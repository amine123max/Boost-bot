import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "../node_modules/typescript/lib/typescript.js";
const source = await fs.readFile(new URL("../src/lib/bot-activity.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { readBotActivity } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
test("progress keeps unknown work indeterminate and only successful completion reaches 100", () => {
  assert.equal(readBotActivity({ available: true, state: "working", percent: null }).percent, null);
  assert.equal(readBotActivity({ available: true, state: "working", percent: 100 }).percent, 99);
  assert.equal(readBotActivity({ available: true, state: "done", percent: 75 }).percent, 100);
  assert.equal(readBotActivity({ available: true, state: "working", percent: "60" }).percent, null);
  assert.equal(readBotActivity({ available: true, state: "working", percent: NaN }).percent, null);
  assert.equal(readBotActivity({ available: true, state: "working", percent: 101 }).percent, null);
  assert.equal(readBotActivity(null).state, "unavailable");
});
