// Offline browser regression: real Bot server, bundled previews and private chat.
// Run after `pnpm -C bot run build`; all disposable data stays under project/tmp.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { App } from '../bot/dist/src/app.js';
import { loadConfig } from '../bot/dist/src/config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tempRoot = path.join(root, 'tmp');
fs.mkdirSync(tempRoot, { recursive: true });
const scratch = fs.mkdtempSync(path.join(tempRoot, 'bot-preview-test-'));
for (const name of ['TEMP', 'TMP', 'TMPDIR']) process.env[name] = scratch;
process.env.AMB_CATALOG = 'off';
const require = createRequire(path.join(root, 'frontend/package.json'));
const { chromium, expect } = require('@playwright/test');
let browser, app, webProxy;
const calls = [];
let stopped = false;
const llm = http.createServer(async (req, res) => {
  if (req.url.endsWith('/models')) {
    res.setHeader('content-type', 'application/json');
    return res.end(JSON.stringify({ data: [{ id: 'preview-test', object: 'model' }] }));
  }
  if (req.url.endsWith('/chat/completions')) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    calls.push(body);
    res.setHeader('content-type', 'text/event-stream');
    if (body.messages.at(-1)?.content === 'PRIVATE_STOP_TEST') {
      res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'PRIVATE_STOP_STARTED' } }] })}\n\n`);
      res.once('close', () => { stopped = true; });
      return;
    }
    res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'PRIVATE_REPLY_OK' } }] })}\n\ndata: [DONE]\n\n`);
    return;
  }
  res.writeHead(404).end();
});
try {
  await new Promise(resolve => llm.listen(0, '127.0.0.1', resolve));
  const config = loadConfig({ dataDir: path.join(scratch, 'data'), env: {
    AMB_UI_PORT: '0', AMB_AGENT: 'off', AMB_MAGPIE_API_KEY: 'offline-test',
    AMB_MAGPIE_BASE_URL: `http://127.0.0.1:${llm.address().port}/v1`,
  } });
  config.ui.token = 'preview-test-token';
  config.ui.lang = 'zh-CN';
  config.llm.defaultModel = 'preview-test';
  app = new App(config, { printQrToTerminal: false });
  const ids = ['company-research', 'ppt-master', 'us-stock-research'];
  for (const id of ids) app.catalog.addDev(path.join(root, 'bot/bots', id));
  await app.start();
  // The intercepted Tauri hostname has no real DNS address in Edge. Disable
  // only its local-network check for this harness; keep CSP and sandbox enabled.
  browser = await chromium.launch({ channel: 'msedge', headless: true, args: ['--disable-features=LocalNetworkAccessChecks'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('response', r => {
    // Installed demo state references optional report files that do not exist
    // until a real research run; the UI falls back to the embedded preview.
    const url = new URL(r.url());
    const optionalSample = r.status() === 404 && url.pathname.endsWith('/app/file') &&
      ['app/reports/sample-aapl/report.md', 'app/reports/sample-aapl/tools.jsonl'].includes(url.searchParams.get('path'));
    if (r.status() >= 400 && !optionalSample) errors.push(`HTTP ${r.status()} ${url.pathname}`);
  });
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {
    // HTTP failures are checked with their full request URL above.
    if (m.type() === 'error' && !m.text().startsWith('Failed to load resource:')) errors.push(m.text());
  });
  // Reproduce the desktop ancestor chain, not just a standalone Bot page.
  await page.route('http://tauri.localhost/**', route => route.fulfill({
    contentType: 'text/html',
    body: `<iframe title="Boost Bot" style="width:100%;height:96vh;border:0" src="${app.web.url}?token=preview-test-token#/preview/company-research"></iframe>`,
  }));
  await page.goto('http://tauri.localhost/');
  const shell = page.frameLocator('iframe[title="Boost Bot"]');
  await expect(shell.locator('.side')).toBeVisible({ timeout: 20000 });
  const expectedPreview = { 'company-research': '云杉机器人', 'ppt-master': 'PPT', 'us-stock-research': '苹果' };
  for (const id of ids) {
    const host = page.frames().find(f => f.url().startsWith(app.web.url));
    await host.evaluate(id => { location.hash = `/preview/${id}`; }, id);
    const frame = shell.locator('.botapp-frame');
    const preview = shell.frameLocator('.botapp-frame');
    await expect(frame).toHaveAttribute('src', new RegExp(`/d/${id}/index.html$`));
    await expect(preview.locator('#app')).toContainText(expectedPreview[id], { timeout: 20000 });
    assert((await frame.boundingBox()).height > 400, `${id}: preview must fill workspace`);
    assert.equal(app.store.listBots().filter(b => b.origin === 'catalog').length, 0, 'Preview must not install');
    console.log(`PASS nested desktop preview: ${id}`);
  }
  // Failed initialization must expose a retry action, rather than an empty frame.
  const host = page.frames().find(f => f.url().startsWith(app.web.url));
  const blankPreview = '**/botapp/d/company-research/index.html';
  await page.route(blankPreview, route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Unavailable preview</title>' }));
  await host.evaluate(() => { location.hash = '/preview/company-research'; });
  await expect(shell.getByText('工作台加载失败。你可以重试，或进入对话继续处理任务。')).toBeVisible({ timeout: 20000 });
  await page.unroute(blankPreview);
  await shell.getByRole('button', { name: '重试', exact: true }).click();
  await expect(shell.frameLocator('.botapp-frame').locator('#app')).toContainText('云杉机器人');
  console.log('PASS preview initialization timeout and retry');
  await host.evaluate(() => { location.hash = '/preview/us-stock-research'; });
  await expect(shell.locator('.botapp-frame')).toHaveAttribute('src', /\/d\/us-stock-research\/index.html$/);
  await shell.getByRole('button', { name: '与智能体对话', exact: true }).click();
  await expect(shell.locator('[data-screen="chat"]')).toBeVisible({ timeout: 20000 });
  const input = shell.locator('[data-screen="chat"] textarea');
  await input.fill('PRIVATE_MESSAGE_TEST');
  await input.press('Enter');
  await expect(shell.locator('[role="log"]')).toContainText('PRIVATE_REPLY_OK', { timeout: 20000 });
  await host.evaluate(() => location.reload());
  await expect(shell.locator('[role="log"]')).toContainText('PRIVATE_REPLY_OK');
  await input.fill('PRIVATE_STOP_TEST');
  await input.press('Enter');
  await expect(shell.locator('[role="log"]')).toContainText('PRIVATE_STOP_STARTED');
  await shell.getByRole('button', { name: '停止生成（Esc）', exact: true }).click();
  await expect.poll(() => stopped).toBe(true);
  await expect(shell.locator('[role="log"]')).toHaveAttribute('aria-busy', 'false');
  await shell.getByRole('button', { name: '返回工作台', exact: true }).click();
  await expect(shell.frameLocator('.botapp-frame').locator('#app')).toContainText(/苹果/);
  assert.equal(calls.length, 2);
  assert(calls[0].messages.some(m => m.content === 'PRIVATE_MESSAGE_TEST'));
  assert(calls[1].messages.some(m => m.content === 'PRIVATE_MESSAGE_TEST'), 'Follow-up must retain context');
  assert.deepEqual(errors.filter(e => !e.includes('favicon')), []);
  console.log('PASS private chat: install, stream, context, persisted history, stop, return to app');
  // Web mode proxies the loopback host without forwarding its Host header.
  // Verify that CSP 'self' still resolves against the public response URL.
  webProxy = http.createServer((req, res) => {
    const upstream = http.request(new URL(req.url, app.web.url), {
      method: req.method,
      headers: { 'x-amb-token': config.ui.token, 'content-type': req.headers['content-type'] || 'application/json' },
    }, response => {
      res.writeHead(response.statusCode, response.headers);
      response.pipe(res);
    });
    upstream.on('error', () => res.writeHead(502).end());
    req.pipe(upstream);
  });
  await new Promise(resolve => webProxy.listen(0, '127.0.0.1', resolve));
  await page.goto(`http://127.0.0.1:${webProxy.address().port}/#/preview/ppt-master`);
  await expect(page.frameLocator('.botapp-frame').locator('#app')).toContainText('PPT');
  assert.deepEqual(errors.filter(e => !e.includes('favicon')), []);
  console.log('PASS same-origin Web proxy preview');
} finally {
  await browser?.close();
  if (webProxy) {
    webProxy.closeAllConnections();
    await new Promise(resolve => webProxy.close(resolve));
  }
  await app?.stop();
  llm.closeAllConnections();
  await new Promise(resolve => llm.close(resolve));
  const resolved = fs.realpathSync(scratch);
  assert(resolved.startsWith(fs.realpathSync(tempRoot) + path.sep));
  fs.rmSync(resolved, { recursive: true, force: true });
}
