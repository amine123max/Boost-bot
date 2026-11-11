// PPT 大师：包本身能过约束检查，pm.py 只认磁盘上真实的 PPTX。pm.py 只用标准库，不需要先装依赖。
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkStatic } from "../src/botkit/check.js";
import { validate, type JsonSchema } from "../src/botkit/schema.js";

const BOT = path.join(import.meta.dirname, "..", "bots", "ppt-master");
const PM = path.join(BOT, "skills", "ppt-runner", "scripts", "pm.py");
const python = ["python3", "python"].find((p) => spawnSync(p, ["--version"]).status === 0);

describe("包", () => {
  it("能过静态检查", () => {
    expect(checkStatic(BOT).issues).toEqual([]);
  });
  it("示例数据符合约定，预览图都在界面包里", () => {
    const schema = JSON.parse(fs.readFileSync(path.join(BOT, "state.schema.json"), "utf8")) as JsonSchema;
    for (const lang of ["zh-CN", "en"]) {
      const sample = JSON.parse(fs.readFileSync(path.join(BOT, `sample.${lang}.json`), "utf8"));
      expect(validate(sample, schema)).toEqual([]);
      const pages = sample.projects.flatMap((p: { previews: Array<{ path: string }> }) => p.previews);
      expect(pages.length).toBeGreaterThan(0);
      for (const page of pages) expect(fs.existsSync(path.join(BOT, "ui", page.path))).toBe(true);
    }
  });
  it("裁剪后的上游技能保留了完整性检查要求的文件", () => {
    const skill = path.join(BOT, "skills", "ppt-master");
    for (const f of ["LICENSE", "SPONSORS.md", "SPONSORS_CN.md", "scripts/attribution_guard.py", "templates/icons/tabler-filled"]) expect(fs.existsSync(path.join(skill, f))).toBe(true);
    expect(fs.existsSync(path.join(skill, "templates", "icons", "tabler-outline"))).toBe(false);
  });
});

