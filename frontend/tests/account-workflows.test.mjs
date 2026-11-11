import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "../node_modules/typescript/lib/typescript.js";
async function loadSource(file) {
  const source = await fs.readFile(new URL(file, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2022,
      target: ts.ScriptTarget.ES2022,
    },
  });
  return import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
  );
}
const {
  formatQuotaCountdown,
  planAccountNumbers,
  parseAccountCapacity,
  orderAccountsBySize,
  runAccountBatch,
} = await loadSource("../src/lib/account-workflows.ts");
const { usageRefreshError, importSummary, exportSummary, warmupSummary } =
  await loadSource("../src/lib/account-feedback.ts");
test("quota countdown keeps days, hours, minutes and seconds without rounding up", () => {
  const now = 1_800_000_000_000;
  assert.equal(
    formatQuotaCountdown(now / 1000 + 86400 * 30 + 3661, now),
    "30天 1时 1分 1秒",
  );
  assert.equal(formatQuotaCountdown(now / 1000 + 59, now), "0天 0时 0分 59秒");
  assert.equal(formatQuotaCountdown(now / 1000 - 60, now), "0天 0时 0分 0秒");
  for (const value of [null, undefined, NaN, Infinity, 0])
    assert.equal(formatQuotaCountdown(value, now), "—");
});
test("numbering preserves selection order, deduplicates IDs and rejects invalid starts", () => {
  assert.deepEqual(planAccountNumbers(["b", "a", "b"], 7), [
    { id: "b", sort: 7 },
    { id: "a", sort: 8 },
  ]);
  for (const start of [-1, 1.5, NaN, "", Number.MAX_SAFE_INTEGER])
    assert.throws(() => planAccountNumbers(["a", "b"], start));
});
test("account capacity allows clearing overrides and rejects invalid token counts", () => {
  for (const value of ["", null, undefined, 0])
    assert.equal(parseAccountCapacity(value), null);
  assert.equal(parseAccountCapacity("12000"), 12000);
  for (const value of [-1, "wrong", 1.5, Infinity])
    assert.throws(() => parseAccountCapacity(value));
});
test("plan-based ordering is stable within groups and leaves input unchanged", () => {
  const accounts = [
    { id: "a", planType: "free" },
    { id: "b", planType: "plus" },
    { id: "c", planType: "pro" },
    { id: "d", planType: "unknown" },
  ];
  assert.deepEqual(
    orderAccountsBySize(accounts, true).map((a) => a.id),
    ["b", "c", "d", "a"],
  );
  assert.deepEqual(
    orderAccountsBySize(accounts, false).map((a) => a.id),
    ["a", "d", "b", "c"],
  );
  assert.equal(accounts[0].id, "a");
});
test("batch actions continue after a failure and report partial success", async () => {
  const visited = [];
  const result = await runAccountBatch(["a", "b", "c"], async (id) => {
    visited.push(id);
    if (id === "b") throw new Error("expired");
  });
  assert.deepEqual(visited, ["a", "b", "c"]);
  assert.deepEqual(result, { succeeded: 2, failed: ["expired"] });
});
test("account notices retain original expiry, import, export and warmup details", () => {
  assert.equal(
    usageRefreshError("refresh token failed with status 401"),
    "账号长期未登录，refresh 已过期，已改为不可用状态",
  );
  assert.equal(usageRefreshError("network timeout"), "network timeout");
  assert.equal(
    importSummary({ total: 3, created: 1, updated: 1, failed: 1 }),
    "导入完成：共3，新增1，更新1，失败1",
  );
  assert.equal(exportSummary({ canceled: true }), "已取消导出");
  assert.equal(
    exportSummary({ exported: 3, outputDir: "browser-download" }),
    "已导出 3 个账号，浏览器将开始下载",
  );
  assert.equal(
    warmupSummary({
      requested: 2,
      succeeded: 1,
      failed: 1,
      results: [
        {
          ok: false,
          accountId: "a",
          accountName: "Account",
          message: "timeout",
        },
      ],
    }),
    "预热完成：成功1个，失败1个；首个失败: Account - timeout",
  );
});
