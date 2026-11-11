import type { ApiKeyUsageStat, AggregateApi } from "@/types";
import type { QuotaModelPoolItem } from "@/types/quota";

const nonnegative = (value: number) =>
  Number.isFinite(value) ? Math.max(0, value) : 0;
export function summarizeKeyUsage(stats: ApiKeyUsageStat[]) {
  const byKey: Record<string, ApiKeyUsageStat> = Object.create(null);
  for (const item of stats) {
    if (!item.keyId) continue;
    byKey[item.keyId] = {
      keyId: item.keyId,
      totalTokens: nonnegative(item.totalTokens),
      estimatedCostUsd: nonnegative(item.estimatedCostUsd),
    };
  }
  return {
    byKey,
    totalTokens: Object.values(byKey).reduce(
      (sum, item) => sum + item.totalTokens,
      0,
    ),
    totalCostUsd: Object.values(byKey).reduce(
      (sum, item) => sum + item.estimatedCostUsd,
      0,
    ),
  };
}
export function keyQuotaState(used: number | null, limit: number | null) {
  const maximum =
    limit != null && Number.isFinite(limit) && limit > 0 ? limit : null;
  const consumed =
    used != null && Number.isFinite(used) ? Math.max(0, used) : null;
  return {
    limit: maximum,
    used: consumed,
    remaining:
      maximum != null && consumed != null
        ? Math.max(0, maximum - consumed)
        : null,
    exhausted: maximum != null && consumed != null && consumed >= maximum,
    percent:
      maximum != null && consumed != null
        ? Math.min(100, (consumed / maximum) * 100)
        : null,
  };
}
export function readAggregateBalance(
  api: Pick<
    AggregateApi,
    | "lastBalanceJson"
    | "lastBalanceStatus"
    | "lastBalanceError"
    | "balanceQueryEnabled"
  >,
) {
  let snapshot: Record<string, unknown> | null = null;
  try {
    const parsed = JSON.parse(api.lastBalanceJson || "null");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed))
      snapshot = parsed;
  } catch {
    /* Invalid stored snapshots remain unknown. */
  }
  const amount =
    typeof snapshot?.remaining === "number" &&
    Number.isFinite(snapshot.remaining)
      ? snapshot.remaining
      : null;
  const unit = typeof snapshot?.unit === "string" ? snapshot.unit : "";
  const details = [
    typeof snapshot?.planName === "string" ? `套餐：${snapshot.planName}` : "",
    typeof snapshot?.used === "number" && Number.isFinite(snapshot.used)
      ? `已用：${snapshot.used}`
      : "",
    typeof snapshot?.total === "number" && Number.isFinite(snapshot.total)
      ? `总额：${snapshot.total}`
      : "",
  ]
    .filter(Boolean)
    .join(" · ");
  if (!api.balanceQueryEnabled)
    return { label: "未启用", tone: "", details, error: "" };
  if (api.lastBalanceStatus === "failed")
    return {
      label: "查询失败",
      tone: "error",
      details,
      error: api.lastBalanceError || "",
    };
  if (snapshot?.isValid === false)
    return {
      label: "额度不可用",
      tone: "error",
      details,
      error:
        typeof snapshot.invalidMessage === "string"
          ? snapshot.invalidMessage
          : "",
    };
  if (api.lastBalanceStatus !== "success" || amount == null)
    return { label: "未查询", tone: "", details, error: "" };
  const value = Number.isInteger(amount) ? String(amount) : amount.toFixed(2);
  return {
    label:
      unit.toUpperCase() === "USD"
        ? `$${value}`
        : `${value}${unit ? " " + unit : ""}`,
    tone: "success",
    details,
    error: "",
  };
}
export function protocolLabel(value: string) {
  return (
    (
      {
        openai_compat: "OpenAI Compat",
        anthropic_native: "Anthropic Native",
        gemini_native: "Gemini Native",
        codex: "Codex",
        claude: "Claude",
        gemini: "Gemini",
      } as Record<string, string>
    )[value] || value
  );
}
export function rotationLabel(value: string) {
  return (
    (
      {
        account_rotation: "账号轮转",
        aggregate_api_rotation: "聚合 API 轮转",
        hybrid_rotation: "混合轮转",
      } as Record<string, string>
    )[value] || value
  );
}
export function aggregateQuotaInfo(pools: QuotaModelPoolItem[]) {
  const records: Record<
    string,
    { models: string[]; tokens: number | null; model: string | null }
  > = Object.create(null);
  for (const pool of pools)
    for (const source of pool.sources) {
      if (source.sourceKind !== "aggregate_api") continue;
      const row = (records[source.sourceId] ||= {
        models: [],
        tokens: null,
        model: null,
      });
      if (!row.models.includes(pool.model)) row.models.push(pool.model);
      if (
        row.tokens == null &&
        source.remainingTokens != null &&
        Number.isFinite(source.remainingTokens)
      ) {
        row.tokens = Math.max(0, source.remainingTokens);
        row.model = pool.model;
      }
    }
  return records;
}
