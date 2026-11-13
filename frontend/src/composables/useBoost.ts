import { computed, reactive, nextTick } from "vue";
import {
  appearanceMode,
  applyThemeWithTransition,
  type ThemeOrigin,
} from "@/lib/theme-transition";
import { notify } from "./useNotifications";
export { notify } from "./useNotifications";
import type {
  Account,
  ApiKey,
  AggregateApi,
  AppSettings,
  AppSessionResult,
  DashboardAdminUsageSummary,
  MemberDashboardSummary,
  UsageAggregateSummary,
} from "@/types";
import type { AppSettingsPatch } from "@/lib/api/app-client";
import { appClient } from "@/lib/api/app-client";
import { accountClient } from "@/lib/api/account-client";
import { serviceClient } from "@/lib/api/service-client";
import { dashboardClient } from "@/lib/api/dashboard-client";
import { attachUsagesToAccounts } from "@/lib/api/normalize";
import {
  getAppErrorMessage,
  loadRuntimeCapabilities,
  isTauriRuntime,
} from "@/lib/api/transport";
import { useAppStore } from "@/lib/store/useAppStore";
import { formatCompactNumber } from "@/lib/utils/usage";

export const boost = reactive({
  ready: false,
  loading: false,
  connected: false,
  error: "",
  accounts: [] as Account[],
  keys: [] as ApiKey[],
  connections: [] as AggregateApi[],
  settings: null as AppSettings | null,
  session: null as AppSessionResult | null,
  summary: null as DashboardAdminUsageSummary | null,
  memberSummary: null as MemberDashboardSummary | null,
  selectedId: "",
  recentAccountId: "",
  quotaSummary: null as UsageAggregateSummary | null,
  updatedAt: null as Date | null,
});
export const isAdmin = computed(
  () =>
    boost.session?.role === "system_admin" || boost.session?.role === "admin",
);
export const currentAccount = computed(
  () =>
    boost.accounts.find((a) => a.id === boost.selectedId) ||
    boost.accounts.find((a) => a.id === boost.recentAccountId) ||
    boost.accounts.find((a) => a.preferred),
);
export const eligibleAccounts = computed(() =>
  boost.accounts.filter(isTestableAccount),
);
export function isTestableAccount(a: Account) {
  return (
    a.hasToken &&
    (!a.status || a.status === "active") &&
    a.availabilityLevel !== "bad" &&
    a.availabilityLevel !== "warn"
  );
}
export async function perform<T>(
  action: () => Promise<T>,
  message?: string,
): Promise<T | undefined> {
  try {
    const result = await action();
    if (message) notify(message);
    return result;
  } catch (e) {
    notify(getAppErrorMessage(e), true);
    return undefined;
  }
}
let accountRefreshVersion = 0;
let appliedAccountRefresh = 0;
export async function refreshAccounts() {
  const version = ++accountRefreshVersion;
  const admin = isAdmin.value;
  const [accountsResult, usagesResult, quotaResult] = await Promise.allSettled([
    accountClient.list(),
    accountClient.listUsage(),
    admin ? accountClient.aggregateUsage() : Promise.resolve(null),
  ]);
  if (accountsResult.status === "rejected") throw accountsResult.reason;
  if (usagesResult.status === "rejected") throw usagesResult.reason;
  const nextAccounts = attachUsagesToAccounts(accountsResult.value.items, usagesResult.value);
  if (version < appliedAccountRefresh) return;
  appliedAccountRefresh = version;
  boost.accounts = nextAccounts;
  if (admin && quotaResult.status === "fulfilled" && quotaResult.value)
    boost.quotaSummary = quotaResult.value;
  if (admin && quotaResult.status === "rejected") throw quotaResult.reason;
}
export async function refreshData() {
  const jobs: Array<[string, () => Promise<() => void>]> = [
    ["订阅", async () => {
      const version = ++accountRefreshVersion;
      const [accounts, usages] = await Promise.all([
        accountClient.list(),
        accountClient.listUsage(),
      ]);
      const nextAccounts = attachUsagesToAccounts(accounts.items, usages);
      return () => {
        if (version < appliedAccountRefresh) return;
        appliedAccountRefresh = version;
        boost.accounts = nextAccounts;
      };
    }],
    [
      "最近账号",
      async () => {
        const logs = await serviceClient.listRequestLogs({
          page: 1,
          pageSize: 10,
          statusFilter: "2xx",
        });
        const recentAccountId = logs.items.find((log) => log.accountId)?.accountId || "";
        return () => { boost.recentAccountId = recentAccountId; };
      },
    ],
    [
      "规则",
      async () => {
        const keys = await accountClient.listApiKeys();
        return () => { boost.keys = keys; };
      },
    ],
  ];
  if (isAdmin.value)
    jobs.push(
      ["账号池额度", async () => {
        const quotaSummary = await accountClient.aggregateUsage();
        return () => { boost.quotaSummary = quotaSummary; };
      }],
      [
        "链接",
        async () => {
          const connections = await accountClient.listAggregateApis();
          return () => { boost.connections = connections; };
        },
      ],
      [
        "当前账号",
        async () => {
          const selectedId = await serviceClient.getManualPreferredAccountId();
          return () => { boost.selectedId = selectedId; };
        },
      ],
      [
        "用量",
        async () => {
          const summary = await dashboardClient.getAdminUsageSummary();
          return () => { boost.summary = summary; };
        },
      ],
    );
  else
    jobs.push([
      "用量",
      async () => {
        const memberSummary = await dashboardClient.getMemberSummary();
        return () => { boost.memberSummary = memberSummary; };
      },
    ]);
  const results = await Promise.allSettled(jobs.map(([, load]) => load()));
  results.forEach((result) => {
    if (result.status === "fulfilled") result.value();
  });
  const errors = results.flatMap((r, i) =>
    r.status === "rejected"
      ? [`${jobs[i][0]}：${getAppErrorMessage(r.reason)}`]
      : [],
  );
  boost.error = errors.join("；");
  if (boost.error) notify(boost.error, true);
  boost.updatedAt = new Date();
}
export async function initialize(options: { startService?: boolean } = {}) {
  if (boost.loading) return;
  boost.loading = true;
  boost.error = "";
  try {
    const runtime = await loadRuntimeCapabilities(true);
    if (runtime.mode === "unsupported-web")
      throw new Error(
        runtime.unsupportedReason || "请通过 Boost Web 服务打开此页面",
      );
    boost.settings = await appClient.getSettings();
    applyAppearance();
    useAppStore
      .getState()
      .setServiceStatus({ addr: boost.settings.serviceAddr });
    if (isTauriRuntime() && options.startService !== false)
      await serviceClient.start(boost.settings.serviceAddr);
    await serviceClient.initialize();
    boost.session = await appClient.getCurrentSession();
    boost.connected = true;
    applyAppearance();
    await refreshData();
    boost.ready = true;
  } catch (e) {
    boost.connected = false;
    boost.error = getAppErrorMessage(e);
    notify(boost.error, true);
  } finally {
    boost.loading = false;
  }
}
export function applyAppearance() {
  const theme = boost.settings?.theme;
  const mode = appearanceMode(theme);
  document.documentElement.dataset.theme = mode;
  document.documentElement.style.removeProperty('color-scheme');
  document.documentElement.style.removeProperty('background-color');
  for (const property of ['--bg', '--sidebar', '--card', '--surface', '--hover', '--input', '--dialog', '--text', '--muted', '--blue-hover', '--blue-soft', '--green', '--red']) document.documentElement.style.removeProperty(property);
  document.documentElement.style.removeProperty('--border');
  document.documentElement.style.removeProperty('--blue');
  try { localStorage.setItem('boost.theme.v1', mode); } catch { /* Keep session theme when storage is unavailable. */ }
}
let settingsWrite: Promise<void> = Promise.resolve();
export async function saveSettings(
  patch: AppSettingsPatch,
  origin?: ThemeOrigin,
) {
  // A settings response contains the complete document. Keep writes ordered so
  // independent controls cannot restore an earlier snapshot over a later one.
  const task = settingsWrite.then(async () => {
    const result = await appClient.setSettings(patch);
    const apply = async () => {
      boost.settings = result;
      applyAppearance();
      await nextTick();
    };
    if (patch.theme)
      await applyThemeWithTransition(appearanceMode(result.theme), apply, origin);
    else await apply();
    notify("设置已保存");
  });
  settingsWrite = task.catch(() => {});
  await task;
}
export async function selectAccount(id: string) {
  if (!isAdmin.value) throw new Error("需要管理员权限才能切换网关账号");
  const account = boost.accounts.find((a) => a.id === id);
  if (!account || !isTestableAccount(account))
    throw new Error("该账号当前不可用，请刷新后重试");
  await serviceClient.setManualPreferredAccount(id);
  boost.selectedId = await serviceClient.getManualPreferredAccountId();
  if (boost.selectedId !== id) throw new Error("账号选择未生效，请重试");
  notify(`已选用 ${account.name}`);
}
export const formatNumber = (n: number | null | undefined) =>
  formatCompactNumber(n, "—", 2);
export const formatTime = (ts: number | null | undefined) =>
  ts
    ? new Date(ts < 1e12 ? ts * 1000 : ts).toLocaleString("zh-CN", {
        hour12: false,
      })
    : "—";
export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
  notify("已复制到剪贴板");
}
