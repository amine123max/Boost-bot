export const trayPreferenceKey = "boost.tray.v1";
export const trayDefaults = {
  showQuota: true,
  showProgress: true,
  showTps: true,
  showUpload: true,
  showDownload: true,
  showMemory: true,
  showRingValues: true,
};
export type TrayPreferences = typeof trayDefaults;
export type TrayItemKey = Exclude<keyof TrayPreferences, "showRingValues">;
export const trayItems: { key: TrayItemKey; label: string }[] = [
  { key: "showQuota", label: "余量环" },
  { key: "showProgress", label: "进度环" },
  { key: "showTps", label: "TPS 显示环" },
  { key: "showUpload", label: "上行速度" },
  { key: "showDownload", label: "下行速度" },
  { key: "showMemory", label: "内存占用" },
];
export function normalizeTrayPreferences(value: unknown): TrayPreferences {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const next = { ...trayDefaults };
  for (const key of Object.keys(next) as (keyof TrayPreferences)[]) {
    if (typeof source[key] === "boolean") next[key] = source[key];
  }
  if (!trayItems.some((item) => next[item.key])) next.showProgress = true;
  return next;
}
