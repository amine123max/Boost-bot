import { test, expect, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
const captures = resolve(
  process.env.BOOST_TEST_OUTPUT_DIR || "../tmp/boost-vue",
  "screenshots",
);

test("daily summary stays daily while keys retain lifetime USD totals and a green heatmap", async ({page}) => {
  const calls=await fixture(page);
  const usage=(tokens:number,requests:number,cost:number)=>({inputTokens:tokens*.8,cachedInputTokens:tokens*.64,outputTokens:tokens*.2,totalTokens:tokens,requestCount:requests,estimatedCostUsd:cost});
  const todayUsage=usage(1200,5,1.25);
  const days=[{day:"2026-11-11",usage:todayUsage},{day:"2026-11-10",usage:usage(300,1,.25)},{day:"2025-06-01",usage:usage(10000,100,1233)}];
  await page.route("**/api/rpc",async route=>{
    const {id,method}=route.request().postDataJSON();
    if(method!=="dashboard/usageHistory")return route.fallback();
    return route.fulfill({json:{id,result:{today:"2026-11-11",todayUsage,days,totals:usage(11500,106,1234.5),hasUndatedHistory:false}}});
  });
  await page.goto("/");
  const daily=page.getByRole("region",{name:"今日用量汇总",exact:true});
  await expect(daily.locator(".usage-summary-metric strong")).toHaveText(["$1.25","5","1.2K","80.0%"]);
  await expect(daily.getByText("今日成本",{exact:true})).toBeVisible();
  await expect(daily.locator(".usage-calendar")).toHaveCount(0);
  await page.getByRole("link",{name:"密钥",exact:true}).click();
  const lifetime=page.getByRole("region",{name:"密钥长期用量汇总",exact:true});
  await expect(lifetime.locator(".usage-summary-metric strong")).toHaveText(["$1,234.50","106","11.5K","80.0%"]);
  await expect(lifetime.locator(".usage-calendar")).toHaveCount(1);
  const scroller=lifetime.getByRole("region",{name:"用量时间轴",exact:true});
  await expect(scroller).toHaveCSS("scrollbar-width","none");
  expect(await lifetime.locator('.usage-cells .usage-cell').first().evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(18);
  await expect(lifetime.locator('.usage-cells')).toHaveCSS("column-gap","2px");
  const today=lifetime.locator('[data-day="2026-11-11"]');
  await expect(today).toHaveAttribute("data-level","1");
  await today.hover();
  await expect(page.getByRole("tooltip")).toContainText("$1.25");
  await expect(page.getByRole("tooltip")).toContainText("1,200");
  const recentRange=await lifetime.locator('.usage-range-summary strong').innerText();
  await scroller.evaluate(el=>{el.scrollLeft=0});
  await expect(lifetime.locator('.usage-range-summary strong')).not.toHaveText(recentRange);
  await expect(lifetime.locator('[data-day="2025-06-01"]')).toHaveAttribute("data-level","4");
  await expect(today).toHaveAttribute("data-level","1");
  await expect(lifetime.locator(".usage-calendar")).toHaveCount(1);
  await scroller.evaluate(el=>{el.scrollLeft=el.scrollWidth});
  await expect(lifetime.locator('.usage-range-summary strong')).toHaveText(recentRange);
  await lifetime.getByRole("button",{name:"收起用量热力图",exact:true}).click();
  await expect(lifetime.locator(".usage-calendar")).toHaveCount(0);
  await lifetime.getByRole("button",{name:"展开用量热力图",exact:true}).click();
  await page.mouse.move(0,0);
  await lifetime.screenshot({path:resolve(captures,"usage-heatmap-dark.png"),animations:"disabled"});
  await page.evaluate(()=>document.documentElement.dataset.theme="light");
  await expect(lifetime.locator('.usage-color-legend [data-level="4"]')).toHaveCSS("background-color","rgb(23, 128, 61)");
  await lifetime.screenshot({path:resolve(captures,"usage-heatmap-light.png"),animations:"disabled"});
  await page.setViewportSize({width:390,height:844});
  await expect(lifetime).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await lifetime.screenshot({path:resolve(captures,"usage-heatmap-mobile.png")});
  expect(calls.some(call=>call.method==="dashboard/adminUsageSummary")).toBe(true);
});

test("usage errors do not invent zero totals and empty history keeps cache rate unknown", async ({page})=>{
  await fixture(page);
  let failed=true;
  await page.route("**/api/rpc",async route=>{
    const {id,method}=route.request().postDataJSON();
    if(method!=="dashboard/usageHistory")return route.fallback();
    return route.fulfill({json:{id,result:failed?{error:"每日统计暂时不可用"}:{today:"2026-11-11",todayUsage:{},totals:{},days:[],hasUndatedHistory:false}}});
  });
  await page.goto("/apikeys/");
  const lifetime=page.getByRole("region",{name:"密钥长期用量汇总",exact:true});
  await expect(lifetime.getByRole("alert")).toContainText("每日统计暂时不可用");
  await expect(lifetime.locator(".usage-summary-metric strong")).toHaveText(["—","—","—","—"]);
  failed=false;
  await lifetime.getByRole("button",{name:"重试",exact:true}).click();
  await expect(lifetime.locator(".usage-summary-metric strong")).toHaveText(["$0.00","0","0","—"]);
  await expect(lifetime.locator('.usage-cells .usage-cell[data-level="1"]')).toHaveCount(0);
});

test("capture the documentation gallery with isolated fixture data", async ({ page }) => {
  test.skip(!process.env.BOOST_DOC_SCREENSHOTS, "Enable explicitly when updating README screenshots");
  const destination = resolve(process.env.BOOST_DOC_SCREENSHOTS!);
  mkdirSync(destination, { recursive: true });
  await fixture(page);
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.route("**/api/rpc", async route => {
    const { id, method } = route.request().postDataJSON();
    if (method === "apikey/list") return route.fulfill({ json: { id, result: [{ id: "docs-key", name: "Development", status: "active", protocolType: "openai_compat", rotationStrategy: "account_rotation", modelSlug: "gpt-5.4" }] } });
    if (method === "apikey/usageStats") return route.fulfill({ json: { id, result: [{ keyId: "docs-key", totalTokens: 80000, estimatedCostUsd: 0.27 }] } });
    return route.fallback();
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  for (const [route, filename, ready] of [
    ["/", "dashboard-dark.png", ".home-page"],
    ["/accounts/", "accounts.png", ".accounts-page"],
    ["/models/", "models.png", ".model-table-wrap"],
    ["/apikeys/", "platform-keys.png", ".keys-page"],
    ["/settings/", "settings-dark.png", ".settings-grid"],
  ]) {
    await page.goto(route);
    await expect(page.locator(ready).first()).toBeVisible();
    await expect(page.locator(".boost-startup")).toHaveCount(0);
    if (route === "/apikeys/") {
      await expect(page.getByText("Development", { exact: true })).toBeVisible();
      await expect(page.locator(".usage-summary-metric strong").first()).not.toHaveText("—");
    }
    await page.evaluate(async () => {
      await document.fonts.ready;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
    });
    await page.screenshot({ path: resolve(destination, filename), animations: "disabled" });
  }
  await page.getByRole("button", { name: "设置主题模式", exact: true }).click();
  await page.getByRole("group", { name: "主题主色", exact: true }).getByTitle("紫色", { exact: true }).click();
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.locator(".panel").filter({ has: page.getByRole("group", { name: "主题主色", exact: true }) }).screenshot({ path: resolve(destination, "settings-light.png"), animations: "disabled" });
  expect(errors).toEqual([]);
});
test('bot replaces the plane, opens from its own position, and appearance lives in Settings', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const calls = await fixture(page);
  await page.route('**/boost-bot/?*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Boost</title><button aria-label="返回 Boost 首页" onclick="parent.postMessage({type: \'boost:bot:back\'},\'*\')">Boost</button><h1>Boost 工作台</h1><script>parent.postMessage({type:"boost:bot:ready"},"*");parent.postMessage({type:"boost:workspace:content-ready"},"*")</script>' }));
  await page.goto('/');
  await expect(page.locator('.brand [data-boost-bot-avatar]')).toBeVisible();
  await expect(page.locator('.boost-startup')).toHaveCount(0);
  await expect(page.locator('.brand img')).toHaveCount(0);
  await expect(page.getByLabel('智能体外观设置', { exact: true })).toHaveCount(0);
  const box = await page.locator('.brand svg').boundingBox();
  await page.getByRole('link', { name: 'Boost 智能体', exact: true }).click();
  await expect(page.locator('aside.sidebar')).toHaveCount(0);
  await expect(page.locator('[data-bot-workspace]')).toBeVisible();
  await expect(page.locator('[data-bot-workspace]')).toHaveAttribute('data-bot-origin', 'avatar');
  await expect(page.locator('[data-bot-workspace]')).toHaveAttribute('data-bot-revealing', 'true');
  expect(await page.locator('[data-bot-surface]').evaluate(el => el.getAnimations()[0]?.effect?.getComputedTiming().duration)).toBe(1050);
  expect(await page.locator('[data-bot-workspace]').evaluate(el => (el as HTMLElement).style.getPropertyValue('--bot-origin-x'))).toBe(`${box!.x + box!.width / 2}px`);
  await expect(page.frameLocator('iframe[title="Boost Bot"]').getByRole('heading', { name: 'Boost 工作台' })).toBeVisible();
  expect(calls.some(call => call.method === 'bot/open')).toBeTruthy();
  await expect(page.locator('.bot-workspace-bar')).toHaveCount(0);
  const workspaceFrame = await page.locator('iframe').boundingBox();
  expect(workspaceFrame!.y).toBe(0);
  expect(workspaceFrame!.height).toBe(860);
  await page.frameLocator('iframe').getByRole('button', { name: '返回 Boost 首页', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.getByRole('link', { name: '设置', exact: true }).click();
  await page.getByRole('button', { name: '设置外观设置', exact: true }).click();
  await page.getByLabel('动画表情', { exact: true }).selectOption('hearts');
  await page.getByLabel('身体轮廓', { exact: true }).selectOption('star');
  await page.getByLabel('动画速度', { exact: true }).selectOption('1.5');
  await page.reload();
  await page.getByRole('button', { name: '设置外观设置', exact: true }).click();
  await expect(page.getByLabel('动画表情', { exact: true })).toHaveValue('hearts');
  await expect(page.getByLabel('身体轮廓', { exact: true })).toHaveValue('star');
  expect(await page.locator('.settings-grid').evaluate(el => getComputedStyle(el).columnCount)).toBe('2');
  await page.setViewportSize({width: 540,height: 860});
  expect(await page.locator('.settings-grid').evaluate(el => getComputedStyle(el).columnCount)).toBe('1');
  expect(errors).toEqual([]);
});

test('bundled navigation avatar animates on entry, after refresh and with reduced motion', async ({ page }) => {
  await fixture(page);
  await page.goto('/');
  await expect(page.locator('.boost-startup')).toHaveCount(0);
  const avatar = page.locator('.brand [data-boost-bot-avatar]');
  await expect(avatar).toHaveAttribute('data-bot-motion','animated');
  const frame = () => avatar.locator('[data-body]').getAttribute('d');
  const first = await frame();
  await expect.poll(frame).not.toBe(first);
  await page.reload();
  await expect(avatar).toHaveAttribute('data-bot-motion','animated');
  const refreshed = await frame();
  await expect.poll(frame).not.toBe(refreshed);
  await page.emulateMedia({reducedMotion:'reduce'});
  await expect(avatar).toHaveAttribute('data-bot-motion','gentle');
  const gentle = await frame();
  await expect.poll(frame).not.toBe(gentle);
  await page.getByRole('link',{name:'设置',exact:true}).click();
  await page.getByRole('button', { name: '设置外观设置', exact: true }).click();
  await page.getByLabel('动画表情',{exact:true}).selectOption('still');
  await expect(avatar).toHaveAttribute('data-bot-motion','gentle');
  const staticPresetBrandFrame = await frame();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.getByRole('link',{name:'首页',exact:true}).click();
  await expect.poll(frame).not.toBe(staticPresetBrandFrame);
});

test('bot deep links center the startup and expose launch failures for retry', async ({ page }) => {
  await fixture(page, true);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.route('**/api/rpc', async (route, next) => {
    if (route.request().postDataJSON().method !== 'bot/open') return route.fallback();
    return route.fulfill({ json: { jsonrpc: '2.0', id: 1, result: { error: '运行时启动失败' } } });
  });
  await page.goto('/bot/');
  await expect(page.getByRole('alert')).toContainText('运行时启动失败');
  await expect(page.getByRole('button', {name: '重试连接'})).toBeVisible();
  await expect(page.locator('[data-bot-workspace]')).toHaveAttribute('data-bot-origin', 'center');
  expect(await page.locator('[data-bot-workspace]').evaluate(el => (el as HTMLElement).style.getPropertyValue('--bot-origin-x'))).toBe('550px');
});

test('refresh retains light theme before RPC resolves and reveals Bot from viewport center', async ({ page }) => {
  await fixture(page);
  await page.route('**/boost-bot/?*', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Boost</title><aside aria-label="机器人">原始 Bot 侧栏</aside><script>parent.postMessage({type:"boost:bot:ready"},"*");parent.postMessage({type:"boost:workspace:content-ready"},"*")</script>' }));
  await page.goto('/settings/');
  await page.getByRole('button', { name: '设置主题模式', exact: true }).click();
  await page.getByRole('button', { name: '浅色', exact: true }).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem('boost.theme.v1'))).toBe('light');
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/rpc', async route => {
    if (route.request().postDataJSON().method === 'appSettings/get') await gate;
    await route.fallback();
  });
  await page.goto('/bot/', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('[data-bot-workspace]')).toHaveAttribute('data-bot-origin', 'center');
  const box = await page.locator('.bot-startup-mark').boundingBox();
  expect(Math.abs(box!.x + box!.width / 2 - 550)).toBeLessThan(1);
  expect(Math.abs(box!.y + box!.height / 2 - 430)).toBeLessThan(1);
  release();
  await expect(page.frameLocator('iframe').getByRole('complementary', { name: '机器人' })).toBeVisible();
  expect(await page.locator('iframe').getAttribute('src')).toContain('boostTheme=light');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});
