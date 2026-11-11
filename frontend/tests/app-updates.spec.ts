import { test, expect, type Page } from "@playwright/test";

async function desktop(
  page: Page,
  options: {
    auto?: boolean;
    available?: boolean;
    portable?: boolean;
    failure?: string;
  } = {},
) {
  await page.addInitScript((options) => {
    const state = ((window as any).__updateFixture = {
      auto: options.auto ?? true,
      available: options.available ?? true,
      portable: options.portable ?? false,
      failure: options.failure || "",
      calls: [] as string[],
      pending: null as any,
    });
    const settings = () => ({
      theme: "dark",
      serviceAddr: "localhost:48760",
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
      transformCallback: () => 1,
      unregisterCallback: () => {},
      invoke: async (command: string, args: any) => {
        state.calls.push(command);
        switch (command) {
          case "app_settings_get":
            return settings();
          case "app_settings_set":
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
