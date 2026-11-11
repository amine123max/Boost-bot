import type { DashboardTokenUsage, UsageHistoryDay } from "@/types";
export type UsageMetric = "cost" | "requests" | "tokens" | "cache";
export const emptyUsage = (): DashboardTokenUsage => ({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
  estimatedCostUsd: 0,
  requestCount: 0,
  successCount: 0,
  errorCount: 0,
});
const valid = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;
export const usd = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valid(value));
export const fullNumber = (value: number) =>
  new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
    valid(value),
  );
export function compactTokens(value: number) {
  const n = valid(value);
  for (const [limit, suffix] of [
    [1e12, "T"],
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const) {
    if (n >= limit)
      return `${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(n / limit)}${suffix}`;
  }
  return fullNumber(n);
}
export function cacheHitRate(usage: DashboardTokenUsage): string {
  return usage.inputTokens > 0
    ? `${((Math.min(valid(usage.cachedInputTokens), usage.inputTokens) / usage.inputTokens) * 100).toFixed(1)}%`
    : "—";
}
export function shiftDay(day: string, offset: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + offset);
  return at.toISOString().slice(0, 10);
}
export function metricValue(
  usage: DashboardTokenUsage,
  metric: UsageMetric,
): number {
  return valid(
    metric === "cost"
      ? usage.estimatedCostUsd
      : metric === "requests"
        ? usage.requestCount
        : metric === "cache"
          ? usage.cachedInputTokens
          : usage.totalTokens,
  );
}
export function intensity(value: number, maximum: number): number {
  if (
    !Number.isFinite(value) ||
    value <= 0 ||
    !Number.isFinite(maximum) ||
    maximum <= 0
  )
    return 0;
  return Math.min(4, Math.max(1, Math.ceil((value / maximum) * 4)));
}
export function sumUsage(days: UsageHistoryDay[]): DashboardTokenUsage {
  const total = emptyUsage();
  for (const { usage } of days)
    for (const key of Object.keys(total) as Array<keyof DashboardTokenUsage>)
      total[key] += valid(usage[key]);
  return total;
}
export function calendarTimeline(
  today: string,
  days: UsageHistoryDay[],
  metric: UsageMetric,
) {
  const weekday = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7;
  const lastMonday = shiftDay(today, -weekday);
  const byDay = new Map(days.map((day) => [day.day, day.usage]));
  const recentStart = shiftDay(lastMonday, -52 * 7);
  const oldestDay = days.reduce(
    (oldest, point) => (point.day < oldest ? point.day : oldest),
    recentStart,
  );
  const oldestWeekday =
    (new Date(`${oldestDay}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = shiftDay(oldestDay, -oldestWeekday);
  const weeks =
    Math.round(
      (Date.parse(`${lastMonday}T00:00:00Z`) -
        Date.parse(`${start}T00:00:00Z`)) /
        (7 * 86400000),
    ) + 1;
  // Keep one scale across the full timeline, so scrolling never changes a day's color.
  const maximum = Math.max(
    0,
    ...days
      .filter((day) => day.day <= today)
      .map((day) => metricValue(day.usage, metric)),
  );
  const cells = Array.from({ length: weeks * 7 }, (_, index) => {
    const day = shiftDay(start, index),
      future = day > today,
      usage = byDay.get(day) || emptyUsage();
    return {
      day,
      usage,
      future,
      level: future ? 0 : intensity(metricValue(usage, metric), maximum),
    };
  });
  const months: Array<{ label: string; column: number }> = [];
  let previous = "";
  for (let column = 0; column < weeks; column++) {
    const day = cells[column * 7].day,
      month = day.slice(0, 7);
    if (month !== previous) {
      months.push({
        label: `${Number(day.slice(5, 7))}月`,
        column: column + 1,
      });
      previous = month;
    }
  }
  return {
    start,
    end: today,
    weeks,
    cells,
    months,
  };
}

export function visibleUsageWindow(
  timeline: ReturnType<typeof calendarTimeline>,
  days: UsageHistoryDay[],
  scrollLeft: number,
  width: number,
  step: number,
) {
  const first = Math.max(
    0,
    Math.min(timeline.weeks - 1, Math.floor(Math.max(0, scrollLeft) / step)),
  );
  const last = Math.min(
    timeline.weeks - 1,
    Math.max(first, Math.ceil((Math.max(0, scrollLeft) + width) / step) - 1),
  );
  const start = shiftDay(timeline.start, first * 7),
    end = [timeline.end, shiftDay(timeline.start, last * 7 + 6)].sort()[0];
  return {
    start,
    end,
    usage: sumUsage(days.filter((day) => day.day >= start && day.day <= end)),
  };
}
