import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "../node_modules/typescript/lib/typescript.js";
const source = await fs.readFile(
  new URL("../src/lib/table-columns.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const { resizeColumnWeights, normalizeColumnWeights } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
test("resizing adjacent columns always fits within the table and retains all other widths", () => {
  for (const initial of [
    [12, 18, 17, 16, 7, 12, 10, 8],
    [27, 11, 12, 11, 15, 14, 10],
  ]) {
    let widths = normalizeColumnWeights(initial, initial.length);
    for (let index = 0; index < initial.length - 1; index++)
      for (const delta of [-1000, -12, 0, 15, 1000]) {
        const next = resizeColumnWeights(widths, index, delta);
        assert.ok(Math.abs(next.reduce((a, b) => a + b, 0) - 100) < 1e-8);
        assert.ok(next.every((value) => Number.isFinite(value) && value > 0));
        assert.ok(
          Math.abs(
            next[index] + next[index + 1] - widths[index] - widths[index + 1],
          ) < 1e-8,
        );
        next.forEach((value, i) => {
          if (i !== index && i !== index + 1) assert.equal(value, widths[i]);
        });
        widths = next;
      }
  }
});
test("invalid resize requests leave the table proportions stable", () => {
  assert.deepEqual(resizeColumnWeights([50, 50], 1, 20), [50, 50]);
  assert.deepEqual(resizeColumnWeights([50, 50], 0, NaN), [50, 50]);
  const normalized = normalizeColumnWeights([NaN, -5, 0], 3);
  assert.ok(normalized.every(Number.isFinite));
  assert.ok(Math.abs(normalized.reduce((a, b) => a + b, 0) - 100) < 1e-8);
});