test.beforeAll(() => mkdirSync(captures, { recursive: true }));

test('network workbench imports flagged cards, tests speed, selects strategy, binds accounts and updates core', async ({ page }) => {
  await fixture(page);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const state: any = { nodes: [], bindings: {}, strategy: 'stable', testRunning: false, selectedId: '', kernel: { installedVersion: '1.14.3', latestVersion: '', autoUpdate: false, busy: false, localPath: 'E:/v2rayN/bin/sing_box/sing-box.exe', source: 'running' } };
  const actions: string[] = [];
  await page.route('**/api/rpc', async route => {
    const { method, params, id } = route.request().postDataJSON();
    if (!['gateway/upstreamProxy/get', 'gateway/proxy/action'].includes(method)) return route.fallback();
    if (method.endsWith('/action')) {
      const { action, options } = params;
      actions.push(action);
      if (action === 'import' && options.text.startsWith('http://127.0.0.1:')) state.nodes.push({ id: 'local', name: '本地代理 · 7897', countryCode: 'JP', country: 'Japan', countrySource: 'measured', protocol: 'http', latencyMs: null, measurement: {} });
      else if (action === 'import') state.nodes = [
        { id: 'jp1', name: '日本 · 东京 01', countryCode: 'JP', country: '日本', protocol: 'trojan', latencyMs: null, measurement: {}, selected: true },
        { id: 'jp2', name: '日本 · 大阪 02', countryCode: 'JP', country: '日本', protocol: 'anytls', latencyMs: null, measurement: {} },
        { id: 'sg1', name: '新加坡 · 专线 03', countryCode: 'SG', country: '新加坡', protocol: 'socks', latencyMs: null, measurement: {} },
      ];
      if (action === 'test') state.nodes.forEach((n: any, i: number) => { n.latencyMs = [52, 38, 76][i]; n.measurement = { state: 'success', jitterMs: [1.5, 2.1, 3.4][i], lossPercent: 0, downloadMbps: [125.8, 96.2, 87.5][i], testedAt: 1794359000 }; });
      if (action === 'strategy') { state.strategy = options.strategy; state.selectedId = options.nodeId; state.nodes.forEach((n: any) => { n.selected = state.strategy === 'manual' ? n.id === options.nodeId : n.id === 'jp2'; }); }
      if (action === 'bind') state.bindings[options.accountId] = options.nodeId;
      if (action === 'coreCheck') state.kernel.latestVersion = '1.14.4';
      if (action === 'coreUpdate') state.kernel.installedVersion = '1.14.4';
      if (action === 'coreAuto') state.kernel.autoUpdate = options.enabled;
    }
    return route.fulfill({ json: { jsonrpc: '2.0', id, result: state } });
  });
  await page.goto('/settings/');
  await expect(page.getByRole('heading', { name: '上游代理', exact: true })).toHaveCount(0);
  await page.goto('/tests/network/');
  await expect(page.getByText('导入节点，开始网络测试', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '导入节点', exact: true }).click();
  await page.getByRole('menuitem', { name: '粘贴节点链接', exact: true }).click();
  await page.getByLabel('待导入节点链接').fill('trojan://fixture@jp1.example.com:443#日本\nanytls://fixture@jp2.example.com:443#日本');
  await page.getByRole('dialog').getByRole('button', { name: '导入节点', exact: true }).click();
  const cards = page.locator('.node-test-card');
  await expect(cards).toHaveCount(3);
  await expect(cards.first().locator('img.country-flag')).toHaveAttribute('src', '/boost-assets/flags/jp.svg');
  await page.getByRole('button', { name: '测速全部', exact: true }).click();
  await cards.first().getByLabel('日本 · 东京 01 的测速详情', { exact: true }).click();
  await expect(cards.first().getByText('下载 125.8 Mbps', { exact: true })).toBeVisible();
  await expect(cards.first().locator('.node-latency.success')).toHaveText('52 ms');
  await cards.first().getByLabel('日本 · 东京 01 的测速详情', { exact: true }).click();
  await expect(cards.nth(1)).toContainText('38 ms');
  await cards.nth(1).click();
  expect(state.strategy).toBe('stable');
  await cards.nth(1).locator('h3').dblclick();
  await expect(cards.nth(1)).toContainText('已固定');
  await expect(cards.getByRole('button', { name: '选用', exact: true })).toHaveCount(0);
  await cards.first().focus();
  await page.keyboard.press('Enter');
  await expect(cards.first()).toContainText('已固定');
  await page.getByRole('button', { name: '手动固定', exact: true }).click();
  await page.getByRole('menuitemradio', { name: '低延迟优先', exact: true }).click();
  await expect(page.getByRole('button', { name: '低延迟优先', exact: true })).toBeVisible();
  await page.setViewportSize({ width: 1480, height: 1000 });
  await expect(page.locator('.test-center .tabs')).toHaveClass(/spring-switch/);
  await page.locator('.test-center').screenshot({ path: resolve(captures, 'network-workbench-dark.png') });
  await page.getByRole('button', { name: '导入节点', exact: true }).click();
  await page.getByRole('menuitem', { name: '添加本地代理', exact: true }).click();
  await page.getByLabel('本地代理端口', { exact: true }).fill('7897');
  await page.getByRole('dialog').getByRole('button', { name: '添加代理', exact: true }).click();
  await expect(cards).toHaveCount(4);
  await expect(cards.last().locator('img.country-flag')).toHaveAttribute('src', '/boost-assets/flags/jp.svg');
  await page.getByRole('button', { name: '内核管理', exact: true }).click();
  await page.getByRole('menuitem', { name: '自动更新设置', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText('E:/v2rayN/bin/sing_box/sing-box.exe');
  await dialog.getByRole('button', { name: '扫描本地', exact: true }).click();
  expect(actions.at(-1)).toBe('coreScan');
  await dialog.getByRole('button', { name: '检查更新', exact: true }).click();
  await expect(dialog).toContainText('1.14.4');
  await dialog.getByRole('switch', { name: '自动更新 sing-box 内核' }).check();
  await dialog.getByRole('button', { name: '更新内核', exact: true }).click();
  await expect(dialog).toContainText('1.14.4');
  await page.keyboard.press('Escape');
  await page.getByRole('link', { name: '账号管理', exact: true }).click();
  await page.getByLabel('账号 a1 的代理节点', { exact: true }).selectOption('jp1');
  await expect(page.getByLabel('账号 a1 的代理节点', { exact: true })).toHaveValue('jp1');
  await page.reload();
  await expect(page.getByLabel('账号 a1 的代理节点', { exact: true })).toHaveValue('jp1');
  await page.goto('/home');
  await expect(page.getByRole('link', { name: '首页', exact: true })).toHaveClass(/active/);
  await page.reload();
  await expect(page.getByRole('heading', { name: '首页', exact: true })).toBeVisible();
  expect(actions).toEqual(expect.arrayContaining(['import', 'test', 'strategy', 'bind', 'coreCheck', 'coreAuto', 'coreUpdate']));
  expect(errors).toEqual([]);
});

test('network controls remain restricted to administrators', async ({ page }) => {
  const calls = await fixture(page, true);
  await page.goto('/tests/network/');
  await expect(page.getByRole('link', { name: '网速测试', exact: true })).toHaveCount(0);
  await expect(page.getByLabel('网速测试面板')).toHaveCount(0);
  expect(calls.some(call => call.method.startsWith('gateway/proxy/') || call.method.startsWith('gateway/upstreamProxy/'))).toBe(false);
});

test("reset credit tooltip shows concise expiries on hover and focus, and refreshes without consuming credits", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await fixture(page);
  const accounts = [
    { id: "ready", label: "Ready", quotaResetAvailableCount: 2 },
    { id: "unknown", label: "Unknown", quotaResetAvailableCount: null },
    { id: "zero", label: "Zero", quotaResetAvailableCount: 0 },
    { id: "partial", label: "Partial", quotaResetAvailableCount: 1 },
  ];
  let expiry = "2026-12-01T04:30:09+08:00";
  let queries = 0;
  const methods: string[] = [];
  await page.route("**/api/rpc", async route => {
    const { id, method } = route.request().postDataJSON();
    methods.push(method);
    let result: unknown;
    if (method === "account/list") result = { items: accounts, total: accounts.length };
    else if (method === "account/usage/list") result = accounts.map(account => ({
      accountId: account.id,
      creditsJson: account.id === "ready" ? JSON.stringify({ rate_limit_reset_credits: {
        credits: [{ expires_at: "2026-12-02T06:09:00+08:00" }, { expires_at: expiry }],
      } }) : null,
    }));
    else if (method === "account/usage/resetCredits") {
      queries++;
      expiry = "2026-12-01T10:00:00+08:00";
      result = { availableCount: 2 };
    } else return route.fallback();
    await route.fulfill({ json: { id, result } });
  });
  await page.goto("/accounts/");
  const trigger = page.getByRole("button", { name: "查询 Ready 的重置次数", exact: true });
  const tooltip = page.getByRole("tooltip");
  await expect(tooltip).toHaveCount(0);
  await trigger.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("可用重置 · 2 次");
  await expect(tooltip.locator("time").first()).toHaveAttribute("datetime", "2026-11-30T20:30:09.000Z");
  await expect(tooltip.locator("time").last()).toHaveAttribute("datetime", "2026-12-01T22:09:00.000Z");
  await expect(tooltip).not.toContainText("最近更新");
  await expect(trigger).toHaveAttribute("aria-describedby", (await tooltip.getAttribute("id"))!);
  expect(queries).toBe(0);
  expect(await tooltip.evaluate(el => el.parentElement === document.body)).toBe(true);
  await tooltip.hover();
  await expect(tooltip).toBeVisible();
  await tooltip.screenshot({ path: resolve(captures, "reset-credits-dark.png") });
  await page.keyboard.press("Escape");
  await expect(tooltip).toHaveCount(0);
  await trigger.focus();
  await expect(tooltip).toBeVisible();
  await page.keyboard.press("Enter");
  await expect.poll(() => queries).toBe(1);
  await expect(trigger).toBeEnabled();
  await trigger.hover();
  await expect(tooltip.locator("time").first()).toHaveAttribute("datetime", "2026-12-01T02:00:00.000Z");
  expect(methods).not.toContain("account/usage/resetQuota");

  for (const [name, message] of [["Unknown", "点击次数查询"], ["Zero", "暂无可用重置"], ["Partial", "到期时间未提供"]]) {
    await page.getByRole("button", { name: `查询 ${name} 的重置次数`, exact: true }).focus();
    await expect(tooltip).toHaveCount(1);
    await expect(tooltip).toContainText(message);
    await expect(tooltip.locator("time")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "查询 Partial 的重置次数", exact: true }).blur();
  await expect(tooltip).toHaveCount(0);
  await page.evaluate(() => document.documentElement.dataset.theme = "light");
  await trigger.hover();
  await expect(tooltip).toHaveCSS("background-color", "rgb(255, 255, 255)");
  await tooltip.screenshot({ path: resolve(captures, "reset-credits-light.png") });
  const box = (await tooltip.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(8);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width - 8);
  await page.setViewportSize({ width: 640, height: 500 });
  await expect(tooltip).toHaveCount(0);
  await page.mouse.move(0, 0);
  await trigger.hover();
  await expect(tooltip).toBeVisible();
  const narrowBox = (await tooltip.boundingBox())!;
  expect(narrowBox.x).toBeGreaterThanOrEqual(8);
  expect(narrowBox.x + narrowBox.width).toBeLessThanOrEqual(632);
  expect(narrowBox.y).toBeGreaterThanOrEqual(8);
  expect(narrowBox.y + narrowBox.height).toBeLessThanOrEqual(492);
  await page.getByRole("link", { name: "首页", exact: true }).click();
  await expect(tooltip).toHaveCount(0);
  expect(errors).toEqual([]);
});

async function fixture(page: Page, member = false, failGooglePrices = false) {
  const calls: { method: string; params: any }[] = [];
  let selected = "";
  let theme = "dark";
  let backgroundTasks: Record<string, any> = {
    warmupCronEnabled: false,
    warmupCronExpression: "",
    warmupCronAccountIds: [],
    warmupIntervalSecs: 0,
    warmupRepeat: false,
    warmupNextRunAt: 0,
  };
  let keys: any[] = [];
  let connections: any[] = [];
  let remoteImported = false;
  const syncedProviders: string[] = [];
  const accounts = [
    {
      id: "a1",
      usagePrimaryWindowRequestCount: 146,
      usagePrimaryWindowTotalTokens: 35170000,
      usagePrimaryWindowEstimatedCostUsd: 9.79,
      usageSecondaryWindowRequestCount: 104,
      usageSecondaryWindowTotalTokens: 30120000,
      usageSecondaryWindowEstimatedCostUsd: 7.92,
      label: "Personal · Plus",
      status: "active",
      hasToken: true,
      planType: "plus",
    },
    {
      id: "a2",
      label: "Workspace · Team",
      status: "active",
      hasToken: true,
      planType: "team",
    },
    {
      id: "a3",
      label: "Development",
      status: "active",
      hasToken: true,
      planType: "plus",
    },
    {
      id: "disabled",
      label: "Disabled account",
      status: "disabled",
      hasToken: true,
    },
  ];
  await page.route("**/api/runtime?*", (route) =>
    route.fulfill({
      json: {
        mode: "web-gateway",
        rpcBaseUrl: "/api/rpc",
        canManageService: false,
        canSelfUpdate: false,
      },
    }),
  );
  await page.route("**/api/events/usage-refresh", (route) =>
    route.fulfill({
      contentType: "text/event-stream",
      body: "retry: 60000\n\n: fixture\n\n",
    }),
  );
  await page.route("**/api/rpc", async (route) => {
    const { method, params, id } = route.request().postDataJSON();
    calls.push({ method, params });
    let result: any;
    switch (method) {
      case "bot/activity":
        result = { available: true, state: "idle", percent: null, activeTasks: 0, waitingTasks: 0 };
        break;
      case 'bot/open':
        result = { url: '/boost-bot/', toolsAllowed: !member };
        break;
      case "appSettings/get":
        result = {
          theme,
          serviceAddr: "localhost:12580",
          routeStrategy: "ordered",
          quotaGuard: { enabled: true },
          backgroundTasks: {
            ...backgroundTasks,
            usagePollingEnabled: true,
            tokenRefreshPollingEnabled: true,
            gatewayKeepaliveEnabled: true,
          },
        };
        break;
      case "appSettings/set":
        theme = (params.patch || params).theme || theme;
        backgroundTasks = {
          ...backgroundTasks,
          ...((params.patch || params).backgroundTasks || {}),
        };
        result = {
          theme,
          serviceAddr: "localhost:12580",
          routeStrategy: "ordered",
          quotaGuard: { enabled: true },
          backgroundTasks: { ...backgroundTasks, usagePollingEnabled: true },
        };
        break;
      case "initialize":
        result = {
          userAgent: "boost-test",
          codexHome: "",
          platformFamily: "windows",
          platformOs: "windows",
        };
        break;
      case "accountManager/session/current":
        result = {
          mode: "accounts",
          role: member ? "member" : "system_admin",
          permissions: member
            ? ["apikey:self", "requestlog:self", "models:read"]
            : ["system:admin"],
        };
        break;
      case "service/codexConfig/read":
        result = {
          path: "C:/Users/test/.codex/config.toml",
          exists: true,
          content: 'model_provider = "Boost"\nmodel = "gpt-5.4"\n',
        };
        break;
      case "account/import":
        if (params.contents?.some((c: string) => c.includes("invalid"))) {
          result = { error: "账号文件格式无效" };
          break;
        }
        accounts.push({
          id: "imported",
          label: "Imported account",
          status: "active",
          hasToken: true,
          planType: "plus",
        });
        result = { created: 1, updated: 0, failed: 0 };
        break;
      case "account/list":
        result = { items: accounts, total: 4 };
        break;
      case "account/usage/aggregate":
        result = {
          primaryBucketCount: 4,
          primaryKnownCount: 4,
          primaryUnknownCount: 0,
          primaryRemainPercent: 75,
          secondaryBucketCount: 4,
          secondaryKnownCount: 4,
          secondaryUnknownCount: 0,
          secondaryRemainPercent: 90,
        };
        break;
      case "account/usage/list":
        result = accounts.map((a) => ({
          accountId: a.id,
          availabilityStatus: "available",
          usedPercent: 25,
          windowMinutes: 300,
          secondaryUsedPercent: 10,
          secondaryWindowMinutes: 10080,
          capturedAt: 1794268800,
        }));
        break;
      case "account/usage/refresh":
        if (params.accountId === "a3") {
          await route.fulfill({
            json: { id, error: { message: "上游返回 401" } },
          });
          return;
        }
        result = { accountId: params.accountId, refreshed: true };
        break;
      case "apikey/list":
        result = keys;
        break;
      case "apikey/usageStats":
      case "accountManager/users/list":
      case "accountManager/apiKeyOwners/list":
        result = [];
        break;
      case "accountManager/status":
        result = { mode: "accounts", distributionEnabled: false };
        break;
      case "aggregateApi/list":
        result = connections;
        break;
      case "quota/modelPools":
        result = { items: [], templates: [], accountOverrides: [] };
        break;
      case "aggregateApi/create":
        connections.push({
          id: "agg" + (connections.length + 1),
          supplierName: params.supplierName,
          url: params.url,
          providerType: params.providerType,
          status: "active",
          modelSlugs: [],
        });
        result = {
          id: connections[connections.length - 1].id,
          key: "upstream-test-key",
        };
        break;
      case "apikey/modelSourceSync":
        remoteImported = true;
        result = {
          sourceModels: [
            {
              sourceKind: params.sourceKind,
              sourceId: params.sourceId || "a1",
              upstreamModel: "remote-model",
              displayName: "Remote Model",
              status: "available",
            },
          ],
          mappings: [],
        };
        break;
      case "requestlog/error_list":
        result = {
          items: [
            {
              traceId: "trace1",
              upstreamUrl: "https://upstream.test/v1/responses",
              errorKind: "timeout",
              cfRay: "ray-123",
              keyId: "key-1",
              accountId: "a1",
              compressionEnabled: true,
              compressionRetryAttempted: true,
              method: "POST",
              requestPath: "/v1/responses",
              stage: "upstream",
              message: "上游连接超时",
              createdAt: 1794268800,
              statusCode: 504,
            },
          ],
          total: 1,
          stages: ["upstream"],
        };
        break;
      case "gateway/manualAccount/get":
        result = { accountId: selected };
        break;
      case "gateway/manualAccount/set":
        selected = params.accountId;
        result = { ok: true };
        break;
      case "gateway/manualAccount/clear":
        selected = "";
        result = { ok: true };
        break;
      case "gateway/transport/get":
        result = {
          upstreamStreamTimeoutMs: 300000,
          upstreamTotalTimeoutMs: 0,
          sseKeepaliveIntervalMs: 15000,
        };
        break;
      case "gateway/routeStrategy/set":
        result = { strategy: params.strategy };
        break;
      case "dashboard/adminUsageSummary":
        result = {
          todayUsage: {
            requestCount: 128,
            successCount: 126,
            errorCount: 2,
            inputTokens: 62000,
            outputTokens: 18000,
            totalTokens: 80000,
            estimatedCostUsd: 0.274,
          },
          dailyUsage: [],
        };
        break;
      case "dashboard/usageHistory": {
        const today = "2026-11-11";
        const todayUsage = {requestCount:128,inputTokens:62000,cachedInputTokens:31000,outputTokens:18000,totalTokens:80000,estimatedCostUsd:0.274};
        result = {today,todayUsage,totals:todayUsage,days:[{day:today,usage:todayUsage}],hasUndatedHistory:false};
        break;
      }
      case "dashboard/memberSummary":
        result = {
          usageToday: { totalCount: 2, totalTokens: 1500 },
          availableModels: [],
        };
        break;
      case "account/warmup": {
        const accountIds = params.accountIds || [];
        const warmupResults = accountIds.map((accountId: string) => ({
          accountId,
          accountName: accounts.find((account) => account.id === accountId)?.label || accountId,
          ok: true,
          message: "请求成功",
          durationMs: 120,
        }));
        result = {
          requested: warmupResults.length,
          succeeded: warmupResults.length,
          failed: 0,
          results: warmupResults,
        };
        break;
      }
      case "service/telemetry":
        result = {
          address: "127.0.0.1:12580",
          processId: 1234,
          uploadBytesPerSecond: 1024,
          downloadBytesPerSecond: 24576,
          memoryBytes: 27682406,
          cpuPercent: 1.2,
          scope: "service_port_api_payload",
          uploadedBytes: 20480,
          downloadedBytes: 2097152,
          activeRequests: 2,
          uptimeSeconds: 2520,
          version: "0.5.0",
          os: "Windows 11 Pro",
          architecture: "x86_64",
          cpuModel: "Intel Core",
          logicalCores: 16,
          systemMemoryBytes: 34359738368,
        };
        break;
      case "service/networkInfo":
        result = {
          ip: "203.0.113.7",
          country: "Japan",
          countryCode: "JP",
          region: "Tokyo",
          city: "Tokyo",
          isp: "Example Network",
          organization: "Example",
          asn: 64500,
          timezone: "Asia/Tokyo",
          viaProxy: true,
          queriedAt: 1794268800,
        };
        break;
      case "requestlog/list":
        result = {
          items: [
            {
              id: "l1",
              model: "gpt-5.4",
              method: "POST",
              requestPath: "/v1/responses",
              accountId: "a1",
              statusCode: 200,
              serviceTier: "fast",
              effectiveServiceTier: "fast",
              createdAt: 1794268800,
              durationMs: 320,
              firstResponseMs: 120,
              totalTokens: 1500,
            },
          ],
          total: 1,
          page: 1,
          pageSize: 20,
        };
        break;
      case "apikey/modelRouting":
        result = {
          sourceModels: [],
          mappings: [
            {
              id: "route1",
              platformModelSlug: remoteImported ? "remote-model" : "gpt-5.4",
              sourceKind: "openai_account",
              sourceId: "a1",
              upstreamModel: "gpt-5.4",
              enabled: true,
            },
            {
              id: "route2",
              platformModelSlug: remoteImported ? "remote-model" : "gpt-5.4",
              sourceKind: "openai_account",
              sourceId: "a2",
              upstreamModel: "gpt-5.4",
              enabled: true,
            },
          ],
        };
        break;
      case "apikey/modelCatalogList":
        result = {
          items: [
            {
              slug: remoteImported ? "remote-model" : "gpt-5.4",
              displayName: remoteImported ? "Remote Model" : "GPT-5.4",
              contextWindow: 128000,
              visibility: "list",
              description: "A reliable model for daily work.",
              supportedReasoningLevels: [
                { effort: "low", description: "" },
                { effort: "medium", description: "" },
                { effort: "high", description: "" },
              ],
              supportedInApi: true,
            },
          ],
        };
        break;
      case "apikey/modelCatalogSave":
        result = { ...params, updatedAt: 1794268800 };
        break;
      case "quota/modelPriceRules/syncOpenai":
        result = { modelCount: 37, ruleCount: 83, syncedAt: 1794268800 };
        break;
      case "quota/modelPriceRules/syncOfficial":
        if (failGooglePrices && params.provider === "google") {
          await route.fulfill({
            json: {
              id,
              error: { message: "Google 官方价格连接失败，已保留现有价格" },
            },
          });
          return;
        }
        syncedProviders.push(params.provider);
        result = { modelCount: 1, ruleCount: 1, syncedAt: 1794268800 };
        break;
      case "quota/modelPriceRules":
        result = syncedProviders.map((provider) => ({
          id: provider,
          provider,
          modelPattern:
            provider === "google"
              ? "gemini-synced"
              : provider === "anthropic"
                ? "claude-synced"
                : "gpt-synced",
          matchType: "exact",
          billingMode: "standard",
          inputPricePer1m: 1,
          cachedInputPricePer1m: 0.1,
          outputPricePer1m: 5,
          cacheWrite5mPricePer1m: provider === "anthropic" ? 1.25 : null,
          cacheWrite1hPricePer1m: provider === "anthropic" ? 2 : null,
          source: "official_sync",
          sourceUrl: "https://example.test/pricing",
          enabled: true,
          priority: 15000,
          updatedAt: 1794268800,
        }));
        break;
      case "apikey/create":
        if (
          ![
            "account_rotation",
            "aggregate_api_rotation",
            "hybrid_rotation",
          ].includes(params.rotationStrategy)
        )
          throw new Error("Invalid rotation strategy");
        keys.push({
          id: "k1",
          name: params.name,
          status: "active",
          protocolType: params.protocolType,
          rotationStrategy: params.rotationStrategy,
        });
        result = { id: "k1", key: "boost-test-secret" };
        break;
      default:
        await route.fulfill({
          json: { id, error: { message: `Unexpected RPC: ${method}` } },
        });
        return;
    }
    await route.fulfill({ json: { id, result } });
  });
  return calls;
}
test("right-edge monitor stays compact on hover and click in both themes", async ({ page }) => {
  await page.setViewportSize({ width: 64, height: 157 });
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await fixture(page);
  await page.goto("/tray-preview/");
  const rail = page.locator(".tray-rail");
  const overflow = () => page.evaluate(() =>
    Array.from(document.querySelectorAll<HTMLElement>("html, body, #app, .tray-page, .tray-rail"))
      .filter(element => element.scrollWidth > element.clientWidth || element.scrollHeight > element.clientHeight)
      .map(element => element.className || element.tagName));
  for (const theme of ["dark", "light"]) {
    if (theme === "light") {
      await page.route("**/api/rpc", async route => {
        const { method, id } = route.request().postDataJSON();
        if (method !== "appSettings/get") return route.fallback();
        await route.fulfill({ json: { id, result: { theme: "business", serviceAddr: "localhost:12580" } } });
      });
      await page.reload();
    }
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(rail.locator(".tray-rail-metric strong")).toHaveText(["1.0", "24", "26"]);
    await expect(rail.locator(".tray-rail-caption")).toHaveText(["", "", ""]);
    await expect(rail).toHaveCSS("width", "64px");
    for (const selector of [".tray-logo", ".tray-quota-ring", ".tray-rail-metric"]) {
      const target = rail.locator(selector).first();
      await target.hover();
      await target.click();
      await expect(page.locator(".tray-details")).toHaveCount(0);
    }
    expect(await overflow()).toEqual([]);
    await page.screenshot({ path: resolve(captures, `edge-dock-collapsed-${theme}.png`), animations: "disabled" });
  }
  await page.setViewportSize({ width: 186, height: 38 });
  await expect(rail).toHaveCSS("flex-direction", "row");
  expect(await overflow()).toEqual([]);
  await page.screenshot({ path: resolve(captures, "edge-dock-horizontal.png"), animations: "disabled" });
  await rail.dblclick();
  await expect(page).toHaveURL("/");
  await expect(page.locator("html")).not.toHaveClass(/tray-preview-window/);
  await page.goto("/tray-preview/");
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL("/");
  expect(errors).toEqual([]);
});

test("theme color swatches update global accents, survive refresh and follow system appearance", async ({ page }) => {
  const calls = await fixture(page);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/settings/");
  await page.getByRole("button", { name: "设置主题模式", exact: true }).click();
  const colors = page.getByRole("group", { name: "主题主色", exact: true });
  const basic = page.getByRole("dialog", { name: "主题模式", exact: true });
  await expect(colors.getByRole("radio")).toHaveCount(17);
  await expect(colors.getByRole("radio", { name: "主色：青绿色", exact: true })).toBeChecked();
  const before = calls.filter(call => call.method === "appSettings/set").length;
  const swatches = colors.locator("label");
  const palette = [
    ["green", "#4ade80", "#15803d"], ["emerald", "#34d399", "#047857"],
    ["teal", "#2dd4bf", "#0f766e"], ["cyan", "#22d3ee", "#0e7490"],
    ["sky", "#38bdf8", "#0369a1"], ["blue", "#60a5fa", "#1d4ed8"],
    ["indigo", "#818cf8", "#4338ca"], ["violet", "#a78bfa", "#6d28d9"],
    ["purple", "#c084fc", "#7e22ce"], ["pink", "#f472b6", "#be185d"],
    ["fuchsia", "#e879f9", "#a21caf"], ["rose", "#fb7185", "#be123c"],
    ["red", "#f87171", "#b91c1c"], ["orange", "#fb923c", "#c2410c"],
    ["amber", "#fbbf24", "#b45309"], ["yellow", "#facc15", "#a16207"],
    ["lime", "#a3e635", "#4d7c0f"],
  ];
  const accent = () => page.locator("html").evaluate(el => getComputedStyle(el).getPropertyValue("--blue").trim());
  for (let i = 0; i < palette.length; i++) {
    await swatches.nth(i).click();
    await expect(page.locator("html")).toHaveAttribute("data-accent", palette[i][0]);
    await expect.poll(accent).toBe(palette[i][1]);
  }
  expect(calls.filter(call => call.method === "appSettings/set")).toHaveLength(before);
  await colors.getByRole("radio", { name: "主色：紫色", exact: true }).focus();
  await page.keyboard.press("Space");
  await expect(colors.getByRole("radio", { name: "主色：紫色", exact: true })).toBeChecked();
  await page.reload();
  await page.getByRole("button", { name: "设置主题模式", exact: true }).click();
  await expect(colors.getByRole("radio", { name: "主色：紫色", exact: true })).toBeChecked();
  await expect.poll(accent).toBe("#c084fc");
  await expect(basic.locator(".segmented button.selected")).toHaveCSS("color", "rgb(24, 24, 27)");
  await basic.screenshot({ path: resolve(captures, "theme-colors-dark.png") });
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  for (let i = 0; i < palette.length; i++) {
    await swatches.nth(i).click();
    await expect.poll(accent).toBe(palette[i][2]);
  }
  await colors.getByTitle("紫色", { exact: true }).click();
  await expect(basic.locator(".segmented button.selected")).toHaveCSS("color", "rgb(255, 255, 255)");
  await basic.screenshot({ path: resolve(captures, "theme-colors-light.png") });
  await page.getByRole("button", { name: "系统", exact: true }).click();
  await page.emulateMedia({ colorScheme: "dark" });
  await expect.poll(accent).toBe("#c084fc");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(accent).toBe("#7e22ce");
  await page.setViewportSize({ width: 390, height: 844 });
  const bounds = await colors.boundingBox();
  for (const swatch of await swatches.all()) {
    const box = await swatch.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(bounds!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(bounds!.x + bounds!.width);
  }
  await basic.screenshot({ path: resolve(captures, "theme-colors-mobile.png") });
  await page.goto("/apikeys/");
  await expect(page.getByRole("button", { name: "新建密钥", exact: true }).first()).toHaveCSS("background-color", "rgb(126, 34, 206)");
});

test("members can select a local theme color without changing service settings", async ({ page }) => {
  const calls = await fixture(page, true);
  await page.goto("/settings/");
  await page.getByRole("button", { name: "设置主题模式", exact: true }).click();
  await page.getByRole("group", { name: "主题主色", exact: true }).getByTitle("蓝色", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "blue");
  expect(calls.some(call => call.method === "appSettings/set")).toBe(false);
});

test("default typography is 13px system text with compact Settings headings", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 1100, height: 850 });
  await page.goto("/settings/");
  await expect(page.locator("html")).toHaveCSS("font-size", "13px");
  const headingSize = await page
    .locator(".settings-grid .panel-header h2")
    .first()
    .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(headingSize).toBe(18);
  const fontFamily = await page.locator("body").evaluate((element) =>
    getComputedStyle(element).fontFamily,
  );
  expect(fontFamily).toContain("Segoe UI");
});

