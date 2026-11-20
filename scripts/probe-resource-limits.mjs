// Exercise isolated Service/Web processes, overload, circuits and encrypted restart.
// Run after building current binaries; all disposable data stays under project tmp.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { inferenceThroughput } from './lib/inference-throughput.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = path.join(root, 'tmp');
const scratch = path.join(tempRoot, 'resource-probe-'+process.pid+'-'+Date.now());
const output = process.argv.find(value => value.startsWith('--output='))?.slice(9);
const keep = process.argv.includes('--keep');
const throughput = process.argv.includes('--throughput');
const modelConcurrency = process.argv.includes('--model-concurrency');
const concurrencyStream = !process.argv.includes('--json');
const release = process.argv.includes('--release') || throughput || modelConcurrency;
const numeric = (name, fallback, low, high) => {
  const argument = process.argv.find(value => value.startsWith(`--${name}=`));
  const value = argument ? Number(argument.split('=')[1]) : fallback;
  if (!Number.isSafeInteger(value) || value < low || value > high) throw new Error(`Invalid --${name}: expected ${low}..${high}`);
  return value;
};
const offered = numeric('qps', 2200, 1, 10000);
const tuningInflight = numeric('inflight', 120, 16, 1000);
const seconds = numeric('seconds', 10, 2, 60);
const fastDelay = numeric('upstream-ms', 0, 0, 250);
const tune = process.argv.includes('--tuned');
fs.mkdirSync(scratch, { recursive: true });
const ephemeral = () => new Promise((resolve,reject)=>{ const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});
const servicePort = await ephemeral(), webPort = await ephemeral();
const token = randomBytes(32).toString('hex');
const service = `http://127.0.0.1:${servicePort}`, web = `http://127.0.0.1:${webPort}`;
const processes = [], upstreamCounts = new Map();
let upstreamDelay = 25, upstreamFailure = false, id = 0;
let holdUpstream, heldRequests = 0;
const upstream = http.createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  let input={};try{input=JSON.parse(Buffer.concat(chunks));}catch{}
  upstreamCounts.set(req.url,(upstreamCounts.get(req.url)||0)+1);
  if(req.url.includes('models')) { await new Promise(r=>setTimeout(r,500));res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'fixture-model',object:'model'}]}));return; }
  if (holdUpstream) {
    heldRequests++;
    await holdUpstream;
  }
  if (upstreamDelay > 0) await new Promise(r=>setTimeout(r,upstreamDelay));
  if(upstreamFailure && !req.url.startsWith('/healthy/')){res.writeHead(503,{'content-type':'application/json'});res.end(JSON.stringify({error:{message:'isolated injected failure'}}));return;}
  if(input.stream){
    res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache'});
    if(req.url.includes('responses')){
      res.write('event: response.created\ndata: '+JSON.stringify({type:'response.created',response:{id:'fixture',object:'response',status:'in_progress'}})+'\n\n');
      res.write('event: response.output_text.delta\ndata: '+JSON.stringify({type:'response.output_text.delta',delta:'fixture'})+'\n\n');
      res.end('event: response.completed\ndata: '+JSON.stringify({type:'response.completed',response:{id:'fixture',object:'response',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'fixture'}]}],usage:{input_tokens:10,output_tokens:5,total_tokens:15}}})+'\n\n');
    }else{
      res.write('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',choices:[{index:0,delta:{content:'fixture'},finish_reason:null}]})+'\n\n');
      res.end('data: '+JSON.stringify({id:'fixture',object:'chat.completion.chunk',choices:[{index:0,delta:{},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}})+'\n\ndata: [DONE]\n\n');
    }
  }else{
    res.writeHead(200,{'content-type':'application/json'});
    res.end(JSON.stringify(req.url.includes('responses')?{id:'fixture',object:'response',status:'completed',output:[{type:'message',role:'assistant',content:[{type:'output_text',text:'fixture'}]}],usage:{input_tokens:10,output_tokens:5,total_tokens:15}}:{id:'fixture',object:'chat.completion',choices:[{index:0,message:{role:'assistant',content:'fixture'},finish_reason:'stop'}],usage:{prompt_tokens:10,completion_tokens:5,total_tokens:15}}));
  }
});
await new Promise(resolve=>upstream.listen(0,'127.0.0.1',2048,resolve));
const upstreamURL=`http://127.0.0.1:${upstream.address().port}`;

