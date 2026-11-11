// 尽调 Bot：约束检查、示例数据，以及对接本机上游服务的脚本（用假的上游跑真实脚本，不联网、不调模型）。
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { execFile, execFileSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { promisify } from "node:util";
import { checkStatic } from "../src/botkit/check.js";

const BOT = path.join(import.meta.dirname, "..", "bots", "company-research");
const UPSTREAM = path.join(BOT, "skills", "cr-research", "scripts", "upstream.py");
const EXPORT_PDF = path.join(BOT, "skills", "cr-report", "scripts", "export_pdf.py");
const run = promisify(execFile);
const hasPython = spawnSync("python3", ["--version"]).status === 0;
const hasReportlab = hasPython && spawnSync("python3", ["-c", "import reportlab"]).status === 0;

describe("Bot 包", () => {
  it("过静态检查", () => {
    expect(checkStatic(BOT).issues).toEqual([]);
  });
  it("只声明用得到的权限：不用后台任务，所以没有 channel-send", () => {
    expect(checkStatic(BOT).manifest!.permissions).toEqual(["workspace-write", "network"]);
  });
  it("两份示例都是虚构公司，来源只用保留域名，报告最后一段是免责声明", () => {
    for (const lang of ["zh-CN", "en"]) {
      const sample = JSON.parse(fs.readFileSync(path.join(BOT, `sample.${lang}.json`), "utf8"));
      expect(sample.jobs[0].sample).toBe(true);
      expect(sample.selectedJobId).toBe(sample.jobs[0].id);
      const urls: string[] = [...sample.reportPreview.matchAll(/https?:\/\/[^\s)]+/g)].map((m: RegExpMatchArray) => m[0]);
      expect(urls.length).toBeGreaterThanOrEqual(5);
      for (const u of [...urls, ...sample.sourcesPreview.map((s: { url: string }) => s.url)]) expect(new URL(u).hostname).toMatch(/^example\.(com|org|net)$/);
      expect(sample.reportPreview.trim().split("\n").at(-1)).toMatch(/免责声明|Disclaimer/);
    }
  });
  it("中文示例是中文，英文示例里没有中文", () => {
    const en = fs.readFileSync(path.join(BOT, "sample.en.json"), "utf8");
    expect(en).not.toMatch(/[一-鿿]/);
    expect(fs.readFileSync(path.join(BOT, "sample.zh-CN.json"), "utf8")).toMatch(/[一-鿿]/);
  });
});

