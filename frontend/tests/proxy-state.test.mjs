import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "../node_modules/typescript/lib/typescript.js";
const source = await fs.readFile(
  new URL("../src/lib/proxy-state.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const { normalizeProxySnapshot } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
test("network state handles legacy servers and absent measurements without claiming success", () => {
  const empty = normalizeProxySnapshot({});
  assert.deepEqual(empty.nodes, []);
  assert.equal(empty.strategy, "stable");
  assert.equal(empty.kernel.autoUpdate, false);
  assert.equal(empty.kernel.localPath, '');
  assert.equal(empty.kernel.source, 'missing');
  const state = normalizeProxySnapshot({
    nodes: [
      {
        id: "jp",
        countryCode: "JP",
        measurement: {
          latencyMs: NaN,
          lossPercent: -1,
          downloadMbps: Infinity,
        },
      },
    ],
    bindings: { account: "jp", invalid: false },
  });
  assert.equal(state.nodes[0].measurement.latencyMs, null);
  assert.equal(state.nodes[0].measurement.downloadMbps, null);
  assert.equal(state.nodes[0].measurement.lossPercent, null);
  assert.equal(state.nodes[0].measurement.state, "");
  assert.equal(state.nodes[0].countrySource, "label");
  assert.deepEqual(state.bindings, { account: "jp" });
});
