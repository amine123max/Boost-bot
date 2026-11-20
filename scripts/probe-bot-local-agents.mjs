// Tests the hosted Bot, SQLite, SSE, and CLI adapter using deterministic local executables.
// Build the Bot backend first: npm --prefix bot run build:backend
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = path.join(root, 'tmp');
fs.mkdirSync(temp,{recursive:true});
const scratch = fs.mkdtempSync(path.join(temp,'local-agent-probe-'));
const token = crypto.randomBytes(24).toString('hex');
const bin = path.join(scratch, 'bin');
const paths = {
  codex: ['@openai','codex','bin','codex.js'],
  claude: ['@anthropic-ai','claude-code','cli.js'],
  deepseek: ['@deepseek-ai','dsh','lib','bin.js'],
};
for (const [provider, parts] of Object.entries(paths)) {
  const file = process.platform === 'win32' ? path.join(bin,'node_modules',...parts)
    : path.join(bin,provider === 'deepseek' ? 'dsh' : provider);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,`#!/usr/bin/env node
const provider = ${JSON.stringify(provider)};
const a=process.argv.slice(2), i=a.findIndex(x=>['--resume','resume','--session-id'].includes(x));
let input='';process.stdin.setEncoding('utf8');
process.stdin.on('data',s=>input+=s);process.stdin.on('end',()=>{
  const session=i<0 ? require('node:crypto').randomUUID() : a[i+1];
  const text=provider+' '+session+' '+input;
  const send=x=>console.log(JSON.stringify(x));
  if (provider==='codex') send({type:'thread.started',thread_id:session});
  else if (provider==='claude') send({type:'system',subtype:'init',session_id:session});
  else send({type:'session',sessionId:session});
  if(input==='stop fixture'){setTimeout(()=>{},30000);return;}
  if(provider==='codex'){
    send({type:'item.completed',item:{type:'agent_message',text}});
    send({type:'turn.completed'});
  }else if(provider==='claude'){
    send({type:'stream_event',event:{type:'content_block_delta',delta:{type:'text_delta',text}}});
    send({type:'result',subtype:'success',session_id:session,result:text});
  }else{
    send({type:'text',text});
    send({type:'final',text});
  }
});
`, {mode:0o700});
}
const env = { ...process.env, TEMP:scratch, TMP:scratch, TMPDIR:scratch };
for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key];
env.PATH = bin + path.delimiter + process.env.PATH;
let processHandle;
async function stop() {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode !== null) return;
  const done = once(processHandle, 'exit');
  processHandle.stdin.end('shutdown\n');
  await done;
}
async function start(allowTools = true) {
  const child = processHandle = spawn(process.execPath,[path.join(root,'bot/dist/backend/src/boost-host.js')],{
    cwd:path.join(root,'bot'),env,windowsHide:true,stdio:['pipe','pipe','pipe'],
  });
  let stdout = '', stderr = '';
  child.stderr.setEncoding('utf8').on('data',data=>{stderr=(stderr+data).slice(-2500);});
  child.stdin.write(JSON.stringify({ dataDir:path.join(scratch,'data'), token, baseUrl:'http://127.0.0.1:1/v1',
    apiKey:'synthetic-local-probe',parentPid:process.pid,allowTools,defaultModel:'fixture' })+'\n');
  const port = await new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('Bot startup timed out: '+stderr)),15000);
    child.on('exit',code=>{clearTimeout(timer);reject(new Error('Bot exited '+code+': '+stderr));});
    child.stdout.setEncoding('utf8').on('data',data=>{
      stdout+=data;
      const match=stdout.match(/"boostBotReady":true,"port":(\d+)/);
      if(match){clearTimeout(timer);resolve(match[1]);}
    });
  });
  return 'http://127.0.0.1:'+port+'/boost-bot/amb/api';
}
let base;
async function call(endpoint, body, expected = 200) {
  const response=await fetch(base+endpoint,{headers:{'x-amb-token':token,...(body?{'content-type':'application/json'}:{})},
    ...(body?{method:'POST',body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(5000)});
  const text=await response.text();
  assert.equal(response.status,expected,text);
  return JSON.parse(text);
}
async function inbox(endpoint, count, observe = () => true) {
  for(let i=0;i<150;i++){
    const state=await call(endpoint);
    const answers=state.messages.filter(m=>m.role==='assistant');
    if(answers.length>=count && observe(state)) return {state,answers};
    await wait(40);
  }
  throw new Error('No expected reply for '+endpoint);
}
const post = (endpoint,text) => call(endpoint+'/messages',{text,requestId:crypto.randomUUID()},202);
try {
  base=await start();
  const {bots}=await call('/bots');
  const id=encodeURIComponent(bots[0].id);
  const providerPath='/bots/'+id+'/local-agents';
  const discovery=await call(providerPath);
  assert(discovery.providers.every(p=>p.available));
  const created=new Map();
  for(const provider of Object.keys(paths)){
    const session=await call(providerPath,{provider},201);
    const endpoint='/bots/'+id+'/local-chat/'+session.peer;
    await post(endpoint,'first 消息');
    const first=(await inbox(endpoint,1)).answers[0].content;
    assert.match(first,new RegExp('^'+provider+' [a-f0-9-]+ first 消息$'));
    created.set(provider,{endpoint,sessionId:first.split(' ')[1]});
  }
  const codex=created.get('codex');
  const second=await call(providerPath,{provider:'codex'},201);
  const other='/bots/'+id+'/local-chat/'+second.peer;
  await post(other,'independent');
  const isolated=(await inbox(other,1)).answers[0].content;
  assert(!isolated.includes(codex.sessionId));
  await post(codex.endpoint,'stop fixture');
  const active=await inbox(codex.endpoint,1,state=>state.live.length>0);
  assert(active.state.live.length);
  await post(codex.endpoint,'queued after stop');
  assert((await call(codex.endpoint)).queued.some(row=>row.text==='queued after stop'));
  // Reattach while the turn is active, then stop through the regular conversation API.
  const feed=await fetch(base+codex.endpoint+'/live?format=replay',{headers:{'x-amb-token':token},signal:AbortSignal.timeout(5000)});
  assert.match(feed.headers.get('content-type') || '',/text\/event-stream/);
  await call('/conversations/'+encodeURIComponent(active.state.conversationId)+'/stop',{});
  assert.match(await feed.text(),/event: done/);
  const settled=await inbox(codex.endpoint,3);
  assert.equal(settled.answers.at(-1).content,'codex '+codex.sessionId+' queued after stop');
  await stop();
  base=await start();
  assert.equal((await call(providerPath)).sessions.length,4);
  for(const [provider, session] of created){
    const before=(await call(session.endpoint)).messages.filter(m=>m.role==='assistant').length;
    await post(session.endpoint,'resume');
    const reply=(await inbox(session.endpoint,before+1)).answers.at(-1).content;
    assert.equal(reply,provider+' '+session.sessionId+' resume');
  }
  assert.equal((await call('/bots/'+id+'/chat')).messages.length,0);
  await stop();
  base=await start(false);
  await call(providerPath,undefined,403);
  console.log('Local Agent probe passed: discovery, isolated sessions, queue, SSE reattach, stop, persisted resume, member denial.');
} finally {
  await stop();
  const resolved=fs.realpathSync(scratch);
  assert(resolved.startsWith(fs.realpathSync(temp)+path.sep) && path.basename(resolved).startsWith('local-agent-probe-'));
  fs.rmSync(resolved,{recursive:true,force:true});
}
