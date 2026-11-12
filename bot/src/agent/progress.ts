export type ProgressState = "working" | "waiting" | "done" | "failed" | "stopped";
export interface TaskProgress {
  id: string;
  state: ProgressState;
  percent: number | null;
  tokensPerSecond?: number | null;
  updatedAt: number;
}

/** Only explicit numeric reports count; tools/elapsed time never imply completion. */
export function reportedProgress(name: string, input: unknown): number | null {
  if (name !== "report_progress" && name !== "task_report") return null;
  try {
    const args = typeof input === "string" ? JSON.parse(input) : input;
    const value = args?.percent;
    return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100
      ? Math.min(99, Math.round(value)) : null;
  } catch { return null; }
}

export function progressSnapshot(tasks: TaskProgress[], now = Date.now()) {
  const active = tasks.filter(task => task.state === "working" || task.state === "waiting");
  const waiting = active.filter(task => task.state === "waiting");
  const recent = tasks.filter(task => now - task.updatedAt < 60_000 && !active.includes(task))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const selected = waiting[0] || active[0] || recent[0];
  return {
    available: true,
    state: selected?.state ?? "idle",
    percent: active.length > 1 ? null : selected?.percent ?? null,
    tokensPerSecond: (() => {
      const values = tasks.filter(task => now - task.updatedAt < 30000).map(task => task.tokensPerSecond).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0);
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    })(),
    activeTasks: active.length,
    waitingTasks: waiting.length,
    updatedAt: now,
  };
}
