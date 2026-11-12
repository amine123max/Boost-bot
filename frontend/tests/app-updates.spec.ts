import { test, expect, type Page } from "@playwright/test";

async function desktop(
  page: Page,
  options: {
    auto?: boolean;
    available?: boolean;
    portable?: boolean;
    failure?: string;
    localTps?: number;
    dockEdge?: "top" | "left" | "right";
  } = {},
) {
  await page.addInitScript((options) => {
    const state = ((window as any).__updateFixture = {
      auto: options.auto ?? true,
      available: options.available ?? true,
      portable: options.portable ?? false,
      failure: options.failure || "",
      calls: [] as string[],
      requests: [] as { command: string; args: any }[],
      pending: null as any,
    });
    const callbacks = new Map<number, (event: unknown) => void>();
    let callbackId = 0;
    const settings = () => ({
      mainWindowCloseAction: localStorage.getItem("test.closeAction") || "ask",
      theme: "dark",
      serviceAddr: "localhost:12580",
      updateAutoCheck: state.auto,
    });
    const check = () => ({
      repo: "amine123max/Boost-bot",
      mode: state.portable ? "portable" : "installer",
      isPortable: state.portable,
      hasUpdate: state.available,
      canPrepare: state.available,
      currentVersion: "0.5.0",
      latestVersion: state.available ? "0.5.1" : "0.5.0",
      releaseTag: state.available ? "v0.5.1" : "v0.5.0",
      checkedAtUnixSecs: Math.floor(Date.now() / 1000),
    });
    (window as any).__TAURI_INTERNALS__ = {
      metadata: { currentWindow: { label: "main" }, currentWebview: { label: "main" } },
      transformCallback: (handler: (event: unknown) => void) => { callbacks.set(++callbackId, handler); return callbackId; },
      unregisterCallback: () => {},
      invoke: async (command: string, args: any) => {
        state.calls.push(command);
        state.requests.push({ command, args });
        switch (command) {
          case "plugin:event|listen":
            if (args.event === "main-window-close-requested") (window as any).__closeRequested = () => callbacks.get(args.handler)?.({ payload: "" });
            return args.handler;
          case "app_tray_layout_sync":
            return { edge: options.dockEdge || "floating", horizontal: options.dockEdge === "top" };
          case "app_local_agent_activity":
            return { available: true, state: options.localTps == null ? "idle" : "working", percent: options.localTps == null ? null : 40, activeTasks: options.localTps == null ? 0 : 1, waitingTasks: 0, tokensPerSecond: options.localTps ?? null };
          case "app_main_window_close":
            (window as any).__closeChoice = args;
            if (args.remember) localStorage.setItem("test.closeAction", args.action);
            return true;
          case "app_settings_get":
            return settings();
          case "app_settings_set":
            if (args.patch.mainWindowCloseAction) localStorage.setItem("test.closeAction", args.patch.mainWindowCloseAction);
            if (args.patch.updateAutoCheck !== undefined)
              state.auto = args.patch.updateAutoCheck;
            return settings();
          case "service_account_manager_session_current":
            return { role: "system_admin", permissions: ["system:admin"] };
          case "service_initialize":
            return {
              platformFamily: "windows",
              platformOs: "windows",
              userAgent: "test",
            };
          case "service_requestlog_list":
            return { items: [], total: 0 };
          case "service_account_usage_list":
            return [];
          case "app_update_check":
            if (state.failure) throw new Error(state.failure);
            return check();
          case "app_update_status":
            return {
              repo: "amine123max/Boost-bot",
              currentVersion: "0.5.0",
              pending: state.pending,
            };
          case "app_update_prepare":
            if (state.failure) throw new Error(state.failure);
            state.pending = {
              ...check(),
              prepared: true,
              downloaded: true,
              assetName: "Boost-setup.exe",
              assetPath: "test/Boost-setup.exe",
            };
            return state.pending;
          case "app_update_launch_installer":
          case "app_update_apply_portable":
            return { ok: true, message: "已启动更新" };
          default:
            return {};
        }
      },
    };
  }, options);
}

