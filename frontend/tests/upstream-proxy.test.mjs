import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "../node_modules/typescript/lib/typescript.js";

const source = await fs.readFile(
  new URL("../src/lib/api/gateway-settings.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const { readGatewayUpstreamProxySettings } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);

test("proxy settings support legacy servers and real node status without fabricating latency", () => {
  assert.deepEqual(
    readGatewayUpstreamProxySettings({ proxyUrl: "http://localhost:7890" })
      .nodes,
    [],
  );
  const settings = readGatewayUpstreamProxySettings({
    proxyUrl: "trojan://secret@host:443\nanytls://secret@host2:443",
    automatic: true,
    nodes: [
      null,
      { name: "Japan-1", latencyMs: 48, selected: true },
      { name: "Japan-2", latencyMs: null },
      { name: "Japan-3", latencyMs: 0 },
    ],
    error: "内核状态暂不可用",
  });
  assert.equal(settings.automatic, true);
  assert.equal(settings.nodes.length, 3);
  assert.equal(settings.nodes[0].latencyMs, 48);
  assert.equal(settings.nodes[0].selected, true);
  assert.equal(settings.nodes[1].latencyMs, null);
  assert.equal(settings.nodes[2].latencyMs, null);
  assert.equal(settings.error, "内核状态暂不可用");
});
