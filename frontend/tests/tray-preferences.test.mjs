import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "../node_modules/typescript/lib/typescript.js";
const source = await fs.readFile(new URL("../src/lib/tray-preferences.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { normalizeTrayPreferences, trayDefaults } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
test("tray preferences reject invalid settings and never make the dock disappear", () => {
  assert.deepEqual(normalizeTrayPreferences(null), trayDefaults);
  assert.equal(normalizeTrayPreferences({ showQuota: "false" }).showQuota, true);
  const hidden = Object.fromEntries(Object.keys(trayDefaults).map(key => [key, false]));
  assert.equal(normalizeTrayPreferences(hidden).showProgress, true);
  assert.equal(normalizeTrayPreferences({ showQuota: false }).showQuota, false);
});
