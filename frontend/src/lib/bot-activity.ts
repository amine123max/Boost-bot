export type BotActivityState =
  | "idle"
  | "working"
  | "waiting"
  | "done"
  | "failed"
  | "stopped"
  | "unavailable";
export interface BotActivity {
  available: boolean;
  stale?: boolean;
  sources?: string[];
  activeSources: string[];
  tokensPerSecond?: number | null;
  state: BotActivityState;
  percent: number | null;
  activeTasks: number;
  waitingTasks: number;
}
export function readBotActivity(value: unknown): BotActivity {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const states = ["idle", "working", "waiting", "done", "failed", "stopped"];
  const state = states.includes(String(source.state))
    ? (source.state as BotActivityState)
    : "unavailable";
  const valid =
    typeof source.percent === "number" &&
    Number.isFinite(source.percent) &&
    source.percent >= 0 &&
    source.percent <= 100;
  return {
    available: source.available === true && state !== "unavailable",
    stale: source.stale === true,
    tokensPerSecond: typeof source.tokensPerSecond === "number" && Number.isFinite(source.tokensPerSecond) && source.tokensPerSecond >= 0 ? source.tokensPerSecond : null,
    sources: Array.isArray(source.sources) ? source.sources.filter((v): v is string => typeof v === "string") : [],
    activeSources: Array.isArray(source.activeSources) ? source.activeSources.filter((v): v is string => typeof v === "string") : [],
    state,
    percent:
      state === "done"
        ? 100
        : valid
          ? Math.min(99, Math.round(source.percent as number))
          : null,
    activeTasks:
      typeof source.activeTasks === "number" &&
      Number.isFinite(source.activeTasks)
        ? Math.max(0, Math.floor(source.activeTasks))
        : 0,
    waitingTasks:
      typeof source.waitingTasks === "number" &&
      Number.isFinite(source.waitingTasks)
        ? Math.max(0, Math.floor(source.waitingTasks))
        : 0,
  };
}

export function mergeActivities(values: BotActivity[]): BotActivity {
  const live = values.filter(v => v.available);
  const active = live.filter(v => v.state === "working" || v.state === "waiting");
  const selected = active.find(v => v.state === "waiting") || active[0] || live.find(v => ["done", "failed", "stopped"].includes(v.state)) || live[0];
  const selectedActivity = readBotActivity(selected);
  const activeTasks = active.reduce((n, v) => n + v.activeTasks, 0);
  const activeSources = [...new Set(active.flatMap(v => v.activeSources.length ? v.activeSources : v.sources ?? []))];
  const rates = live.map(v => v.tokensPerSecond).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0);
  const sources = active.length ? activeSources : selectedActivity.activeSources.length ? selectedActivity.activeSources : selectedActivity.sources ?? [];
  return { ...selectedActivity, sources, activeSources: sources, tokensPerSecond: rates.length ? rates.reduce((sum, value) => sum + value, 0) : null, activeTasks, waitingTasks: active.reduce((n, v) => n + v.waitingTasks, 0), percent: activeTasks > 1 ? null : selectedActivity.state === "done" ? 100 : selectedActivity.percent };
}