describe.skipIf(!hasPython)("对接本机上游服务", () => {
  const REPORT = `# Stripe report\n\nStripe processes payments ([overview](https://a.test/overview)).\n\n## References\n* A. "Funding round." https://b.test/funding.\n* C. "Market map." https://c.test/market\n`;
  const up = async (...args: string[]) => JSON.parse((await run("python3", [UPSTREAM, ...args], { encoding: "utf8" })).stdout);
  let tmp: string;
  let server: http.Server;
  let api: string;
  let stream: string[];
  let bodies: unknown[];
  let reportStatus: number;
  beforeAll(async () => {
    server = http.createServer((req, res) => {
      const url = req.url ?? "";
      const chunks: Buffer[] = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        if (chunks.length) bodies.push(JSON.parse(Buffer.concat(chunks).toString()));
        if (url === "/config") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ openrouter_configured: true, openai_configured: false, default_model: "m" }));
        if (url === "/research") return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ status: "accepted", job_id: "up-1" }));
        if (url === "/research/up-1/stream") {
          res.writeHead(200, { "content-type": "text/event-stream" });
          for (const line of stream) res.write(`data: ${line}\n\n`);
          return void res.end();
        }
        if (url === "/research/up-1/report") return void res.writeHead(reportStatus, { "content-type": "application/json" }).end(JSON.stringify({ report: REPORT }));
        if (url === "/generate-pdf") return void res.writeHead(200, { "content-type": "application/pdf" }).end("%PDF-1.4 fake");
        res.writeHead(404).end("{}");
      });
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    api = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterAll(() => {
    server.closeAllConnections();
    server.close();
  });
  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "amb-cr-"));
    stream = [];
    bodies = [];
    reportStatus = 202;
  });
  const jobDir = () => path.join(tmp, "app", "jobs", "j1");
  const statePath = () => path.join(tmp, "app", "state.json");
  const state = () => JSON.parse(fs.readFileSync(statePath(), "utf8"));
  const job = () => state().jobs[0];
  const setup = async (job: object = { id: "j1", company: "Stripe", status: "pending" }) => {
    fs.mkdirSync(jobDir(), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify({ title: "t", jobs: [job], timeline: [] }));
    await up("start", "--api", api, "--job-dir", jobDir(), "--company", "Stripe", "--industry", "Payments");
  };
  const follow = () => up("follow", "--job-dir", jobDir(), "--state", statePath(), "--job-id", "j1", "--lang", "en", "--max-seconds", "5");

  it("探测：认得上游，只报告布尔值和默认模型；端口上是别的服务不算", async () => {
    expect(await up("probe", "--api", api)).toEqual({ reachable: true, openrouter: true, openai: false, defaultModel: "m" });
    expect(await up("probe", "--api", "http://127.0.0.1:9")).toEqual({ reachable: false });
  });
  it("只连本机：别的地址一律拒绝", async () => {
    expect((await up("probe", "--api", "https://evil.test")).error).toBe("api_not_local");
    expect((await up("start", "--api", "https://evil.test", "--job-dir", jobDir(), "--company", "x")).error).toBe("api_not_local");
  });
  it("启动时不传任何 Key", async () => {
    await setup();
    expect(bodies).toEqual([{ company: "Stripe", industry: "Payments" }]);
    expect(JSON.parse(fs.readFileSync(path.join(jobDir(), "upstream.json"), "utf8")).jobId).toBe("up-1");
  });
  it("跑完整条流程：节点、篇数、时间线、报告、来源和免责声明都写好", async () => {
    await setup();
    stream = [
      { type: "research_init" },
      { type: "query_generating", category: "financial_analyzer" },
      { type: "curation", category: "financial", total: 7 },
      { type: "curation", category: "news", total: 4 },
      { type: "enrichment" },
      { type: "briefing_start", category: "company" },
      { type: "report_compilation" },
      { type: "complete", report: REPORT },
    ].map((e) => JSON.stringify(e));
    const result = await follow();
    expect(result).toMatchObject({ state: "completed", sources: 3 });
    const j = job();
    expect(j.status).toBe("completed");
    expect(j.progress).toBe(100);
    expect(Object.values(j.nodes).every((s) => s === "done")).toBe(true);
    expect(j.docCounts).toEqual({ financial: 7, news: 4, industry: 0, company: 0 });
    expect(j.reportPath).toBe(`${jobDir().replaceAll(path.sep, "/")}/report.md`);
    // 免责声明在最后（AT-CR-07）
    const report = fs.readFileSync(path.join(jobDir(), "report.md"), "utf8");
    expect(report.trim().split("\n").at(-1)).toContain("**Disclaimer**");
    // 报告里至少 3 个地址在 sources.json 里（AT-CR-02）；句尾的点不算地址
    const sources = JSON.parse(fs.readFileSync(path.join(jobDir(), "sources.json"), "utf8"));
    expect(sources.map((s: { url: string }) => s.url)).toEqual(["https://a.test/overview", "https://b.test/funding", "https://c.test/market"]);
    expect(sources[1].title).toBe("Funding round");
    expect(state().selectedJobId).toBe("j1");
    expect(state().reportPreview).toContain("Stripe report");
    expect(state().sourcesPreview).toHaveLength(3);
    expect(state().timeline.filter((e: { node: string; status: string }) => e.node === "editor" && e.status === "done")).toHaveLength(1);
    const lines = fs.readFileSync(path.join(jobDir(), "nodes.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(lines.some((l) => l.node === "grounding")).toBe(true);
    expect(lines.some((l) => l.node === "editor")).toBe(true);
  });
  it("进度是轮询出来的：漏掉的节点，走到后面的阶段时也算完成", async () => {
    await setup();
    stream = [JSON.stringify({ type: "progress", step: "curator" })];
    await follow();
    const nodes = job().nodes;
    for (const n of ["grounding", "financial_analyst", "news_scanner", "industry_analyst", "company_analyst", "collector", "curator"]) expect(nodes[n]).toBe("done");
    expect(nodes.editor).toBe("pending");
  });
  it("上游报错：任务失败，写明原因，别的任务不受影响", async () => {
    fs.mkdirSync(jobDir(), { recursive: true });
    fs.writeFileSync(statePath(), JSON.stringify({ title: "t", jobs: [{ id: "j1", company: "Stripe", status: "pending" }, { id: "j2", company: "Other", status: "completed" }], timeline: [] }));
    await up("start", "--api", api, "--job-dir", jobDir(), "--company", "Stripe");
    stream = [JSON.stringify({ type: "error", error: "Tavily key missing" })];
    expect(await follow()).toEqual({ state: "failed", error: "Tavily key missing" });
    expect(state().jobs[0]).toMatchObject({ status: "failed", error: "Tavily key missing" });
    expect(state().jobs[1]).toEqual({ id: "j2", company: "Other", status: "completed" });
  });
  it("上游重启过，不认识这个任务了：任务失败，不会一直等", async () => {
    await setup();
    reportStatus = 404;
    expect((await follow()).state).toBe("failed");
    expect(job().error).toContain("job_lost");
  });
  it("进度流断了但报告已经好了：照常完成", async () => {
    await setup();
    reportStatus = 200;
    expect((await follow()).state).toBe("completed");
    expect(job().status).toBe("completed");
  });
  it("用户取消后，脚本不再把结果写回来", async () => {
    await setup({ id: "j1", company: "Stripe", status: "cancelled" });
    stream = [JSON.stringify({ type: "research_init" })];
    expect(await follow()).toEqual({ state: "cancelled" });
    expect(job().status).toBe("cancelled");
  });
  it("服务连不上：如实返回，不改任务", async () => {
    await setup();
    const meta = path.join(jobDir(), "upstream.json");
    fs.writeFileSync(meta, JSON.stringify({ ...JSON.parse(fs.readFileSync(meta, "utf8")), apiBase: "http://127.0.0.1:9" }));
    expect((await follow()).state).toBe("unreachable");
    expect(job().status).toBe("pending");
  });
  it("上游生成 PDF：西文报告存成文件；有中文时交给本地脚本", async () => {
    await setup();
    fs.writeFileSync(path.join(jobDir(), "report.md"), "# Report “quoted”\n");
    const ok = await up("pdf", "--job-dir", jobDir());
    expect(ok.ok).toBe(true);
    expect(fs.readFileSync(path.join(jobDir(), "report.pdf")).subarray(0, 5).toString()).toBe("%PDF-");
    fs.writeFileSync(path.join(jobDir(), "report.md"), "# 中文报告\n");
    expect(await up("pdf", "--job-dir", jobDir())).toEqual({ ok: false, error: "non_latin_report" });
  });
});

