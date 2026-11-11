import type { Account } from "@/types";

export function formatQuotaCountdown(
  timestamp: number | null | undefined,
  now = Date.now(),
): string {
  if (timestamp == null || !Number.isFinite(timestamp) || timestamp <= 0)
    return "—";
  const seconds = Math.max(0, Math.floor(timestamp - now / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds / 3600) % 24;
  const minutes = Math.floor(seconds / 60) % 60;
  return `${days}天 ${hours}时 ${minutes}分 ${seconds % 60}秒`;
}

export function planAccountNumbers(ids: string[], start: number) {
  if (
    !Number.isSafeInteger(start) ||
    start < 0 ||
    !Number.isSafeInteger(start + ids.length)
  )
    throw new Error("编号必须为非负整数");
  return [...new Set(ids)].map((id, index) => ({ id, sort: start + index }));
}

export function parseAccountCapacity(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0)
    throw new Error("额度容量必须为非负整数，留空表示不覆盖");
  return parsed || null;
}

export function orderAccountsBySize(
  accounts: Account[],
  largeFirst: boolean,
): Account[] {
  const rank = (a: Account) => {
    const plan = (a.planType || a.planTypeRaw || "").toLowerCase();
    return ["plus", "pro", "team", "business", "enterprise", "edu"].includes(
      plan,
    )
      ? 2
      : plan === "free"
        ? 0
        : 1;
  };
  return [...accounts].sort(
    (a, b) => (rank(b) - rank(a)) * (largeFirst ? 1 : -1),
  );
}

export async function runAccountBatch<T>(
  items: T[],
  run: (item: T) => Promise<unknown>,
) {
  const failed: string[] = [];
  for (const item of items) {
    try {
      await run(item);
    } catch (error) {
      failed.push(error instanceof Error ? error.message : String(error));
    }
  }
  return { succeeded: items.length - failed.length, failed };
}
