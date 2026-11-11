import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs/promises";
import ts from "../node_modules/typescript/lib/typescript.js";
const source = await fs.readFile(
  new URL("../src/lib/usage-heatmap.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const {
  emptyUsage,
  calendarTimeline,
  visibleUsageWindow,
  shiftDay,
  cacheHitRate,
  intensity,
  usd,
  sumUsage,
} = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("calendar has one continuous Monday-first timeline with at least 53 weeks", () => {
  const timeline = calendarTimeline("2026-11-11", [], "tokens");
  assert.equal(timeline.start, "2025-11-10");
  assert.equal(timeline.cells.length, 371);
  assert.equal(
    timeline.cells.filter((cell) => !cell.future).at(-1).day,
    "2026-11-11",
  );
  assert.equal(timeline.weeks, 53);
  assert.equal(shiftDay("2024-02-28", 1), "2024-02-29");
});
test("scrolling changes visible dates and totals without changing the green intensity scale", () => {
  const days = [
    { day: "2026-11-11", usage: { ...emptyUsage(), totalTokens: 100 } },
    { day: "2025-01-01", usage: { ...emptyUsage(), totalTokens: 400 } },
  ];
  const timeline = calendarTimeline("2026-11-11", days, "tokens");
  assert.equal(
    timeline.cells.find((cell) => cell.day === "2026-11-11").level,
    1,
  );
  assert.equal(
    timeline.cells.find((cell) => cell.day === "2025-01-01").level,
    4,
  );
  assert.deepEqual(
    [0, 1, 100, 200, 300, 400].map((value) => intensity(value, 400)),
    [0, 1, 1, 2, 3, 4],
  );
  assert.equal(intensity(NaN, 400), 0);
  const oldest = visibleUsageWindow(timeline, days, 0, 53 * 20, 20);
  const latest = visibleUsageWindow(
    timeline,
    days,
    (timeline.weeks - 53) * 20,
    53 * 20,
    20,
  );
  assert.equal(oldest.start, "2024-12-30");
  assert.equal(oldest.usage.totalTokens, 400);
  assert.equal(latest.start, "2025-11-10");
  assert.equal(latest.end, "2026-11-11");
  assert.equal(latest.usage.totalTokens, 100);
});
test("cache hit rate is token-weighted and no-input data stays unknown", () => {
  const sum = sumUsage([
    {
      day: "one",
      usage: { ...emptyUsage(), inputTokens: 100, cachedInputTokens: 100 },
    },
    {
      day: "two",
      usage: { ...emptyUsage(), inputTokens: 900, cachedInputTokens: 0 },
    },
  ]);
  assert.equal(cacheHitRate(sum), "10.0%");
  assert.equal(cacheHitRate(emptyUsage()), "—");
  assert.equal(usd(1234.5), "$1,234.50");
});