describe.skipIf(!python)("pm.py", () => {
  let ws: string;
  const pm = (...args: string[]) => {
    const r = spawnSync(python!, [PM, ...args], { cwd: ws, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    return { code: r.status, out: r.stdout, json: (() => { try { return JSON.parse(r.stdout); } catch { return undefined; } })() };
  };
  const state = () => JSON.parse(fs.readFileSync(path.join(ws, "app", "state.json"), "utf8"));
  /** 用 Python 写一个最小的 zip，当成 PPTX */
  const deck = (file: string, slideXml: string) => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const code = "import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1],'w')\nz.writestr('[Content_Types].xml','x')\nz.writestr('ppt/presentation.xml','x')\nz.writestr('ppt/slides/slide1.xml',sys.argv[2])\nz.close()";
    execFileSync(python!, ["-c", code, file, slideXml]);
  };
  const project = () => path.join(ws, "app", "projects", "deck_1");

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "amb-ppt-master-"));
    fs.mkdirSync(path.join(ws, "app"), { recursive: true });
    fs.copyFileSync(path.join(BOT, "sample.en.json"), path.join(ws, "app", "state.json"));
    fs.mkdirSync(path.join(project(), "svg_output"), { recursive: true });
  });
  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("verify：不是 PPTX、全是图片都不算", () => {
    fs.writeFileSync(path.join(ws, "fake.pptx"), "not a zip");
    expect(pm("verify", "fake.pptx").code).toBe(1);
    deck(path.join(ws, "pictures.pptx"), "<p:sld><p:pic></p:pic></p:sld>");
    const pictures = pm("verify", "pictures.pptx");
    expect(pictures.code).toBe(1);
    expect(pictures.json).toMatchObject({ ok: false, problem: "no_editable_slides", imageOnlySlides: ["ppt/slides/slide1.xml"] });
    deck(path.join(ws, "real.pptx"), "<p:sld><p:sp></p:sp></p:sld>");
    expect(pm("verify", "real.pptx").json).toMatchObject({ ok: true, slides: 1, editableSlides: 1 });
  });

  it("sync：第一次清掉示例，预览和导出都从磁盘读", () => {
    fs.writeFileSync(path.join(project(), "svg_output", "slide_01.svg"), "<svg/>");
    expect(pm("sync", project(), "--kind", "generate", "--name", "Deck", "--route", "generate", "--profile", "quick", "--phase", "authoring", "--total", "3").code).toBe(0);
    const st = state();
    expect(st.projects.map((p: { id: string }) => p.id)).toEqual(["deck_1"]);
    expect(st.activeProjectId).toBe("deck_1");
    expect(st.job).toMatchObject({ phase: "authoring", done: 1, total: 3, profile: "quick" });
    expect(st.projects[0]).toMatchObject({ name: "Deck", previewsDraft: true, previews: [{ path: "app/projects/deck_1/svg_output/slide_01.svg", name: "slide_01" }], exports: [] });
    // 之后只给 --phase，其余沿用
    fs.mkdirSync(path.join(project(), "svg_final"));
    fs.writeFileSync(path.join(project(), "svg_final", "slide_01.svg"), "<svg/>");
    pm("sync", project(), "--phase", "finalizing");
    expect(state().job).toMatchObject({ phase: "finalizing", total: 3, profile: "quick" });
    expect(state().projects[0]).toMatchObject({ name: "Deck", previewsDraft: false, previews: [{ path: "app/projects/deck_1/svg_final/slide_01.svg" }] });
  });

  it("sync：没有有效的 PPTX 就不能标记完成", () => {
    pm("sync", project(), "--kind", "generate", "--route", "generate", "--phase", "exporting");
    expect(pm("sync", project(), "--phase", "done").code).toBe(3);
    expect(state().job.phase).toBe("exporting");
    // 假的文件不算，也不会出现在导出列表里
    fs.mkdirSync(path.join(project(), "exports"));
    fs.writeFileSync(path.join(project(), "exports", "fake.pptx"), "not a zip");
    expect(pm("sync", project(), "--phase", "done").code).toBe(3);
    expect(state().projects[0].exports).toEqual([]);
    deck(path.join(project(), "exports", "deck_1_native_charts_tables.pptx"), "<p:sld><p:sp></p:sp></p:sld>");
    expect(pm("sync", project(), "--phase", "done").code).toBe(0);
    expect(state().job.phase).toBe("done");
    expect(state().projects[0].exports).toMatchObject([{ name: "deck_1_native_charts_tables.pptx", kind: "native_charts", slides: 1 }]);
  });

  it("sync：模板没有评审文件也能完成，但 templates/ 不能是空的", () => {
    pm("sync", project(), "--kind", "template", "--phase", "authoring");
    expect(pm("sync", project(), "--phase", "done").code).toBe(3);
    fs.mkdirSync(path.join(project(), "templates"));
    fs.writeFileSync(path.join(project(), "templates", "design_spec.md"), "x");
    fs.writeFileSync(path.join(project(), "templates", "01_cover.svg"), "<svg/>");
    expect(pm("sync", project(), "--phase", "done").code).toBe(0);
    expect(state().job).toMatchObject({ route: "create_template", phase: "done", done: 1 });
    expect(state().projects[0].previews).toMatchObject([{ path: "app/projects/deck_1/templates/01_cover.svg" }]);
  });

  it("sync：项目只能在 app/ 下", () => {
    expect(pm("sync", ws, "--phase", "done").json).toMatchObject({ ok: false, code: "bad_project" });
  });

  it("pending：写卡片、清卡片，格式不对就拒绝", () => {
    pm("sync", project(), "--kind", "generate", "--route", "generate", "--phase", "importing");
    fs.writeFileSync(path.join(ws, "bad.json"), JSON.stringify({ stage: "x" }));
    expect(pm("pending", "bad.json").json).toMatchObject({ ok: false, code: "bad_spec" });
    fs.writeFileSync(path.join(ws, "card.json"), JSON.stringify({ stage: "stage1", title: "T", summary: "S", choices: [{ id: "free_design", label: "Free" }] }));
    expect(pm("pending", "card.json").code).toBe(0);
    expect(state().pendingSpec).toMatchObject({ stage: "stage1", title: "T" });
    expect(state().job.phase).toBe("spec_pending");
    pm("pending", "--clear");
    expect(state().pendingSpec).toBeNull();
  });

  it("run：本地网页和不存在的脚本都拒绝，走不出 scripts/", () => {
    expect(pm("run", "confirm_ui/server.py").json).toMatchObject({ code: "blocked" });
    expect(pm("run", "svg_editor/server.py").json).toMatchObject({ code: "blocked" });
    expect(pm("run", "../../ppt-runner/scripts/pm.py").json).toMatchObject({ code: "no_script" });
    expect(pm("run", "nope.py").json).toMatchObject({ code: "no_script" });
  });

  it("doctor：完整性检查通过，依赖缺的话标在 state.runtime 里", () => {
    const r = pm("doctor");
    expect(r.json.guardOk).toBe(true);
    expect(r.json.imageToPptxReady).toBe(false);
    expect(state().runtime).toMatchObject({ ready: false, problem: "not_installed" });
  });

  it("doctor：上游被改过就停", () => {
    const skills = path.join(ws, "skills");
    fs.cpSync(path.join(BOT, "skills", "ppt-runner"), path.join(skills, "ppt-runner"), { recursive: true });
    fs.cpSync(path.join(BOT, "skills", "ppt-master"), path.join(skills, "ppt-master"), { recursive: true, filter: (s) => !s.includes(`${path.sep}templates${path.sep}`) });
    fs.rmSync(path.join(skills, "ppt-master", "SPONSORS.md"));
    const r = spawnSync(python!, [path.join(skills, "ppt-runner", "scripts", "pm.py"), "doctor"], { cwd: ws, encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
    expect(r.status).toBe(1);
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: false, guardOk: false });
    expect(state().runtime).toMatchObject({ ready: false, problem: "guard" });
  });
});

describe("评测任务", () => {
  it("contains 写的是紧凑 JSON：评测拿到的状态是 JSON.stringify 的结果", () => {
    const tasks = JSON.parse(fs.readFileSync(path.join(BOT, "evals", "tasks.json"), "utf8")) as Array<{ contains?: string[] }>;
    for (const s of tasks.flatMap((t) => t.contains ?? [])) expect(s).not.toMatch(/":\s/);
  });
});