test("agent progress ring follows live estimates and keeps the avatar animated without a frame", async ({ page }) => {
  await fixture(page);
  let state = { available: true, state: "working", percent: null as number | null, activeTasks: 1, waitingTasks: 0 };
  await page.route("**/api/rpc", async route => {
    const { id, method } = route.request().postDataJSON();
    if (method !== "bot/activity") return route.fallback();
    await route.fulfill({ json: { id, result: state } });
  });
  await page.setViewportSize({ width: 64, height: 157 });
  await page.goto("/tray-preview/");
  const ring = page.locator(".bot-task-progress");
  const avatar = ring.locator("[data-boost-bot-avatar]");
  await expect(ring).toHaveClass(/pending/);
  await expect(ring).not.toHaveAttribute("aria-valuenow");
  await expect(avatar.locator("[data-character]")).toHaveCount(1);
  const pose = await avatar.locator("[data-body]").getAttribute("d");
  await expect.poll(() => avatar.locator("[data-body]").getAttribute("d")).not.toBe(pose);
  await expect(page.locator(".tray-logo")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".tray-logo")).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".tray-logo-mark")).toHaveCount(0);
  await expect(page.locator(".tray-metric-upload strong")).toHaveCSS("color", "rgb(255, 159, 10)");
  await expect(page.locator(".tray-metric-download strong")).toHaveCSS("color", "rgb(22, 143, 255)");
  await expect(page.locator(".tray-rail .tray-metric-upload")).toHaveCSS("border-top-color", "rgba(0, 0, 0, 0)");
  state = { ...state, percent: 42 };
  await expect(ring).toHaveAttribute("aria-valuenow", "42");
  await expect(ring.locator(".bot-task-arc")).toHaveAttribute("stroke-dashoffset", "58");
  await page.locator(".tray-logo").click();
  await expect(page.locator(".tray-details")).toHaveCount(0);
  await expect(ring).toHaveAttribute("aria-valuenow", "42");
  await page.screenshot({ path: resolve(captures, "agent-progress-working.png"), animations: "disabled" });
  state = { ...state, state: "waiting", waitingTasks: 1 };
  await expect(ring).toHaveAttribute("data-task-state", "waiting");
  await expect(ring).toHaveAttribute("aria-valuetext", "等待你的回复");
  state = { ...state, state: "done", percent: 100, activeTasks: 0, waitingTasks: 0 };
  await expect(ring).toHaveAttribute("aria-valuenow", "100");
  state = { ...state, state: "idle", percent: null };
  await expect(ring).toHaveAttribute("data-task-state", "idle");
  await expect(ring.locator(".bot-task-arc")).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  state = { ...state, state: "working", percent: null, activeTasks: 1 };
  await expect(ring).toHaveClass(/pending/);
  await expect(ring.locator(".bot-task-ring")).toHaveCSS("animation-name", "none");
});

