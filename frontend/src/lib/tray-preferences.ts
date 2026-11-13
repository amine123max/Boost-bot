export const trayPreferenceKey = "boost.tray.v2";
export const legacyTrayPreferenceKey = "boost.tray.v1";
export const trayItems = [
  { key: "progress", label: "任务进度", icon: "activity" },
  { key: "quota", label: "账号余量", icon: "gauge" },
  { key: "tps", label: "输出速率", icon: "zap" },
  { key: "upload", label: "上行速度", icon: "arrow-up" },
  { key: "download", label: "下行速度", icon: "arrow-down" },
  { key: "memory", label: "内存占用", icon: "cpu" },
] as const;
export type TrayItemKey = (typeof trayItems)[number]["key"];
export type TrayDisplay = "ring" | "value" | "card";
export interface TrayWidget {
  kind: TrayItemKey;
  display: TrayDisplay;
}
export interface TrayPanel {
  id: string;
  name: string;
  widgets: TrayWidget[];
}
export interface TrayPreferences {
  view: "compact" | "cards";
  orientation: "auto" | "horizontal" | "vertical";
  snapToEdges: boolean;
  appearance: "system" | "dark" | "light";
  dockHorizontal: boolean;
  showRingValues: boolean;
  pages: TrayPanel[];
  activePage: string;
  position: { x: number; y: number } | null;
  palette: { x: number; y: number };
}
export function newTrayWidget(kind: TrayItemKey): TrayWidget {
  return {
    kind,
    display: ["progress", "quota", "tps"].includes(kind) ? "ring" : "value",
  };
}
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
export function normalizeTrayPreferences(value: unknown): TrayPreferences {
  const source = object(value);
  const legacyKeys = {
    progress: "showProgress",
    quota: "showQuota",
    tps: "showTps",
    upload: "showUpload",
    download: "showDownload",
    memory: "showMemory",
  };
  const fallback = trayItems
    .filter((item) => source[legacyKeys[item.key]] !== false)
    .map((item) => newTrayWidget(item.key));
  const pages: TrayPanel[] = [];
  for (const entry of Array.isArray(source.pages)
    ? source.pages.slice(0, 6)
    : []) {
    const page = object(entry);
    if (
      typeof page.id !== "string" ||
      !/^[\w-]{1,64}$/.test(page.id) ||
      pages.some((p) => p.id === page.id)
    )
      continue;
    const widgets: TrayWidget[] = [];
    for (const item of Array.isArray(page.widgets) ? page.widgets : []) {
      const w = object(item);
      if (
        !trayItems.some((item) => item.key === w.kind) ||
        widgets.some((item) => item.kind === w.kind)
      )
        continue;
      widgets.push({
        kind: w.kind as TrayItemKey,
        display:
          w.kind === "tps"
            ? "ring"
            : ["ring", "value", "card"].includes(String(w.display))
              ? (w.display as TrayDisplay)
              : "ring",
      });
    }
    for (const widget of widgets) {
      if (
        pages.length >= 6 ||
        pages.some((p) => p.widgets[0].kind === widget.kind)
      )
        continue;
      pages.push({
        id: widgets.length === 1 ? page.id : `${page.id}-${widget.kind}`,
        name:
          widgets.length === 1
            ? String(
                page.name ||
                  trayItems.find((item) => item.key === widget.kind)!.label,
              ).slice(0, 24)
            : trayItems.find((item) => item.key === widget.kind)!.label,
        widgets: [widget],
      });
    }
  }
  if (!pages.length)
    for (const widget of fallback.length
      ? fallback
      : [newTrayWidget("progress")])
      pages.push({
        id: `monitor-${widget.kind}`,
        name: trayItems.find((item) => item.key === widget.kind)!.label,
        widgets: [widget],
      });
  const position = object(source.position),
    palette = object(source.palette);
  const finite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  return {
    view: source.view === "cards" ? "cards" : "compact",
    orientation: ["horizontal", "vertical"].includes(String(source.orientation))
      ? (source.orientation as "horizontal" | "vertical")
      : "auto",
    snapToEdges: source.snapToEdges !== false,
    appearance:
      source.appearance === "dark" || source.appearance === "light"
        ? source.appearance
        : "system",
    dockHorizontal: source.dockHorizontal === true,
    showRingValues: source.showRingValues !== false,
    pages,
    activePage: pages.some((p) => p.id === source.activePage)
      ? String(source.activePage)
      : pages.find((p) => p.id.startsWith(`${String(source.activePage)}-`))
          ?.id || pages[0].id,
    position:
      finite(position.x) && finite(position.y)
        ? { x: Math.round(position.x), y: Math.round(position.y) }
        : null,
    palette: {
      x: finite(palette.x) ? Math.max(0, Math.min(1, palette.x)) : 0.5,
      y: finite(palette.y) ? Math.max(0, Math.min(1, palette.y)) : 1,
    },
  };
}
export const trayDefaults = normalizeTrayPreferences(null);
