import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "../node_modules/typescript/lib/typescript.js";
const source = await fs.readFile(new URL("../src/lib/bot-activity.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } });
const { readBotActivity, mergeActivities } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
test("progress keeps unknown work indeterminate and only successful completion reaches 100", () => {
  assert.equal(readBotActivity({ available: true, state: "working", percent: null }).percent, null);
  assert.equal(readBotActivity({ available: true, state: "working", percent: 100 }).percent, 99);
  assert.equal(readBotActivity({ available: true, state: "done", percent: 75 }).percent, 100);
  assert.equal(readBotActivity({ available: true, state: "working", percent: "60" }).percent, null);
  assert.equal(readBotActivity({ available: true, state: "working", percent: NaN }).percent, null);
  assert.equal(readBotActivity({ available: true, state: "working", percent: 101 }).percent, null);
  assert.equal(readBotActivity(null).state, "unavailable");
});

test("external tasks do not disappear when the built-in host is unavailable", () => {
  const local = readBotActivity({ available: true, state: "working", percent: 42, activeTasks: 1, waitingTasks: 0, sources: ["codex"], stale: true });
  assert.equal(mergeActivities([readBotActivity(null), local]).percent, 42);
  assert.equal(mergeActivities([readBotActivity(null), local]).stale, true);
  const wait = readBotActivity({ available: true, state: "waiting", percent: null, activeTasks: 1, waitingTasks: 1 });
  assert.equal(mergeActivities([local, wait]).state, "waiting");
  assert.equal(mergeActivities([local, wait]).percent, null);
  assert.equal(mergeActivities([local, wait]).activeTasks, 2);
});

test("TPS stays unknown without valid samples and aggregates independent sources", () => {
  const task = (tokensPerSecond) => readBotActivity({ available: true, state: "working", activeTasks: 1, tokensPerSecond });
  assert.equal(task(-1).tokensPerSecond, null);
  assert.equal(task(Infinity).tokensPerSecond, null);
  assert.equal(task("50").tokensPerSecond, null);
  assert.equal(mergeActivities([task(20), task(30)]).tokensPerSecond, 50);
  assert.equal(mergeActivities([task(null)]).tokensPerSecond, null);
});