async function request(base,endpoint,options={}){
  const start=performance.now();const response=await fetch(base+endpoint,{...options,signal:options.signal||AbortSignal.timeout(15000)});
  const text=await response.text();return {status:response.status,text,headers:response.headers,ms:performance.now()-start};
}
const socketBudget = Math.max(192,tuningInflight+64);
const inferenceAgent = new http.Agent({keepAlive:true,maxSockets:socketBudget,maxFreeSockets:socketBudget});
function inferenceRequest(endpoint, options){
  const start=performance.now();
  return new Promise((resolve,reject)=>{
    const req=http.request(service+endpoint,{...options,agent:inferenceAgent,
      headers:{...options.headers,'content-length':Buffer.byteLength(options.body)}},res=>{
      let text='';res.setEncoding('utf8');
      res.on('data',part=>{text+=part;});
      res.on('error',reject);
      res.on('end',()=>resolve({status:res.statusCode,text,ms:performance.now()-start}));
    });
    req.on('error',reject);req.end(options.body);
  });
}
async function rpc(method,params={},base=service){
  const result=await request(base,base===web?'/api/rpc':'/rpc',{method:'POST',headers:{'content-type':'application/json','x-boost-rpc-token':token,'x-boost-rpc-actor-role':'system_admin'},body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});
  let payload;try{payload=JSON.parse(result.text);}catch{}
  return {...result,payload,result:payload?.result};
}
async function requireRpc(method,params={},base=service){const value=await rpc(method,params,base);assert.equal(value.status,200,method);assert(!value.payload?.error,method+': '+JSON.stringify(value.payload));assert(!value.result?.error,method+': '+JSON.stringify(value.result));return value.result;}
function launch(name,extra={}){
  const output=fs.openSync(path.join(scratch,name+'.log'),'w');
  const child=spawn(path.join(root,'target',release?'release':'debug',name+(process.platform==='win32'?'.exe':'')),[],{cwd:root,windowsHide:true,stdio:['ignore',output,output],env:{...process.env,
    TEMP:scratch,TMP:scratch,TMPDIR:scratch,BOOST_DB_PATH:path.join(scratch,'boost.db'),BOOST_RPC_TOKEN:token,
    BOOST_RPC_TOKEN_FILE:path.join(scratch,'rpc-token'),BOOST_DB_ENCRYPTION:'off',BOOST_DB_KEY_FILE:'',
    BOOST_SERVICE_ADDR:`127.0.0.1:${servicePort}`,BOOST_WEB_ADDR:`127.0.0.1:${webPort}`,BOOST_WEB_NO_OPEN:'1',
    BOOST_WEB_NO_SPAWN_SERVICE:'1',BOOST_DISABLE_POLLING:'1',BOOST_BOT_ROOT:path.join(root,'bot'),RUST_LOG:keep?'warn,boost_service::http::proxy_runtime=debug':'error',...extra}});
  fs.closeSync(output);processes.push(child);return child;
}
async function waitReady(base,endpoint){for(let i=0;i<120;i++){try{const r=await request(base,endpoint,{signal:AbortSignal.timeout(500)});if(r.status===200)return;}catch{}await new Promise(r=>setTimeout(r,250));}throw new Error('readiness failed for '+base);}
function summarize(values){const times=values.map(v=>v.ms).sort((a,b)=>a-b);const at=q=>Number(times[Math.min(times.length-1,Math.floor(times.length*q))].toFixed(2));return {count:values.length,statuses:values.reduce((a,v)=>(a[v.status]=(a[v.status]||0)+1,a),{}),p50:at(.5),p95:at(.95),p99:at(.99)};}
async function batch(concurrency,count,task){let next=0;const results=[];const start=performance.now();await Promise.all(Array.from({length:concurrency},async()=>{while(next<count){next++;results.push(await task());}}));return {...summarize(results),rps:Number((count*1000/(performance.now()-start)).toFixed(1))};}

