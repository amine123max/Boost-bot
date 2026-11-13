/** Boost owns authentication, model routing, account billing and this process's lifetime. */
import fs from 'node:fs';
import path from 'node:path';
import { App } from './app.js';
import { loadConfig } from './config.js';
import { registerSecret } from './log.js';
import { findAppRoot } from './magpie/supervisor.js';

const input = await new Promise<string>((resolve, reject) => {
  let text = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    text += chunk;
    if (text.length > 65536) reject(new Error('Invalid Boost host configuration'));
    if (text.includes('\n')) { process.stdin.pause(); resolve(text.split('\n')[0]); }
  });
  process.stdin.on('error', reject);
});
const host = JSON.parse(input) as {
  dataDir: string; token: string; baseUrl: string; apiKey: string;
  allowTools: boolean; parentPid: number; defaultModel?: string;
};
if (!host.token || !host.apiKey || !host.dataDir || !/^http:\/\/(127\.0\.0\.1|localhost|\[::1\]):\d+\/v1$/.test(host.baseUrl)) {
  throw new Error('Invalid Boost host configuration');
}
registerSecret(host.token);
registerSecret(host.apiKey);
// No independent model gateway or provider login. These are internal compatibility
// switches of the vendored runtime, never new public Boost configuration options.
if (Boolean(process.env.BOOST_BOT_CATALOG_URL) !== Boolean(process.env.BOOST_BOT_CATALOG_PUBKEY)) throw new Error('Boost Bot 额外目录需要同时配置地址和签名公钥');
process.env.AMB_CATALOG = process.env.BOOST_BOT_CATALOG_URL ? 'on' : 'off';
if (process.env.BOOST_BOT_CATALOG_URL) process.env.AMB_CATALOG_URL = process.env.BOOST_BOT_CATALOG_URL;
if (process.env.BOOST_BOT_CATALOG_PUBKEY) process.env.AMB_CATALOG_PUBKEY = process.env.BOOST_BOT_CATALOG_PUBKEY;
process.env.AMB_AGENT_PREWARM = '0';
process.env.BOOST_BOT_HOSTED = '1';
process.env.BOOST_BOT_ALLOW_TOOLS = host.allowTools ? '1' : '0';
process.env.AMB_CUA_DRIVER_DIR = path.join(findAppRoot(), 'bin', 'cua-driver');
// Child tools inherit scratch paths local to this workspace, never system temp.
const scratch = process.env.TMPDIR || path.join(host.dataDir, 'tmp', 'runtime');
fs.mkdirSync(scratch, { recursive: true });
for (const name of ['TEMP', 'TMP', 'TMPDIR']) process.env[name] = scratch;
const config = loadConfig({ dataDir: host.dataDir, env: {} });
config.ui = { ...config.ui, host: '127.0.0.1', port: 0, token: host.token, lang: config.ui.lang === 'system' ? 'zh-CN' : config.ui.lang };
config.magpie = { mode: 'external', binPath: '', externalBaseUrl: host.baseUrl, externalApiKey: host.apiKey };
config.agent.mode = host.allowTools ? 'dsh' : 'off';
if (host.defaultModel && !config.llm.defaultModel) config.llm.defaultModel = host.defaultModel;
const app = new App(config);
if (host.allowTools) {
  const bundled = path.join(findAppRoot(), 'bots');
  for (const entry of fs.readdirSync(bundled, { withFileTypes: true })) {
    const dir = path.join(bundled, entry.name);
    if (entry.isDirectory() && fs.existsSync(path.join(dir, 'bot.json'))) app.catalog.addDev(dir);
  }
}
await app.start();
process.stdout.write(JSON.stringify({ boostBotReady: true, port: app.web!.port }) + '\n');
let stopping = false;
const stop = async () => {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => process.exit(1), 8000);
  deadline.unref();
  await app.stop();
  process.exit(0);
};
process.stdin.on('end', () => void stop());
process.stdin.on('data', (chunk) => { if (String(chunk).includes('shutdown')) void stop(); });
process.stdin.resume();
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
const parentCheck = setInterval(() => {
  try { process.kill(host.parentPid, 0); } catch { void stop(); }
}, 3000);
parentCheck.unref();
