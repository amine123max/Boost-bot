export type ProgressState = "working" | "waiting" | "done" | "failed" | "stopped";
export interface TaskProgress {
  id: string;
  state: ProgressState;
  percent: number | null;
  tokensPerSecond?: number | null;
  rateUpdatedAt?: number;
  rateKind?: string;
  rateStale?: boolean;
  updatedAt: number;
}

/** Only explicit numeric reports count; tools/elapsed time never imply completion. */
export function reportedProgress(name: string, input: unknown): number | null {
  name = name.replace(/^functions\./, '');
  if (!['report_progress','task_report','update_plan','TodoWrite','todo_write'].includes(name)) return null;
  try {
    const args = typeof input === "string" ? JSON.parse(input) : input;
    const plan = args?.plan ?? args?.todos;
    if (Array.isArray(plan) && plan.length>0 && plan.length<=256) return Math.min(99,Math.round(plan.filter(step=>step?.status==='completed').length*100/plan.length));
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
    percent: active.length > 1 ? active.every(task=>task.percent!==null) ? Math.round(active.reduce((n,t)=>n+t.percent!,0)/active.length) : null : selected?.percent ?? null,
    tokensPerSecond: (() => {
      const values = (active.length ? active : recent.filter(task => task.state === "done"))
        .filter(task => now - (task.rateUpdatedAt ?? task.updatedAt) < 60_000).map(task => task.tokensPerSecond).filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0);
      return values.length ? values.reduce((sum, value) => sum + value, 0) : null;
    })(),
    rateKind: 'request',
    rateUpdatedAt: selected?.rateUpdatedAt ?? selected?.updatedAt,
    rateStale: selected?.rateStale === true,
    activeTasks: active.length,
    waitingTasks: waiting.length,
    updatedAt: now,
  };
}
