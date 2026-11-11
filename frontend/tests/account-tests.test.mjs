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
const { runAccountTests } = await loadSource(
  "../src/lib/account-tests.ts",
);
const { readAccountWarmupResult } = await loadSource(
  "../src/lib/api/account-maintenance.ts",
);
test("test runner visits every account once while bounding concurrent requests", async () => {
  let active = 0,
    max = 0;
  const visited = [];
  await runAccountTests(
    Array.from({ length: 11 }, (_, i) => i),
    async (item) => {
      active++;
      max = Math.max(max, active);
      await new Promise((r) => setTimeout(r, 2));
      visited.push(item);
      active--;
    },
    3,
  );
  assert.equal(max, 3);
  assert.deepEqual(
    visited.sort((a, b) => a - b),
    Array.from({ length: 11 }, (_, i) => i),
  );
});
test("warmup preserves measured durations and keeps absent or invalid measurements unknown", () => {
  const data = readAccountWarmupResult({
    results: [
      { accountId: "ok", ok: true, durationMs: 42 },
      { accountId: "old", ok: true },
      { accountId: "bad", ok: false, durationMs: -1 },
    ],
  });
  assert.deepEqual(
    data.results.map((r) => r.durationMs),
    [42, null, null],
  );
});
