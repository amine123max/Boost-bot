import assert from "node:assert/strict";
import fs from "node:fs/promises";
import test from "node:test";
import ts from "../node_modules/typescript/lib/typescript.js";
const source = await fs.readFile(new URL("../src/lib/navigation.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022 } });
const { searchNavigation } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
test("navigation search respects role, runtime and all query terms", () => {
  assert.equal(searchNavigation("TPS", true, true)[0].title, "显示内容");
  assert.equal(searchNavigation("port 12580", true, true)[0].title, "本地服务地址");
  assert.equal(searchNavigation("port", true, false).length, 0);
  assert.equal(searchNavigation("路由", false, true).length, 0);
  assert.equal(searchNavigation("no-such", true, true).length, 0);
});
