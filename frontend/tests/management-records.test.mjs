import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "../node_modules/typescript/lib/typescript.js";
const source = await fs.readFile(
  new URL("../src/lib/management-records.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const {
  summarizeKeyUsage,
  keyQuotaState,
  readAggregateBalance,
  aggregateQuotaInfo,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
test("platform usage uses actual per-key counters and retains historical totals", () => {
  const summary = summarizeKeyUsage([
    { keyId: "a", totalTokens: 12000, estimatedCostUsd: 0.5 },
    { keyId: "deleted", totalTokens: 24000, estimatedCostUsd: 1.2 },
    { keyId: "invalid", totalTokens: -1, estimatedCostUsd: Infinity },
  ]);
  assert.equal(summary.totalTokens, 36000);
  assert.equal(summary.totalCostUsd, 1.7);
  assert.equal(summary.byKey.a.totalTokens, 12000);
  assert.equal(summary.byKey.invalid.estimatedCostUsd, 0);
});
test("key quota distinguishes unlimited, unknown, remaining and exhausted usage", () => {
  assert.deepEqual(keyQuotaState(500, 2000), {
    limit: 2000,
    used: 500,
    remaining: 1500,
    exhausted: false,
    percent: 25,
  });
  assert.deepEqual(keyQuotaState(null, 2000), {
    limit: 2000,
    used: null,
    remaining: null,
    exhausted: false,
    percent: null,
  });
  assert.deepEqual(keyQuotaState(2000, 2000), {
    limit: 2000,
    used: 2000,
    remaining: 0,
    exhausted: true,
    percent: 100,
  });
  assert.equal(keyQuotaState(3000, 2000).percent, 100);
  for (const limit of [0, null, -1, Infinity])
    assert.equal(keyQuotaState(500, limit).remaining, null);
});
test("balance status does not present stale snapshots as successful after a failed refresh", () => {
  const api = {
    balanceQueryEnabled: true,
    lastBalanceStatus: "success",
    lastBalanceJson: JSON.stringify({
      remaining: 12.345,
      unit: "usd",
      used: 2,
      total: 20,
      planName: "Standard",
    }),
    lastBalanceError: null,
  };
  assert.equal(readAggregateBalance(api).label, "$12.35");
  assert.equal(
    readAggregateBalance(api).details,
    "套餐：Standard · 已用：2 · 总额：20",
  );
  assert.equal(
    readAggregateBalance({
      ...api,
      lastBalanceStatus: "failed",
      lastBalanceError: "timeout",
    }).label,
    "查询失败",
  );
  assert.equal(
    readAggregateBalance({ ...api, balanceQueryEnabled: false }).label,
    "未启用",
  );
  assert.equal(
    readAggregateBalance({ ...api, lastBalanceJson: "broken" }).label,
    "未查询",
  );
  assert.equal(
    readAggregateBalance({ ...api, lastBalanceJson: "[]" }).label,
    "未查询",
  );
  assert.equal(
    readAggregateBalance({
      ...api,
      lastBalanceJson: '{"isValid":false,"invalidMessage":"expired"}',
    }).error,
    "expired",
  );
});
test("aggregate token estimates are not summed across models sharing the same balance", () => {
  const rows = aggregateQuotaInfo([
    {
      model: "gpt",
      sources: [
        { sourceKind: "aggregate_api", sourceId: "a", remainingTokens: 1000 },
        {
          sourceKind: "openai_account",
          sourceId: "account",
          remainingTokens: 100,
        },
      ],
    },
    {
      model: "gemini",
      sources: [
        { sourceKind: "aggregate_api", sourceId: "a", remainingTokens: 2000 },
        { sourceKind: "aggregate_api", sourceId: "b", remainingTokens: null },
      ],
    },
  ]);
  assert.deepEqual(rows.a, {
    models: ["gpt", "gemini"],
    tokens: 1000,
    model: "gpt",
  });
  assert.deepEqual(rows.b, { models: ["gemini"], tokens: null, model: null });
  assert.equal(rows.account, undefined);
});