describe.skipIf(!hasPython)("导出 PDF", () => {
  const py = (code: string) => execFileSync("python3", ["-c", `import sys, json; sys.path.insert(0, ${JSON.stringify(path.dirname(EXPORT_PDF))}); import export_pdf as x; ${code}`], { encoding: "utf8", env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" } });
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "amb-cr-pdf-"));

  it.skipIf(hasReportlab)("没装 reportlab：告诉 Bot 要先安装，退出码 3", () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, "r.md"), "# x\n");
    const r = spawnSync("python3", [EXPORT_PDF, "--input", path.join(dir, "r.md"), "--output", path.join(dir, "r.pdf")], { encoding: "utf8" });
    expect(r.status).toBe(3);
    expect(JSON.parse(r.stdout)).toEqual({ ok: false, error: "missing_reportlab" });
    expect(fs.existsSync(path.join(dir, "r.pdf"))).toBe(false);
  });
  it("解析 Markdown：标题、列表、引用、表格、分隔线和段落", () => {
    const md = "# 标题\n\n第一段\n接着写\n\n- 甲\n- 乙\n\n1. 一\n\n> 引用\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n---\n\n结尾";
    const blocks = JSON.parse(py(`print(json.dumps(x.parse_blocks(${JSON.stringify(md)}), ensure_ascii=False))`));
    expect(blocks).toEqual([
      ["heading", [1, "标题"]],
      ["p", "第一段 接着写"],
      ["ul", ["甲", "乙"]],
      ["ol", ["一"]],
      ["quote", ["引用"]],
      ["table", [["a", "b"], ["1", "2"]]],
      ["rule", null],
      ["p", "结尾"],
    ]);
  });
  it("行内标记：文字先转义，模型写的 < 不会变成标签；句尾的标点不算链接", () => {
    const markup = (s: string) => py(`print(x.inline_markup(${JSON.stringify(s)}))`).trim();
    expect(markup("a <b> & c")).toBe("a &lt;b&gt; &amp; c");
    expect(markup("**粗**")).toBe("<b>粗</b>");
    expect(markup("[来源](https://a.test/x?a=1&b=2)")).toContain('href="https://a.test/x?a=1&amp;b=2"');
    expect(markup("见 https://a.test/x。")).toContain('href="https://a.test/x"');
    expect(markup("见 https://a.test/x。")).toMatch(/<\/a>。$/);
  });
  it("按报告里的文字选字体", () => {
    const font = (s: string) => py(`print(x.pick_font(${JSON.stringify(s)}))`).trim();
    expect(font("Plain English “quotes”")).toBe("Helvetica");
    expect(font("中文报告")).toBe("STSong-Light");
    expect(font("日本語のレポート")).toBe("HeiseiKakuGo-W5");
    expect(font("한국어 보고서")).toBe("HYGothic-Medium");
    expect(font("Отчёт")).toBe("STSong-Light");
  });
});
