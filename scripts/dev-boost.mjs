// Launch matching source-built service, Web gateway and Vite together.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import net from 'node:net';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const value = (name, fallback) => { const at = process.argv.indexOf(name); return at >= 0 ? process.argv[at + 1] : fallback; };
const serviceAddr = value('--service', '127.0.0.1:48860');
const webAddr = value('--web', '127.0.0.1:48861');
const port = value('--port', '3005');
const webRoot = resolve(root, value('--web-root', 'frontend/out'));
const staticOnly = process.argv.includes('--static-only');
const externalService = process.argv.includes('--external-service');
const scratch = resolve(root, 'tmp', `boost-dev-${process.pid}`);
mkdirSync(scratch, { recursive: true });
const env = {
  ...process.env, TEMP: scratch, TMP: scratch, TMPDIR: scratch,
  BOOST_SERVICE_ADDR: serviceAddr, BOOST_WEB_ADDR: webAddr,
  BOOST_WEB_ROOT: webRoot, BOOST_WEB_NO_OPEN: '1', BOOST_WEB_NO_SPAWN_SERVICE: '1',
  BOOST_BOT_ROOT: resolve(root, 'bot'), BOOST_DEV_WEB_URL: `http://${webAddr}`,
  BOOST_DB_PATH: resolve(value('--db', process.env.BOOST_DB_PATH || resolve(root, 'data/boost.db'))),
};
const tokenFile = value('--rpc-token-file', process.env.BOOST_RPC_TOKEN_FILE);
if (tokenFile) env.BOOST_RPC_TOKEN_FILE = resolve(tokenFile);
function build(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Boost development build failed: ${command}`);
}
if (!process.argv.includes('--prepared')) {
  if (!staticOnly) build(process.execPath, [resolve(root, 'backend/desktop/scripts/before-build.mjs'), 'build:desktop']);
  build('cargo', ['build', '-p', 'boost-service', '-p', 'boost-web']);
}
const target = resolve(process.env.CARGO_TARGET_DIR || resolve(root, 'target'), 'debug');
const executable = name => resolve(target, name + (process.platform === 'win32' ? '.exe' : ''));
for (const name of ['boost-service','boost-web']) if (!existsSync(executable(name))) throw new Error(`${name} is missing; start without --prepared`);
if (!existsSync(resolve(webRoot,'index.html'))) throw new Error(`Boost frontend is missing at ${webRoot}; build the frontend first`);
const children = [];
let stopping = false;
function start(command, args = [], cwd = root) {
  const child = spawn(command, args, { cwd, env, stdio: ['ignore', 'inherit', 'inherit'], windowsHide: true });
  child.on('error', error => { console.error(error.message); void stop(1); });
  child.on('exit', code => { if (!stopping) void stop(code || 0); });
  children.push(child);
  return child;
}
async function ready(url) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (stopping) throw new Error('Boost development startup interrupted');
    try { if ((await fetch(url, {signal: AbortSignal.timeout(1000)})).ok) return; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  throw new Error(`Boost did not become ready at ${url}`);
}
async function available(addr) {
  const url=new URL(`http://${addr}`);
  const server=net.createServer();
  await new Promise((resolveReady,reject)=>{
    server.once('error',()=>reject(new Error(`Port ${addr} is already in use; stop that development session or select a different address`)));
    server.listen(Number(url.port),url.hostname,resolveReady);
  });
  await new Promise(resolveClose=>server.close(resolveClose));
}
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  try { await fetch(`http://${webAddr}/__quit`, { signal: AbortSignal.timeout(800) }); } catch {}
  for (const child of children.reverse()) if (child.exitCode === null) child.kill();
  process.exitCode = code;
}
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
try {
  if (!externalService) await available(serviceAddr);
  await available(webAddr);
  if (!staticOnly) await available(`127.0.0.1:${port}`);
  if (!externalService) start(executable('boost-service'));
  await ready(`http://${serviceAddr}/health`);
  start(executable('boost-web'));
  await ready(`http://${webAddr}/api/runtime`);
  if (!staticOnly) {
    const require = createRequire(resolve(root, 'frontend/package.json'));
    const vite = resolve(dirname(require.resolve('vite/package.json')), 'bin/vite.js');
    start(process.execPath, [vite, '--host', '127.0.0.1', '--port', port, '--strictPort'], resolve(root, 'frontend'));
    console.log(`Boost development: http://127.0.0.1:${port} (matching service ${serviceAddr}, Web ${webAddr})`);
  } else console.log(`Boost desktop-build preview: http://${webAddr} (external service ${serviceAddr})`);
} catch (error) { console.error(error.message); await stop(1); }