test("home traffic cards match the supplied metric families and units", async ({ page }) => {
  await fixture(page);
  await page.goto("/");
  const cards = page.locator(".traffic-stat");
  await expect(cards).toHaveCount(6);
  await expect(cards.locator("p")).toHaveText(["上传速度", "下载速度", "活跃连接", "上传量", "下载量", "内核占用"]);
  await expect(cards.nth(0).locator("strong")).toHaveText("1.00KB/s");
  await expect(cards.nth(1).locator("strong")).toHaveText("24.00KB/s");
  await expect(cards.nth(2).locator("strong")).toHaveText("2");
  await expect(cards.nth(5).locator("strong")).toHaveText("26.4MB");
  await expect(cards.nth(0).locator(".icon-tile")).toHaveCSS("color", "rgb(255, 159, 10)");
  await expect(cards.nth(0)).toHaveCSS("border-top-width", "0px");
  await expect(cards.nth(1)).toHaveCSS("border-top-width", "0px");
  await expect(cards.nth(1).locator(".icon-tile")).toHaveCSS("color", "rgb(22, 143, 255)");
  await expect(cards.nth(5).locator(".icon-tile")).toHaveCSS("color", "rgb(240, 68, 68)");
  await page.locator(".traffic-stats").screenshot({ path: resolve(captures, "home-traffic-cards.png") });
});

