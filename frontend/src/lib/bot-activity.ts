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