const calls = (page: Page, command: string) =>
  page.evaluate(
    (command) =>
      (window as any).__updateFixture.calls.filter(
        (value: string) => value === command,
      ).length,
    command,
  );

test("automatic check only prompts, repeats every 24 hours, and respects disabling", async ({
  page,
}) => {
  await page.clock.install();
  await desktop(page);
  await page.goto("/settings/");
  const dialog = page.getByRole("dialog", { name: "发现 Boost 新版本" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("0.5.1");
  await expect(dialog).not.toContainText("amine123max/Boost-bot");
  expect(await calls(page, "app_update_prepare")).toBe(0);
  expect(await calls(page, "app_update_launch_installer")).toBe(0);
  await dialog.getByRole("button", { name: "稍后", exact: true }).click();
  await page.clock.fastForward(23 * 60 * 60 * 1000);
  expect(await calls(page, "app_update_check")).toBe(1);
  await page.clock.fastForward(60 * 60 * 1000);
  await expect.poll(() => calls(page, "app_update_check")).toBe(2);
  await expect(dialog).toHaveCount(0);
  await page
    .getByRole("switch", { name: "自动检查更新", exact: true })
    .uncheck();
  await page.clock.fastForward(24 * 60 * 60 * 1000);
  expect(await calls(page, "app_update_check")).toBe(2);
  await page.getByRole("button", { name: "检查更新", exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(await calls(page, "app_update_prepare")).toBe(0);
});

test("download and installer each require a separate user action", async ({
  page,
}) => {
  await desktop(page);
  await page.goto("/settings/");
  const dialog = page.getByRole("dialog", { name: "发现 Boost 新版本" });
  await dialog.getByRole("button", { name: "下载更新", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "安装更新", exact: true }),
  ).toBeEnabled();
  expect(await calls(page, "app_update_prepare")).toBe(1);
  expect(await calls(page, "app_update_launch_installer")).toBe(0);
  await dialog.getByRole("button", { name: "稍后", exact: true }).click();
  await page.getByRole("button", { name: "安装更新", exact: true }).click();
  await expect.poll(() => calls(page, "app_update_launch_installer")).toBe(1);
  expect(await calls(page, "app_update_apply_portable")).toBe(0);
});

test("portable updates restart only after the user chooses to apply", async ({
  page,
}) => {
  await desktop(page, { portable: true });
  await page.goto("/settings/");
  const dialog = page.getByRole("dialog", { name: "发现 Boost 新版本" });
  await dialog.getByRole("button", { name: "下载更新", exact: true }).click();
  await expect(
    dialog.getByRole("button", { name: "重启并更新", exact: true }),
  ).toBeEnabled();
  expect(await calls(page, "app_update_apply_portable")).toBe(0);
  await dialog.getByRole("button", { name: "重启并更新", exact: true }).click();
  await expect.poll(() => calls(page, "app_update_apply_portable")).toBe(1);
  expect(await calls(page, "app_update_launch_installer")).toBe(0);
});

test("automatic failures stay quiet and manual checking recovers", async ({
  page,
}) => {
  await desktop(page, { failure: "GitHub 暂时不可用" });
  await page.goto("/settings/");
  await expect(page.getByRole("alert")).toContainText("GitHub 暂时不可用");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".notice-card.error")).toHaveCount(0);
  await page.evaluate(() => {
    (window as any).__updateFixture.failure = "";
  });
  await page.getByRole("button", { name: "检查更新", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "发现 Boost 新版本" }),
  ).toBeVisible();
  expect(await calls(page, "app_update_prepare")).toBe(0);
});

test("disabled checks never start an automatic update check", async ({
  page,
}) => {
  await desktop(page, { auto: false });
  await page.goto("/settings/");
  await expect(
    page.getByRole("button", { name: "检查更新", exact: true }),
  ).toBeVisible();
  expect(await calls(page, "app_update_check")).toBe(0);
});

test("tray previews never check even when automatic checking is enabled", async ({
  page,
}) => {
  await desktop(page, { auto: true });
  await page.goto("/tray-preview/");
  await expect(
    page.getByRole("main", { name: "Boost 右侧悬浮条" }),
  ).toBeVisible();
  await expect
    .poll(() => calls(page, "service_account_manager_session_current"))
    .toBe(1);
  expect(await calls(page, "app_update_check")).toBe(0);
  expect(await calls(page, "app_update_status")).toBe(0);
});

