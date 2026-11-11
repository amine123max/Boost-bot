// Offline executable-host regression. No user models or credentials are accessed.
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const tmpRoot = resolve(project, 'tmp');
mkdirSync(tmpRoot,{recursive:true});
const scratch = mkdtempSync(resolve(tmpRoot,'boost-bot-smoke-'));
const hosts = [];
const calls = [];
const gateway = http.createServer(async (req,res) => {
  assert.equal(req.headers.authorization,'Bearer fixture-key');
  if(req.url.startsWith('/v1/models')) return res.writeHead(200,{'content-type':'application/json'}).end(JSON.stringify({data:[{id:'fixture-model'}]}));
  let text=''; for await (const chunk of req) text+=chunk;
  const request=JSON.parse(text); calls.push(request);
  res.writeHead(200,{'content-type':'text/event-stream'});
  res.end(`data: ${JSON.stringify({id:'fixture-completion',object:'chat.completion.chunk',created:1,model:'fixture-model',choices:[{index:0,delta:{role:'assistant',content:'Boost host integration verified'},finish_reason:null}]})}\n\ndata: ${JSON.stringify({id:'fixture-completion',object:'chat.completion.chunk',created:1,model:'fixture-model',choices:[{index:0,delta:{},finish_reason:'stop'}]})}\n\ndata: [DONE]\n\n`);
});
await new Promise(r=>gateway.listen(0,'127.0.0.1',r));
async function host(tools) {
  const token = 'host-smoke-private-token';
  const root = resolve(project,'bot');
  const child = spawn(process.execPath,[resolve(root,'dist/src/boost-host.js')],{cwd:root, windowsHide:true, env:{...process.env, TEMP:scratch,TMP:scratch,TMPDIR:scratch, AMB_LOG_STDOUT:'0'},stdio:['pipe','pipe','pipe']});
  hosts.push(child);
  let stderr=''; child.stderr.on('data',x=>stderr+=x);
  const ready = new Promise((resolveReady,reject) => {
    const timer=setTimeout(()=>reject(new Error(`Host timeout: ${stderr}`)),25000);
    createInterface({input:child.stdout}).on('line',line=>{try{const value=JSON.parse(line); if(value.boostBotReady){clearTimeout(timer);resolveReady(value.port);}}catch{}});
    child.on('exit', code=>{clearTimeout(timer);reject(new Error(`Host exited ${code}: ${stderr}`));});
  });
  child.stdin.write(JSON.stringify({dataDir:resolve(scratch,tools?'admin':'member'),token,baseUrl:`http://127.0.0.1:${gateway.address().port}/v1`,apiKey:'fixture-key',allowTools:tools,parentPid:process.pid})+'\n');
  const port=await ready;
  const base=`http://127.0.0.1:${port}`;
  const api=async(path,method='GET',body)=>fetch(`${base}/boost-bot/amb/api${path}`,{method,headers:{'x-amb-token':token,...(body?{'content-type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});
  return {base,token,api};
}
try {
  const member=await host(false);
  assert.equal((await fetch(member.base+'/boost-bot/')).status,401);
  const html=await (await fetch(member.base+'/boost-bot/',{headers:{'x-amb-token':member.token}})).text();
  assert(html.includes('<title>Boost</title>'));
  const asset=await fetch(member.base+'/boost-bot/amb/static/boost-appearance/renderer.js',{headers:{'x-amb-token':member.token}});
  assert.equal(asset.status,200);
  assert.equal((await member.api('/tasks','POST',{})).status,403);
  assert.equal((await member.api('/bots/default/settings','PUT',{permission:'full'})).status,403);
  assert.equal((await member.api('/bots/default/chat/model','PUT',{model:'fixture-model'})).status,200);
  const reply=await member.api('/bots/default/chat','POST',{text:'hello'});
  assert.equal(reply.status,200);
  assert.match((await reply.json()).reply,/Boost host integration verified/);
  assert(calls.some(call=>call.model==='fixture-model'));
  const admin=await host(true);
  assert.equal((await admin.api('/channel-accounts')).status,200);
  const agent=await (await admin.api('/agent')).json();
  assert.equal(agent.enabled,true);
  assert.equal(agent.runtime,'found');
  assert.equal((await admin.api('/account/login','POST',{})).status,403);
  const catalog = await (await admin.api('/catalog')).json();
  assert(JSON.stringify(catalog).includes('ppt-master'));
  if(process.argv.includes('--tools')) {
    const diagnostic=await (await admin.api('/diagnostics/test-agent','POST',{botId:'default',model:'fixture-model',timeoutMs:45000})).json();
    assert(diagnostic.ok,JSON.stringify(diagnostic));
    console.log('Boost tool host started, loaded plugins and completed an offline model turn');
  }
  if(process.argv.includes('--browser')) {
    const require = createRequire(resolve(project,'frontend/package.json'));
    const { chromium } = require('@playwright/test');
    const browser=await chromium.launch({channel:'msedge',headless:true});
    try {
      const page=await browser.newPage({viewport:{width:1280,height:900}});
      const errors=[];
      page.on('pageerror', error=>errors.push(error.message));
      page.on('response', response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
      await page.goto(`${admin.base}/boost-bot/?token=${admin.token}`);
      await page.locator('.bot-face:visible').first().waitFor();
      await page.locator('textarea').first().waitFor();
      assert.equal(await page.title(),'Boost');
      await page.screenshot({path:process.env.BOOST_BOT_CAPTURE_PATH || resolve(scratch,'workspace.png')});
      assert.deepEqual(errors,[]);
      console.log('Boost imported workspace rendered without browser errors');
    } finally { await browser.close(); }
  }
  console.log('Boost executable host: authentication, account model calls, member isolation, tools and channels passed');
} finally {
  for(const child of hosts){ if(child.exitCode===null){child.stdin.write('shutdown\n');await Promise.race([new Promise(r=>child.once('exit',r)),new Promise(r=>setTimeout(r,9000))]);if(child.exitCode===null)child.kill();} }
  await new Promise(r=>gateway.close(r));
  const actual=realpathSync(scratch);
  assert(actual.startsWith(realpathSync(tmpRoot)+sep)&&actual.includes('boost-bot-smoke-'));
  rmSync(actual,{recursive:true,force:true});
}
