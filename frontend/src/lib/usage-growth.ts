import type { DashboardTokenUsage, UsageHistory } from "@/types";
import type { UsageMetric } from "./usage-heatmap";

const valid = (value: number) => Number.isFinite(value) && value >= 0;

function hitRate(usage: DashboardTokenUsage): number | null {
  if (
    !valid(usage.inputTokens) ||
    !valid(usage.cachedInputTokens) ||
    usage.inputTokens === 0
  )
    return null;
  return (
    (Math.min(usage.cachedInputTokens, usage.inputTokens) / usage.inputTokens) *
    100
  );
}

/** Positive absolute growth; cache rate changes are percentage points. */
export function usageGrowth(
  history: UsageHistory | null,
  daily: boolean,
  metric: UsageMetric,
): number | null {
  if (!history) return null;
  const current = daily ? history.todayUsage : history.totals;
  let previous: DashboardTokenUsage;
  if (daily) {
    // Use the service's calendar day, independent of the browser's timezone.
    const date = new Date(`${history.today}T00:00:00Z`);
    if (!Number.isFinite(date.getTime())) return null;
    date.setUTCDate(date.getUTCDate() - 1);
    const yesterday = history.days.find(
      (day) => day.day === date.toISOString().slice(0, 10),
    );
    if (!yesterday) return null;
    previous = yesterday.usage;
  } else {
    // The previous cumulative snapshot is the current total minus today's usage.
    previous = { ...current };
    for (const key of Object.keys(current) as Array<
      keyof DashboardTokenUsage
    >) {
      if (
        !valid(current[key]) ||
        !valid(history.todayUsage[key]) ||
        current[key] < history.todayUsage[key]
      )
        return null;
      previous[key] = current[key] - history.todayUsage[key];
    }
  }
  let delta: number;
  if (metric === "cache") {
    const rate = hitRate(current),
      baseline = hitRate(previous);
    if (rate == null || baseline == null) return null;
    delta = rate - baseline;
  } else {
    const key =
      metric === "cost"
        ? "estimatedCostUsd"
        : metric === "requests"
          ? "requestCount"
          : "totalTokens";
    if (!valid(current[key]) || !valid(previous[key])) return null;
    // Use the original daily amount for cumulative counters to avoid cancellation.
    delta = daily ? current[key] - previous[key] : history.todayUsage[key];
  }
  return Number.isFinite(delta) && delta > 1e-9 ? delta : null;
}