for (const [value, label] of [["exit", "退出"], ["minimize", "最小化"]]) {
  test('standalone close remembers ' + value + ' and settings can reset it', async ({ page }, testInfo) => {
    await desktop(page, { auto: false });
    await page.setViewportSize({ width: 392, height: 212 });
    await page.goto('/close-confirm/');
    const dialog = page.getByRole('dialog', { name: '关闭 Boost', exact: true });
    await expect(dialog).toBeVisible();
    await expect.poll(() => calls(page, 'app_close_prompt_ready')).toBe(1);
    expect(await calls(page, 'service_start')).toBe(0);
    expect(await calls(page, 'service_initialize')).toBe(0);
    await expect(dialog.locator('p.hint')).toHaveCount(0);
    await expect(dialog.locator('footer button')).toHaveText(['最小化', '退出']);
    const left = await dialog.getByRole('button', { name: '最小化', exact: true }).boundingBox();
    const right = await dialog.getByRole('button', { name: '退出', exact: true }).boundingBox();
    expect(right!.x - left!.x - left!.width).toBeGreaterThanOrEqual(12);
    expect(Math.abs(right!.width - left!.width)).toBeLessThan(1);
    await dialog.getByRole('checkbox', { name: '记住我的选择' }).check();
    await page.screenshot({ path: testInfo.outputPath('close-dialog.png') });
    await dialog.getByRole('button', { name: label, exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await page.evaluate(() => (window as any).__closeChoice)).toEqual({ action: value, remember: true });
    await page.setViewportSize({ width: 1100, height: 850 });
    await page.goto('/settings/');
    await page.getByRole('button', { name: '设置关闭主窗口时', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '关闭主窗口时', exact: true })).toHaveValue(value);
    await page.getByRole('combobox', { name: '关闭主窗口时', exact: true }).selectOption('ask');
    await page.reload();
    await page.getByRole('button', { name: '设置关闭主窗口时', exact: true }).click();
    await expect(page.getByRole('combobox', { name: '关闭主窗口时', exact: true })).toHaveValue('ask');
  });
}