test("right-edge monitor shows unavailable telemetry and respects member permissions", async ({ page }) => {
  await page.setViewportSize({ width: 64, height: 157 });
  await fixture(page);
  await page.route("**/api/rpc", async (route) => {
    const { method, id } = route.request().postDataJSON();
    if (method === "account/usage/list") {
      await route.fulfill({ json: { id, result: [] } });
      return;
    }
    if (method !== "service/telemetry") return route.fallback();
    await route.fulfill({ json: { id, error: { message: "Telemetry unavailable" } } });
  });
  await page.goto("/tray-preview/");
  await expect(page.locator(".tray-page").getByRole("status")).toHaveText("状态不可用");
  await expect(page.getByRole("img", { name: "5小时剩余额度 暂无数据" })).toBeVisible();
  await expect(page.locator(".tray-rail-metric strong")).toHaveText(["—", "—", "—"]);
  await page.goto("about:blank");
  await page.unrouteAll({ behavior: "wait" });
  const calls = await fixture(page, true);
  await page.goto("/tray-preview/");
  await expect(page.locator(".tray-page").getByRole("status")).toHaveText("服务在线");
  await expect(page.locator(".tray-rail-metric strong")).toHaveText(["—", "—", "—"]);
  expect(calls.some(call => call.method === "service/telemetry")).toBe(false);
});

test("refresh restores saved appearance before paint and shows one ring until data is ready", async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => {
    localStorage.setItem("boost.theme.v1", "light");
    localStorage.setItem("boost.ui.v1", JSON.stringify({ typographyVersion: 1, fontSize: 13, fontWeight: 500, letterSpacing: .8, compactSidebar: true, density: "comfortable" }));
  });
  let release!: () => void;
  let hold = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/rpc", async route => {
    const { id, method } = route.request().postDataJSON();
    if (method === "appSettings/get") return route.fulfill({ json: { id, result: { theme: "business", serviceAddr: "localhost:12580" } } });
    if (method === "account/list") await hold;
    return route.fallback();
  });
  await page.goto("/");
  await expect(page.locator(".boost-startup")).toBeVisible();
  await expect(page.locator(".boost-loading-ring:visible")).toHaveCount(1);
  await expect(page.locator(".boost-startup [data-boost-bot-avatar]")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  expect(await page.locator("html").evaluate(element => (element as HTMLElement).style.getPropertyValue("--font-scale"))).toBe(String(13/14));
  await expect(page.locator(".home-page")).toHaveCount(0);
  const spinner = (await page.locator(".boost-startup-spinner").boundingBox())!;
  await expect(page.locator(".boost-startup-spinner")).toHaveCSS("width", "32px");
  await expect(page.locator(".boost-startup-spinner")).toHaveCSS("height", "32px");
  expect(spinner.x + spinner.width / 2).toBeCloseTo(550, 2);
  expect(spinner.y + spinner.height / 2).toBeCloseTo(430, 2);
  await page.screenshot({ path: resolve(captures, "single-ring-loading.png") });
  release();
  await expect(page.locator(".boost-startup")).toHaveCount(0);
  await expect(page.locator(".home-page")).toBeVisible();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await expect(page.locator("html")).toHaveAttribute("data-density", "comfortable");
  const before = await page.locator(".daily-usage-overview .usage-summary-row").boundingBox();
  expect(await page.locator("html").evaluate(element => (element as HTMLElement).style.getPropertyValue("--font-scale"))).toBe(String(13/14));
  hold = new Promise<void>(resolve => { release = resolve; });
  await page.getByRole("button", { name: "刷新数据" }).click();
  await expect(page.locator(".refresh-ring")).toBeVisible();
  await expect(page.locator(".boost-loading-ring:visible")).toHaveCount(1);
  expect(await page.locator(".daily-usage-overview .usage-summary-row").boundingBox()).toEqual(before);
  release();
  await expect(page.getByRole("button", { name: "刷新数据" })).toBeEnabled();
  expect(await page.locator(".daily-usage-overview .usage-summary-row").boundingBox()).toEqual(before);
  await page.reload();
  await expect(page.locator(".boost-startup")).toHaveCount(0);
  await expect(page.locator(".home-page")).toBeVisible();
  expect(await page.locator(".daily-usage-overview .usage-summary-row").boundingBox()).toEqual(before);
});

test("Zinc dark and light palettes keep the same management layout", async ({ page }) => {
  await fixture(page);
  await page.goto("/");
  await expect(page.locator(".boost-startup")).toHaveCount(0);
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(14, 14, 14)");
  await expect(page.locator(".sidebar")).toHaveCSS("background-color", "rgb(14, 14, 14)");
  const darkBounds = await page.locator(".daily-usage-overview .usage-summary-row").boundingBox();
  await page.screenshot({ path: resolve(captures, "zinc-home-dark.png"), fullPage: true });
  await page.getByRole("link", { name: "设置", exact: true }).click();
  await page.getByRole("button", { name: "设置主题模式", exact: true }).click();
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(245, 245, 246)");
  await expect(page.locator(".sidebar")).toHaveCSS("background-color", "rgb(245, 245, 246)");
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("link", { name: "首页", exact: true }).click();
  await page.locator(".page-content").evaluate(element => { element.scrollTop = 0; });
  expect(await page.locator(".daily-usage-overview .usage-summary-row").boundingBox()).toEqual(darkBounds);
  await page.screenshot({ path: resolve(captures, "zinc-home-light.png"), fullPage: true });
});

