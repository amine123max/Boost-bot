// 界面是不经编译的 JS，引用了不存在的名字要到渲染那一行才报错：
// 故障排查页丢了 ProbeRow 之后，测试模型一出结果页面就渲染失败，按钮一直转圈。
// 这里用 tsc 只查"找不到名字"这一类（tsconfig.ui.json），其他类型问题不管。
import { execFileSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const UNDEFINED_NAME = /\berror TS(2304|2552|2663|18004):/;

function runTsc(): string {
  const tsc = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");
  const args = [tsc, "-p", "tsconfig.ui.json", "--pretty", "false", "--listFiles"];
  try {
    return execFileSync(process.execPath, args, { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    // 有类型错误时 tsc 退出码非 0，输出照常在 stdout
    return (e as { stdout?: string }).stdout ?? "";
  }
}

describe("界面代码", () => {
  it("没有引用未定义的名字", () => {
    const out = runTsc();
    // tsc 自己没跑起来（配置错了、一个文件都没查）时不能算通过
    expect(out).toContain("ui/screens/troubleshoot.js");
    expect(out.split(/\r?\n/).filter((l) => UNDEFINED_NAME.test(l))).toEqual([]);
  }, 120_000);
});