test('close dialog cancels without service changes', async ({ page }) => {
  await desktop(page, { auto: false });
  await page.goto('/close-confirm/');
  await expect(page.getByRole('dialog', { name: '关闭 Boost', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect.poll(() => calls(page, 'app_show_main_window')).toBe(1);
  expect(await calls(page, 'app_main_window_close')).toBe(0);
});

test('floating window connects without starting a service and invokes native drag', async ({ page }) => {
  await desktop(page, { auto: false });
  await page.goto('/tray-preview/');
  await expect(page.locator('.tray-drag-handle')).toBeVisible();
  await expect.poll(() => calls(page, 'service_initialize')).toBe(1);
  expect(await calls(page, 'service_start')).toBe(0);
  await page.locator('.tray-drag-handle').dispatchEvent('pointerdown', { button: 0, screenX: 10, screenY: 10, bubbles: true });
  expect(await calls(page, 'plugin:window|start_dragging')).toBe(0);
  await page.locator('body').dispatchEvent('pointermove', { screenX: 25, screenY: 30, bubbles: true });
  await expect.poll(() => calls(page, 'plugin:window|start_dragging')).toBe(1);
  expect(await calls(page, 'app_update_check')).toBe(0);
  await expect(page.locator('.tray-rail-actions')).toHaveCount(0);
  await page.locator('.tray-rail').dblclick();
  await expect.poll(() => calls(page, 'app_show_main_window')).toBe(1);
  expect(await calls(page, 'service_start')).toBe(0);
  await expect(page.locator('.tray-details')).toHaveCount(0);
});

test('settings use icon help, gear editors and clean update layout', async ({ page }, testInfo) => {
  await desktop(page, { auto: false, available: false });
  await page.goto('/settings/');
  const system = page.locator('.panel').filter({ has: page.getByRole('heading', { name: '系统设置', exact: true }) });
  await expect(system.locator('.panel-header h2')).toHaveCSS('font-size', '18px');
  await expect(system.locator('.panel-header h2')).toHaveCSS('font-weight', '700');
  await expect(page.locator('.nav-item').first()).toHaveCSS('font-size', '18px');
  await expect(system.locator('.setting-label').first()).toHaveCSS('font-size', '16px');
  const hint = page.getByRole('button', { name: '自动检查更新说明', exact: true });
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  await hint.hover();
  await expect(page.getByRole('tooltip')).toContainText('24 小时');
  await page.keyboard.press('Escape');
  await hint.focus();
  await expect(page.getByRole('tooltip')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '检查更新', exact: true }).click();
  const updates = page.locator('.panel').filter({ has: page.getByRole('heading', { name: '应用更新', exact: true }) });
  await expect(updates).not.toContainText('更新仓库');
  await expect(updates).not.toContainText('上次检查');
  await expect(updates).not.toContainText('amine123max');
  const github = page.getByRole('link', { name: 'Boost GitHub' });
  await expect(github).toHaveAttribute('href', 'https://github.com/amine123max/Boost-bot');
  await github.click();
  expect(await calls(page, 'open_external_url')).toBe(1);
  await page.screenshot({ path: testInfo.outputPath('settings.png'), fullPage: true });
  await page.getByRole('button', { name: '设置关闭主窗口时', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '关闭主窗口时', exact: true })).toBeVisible();
});

test('tray display choices sync live and persist while keeping one visible item', async ({ page, context }, testInfo) => {
  await desktop(page, { auto: false, localTps: 32 });
  await page.setViewportSize({ width: 64, height: 157 });
  await page.goto('/tray-preview/');
  await expect(page.locator('.tray-tps-ring')).toHaveAttribute('aria-label', 'TPS 32.0 t/s');
  await expect(page.locator('.tray-tps-ring strong')).toHaveText('32');
  const settings = await context.newPage();
  await desktop(settings, { auto: false });
  await settings.goto('/settings/');
  await settings.getByRole('button', { name: '设置显示内容', exact: true }).click();
  await settings.screenshot({ path: testInfo.outputPath('tray-display-settings.png'), animations: 'disabled' });
  await settings.getByRole('switch', { name: 'TPS 显示环', exact: true }).uncheck();
  await expect(page.locator('.tray-tps-ring')).toHaveCount(0);
  await settings.getByRole('switch', { name: '上行速度', exact: true }).uncheck();
  await expect(page.locator('.tray-metric-upload')).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => (window as any).__updateFixture.requests.filter((r: any) => r.command === 'app_tray_layout_sync').at(-1)?.args)).toEqual({ rings: 2, metrics: 2 });
  await settings.getByRole('switch', { name: '余量环', exact: true }).uncheck();
  await settings.getByRole('switch', { name: '下行速度', exact: true }).uncheck();
  await settings.getByRole('switch', { name: '内存占用', exact: true }).uncheck();
  await expect(settings.getByRole('switch', { name: '进度环', exact: true })).toBeDisabled();
  await expect(page.locator('.tray-rail-metrics')).toHaveCount(0);
  await expect(page.locator('.tray-quota-ring')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.tray-tps-ring')).toHaveCount(0);
  await expect(page.locator('.tray-logo')).toBeVisible();
  await settings.close();
});

test('top docking receives native edge state and moves the grip to the side', async ({ page }, testInfo) => {
  await desktop(page, { auto: false, localTps: 285, dockEdge: 'top' });
  await page.setViewportSize({ width: 186, height: 38 });
  await page.goto('/tray-preview/');
  const rail = page.locator('.tray-rail');
  await expect(rail).toHaveClass(/is-top/);
  await expect(rail).toHaveCSS('flex-direction', 'row');
  await expect(rail).toHaveCSS('border-top-left-radius', '0px');
  await expect(page.locator('.tray-drag-handle')).toHaveCSS('width', '2px');
  await expect(page.locator('.tray-tps-ring strong')).toHaveText('285');
  await page.screenshot({ path: testInfo.outputPath('top-strip-dark.png'), animations: 'disabled' });
});
