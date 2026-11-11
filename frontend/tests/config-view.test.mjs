import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "../node_modules/typescript/lib/typescript.js";
const source = await fs.readFile(
  new URL("../src/lib/config-view.ts", import.meta.url),
  "utf8",
);
const { outputText } = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ES2022,
    target: ts.ScriptTarget.ES2022,
  },
});
const { redactConfiguration } = await import(
  `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`
);
test("configuration views and copies redact nested credentials and proxy user info", () => {
  const original = {
    webAccessPasswordConfigured: true,
    routeStrategy: "ordered",
    envOverrides: { BOOST_ACCESS_TOKEN: "secret", BOOST_PORT: "48760" },
    upstreamProxyUrl: "http://alice:password@127.0.0.1:7897",
  };
  const result = redactConfiguration(original);
  const serialized = JSON.stringify(result);
  assert.equal(result.webAccessPasswordConfigured, true);
  assert.equal(result.routeStrategy, "ordered");
  assert.equal(result.envOverrides.BOOST_PORT, "48760");
  assert.equal(result.envOverrides.BOOST_ACCESS_TOKEN, "••••••••");
  assert.ok(!serialized.includes("alice"));
  assert.ok(!serialized.includes("password@"));
  assert.ok(!serialized.includes('"secret"'));
  assert.equal(original.envOverrides.BOOST_ACCESS_TOKEN, "secret");
});

test("multiline proxy diagnostics redact credentials on every node", () => {
  const result = redactConfiguration({
    upstreamProxyUrl: [
      "trojan://trojan-secret@jp1.example.com:443?sni=jp1.example.com#Japan-1",
      "anytls://anytls-secret@jp2.example.com:443#Japan-2",
      "http://alice:http-secret@127.0.0.1:7890",
    ].join("\n"),
  });
  const text = JSON.stringify(result);
  for (const credential of [
    "trojan-secret",
    "anytls-secret",
    "alice",
    "http-secret",
  ]) {
    assert.ok(!text.includes(credential));
  }
  assert.equal(result.upstreamProxyUrl.split("\n").length, 3);
});