const report={environment:{platform:process.platform,node:process.version,mode:release?'release':'debug',upstream:'local fixture',delayMs:throughput?fastDelay:upstreamDelay},checks:[],loads:{}};
Object.assign(report.environment,{cpu:os.cpus()[0].model,logicalCores:os.cpus().length,systemMemoryBytes:os.totalmem()});
try{
  const overrides = modelConcurrency ? {
    BOOST_STORAGE_MAX_CONNECTIONS:'1400', BOOST_STORAGE_MAX_IDLE_CONNECTIONS:'128',
    BOOST_HTTP_WORKER_MIN:concurrencyStream?'32':'1024', BOOST_HTTP_WORKER_MAX:concurrencyStream?'32':'1024',
    BOOST_HTTP_STREAM_WORKER_MIN:concurrencyStream?'1024':'4', BOOST_HTTP_STREAM_WORKER_MAX:concurrencyStream?'1024':'4',
    BOOST_FRONT_PROXY_MAX_INFLIGHT:'1200', BOOST_FRONT_PROXY_WORKER_THREADS:'8',
  } : throughput && tune ? {
    BOOST_STORAGE_MAX_CONNECTIONS:String(Math.ceil(tuningInflight * 4/3)), BOOST_STORAGE_MAX_IDLE_CONNECTIONS:String(tuningInflight),
    BOOST_HTTP_WORKER_MAX:String(tuningInflight), BOOST_HTTP_WORKER_MIN:String(tuningInflight),
    BOOST_HTTP_STREAM_WORKER_MIN:String(tuningInflight), BOOST_HTTP_STREAM_WORKER_MAX:String(tuningInflight),
    BOOST_FRONT_PROXY_MAX_INFLIGHT:String(tuningInflight+40), BOOST_FRONT_PROXY_WORKER_THREADS:'8',
  } : {};
  launch('boost-service',overrides);await waitReady(service,'/health');
  const settings=await requireRpc('appSettings/get');
  const limits={...settings.resourceLimits,globalQps:0,maxInflight:24,modelMaxInflight:8};
  if (!throughput || tune) await requireRpc('appSettings/set',{resourceLimits:modelConcurrency
    ? {...limits,maxInflight:1024,modelMaxInflight:1000}
    : throughput ? {...limits,globalQps:Math.max(2500,offered+100),burst:256,maxInflight:tuningInflight,modelMaxInflight:tuningInflight} : limits});
  if (!throughput && !modelConcurrency) {
  launch('boost-web');await waitReady(web,'/api/runtime');
  const ui=await request(web,'/settings/');assert.equal(ui.status,200);assert(ui.text.includes('Boost'));report.checks.push('embedded Web settings route');
  for(const concurrency of [1,6,16,32,64]){
    report.loads['rpc-'+concurrency]=await batch(concurrency,256,()=>rpc('service/listenConfig/get'));
    assert(Object.keys(report.loads['rpc-'+concurrency].statuses).every(code=>['200','429'].includes(code)));
  }
  report.loads.webRpc=await batch(6,60,()=>rpc('service/listenConfig/get',{},web));
  }
  const source=await requireRpc('aggregateApi/create',{providerType:'codex',supplierName:'isolated-fixture',url:upstreamURL+'/v1/chat/completions',key:'isolated-upstream-key',modelSlugs:['fixture-model']});
  await requireRpc('apikey/modelCatalogSave',{slug:'fixture-model',display_name:'Fixture model',supported_in_api:false,sourceKind:'manual'});
  await requireRpc('apikey/modelSourceModelSave',{sourceKind:'aggregate_api',sourceId:source.id,upstreamModel:'fixture-model',status:'active'});
  await requireRpc('apikey/modelSourceMappingSave',{platformModelSlug:'fixture-model',sourceKind:'aggregate_api',sourceId:source.id,upstreamModel:'fixture-model',enabled:true,priority:0,weight:1});
  await requireRpc('apikey/modelCatalogSave',{slug:'fixture-model',display_name:'Fixture model',supported_in_api:true,sourceKind:'manual'});
  const apiKey=await requireRpc('apikey/create',{name:'isolated-load',modelSlug:'fixture-model',protocolType:'openai_compat',rotationStrategy:'aggregate_api_rotation',aggregateApiId:source.id});
  const platformKey=apiKey.key||apiKey.apiKey||apiKey.secret;
  assert(platformKey,'platform key missing in create response');
  const modelRequest=(endpoint,stream=false,extra={},timeout=15000)=>{
    const options={method:'POST',headers:{'content-type':'application/json',accept:stream?'text/event-stream':'application/json',authorization:'Bearer '+platformKey},signal:AbortSignal.timeout(timeout),body:JSON.stringify({model:'fixture-model',stream,...(endpoint.includes('responses')?{input:'fixture'}:{messages:[{role:'user',content:'fixture'}]}),...extra})};
    return modelConcurrency ? request(service,endpoint,options) : inferenceRequest(endpoint,options);
  };
  const warm=await modelRequest('/v1/chat/completions');assert.equal(warm.status,200,warm.text);report.checks.push('model JSON through front and backend');
  if (modelConcurrency) {
    const endpoint = '/v1/chat/completions';
    let releaseUpstream;
    holdUpstream = new Promise(resolve => { releaseUpstream = resolve; });
    upstreamDelay = 0;
    const settled = [];
    const calls = [];
    try {
      // Keep the streams open together without also benchmarking cold TCP backlog.
      for (let offset = 0; offset < 1000; offset += 25) {
        for (let i = offset; i < Math.min(offset + 25, 1000); i++) {
          calls.push(modelRequest(endpoint,concurrencyStream,{},60000)
            .catch(error => ({status:'transport_error',text:error.message}))
            .then(result => { settled.push(result); return result; }));
        }
        await new Promise(resolve => setTimeout(resolve,25));
      }
      const until = performance.now() + 45000;
      while (heldRequests < calls.length && settled.length === 0 && performance.now() < until) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      assert.equal(heldRequests,1000,JSON.stringify({heldRequests,earlyResults:settled.slice(0,5).map(({status,text})=>({status,text:text.slice(0,240)}))}));
      assert.equal(settled.length,0);
      const overflow = await modelRequest(endpoint,concurrencyStream);
      assert.equal(overflow.status,429,overflow.text);
      assert(overflow.text.includes('model_concurrency_exhausted'),overflow.text);
      assert.equal(heldRequests,1000);
      await requireRpc('service/listenConfig/get');
    } finally {
      holdUpstream = null;
      releaseUpstream();
      await Promise.all(calls);
    }
    const expected = concurrencyStream ? '[DONE]' : '"fixture"';
    const completedRequests = settled.filter(result=>result.status===200 && result.text.includes(expected)).length;
    assert.equal(completedRequests,1000);
    const recovered = await modelRequest(endpoint,concurrencyStream);
    assert.equal(recovered.status,200,recovered.text);
    report.checks.push('1,000 simultaneous requests reached the same upstream model; request 1,001 was rejected and capacity recovered');
    report.loads.modelConcurrency={protocol:concurrencyStream?'SSE':'JSON',upstreamInFlight:heldRequests,completedRequests};
    if(output) fs.writeFileSync(path.resolve(output),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
  } else if (throughput) {
    upstreamDelay=fastDelay;
    const measure = async (endpoint, stream) => {
      const run = async () => {
        const tools = endpoint.endsWith('/responses')
          ? [{type:'function',name:'fixture_tool',parameters:{type:'object',properties:{}}}]
          : [{type:'function',function:{name:'fixture_tool',parameters:{type:'object',properties:{}}}}];
        const result = await modelRequest(endpoint,stream,{tools});
        const valid = result.text.includes(stream ? (endpoint.endsWith('/responses') ? 'response.completed' : '[DONE]') : '"fixture"');
        return { ...result, valid };
      };
      const warm = await Promise.all(Array.from({length:tune?32:1},run));
      assert(warm.some(result=>result.status===200&&result.valid), `Warm-up failed (${endpoint}): ${warm.map(result=>result.status)}`);
      return inferenceThroughput({request:run,rate:offered,durationMs:seconds*1000});
    };
    report.environment.tuned=tune;
    report.environment.gatewayConcurrency=tune?tuningInflight:settings.resourceLimits.maxInflight;
    report.loads.chatJson=await measure('/v1/chat/completions',false);
    if (process.argv.includes('--protocols')) {
      report.loads.chatSse=await measure('/v1/chat/completions',true);
      await requireRpc('aggregateApi/update',{id:source.id,providerType:'codex',supplierName:'isolated-fixture',url:upstreamURL+'/v1/responses',modelSlugs:['fixture-model']});
      report.loads.responsesJson=await measure('/v1/responses',false);
      report.loads.responsesSse=await measure('/v1/responses',true);
    }
    report.passed=Object.values(report.loads).every(load=>load.successfulQps>2000 && load.p95Ms<=50 && load.successRatio>=.99);
    if(output) fs.writeFileSync(path.resolve(output),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify(report));
    if (process.argv.includes('--assert-target') && !report.passed) process.exitCode=1;
  } else {
  const large = await modelRequest('/v1/chat/completions',false,{messages:[{role:'user',content:'fixture'.repeat(1024)}]});
  assert.equal(large.status,200,large.text);
  report.checks.push('larger request body through streaming loopback path');
  report.loads.model=await batch(32,128,()=>modelRequest('/v1/chat/completions'));
  assert(report.loads.model.statuses[200]>0);assert(report.loads.model.statuses[429]>0);
  assert(!report.loads.model.statuses[500]);
  const stream=await modelRequest('/v1/chat/completions',true);assert.equal(stream.status,200,stream.text);assert(stream.text.includes('data:'));report.checks.push('Chat Completions SSE');
  await requireRpc('aggregateApi/update',{id:source.id,providerType:'codex',supplierName:'isolated-fixture',url:upstreamURL+'/v1/responses',modelSlugs:['fixture-model']});
  for(const streaming of [false,true]){
    const result=await modelRequest('/v1/responses',streaming,{tools:[{type:'function',name:'fixture_tool',parameters:{type:'object',properties:{}}}]});
    assert.equal(result.status,200,result.text);if(streaming)assert(result.text.includes('response.completed'));
  }
  report.checks.push('Responses JSON and SSE with tool definitions');
  upstreamDelay=500;
  const inFlight=Array.from({length:8},()=>modelRequest('/v1/responses'));
  await new Promise(r=>setTimeout(r,75));
  report.loads.rpcDuringSlowModels=await batch(6,60,()=>rpc('service/listenConfig/get'));
  assert.equal(report.loads.rpcDuringSlowModels.statuses[200],60);
  await Promise.all(inFlight);
  upstreamDelay=1000;
  await request(service,'/v1/responses',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+platformKey},body:JSON.stringify({model:'fixture-model',input:'cancel',stream:true}),signal:AbortSignal.timeout(80)}).catch(()=>{});
  await new Promise(r=>setTimeout(r,1300));
  upstreamDelay=1;
  upstreamFailure=true;
  for(let i=0;i<35;i++){const result=await modelRequest('/v1/responses');assert(result.status>=400);}
  const beforeCircuit=upstreamCounts.get('/v1/responses')||0;
  const rejectedCircuit=await modelRequest('/v1/responses');assert(rejectedCircuit.status>=400);
  assert.equal(upstreamCounts.get('/v1/responses'),beforeCircuit);
  report.checks.push('upstream circuit skips failed source without another network attempt');
  const healthy=await requireRpc('aggregateApi/create',{providerType:'codex',supplierName:'isolated-healthy',url:upstreamURL+'/healthy/v1/responses',key:'isolated-upstream-key',modelSlugs:['fixture-model']});
  await requireRpc('apikey/modelSourceModelSave',{sourceKind:'aggregate_api',sourceId:healthy.id,upstreamModel:'fixture-model'});
  await requireRpc('apikey/modelSourceMappingSave',{platformModelSlug:'fixture-model',sourceKind:'aggregate_api',sourceId:healthy.id,upstreamModel:'fixture-model',enabled:true,priority:1,weight:1});
  const recovered=await modelRequest('/v1/responses');assert.equal(recovered.status,200,recovered.text);report.checks.push('failover to separate healthy source');
  upstreamFailure=false;
  const soakLimits={...limits,globalQps:20,burst:20};
  await requireRpc('appSettings/set',{resourceLimits:soakLimits});
  upstreamDelay=50;
  const soakResults=[], memory=[];const soakUntil=performance.now()+8000;let peakClientInFlight=0,clientInFlight=0;
  await Promise.all([
    ...Array.from({length:32},async()=>{while(performance.now()<soakUntil){clientInFlight++;peakClientInFlight=Math.max(peakClientInFlight,clientInFlight);try{soakResults.push(await modelRequest('/v1/responses'));}finally{clientInFlight--;}}}),
    (async()=>{while(performance.now()<soakUntil){const value=await requireRpc('service/telemetry');memory.push(value.memoryBytes);await new Promise(r=>setTimeout(r,200));}})()
  ]);
  report.loads.soak={...summarize(soakResults),durationSeconds:8,clientConcurrency:peakClientInFlight,peakMemoryBytes:Math.max(...memory),lastMemoryBytes:memory.at(-1)};
  assert(!report.loads.soak.statuses[500]);assert(!report.loads.soak.statuses[502]);assert(report.loads.soak.statuses[200]>0);assert(report.loads.soak.statuses[429]>0);
  await new Promise(r=>setTimeout(r,100));
  const counters=await requireRpc('service/telemetry');report.memoryBytes=counters.memoryBytes;report.finalQueue=counters.managementQueue;
  const noKey=await request(service,'/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json'},body:'{}'});assert.equal(noKey.status,401);report.checks.push('missing platform key rejected');
  const keyPath=path.join(scratch,'main-key');fs.writeFileSync(keyPath,randomBytes(32),{mode:0o600});
  for(const child of [...processes].reverse())if(child.exitCode===null){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
  launch('boost-service',{BOOST_DB_KEY_FILE:keyPath});await waitReady(service,'/health');
  const encryptedSettings=await requireRpc('appSettings/get');assert(encryptedSettings.storageSecurity.encrypted);assert.equal(encryptedSettings.storageSecurity.provider,'key_file');
  report.checks.push('headless key-file startup converts and reopens the complete main database');
  report.mainEncryption=encryptedSettings.storageSecurity;
  if(output) fs.writeFileSync(path.resolve(output), JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  }
}finally{
  inferenceAgent.destroy();
  for(const child of processes.reverse())if(child.exitCode===null){child.kill();await new Promise(resolve=>{child.once('exit',resolve);setTimeout(resolve,5000).unref();});}
  await new Promise(resolve=>upstream.close(resolve));
  if (!keep && processes.every(child=>child.exitCode!==null || child.signalCode!==null)) {
    const target=fs.realpathSync(scratch), parent=fs.realpathSync(tempRoot)+path.sep;
    if(!target.startsWith(parent)||!path.basename(target).startsWith('resource-probe-'+process.pid+'-')) throw new Error('Invalid probe cleanup path');
    fs.rmSync(target,{recursive:true,force:true});
  } else if(keep) console.error('Probe files retained at '+scratch);
}