test("navigation, dark/light themes, local assets and service telemetry", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls = await fixture(page);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "账号管理", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".daily-usage-overview .usage-summary-metric strong").nth(2)).toContainText("80K");
  await expect(page.getByText("用量趋势", { exact: true })).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "接入地址", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "路由策略", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("progressbar", { name: "5小时内剩余额度", exact: true }),
  ).toHaveAttribute("aria-valuenow", "75");
  await expect(
    page.getByRole("heading", { name: "Personal · Plus", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("上行速度")).toContainText("1.00");
  await expect(page.getByLabel("内核内存占用")).toContainText("26.4");
  await expect(page.getByRole("heading", { name: "流量统计" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "IP 信息" })).toBeVisible();
  await expect(page.getByText("203.0.113.7", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "显示 IP", exact: true }).click();
  await expect(page.getByText("203.0.113.7", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "隐藏 IP", exact: true }).click();
  await page.screenshot({
    path: resolve(captures, "home-information.png"),
    fullPage: true,
  });
  await page.locator(".page-content").evaluate((el) => {
    el.scrollTop = 0;
  });
  await page.screenshot({
    path: resolve(captures, "home-dark.png"),
    fullPage: true,
  });
  for (const [title, path] of [
    ["账号管理", "/accounts/"],
    ["聚合API", "/aggregate-api/"],
    ["密钥", "/apikeys/"],
    ["日志", "/logs/"],
    ["测试", "/tests/"],
    ["模型", "/models/"],
    ["设置", "/settings/"],
  ]) {
    await page
      .getByRole("navigation", { name: "主导航" })
      .getByRole("link", { name: title, exact: true })
      .click();
    await expect(page).toHaveURL(new RegExp(path));
    await expect(page.locator("h1")).toContainText(
      title === "测试" ? "测试中心" : title,
    );
  }
  await page.getByRole("button", { name: "设置主题模式", exact: true }).click();
  await page.getByRole("button", { name: "浅色", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(
    page.getByRole("button", { name: "浅色", exact: true }),
  ).toBeEnabled();
  await page.screenshot({
    path: resolve(captures, "settings-light.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page.getByRole("button", { name: "当前配置", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Codex config.toml", exact: true }),
  ).toContainText("Boost");
  await page.getByRole("button", { name: "关闭对话框", exact: true }).click();
  await page.getByRole("button", { name: "界面设置", exact: true }).click();
  await page.screenshot({
    path: resolve(captures, "interface-dialog.png"),
    fullPage: true,
  });
  await page.getByRole("switch", { name: "收起导航栏" }).click();
  await expect(page.locator(".app-shell")).toHaveClass(/sidebar-collapsed/);
  await page.getByRole("switch", { name: "收起导航栏" }).click();
  await page.getByRole("button", { name: "完成", exact: true }).click();
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "模型", exact: true })
    .click();
  await expect(page.getByText("GPT-5.4", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("GPT-5.4", { exact: true })).toBeVisible();
  await page.setViewportSize({ width: 640, height: 720 });
  await expect(page.locator("body")).toHaveJSProperty("scrollWidth", 640);
  expect(calls.some((c) => c.method === "service/telemetry")).toBeTruthy();
  expect(errors).toEqual([]);
});
test("checks account availability without model requests and permits manual routing", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto("/tests/");
  await page.getByRole("button", { name: "检测全部", exact: true }).click();
  await expect(page.getByText("上游返回 401", { exact: true })).toBeVisible();
  const testCalls = calls.filter((c) => c.method === "account/usage/refresh");
  expect(testCalls.map((c) => c.params.accountId).sort()).toEqual(["a1", "a2", "a3"]);
  expect(testCalls.every((call) => !("model" in call.params))).toBeTruthy();
  expect(calls.some((c) => c.method === "account/warmup")).toBeFalsy();
  await page.locator(".test-card").filter({ hasText: "Workspace · Team" })
    .getByRole("button", { name: "选用", exact: true }).click();
  await expect(
    page.getByText("已选用 Workspace · Team", { exact: true }),
  ).toBeVisible();
  expect(
    calls.find((c) => c.method === "gateway/manualAccount/set")?.params
      .accountId,
  ).toBe("a2");
  await page.screenshot({
    path: resolve(captures, "tests-dark.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "恢复自动选择" }).click();
  await expect(page.getByText("已恢复自动选择", { exact: true })).toBeVisible();
});
test("home omits the usage trend and fast requests use a yellow badge", async ({ page }) => {
  await fixture(page);
  await page.goto("/");
  await expect(page.getByText("用量趋势", { exact: true })).toHaveCount(0);
  await page.goto("/logs/");
  const fast = page.locator(".request-tier .tier-fast").first();
  await expect(fast).toHaveText("fast");
  await expect(fast).toHaveCSS("color", "rgb(251, 191, 36)");
});
test("account warmup offers immediate and scheduled plans", async ({ page }) => {
  const calls = await fixture(page);
  await page.goto("/accounts/");
  await page.getByRole("button", { name: "预热", exact: true }).click();
  await expect.poll(() => calls.some((call) => call.method === "account/warmup")).toBeTruthy();
  const immediate = calls.find((call) => call.method === "account/warmup");
  expect(immediate?.params.message).toBe("hi");
  expect(immediate?.params.accountIds.length).toBeGreaterThan(0);

  await page.getByRole("button", { name: "预热选项" }).click();
  await page.getByRole("menuitem", { name: "定时预热" }).click();
  const dialog = page.getByRole("dialog", { name: "定时预热" });
  await dialog.getByLabel("多少小时后预热").fill("2");
  await dialog.locator(".warmup-account-list").getByRole("checkbox").first().check();
  await dialog.getByRole("button", { name: "保存计划" }).click();
  await expect(page.getByText("定时预热已保存", { exact: true })).toBeVisible();
  const schedule = calls.filter((call) => call.method === "appSettings/set").at(-1)?.params;
  expect(schedule?.backgroundTasks?.warmupCronEnabled).toBe(true);
  expect(schedule?.backgroundTasks?.warmupIntervalSecs).toBe(7200);
  expect(schedule?.backgroundTasks?.warmupCronAccountIds).toHaveLength(1);
});
test("creates a working platform-key rule with backend rotation values", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto("/apikeys/");
  await page.getByRole("button", { name: "新建密钥" }).first().click();
  await page.getByLabel("名称", { exact: true }).fill("Desktop");
  await page.getByRole("button", { name: "保存密钥" }).click();
  await expect(
    page.getByText("boost-test-secret", { exact: true }),
  ).toBeVisible();
  const request = calls.find((c) => c.method === "apikey/create");
  expect(request?.params.rotationStrategy).toBe("account_rotation");
  expect(request?.params.protocolType).toBe("openai_compat");
});
test("member role does not request global telemetry or expose admin controls", async ({
  page,
}) => {
  const calls = await fixture(page, true);
  await page.goto("/tests/");
  await expect(
    page.getByRole("button", { name: "检测全部", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "选用", exact: true }),
  ).toHaveCount(0);
  expect(
    calls.some((c) =>
      [
        "service/telemetry",
        "service/networkInfo",
        "aggregateApi/list",
        "gateway/manualAccount/get",
      ].includes(c.method),
    ),
  ).toBeFalsy();
  await page.goto("/models/");
  await expect(
    page.getByRole("button", { name: "添加模型", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "同步官方价格", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "并入远端模型", exact: true }),
  ).toHaveCount(0);
  expect(calls.some((c) => c.method === "quota/modelPriceRules")).toBeFalsy();
});

test("account import and failures remain usable with a modal open", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto("/accounts/");
  await page
    .getByRole("button", { name: "添加账号", exact: true })
    .first()
    .click();
  await page.getByLabel("或粘贴 JSON", { exact: true }).fill("invalid");
  await page.getByRole("button", { name: "导入账号", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("账号文件格式无效");
  const bounds = await page.locator(".notification-center").boundingBox();
  expect(bounds?.y).toBeLessThan(40);
  await page
    .getByLabel("或粘贴 JSON", { exact: true })
    .fill('{"account":"fixture"}');
  await page.getByRole("button", { name: "导入账号", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Imported account", exact: true }),
  ).toBeVisible();
  expect(calls.some((c) => c.method === "account/import")).toBeTruthy();
});
test("aggregate API, remote model import, price synchronization and gateway logs", async ({
  page,
}) => {
  const calls = await fixture(page);
  await page.goto("/aggregate-api/");
  await page
    .getByRole("button", { name: "添加聚合API", exact: true })
    .first()
    .click();
  await page.getByLabel("名称", { exact: true }).fill("Work API");
  await page
    .getByLabel("上游地址", { exact: true })
    .fill("https://example.test/v1");
  await page
    .getByLabel("API Key", { exact: true })
    .fill("upstream-test-secret");
  await page.getByRole("button", { name: "保存聚合API", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Work API", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "主导航" })
    .getByRole("link", { name: "模型", exact: true })
    .click();
  await page.getByRole("button", { name: "并入远端模型", exact: true }).click();
  await page
    .getByLabel("模型来源", { exact: true })
    .selectOption("aggregate_api");
  await page.getByRole("button", { name: "并入模型", exact: true }).click();
  await expect(page.getByText("Remote Model", { exact: true })).toBeVisible();
  await page.goto("/models/?tab=prices");
  await page.getByRole("button", { name: "同步官方价格", exact: true }).click();
  await expect(
    page.getByText("已同步 3 家官方价格 · 3 个模型", { exact: true }),
  ).toBeVisible();
  await page.goto("/logs/");
  await page.getByRole("button", { name: "网关日志", exact: true }).click();
  await expect(page.getByText("上游连接超时", { exact: true })).toBeVisible();
  expect(
    calls.some(
      (c) =>
        c.method === "apikey/modelSourceSync" &&
        c.params.sourceKind === "aggregate_api",
    ),
  ).toBeTruthy();
});

test("model table, compact typography, rounded stable dialogs and settings columns", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const calls = await fixture(page);
  await page.setViewportSize({ width: 1400, height: 850 });
  await page.goto("/models/");
  await expect(
    page.getByRole("columnheader", { name: "模型", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("columnheader", { name: "推理等级", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("已启用 2 条", { exact: true })).toBeVisible();
  await expect(page.locator(".model-grid")).toHaveCount(0);
  await page.screenshot({ path: resolve(captures, "model-table-dark.png") });
  await page
    .getByRole("button", { name: "查看 gpt-5.4 绑定", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("调用绑定");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.goto("/settings/?tab=models");
  await page.getByRole("button", { name: "添加模型", exact: true }).click();
  await page.setViewportSize({ width: 1100, height: 550 });
  const dialog = page.getByRole("dialog");
  const footer = dialog.locator(".modal-footer");
  await expect(footer).toBeVisible();
  expect(
    await dialog.evaluate((el) =>
      parseFloat(getComputedStyle(el).borderTopLeftRadius),
    ),
  ).toBeGreaterThan(0);
  await page.getByLabel("模型标识", { exact: true }).fill("gpt-custom");
  await page.getByLabel("显示名称", { exact: true }).fill("Custom");
  const before = await footer.boundingBox();
  await dialog
    .locator(".modal-content")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  const after = await footer.boundingBox();
  expect(Math.abs(before!.y - after!.y)).toBeLessThan(1);
  await expect(dialog.locator(".modal-content .form-actions")).toHaveCount(0);
  await page.screenshot({ path: resolve(captures, "stable-dialog.png") });
  await page.getByRole("button", { name: "保存模型", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    calls.some(
      (c) =>
        c.method === "apikey/modelCatalogSave" &&
        c.params.slug === "gpt-custom",
    ),
  ).toBeTruthy();
  await page.goto("/settings/");
  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.locator(".settings-grid .panel").first()).toBeVisible();
  const cards = await page
    .locator(".settings-grid .panel")
    .evaluateAll((elements) =>
      elements.map((el) => el.getBoundingClientRect().x),
    );
  expect(new Set(cards.map((x) => Math.round(x))).size).toBe(2);
  await expect(page.getByRole("tablist", { name: "设置分类" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "进入模型管理" })).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});

test("gateway log detail preserves diagnostic fields", async ({ page }) => {
  await fixture(page);
  await page.goto("/logs/");
  await page.getByRole("button", { name: "网关日志", exact: true }).click();
  await page
    .getByRole("button", { name: "查看网关日志 trace1", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("https://upstream.test/v1/responses");
  await expect(dialog).toContainText("ray-123");
  await expect(dialog).toContainText("已尝试");
  await expect(dialog).toContainText("Personal · Plus");
});

test("provider presets, family import and independent official price failures", async ({
  page,
}) => {
  const calls = await fixture(page, false, true);
  await page.goto("/aggregate-api/");
  for (const preset of ["gpt", "deepseek", "gemini", "claude"]) {
    await page
      .getByRole("button", { name: "添加聚合API", exact: true })
      .first()
      .click();
    await page.getByLabel("快速配置", { exact: true }).selectOption(preset);
    await page.getByLabel("API Key", { exact: true }).fill("test-upstream");
    await page
      .getByRole("button", { name: "保存聚合API", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
  }
  await page.goto("/models/");
  await page.getByRole("button", { name: "并入远端模型", exact: true }).click();
  await expect(page.getByLabel("模型来源", { exact: true })).toHaveValue(
    "openai_account",
  );
  await page
    .getByLabel("模型来源", { exact: true })
    .selectOption("aggregate_api");
  await expect(page.getByRole("dialog").getByRole("checkbox")).toHaveCount(4);
  await page.getByLabel("模型来源", { exact: true }).selectOption("gemini");
  await expect(page.getByRole("dialog").getByRole("checkbox")).toHaveCount(1);
  await page.getByRole("button", { name: "并入模型", exact: true }).click();
  await expect(page.getByText("Remote Model", { exact: true })).toBeVisible();
  expect(
    calls.some(
      (c) =>
        c.method === "apikey/modelSourceSync" &&
        c.params.sourceKind === "aggregate_api" &&
        c.params.sourceId === "agg3",
    ),
  ).toBeTruthy();
  await page.goto("/models/?tab=prices");
  await page.getByRole("button", { name: "同步官方价格", exact: true }).click();
  await expect(page.getByText("gpt-synced", { exact: true })).toBeVisible();
  await expect(page.getByText("claude-synced", { exact: true })).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "Google 官方价格连接失败",
  );
  expect(
    calls
      .filter((c) => c.method === "quota/modelPriceRules/syncOfficial")
      .map((c) => c.params.provider),
  ).toEqual(["openai", "google", "anthropic"]);
  await expect(
    page.getByRole("row").filter({ hasText: "claude-synced" }),
  ).toContainText("5m $1.25");
});

test("Boost configuration guide uses platform key placeholder and stable footer", async ({
  page,
}) => {
  await fixture(page);
  await page.goto("/settings/");
  await page.getByRole("button", { name: "配置方法", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("$env:BOOST_API_KEY = '平台密钥'");
  await expect(dialog).toContainText('env_key = "BOOST_API_KEY"');
  await expect(dialog).toContainText('model_provider = "Boost"');
  await expect(dialog).toContainText("http://localhost:12580/v1");
  await expect(dialog.locator(".guide-code")).not.toContainText("boost-");
  const before = await dialog.locator(".modal-footer").boundingBox();
  await dialog
    .locator(".modal-content")
    .evaluate((el) => (el.scrollTop = el.scrollHeight));
  const after = await dialog.locator(".modal-footer").boundingBox();
  expect(Math.abs((before?.y || 0) - (after?.y || 0))).toBeLessThan(1);
  await dialog.locator(".modal-content").evaluate((el) => (el.scrollTop = 0));
  await dialog
    .getByRole("button", { name: "OpenAI 兼容客户端", exact: true })
    .click();
  await expect(dialog).toContainText('os.environ["BOOST_API_KEY"]');
  await expect(dialog.locator(".spring-indicator")).toHaveCount(1);
  await dialog.getByRole("button", { name: "完成", exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

async function workflowFixture(page: Page) {
  const calls = await fixture(page);
  const connections: any[] = [
    {
      id: "work-api",
      supplierName: "Work API",
      url: "https://api.anthropic.test/v1",
      providerType: "claude",
      status: "active",
      authType: "apikey",
      authParams: {
        location: "header",
        name: "x-api-key",
        headerValueFormat: "raw",
      },
      action: "/messages",
      modelOverride: "",
      sort: 4,
      modelSlugs: [],
      balanceQueryEnabled: true,
      balanceQueryTemplate: "custom",
      balanceQueryBaseUrl: "https://balance.test",
      balanceQueryUserId: "42",
      balanceQueryConfigJson:
        '{"method":"GET","path":"/balance","remainingPath":"balance","unit":"USD"}',
    },
    {
      id: "disabled-api",
      supplierName: "Disabled API",
      url: "https://api.disabled.test/v1",
      providerType: "codex",
      status: "disabled",
      modelSlugs: [],
      sort: 5,
    },
  ];
  const model = (slug: string, name = slug, kind = "remote") => ({
    slug,
    displayName: name,
    sourceKind: kind,
    userEdited: kind === "custom",
    sortIndex: 0,
    updatedAt: 1794268800,
    visibility: "list",
    supportedInApi: true,
    contextWindow: 128000,
    description: "A model from " + kind,
    supportedReasoningLevels: [{ effort: "medium", description: "" }],
  });
  let catalog: any[] = [
    model("gpt-5.4", "GPT-5.4"),
    model("claude-text", "Claude Text"),
  ];
  let sources: any[] = [];
  let mappings: any[] = [];
  let prices: any[] = [];
  let templates: any[] = [
    {
      supplierKey: "Work API",
      providerType: "claude",
      upstreamModel: "claude-template",
      displayName: "Shared Claude",
      status: "available",
      createdAt: 1,
      updatedAt: 1,
    },
  ];
  function addSource(id: string, displayName?: string) {
    if (!sources.some((m) => m.upstreamModel === id))
      sources.push({
        sourceKind: "aggregate_api",
        sourceId: "work-api",
        upstreamModel: id,
        displayName: displayName || id,
        status: "available",
        discoveryKind: "manual",
        createdAt: 1,
        updatedAt: 1,
      });
    if (!catalog.some((m) => m.slug === id))
      catalog.push(model(id, displayName || id));
    return sources.find((m) => m.upstreamModel === id);
  }
  await page.route("**/api/rpc", async (route) => {
    const { method, params, id } = route.request().postDataJSON();
    let result: any;
    switch (method) {
      case "initialize":
        result = {
          userAgent: "codex_cli_rs/0.120.0",
          platformFamily: "windows",
          platformOs: "windows",
        };
        break;
      case "aggregateApi/list":
        result = connections;
        break;
      case "aggregateApi/update": {
        const a = connections.find((a) => a.id === params.id);
        Object.assign(
          a,
          Object.fromEntries(
            Object.entries(params).filter(([k, v]) => k !== "id" && v != null),
          ),
        );
        result = { ok: true };
        break;
      }
      case "aggregateApi/testConnection":
        result = { id: params.id, ok: true, latencyMs: 123 };
        break;
      case "aggregateApi/refreshBalance": {
        const a = connections.find((a) => a.id === params.id);
        a.lastBalanceStatus = "success";
        a.lastBalanceAt = 1794268800;
        a.lastBalanceJson = JSON.stringify({
          remaining: 24.5,
          unit: "USD",
          isValid: true,
        });
        result = {
          id: params.id,
          ok: true,
          balance: { remaining: 24.5, unit: "USD" },
          latencyMs: 20,
        };
        break;
      }
      case "aggregateApi/readSecret":
        result = {
          id: params.id,
          key: "fixture-upstream-key",
          authType: "apikey",
        };
        break;
      case "aggregateApi/supplierModels/list":
        result = templates;
        break;
      case "aggregateApi/supplierModels/save": {
        const row = { ...params, createdAt: 1, updatedAt: 1 };
        templates = [
          ...templates.filter((m) => m.upstreamModel !== params.upstreamModel),
          row,
        ];
        result = row;
        break;
      }
      case "aggregateApi/supplierModels/delete":
        templates = templates.filter(
          (m) => m.upstreamModel !== params.upstreamModel,
        );
        result = { ok: true };
        break;
      case "aggregateApi/sourceModels/importSupplier": {
        const rows = templates
          .filter((m) => m.status === "available")
          .map((m) => addSource(m.upstreamModel, m.displayName));
        result = { imported: rows.length, items: rows };
        break;
      }
      case "apikey/modelCatalogList":
        result = { items: catalog };
        break;
      case "apikey/modelCatalogSave": {
        const row = {
          ...model(
            params.slug,
            params.display_name || params.slug,
            params.sourceKind || "custom",
          ),
          ...params,
          displayName: params.display_name || params.slug,
          userEdited: true,
        };
        catalog = [
          ...catalog.filter(
            (m) => m.slug !== (params.previousSlug || params.slug),
          ),
          row,
        ];
        result = row;
        break;
      }
      case "apikey/modelCatalogDelete":
        catalog = catalog.filter((m) => m.slug !== params.slug);
        mappings = mappings.filter((m) => m.platformModelSlug !== params.slug);
        result = { ok: true };
        break;
      case "apikey/modelRouting":
        result = { sourceModels: sources, mappings };
        break;
      case "apikey/modelSourceSync":
        addSource("claude-native", "Native Claude");
        result = { sourceModels: sources, mappings };
        break;
      case "apikey/modelSourceModelSave":
        result = addSource(params.upstreamModel, params.displayName);
        break;
      case "apikey/modelSourceMappingSave": {
        const row = {
          ...params,
          id: params.id || "mapping-" + (mappings.length + 1),
          createdAt: 1,
          updatedAt: 1,
        };
        mappings = [...mappings.filter((m) => m.id !== row.id), row];
        result = row;
        break;
      }
      case "apikey/modelSourceMappingDelete":
        mappings = mappings.filter((m) => m.id !== params.id);
        result = { ok: true };
        break;
      case "quota/modelPriceRules":
        result = prices;
        break;
      case "quota/modelPriceRules/syncOfficial": {
        const row = {
          id: "official-" + params.provider,
          provider: params.provider,
          modelPattern: "official-" + params.provider,
          matchType: "exact",
          billingMode: "standard",
          source: "official_sync",
          sourceUrl: "https://example.test/pricing",
          inputPricePer1m: 1,
          cachedInputPricePer1m: 0.1,
          outputPricePer1m: 5,
          enabled: true,
          priority: 15000,
          updatedAt: 1794268800,
        };
        prices = [...prices.filter((r) => r.id !== row.id), row];
        result = { modelCount: 1, ruleCount: 1, syncedAt: 1794268800 };
        break;
      }
      case "quota/modelPriceRule/upsert": {
        const row = {
          ...params,
          id: params.id || "custom-" + (prices.length + 1),
          source: "custom",
          billingMode: "standard",
          updatedAt: 1794268800,
        };
        prices = [...prices.filter((r) => r.id !== row.id), row];
        result = prices;
        break;
      }
      case "quota/modelPriceRule/delete":
        prices = prices.filter((r) => r.id !== params.id);
        result = prices;
        break;
      default:
        await route.fallback();
        return;
    }
    calls.push({ method, params });
    await route.fulfill({ json: { id, result } });
  });
  return calls;
}

test("model workspace owns prices, custom rules and legacy settings redirects", async ({
  page,
}) => {
  const calls = await workflowFixture(page);
  await page.goto("/models/");
  await expect(
    page.getByRole("tab", { name: "模型目录", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("button", { name: "同步官方价格", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "添加模型", exact: true }),
  ).toBeVisible();
  const catalogStyle = await page.locator(".models-table").evaluate((table) => {
    const style = (el: Element | null) => (el ? getComputedStyle(el) : null);
    return {
      headerBackground: style(table.querySelector("th"))?.backgroundColor,
      headerFont: style(table.querySelector("th"))?.fontSize,
      modelFont: style(table.querySelector("h3"))?.fontSize,
      modelFamily: style(table.querySelector("h3"))?.fontFamily,
      rowBackground: style(table.querySelector("tbody tr"))?.backgroundColor,
    };
  });
  await page.getByLabel("搜索模型", { exact: true }).fill("claude");
  await page.getByRole("tab", { name: "模型计费", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "添加模型", exact: true }),
  ).toHaveCount(0);
  await expect(
    page
      .getByRole("tablist", { name: "模型分类", exact: true })
      .locator(".spring-indicator"),
  ).toHaveCount(1);
  await page.getByLabel("价格提供商", { exact: true }).selectOption("google");
  await page.getByRole("button", { name: "同步官方价格", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "同步官方价格", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "新增价格", exact: true }).click();
  await page.getByLabel("模型匹配", { exact: true }).fill("claude-text");
  await page.getByLabel("提供商", { exact: true }).fill("anthropic");
  await page.getByLabel("输入（$/百万 tokens）", { exact: true }).fill("2");
  await page.getByLabel("输出（$/百万 tokens）", { exact: true }).fill("8");
  await page.getByRole("button", { name: "保存价格", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByLabel("价格提供商", { exact: true }).selectOption("all");
  const custom = page.getByRole("row").filter({
    has: page.getByRole("button", {
      name: "编辑 claude-text 价格",
      exact: true,
    }),
  });
  await expect(custom).toContainText("$2");
  const billingStyle = await page.locator(".prices-table").evaluate((table) => {
    const style = (el: Element | null) => (el ? getComputedStyle(el) : null);
    return {
      headerBackground: style(table.querySelector("th"))?.backgroundColor,
      headerFont: style(table.querySelector("th"))?.fontSize,
      modelFont: style(table.querySelector("h3"))?.fontSize,
      modelFamily: style(table.querySelector("h3"))?.fontFamily,
      rowBackground: style(table.querySelector("tbody tr"))?.backgroundColor,
    };
  });
  expect(billingStyle).toEqual(catalogStyle);
  await page.screenshot({ path: resolve(captures, "model-billing-dark.png") });
  await page.setViewportSize({ width: 550, height: 750 });
  expect(
    await page
      .locator(".prices-table tbody tr")
      .first()
      .locator("td")
      .nth(2)
      .evaluate((el) => getComputedStyle(el).display),
  ).toBe("table-cell");
  await page.setViewportSize({ width: 1100, height: 860 });
  await page
    .getByRole("button", { name: "编辑 claude-text 价格", exact: true })
    .click();
  await page.getByLabel("输入（$/百万 tokens）", { exact: true }).fill("3.5");
  await page.getByRole("button", { name: "保存价格", exact: true }).click();
  await expect(custom).toContainText("$3.5");
  await page
    .getByRole("button", { name: "删除 claude-text 价格", exact: true })
    .click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "删除 claude-text 价格", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("official-google", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "模型目录", exact: true }).click();
  await expect(page.getByLabel("搜索模型", { exact: true })).toHaveValue(
    "claude",
  );
  await expect(
    page.getByRole("columnheader", { name: "调用状态", exact: true }),
  ).toBeVisible();
  await page.goto("/settings/");
  await expect(
    page.getByRole("tab", { name: "模型管理", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "同步官方价格", exact: true }),
  ).toHaveCount(0);
  await page.goto("/settings/?tab=prices");
  await expect(page).toHaveURL(/\/models\/\?tab=prices/);
  await expect(
    page.getByRole("tab", { name: "模型计费", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("columnheader", { name: "输入", exact: true }),
  ).toBeVisible();
  expect(
    calls.filter((c) => c.method === "quota/modelPriceRule/upsert"),
  ).toHaveLength(2);
});

test("aggregate model pool restores remote import, supplier templates and editable routing", async ({
  page,
}) => {
  const calls = await workflowFixture(page);
  await page.goto("/aggregate-api/");
  await page
    .getByRole("button", { name: "导入 Work API 模型", exact: true })
    .click();
  let dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "从供应商模板导入", exact: true })
    .click();
  await expect(
    dialog.getByText("claude-template", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "拉取远端模型", exact: true })
    .click();
  await expect(
    dialog.getByText("claude-native", { exact: true }),
  ).toBeVisible();
  await dialog.getByLabel("上游模型名", { exact: true }).fill("claude-manual");
  await dialog
    .getByLabel("模型显示名称", { exact: true })
    .fill("Manual Claude");
  await dialog
    .getByRole("button", { name: "添加到模型池", exact: true })
    .click();
  await expect(
    dialog.getByText("claude-manual", { exact: true }),
  ).toBeVisible();
  await dialog.getByRole("tab", { name: "供应商模板", exact: true }).click();
  await dialog
    .getByLabel("上游模型名", { exact: true })
    .fill("claude-new-template");
  await dialog.getByLabel("模型显示名称", { exact: true }).fill("New Template");
  await dialog
    .getByRole("button", { name: "保存供应商模板", exact: true })
    .click();
  await expect(
    dialog.getByText("claude-new-template", { exact: true }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "切换模板 claude-new-template", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", {
      name: "导入 claude-new-template",
      exact: true,
    }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "切换模板 claude-new-template", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "导入 claude-new-template", exact: true })
    .click();
  await dialog
    .getByRole("button", { name: "删除模板 claude-new-template", exact: true })
    .click();
  await dialog.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(
    dialog.getByText("claude-new-template", { exact: true }),
  ).toHaveCount(0);
  await dialog.getByRole("tab", { name: "当前模型池", exact: true }).click();
  await dialog
    .getByRole("row")
    .filter({ hasText: "claude-template" })
    .getByRole("link", { name: "管理绑定", exact: true })
    .click();
  dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("调用绑定");
  await dialog.getByLabel("上游模型", { exact: true }).fill("claude-template");
  await dialog.getByLabel("绑定优先级", { exact: true }).fill("7");
  await dialog.getByLabel("绑定权重", { exact: true }).fill("2");
  await dialog
    .getByLabel("绑定计费模型", { exact: true })
    .fill("claude-billing");
  await dialog.getByRole("button", { name: "保存并关联", exact: true }).click();
  await expect(dialog.getByText("1 条启用", { exact: true })).toBeVisible();
  await dialog.getByLabel("启用绑定", { exact: true }).uncheck();
  await dialog.getByRole("button", { name: "保存绑定", exact: true }).click();
  await expect(dialog.getByText("0 条启用", { exact: true })).toBeVisible();
  await dialog
    .getByRole("button", { name: "删除绑定 mapping-1", exact: true })
    .click();
  await dialog.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(dialog.getByText("暂无调用绑定", { exact: true })).toBeVisible();
  expect(
    calls.some(
      (c) =>
        c.method === "aggregateApi/sourceModels/importSupplier" &&
        c.params.apiId === "work-api",
    ),
  ).toBeTruthy();
  expect(
    calls.some(
      (c) =>
        c.method === "apikey/modelSourceSync" &&
        c.params.sourceId === "work-api",
    ),
  ).toBeTruthy();
  expect(
    calls.some(
      (c) =>
        c.method === "apikey/modelSourceMappingSave" &&
        c.params.priority === 7 &&
        c.params.weight === 2 &&
        c.params.billingModelSlug === "claude-billing",
    ),
  ).toBeTruthy();
});

test("catalog edits retain advanced parameters and export without writing local Codex config", async ({
  page,
}) => {
  const calls = await workflowFixture(page);
  await page.goto("/models/");
  await page.getByRole("button", { name: "添加模型", exact: true }).click();
  await page.getByLabel("模型标识", { exact: true }).fill("custom-coder");
  await page.getByLabel("显示名称", { exact: true }).fill("Custom Coder");
  await page.getByText("高级模型参数", { exact: true }).click();
  await page.getByLabel("模型参数 JSON", { exact: true }).fill(
    JSON.stringify({
      defaultReasoningLevel: "high",
      supportedReasoningLevels: [
        { effort: "high", description: "Deep reasoning" },
      ],
      supportsParallelToolCalls: true,
    }),
  );
  await page.getByRole("button", { name: "保存模型", exact: true }).click();
  await expect(page.getByText("Custom Coder", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "导出模型缓存", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("models_cache.json");
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const payload = JSON.parse(await readFile(path!, "utf8"));
  expect(payload.client_version).toBe("0.120.0");
  expect(
    payload.models.some(
      (m: any) =>
        m.slug === "custom-coder" && m.default_reasoning_level === "high",
    ),
  ).toBeTruthy();
  await page.getByLabel("模型筛选", { exact: true }).selectOption("custom");
  await page.getByLabel("选择全部模型", { exact: true }).check();
  await page.getByRole("button", { name: "批量删除模型", exact: true }).click();
  await page.getByRole("button", { name: "确认删除", exact: true }).click();
  await expect(page.getByText("Custom Coder", { exact: true })).toHaveCount(0);
  await page.getByLabel("模型筛选", { exact: true }).selectOption("all");
  await expect(page.getByText("GPT-5.4", { exact: true })).toBeVisible();
  expect(
    calls.some(
      (c) =>
        c.method === "apikey/modelCatalogSave" &&
        c.params.supports_parallel_tool_calls === true,
    ),
  ).toBeTruthy();
  expect(
    calls.some((c) =>
      /sync_codex|syncCodex|codexConfig.*(?:write|save)/i.test(c.method),
    ),
  ).toBeFalsy();
});

test("aggregate advanced settings, balance and key actions preserve original connection fields", async ({
  page,
}) => {
  const calls = await workflowFixture(page);
  await page.goto("/aggregate-api/");
  await page
    .getByRole("button", { name: "编辑 Work API", exact: true })
    .click();
  await page.getByText("高级配置", { exact: true }).click();
  await expect(page.getByLabel("认证参数 JSON", { exact: true })).toHaveValue(
    /x-api-key/,
  );
  await expect(page.getByLabel("请求路径", { exact: true })).toHaveValue(
    "/messages",
  );
  await expect(page.getByLabel("查询用户 ID", { exact: true })).toHaveValue(
    "42",
  );
  await page.getByLabel("认证参数 JSON", { exact: true }).fill("{");
  await page.getByRole("button", { name: "保存聚合API", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "认证参数必须为有效 JSON",
  );
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("认证参数 JSON", { exact: true }).fill(
    JSON.stringify({
      location: "header",
      name: "x-api-key",
      headerValueFormat: "raw",
    }),
  );
  await page.getByLabel("名称", { exact: true }).fill("Renamed API");
  await page.getByLabel("排序优先级", { exact: true }).fill("9");
  await page.getByRole("button", { name: "保存聚合API", exact: true }).click();
  const update = calls.find((c) => c.method === "aggregateApi/update");
  expect(update?.params.authParams.name).toBe("x-api-key");
  expect(update?.params.balanceQueryConfigJson).toContain("remainingPath");
  await page.getByRole("button", { name: "刷新余额", exact: true }).click();
  await expect(page.getByText("$24.50", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "测试全部", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "测试全部", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Renamed API 的操作", exact: true })
    .click();
  await page.getByRole("menuitem", { name: "查看连接凭据", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("fixture-upstream-key");
  await page.getByRole("button", { name: "关闭", exact: true }).click();
  await page.getByRole("button", { name: "Renamed API 的操作", exact: true }).click();
  await page.getByRole("menuitem", { name: "设为优先", exact: true }).click();
  await expect(page.getByRole("button", { name: "Renamed API 的操作", exact: true })).toBeEnabled();
  expect(
    calls.some(
      (c) => c.method === "aggregateApi/update" && c.params.sort === 0,
    ),
  ).toBeTruthy();
  expect(
    calls.filter((c) => c.method === "aggregateApi/testConnection"),
  ).toHaveLength(1);
  expect(
    calls
      .filter((c) => c.method === "aggregateApi/testConnection")
      .every((c) => c.params.id === "work-api"),
  ).toBeTruthy();
  await page.getByRole("button", { name: "已关闭 1", exact: true }).click();
  await page
    .getByRole("button", { name: "导入 Disabled API 模型", exact: true })
    .click();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "拉取远端模型", exact: true }),
  ).toBeDisabled();
  await expect(
    page
      .getByRole("dialog")
      .getByRole("button", { name: "从供应商模板导入", exact: true }),
  ).toBeDisabled();
});

test("sidebar search supports keyboard navigation, settings deep links and permissions", async ({ page }) => {
  await fixture(page);
  await page.goto('/settings/');
  await expect(page.locator('.topbar h1')).toHaveCSS('font-size', '22px');
  await expect(page.locator('.nav-item').first()).toHaveCSS('letter-spacing', '0.5px');
  const heading = (await page.locator('.topbar h1').boundingBox())!;
  const brand = (await page.locator('.brand-word').boundingBox())!;
  expect(Math.abs(heading.y + heading.height / 2 - brand.y - brand.height / 2)).toBeLessThan(2);
  await page.getByRole('button', { name: '搜索页面与设置', exact: true }).click();
  const input = page.getByRole('combobox', { name: '搜索页面与设置', exact: true });
  await expect(input).toBeFocused();
  await input.fill('TPS');
  await expect(page.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog', { name: '显示内容', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await page.keyboard.press('Control+k');
  await expect(input).toBeFocused();
  await input.fill('no-such-entry');
  await expect(page.getByText('未找到匹配结果', { exact: true })).toBeVisible();
  await input.fill('model');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('option', { selected: true })).toContainText('模型映射规则');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.setViewportSize({ width: 640, height: 720 });
  await page.getByRole('button', { name: '搜索页面与设置', exact: true }).click();
  await expect(input).toBeVisible();
  await page.keyboard.press('Escape');
  await page.goto('about:blank');
  await page.unrouteAll({ behavior: 'wait' });
  await fixture(page, true);
  await page.goto('/');
  await page.keyboard.press('Control+k');
  await input.fill('路由');
  await expect(page.getByRole('option')).toHaveCount(0);
});
