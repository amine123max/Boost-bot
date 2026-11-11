// 界面只显示 app/state.json，开始、取消、导出、删除都交给 Bot（send）。选哪个任务、看哪个标签只影响这个界面，不用发消息。
import { html, mount, useBot, useEffect, useState, Button, Empty, Field, Link, Meter, Notice, Page } from "/boost-bot/amb/botapp/kit/kit.js";
import { Report } from "./report.js";

const RESEARCH = [["financial_analyst", "financial"], ["news_scanner", "news"], ["industry_analyst", "industry"], ["company_analyst", "company"]];
const AFTER_RESEARCH = ["collector", "curator", "enricher", "briefing", "editor"];
const ACTIVE = new Set(["pending", "grounding", "researching", "collecting", "curating", "enriching", "briefing", "editing"]);
/** 这么久没有进展，这一轮多半已经断了（回合被中止、App 重启） */
const STALE_MS = 15 * 60_000;
const NO_FORM = { company: "", url: "", industry: "", hq: "" };

const statusTone = (status) => (status === "completed" ? "ok" : status === "failed" ? "err" : status === "cancelled" ? "off" : "warn");
const nodeTone = (status) => (status === "done" ? "ok" : status === "failed" ? "err" : status === "running" ? "warn" : "off");

function timeOf(iso, lang) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleString(lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** 读 app/ 下的文本文件。示例数据和文件不存在时返回 null，界面用状态里的预览 */
function useAppFile(bot, path, version) {
  const [text, setText] = useState(null);
  useEffect(() => {
    if (!path || bot.sample) return void setText(null);
    let alive = true;
    bot.readFile(path).then((f) => alive && setText(typeof f?.text === "string" ? f.text : null)).catch(() => alive && setText(null));
    return () => {
      alive = false;
    };
  }, [path, version, bot.sample]);
  return text;
}

function parseSources(text) {
  if (!text) return null;
  try {
    const list = JSON.parse(text);
    return Array.isArray(list) ? list.filter((s) => s && typeof s.url === "string") : null;
  } catch {
    return null;
  }
}

function NewJob({ bot }) {
  const { t } = bot;
  const [form, setForm] = useState(NO_FORM);
  const field = (key) => ({ value: form[key], onInput: (e) => setForm((f) => ({ ...f, [key]: e.currentTarget.value })) });
  const start = (e) => {
    e.preventDefault();
    const company = form.company.trim();
    if (!company || bot.busy) return;
    const action = { type: "start_research", company };
    if (form.url.trim()) action.company_url = form.url.trim();
    if (form.industry.trim()) action.industry = form.industry.trim();
    if (form.hq.trim()) action.hq_location = form.hq.trim();
    bot.send(t("action.start", { company }), action);
    setForm(NO_FORM);
  };
  return html`<form class="cr-form" onSubmit=${start}>
    <${Field} label=${t("form.company")} placeholder=${t("form.companyHint")} ...${field("company")} />
    <details class="cr-more">
      <summary class="t-meta">${t("form.more")}</summary>
      <div class="cr-form">
        <${Field} label=${t("form.url")} ...${field("url")} />
        <${Field} label=${t("form.industry")} ...${field("industry")} />
        <${Field} label=${t("form.hq")} ...${field("hq")} />
      </div>
    </details>
    <button type="submit" class="btn primary" disabled=${bot.busy || !form.company.trim()}>${t("form.start")}</button>
  </form>`;
}

function JobList({ bot, jobs, jobId, onPick }) {
  const { t, lang } = bot;
  if (!jobs.length) return html`<${Empty}>${t("jobs.empty")}<//>`;
  return html`<div class="cr-jobs" role="list">
    ${jobs.map((job) => html`<button type="button" key=${job.id} role="listitem" class=${`cr-job${job.id === jobId ? " on" : ""}`} aria-current=${job.id === jobId} onClick=${() => onPick(job.id)}>
      <span class="cr-job-name">${job.company}</span>
      <span class="cr-job-meta">
        <span class=${`badge ${statusTone(job.status)}`}>${t(`status.${job.status}`)}</span>
        <span class="t-meta">${job.sample ? t("jobs.sample") : timeOf(job.updatedAt, lang)}</span>
      </span>
    </button>`)}
  </div>`;
}

function Node({ bot, job, node, count }) {
  const status = job.nodes?.[node] ?? "pending";
  return html`<li class="cr-node">
    <span class=${`badge ${nodeTone(status)}`}>${bot.t(`node.${node}`)}</span>
    ${count !== undefined && html`<span class="t-meta">${bot.t("node.docs", { count })}</span>`}
  </li>`;
}

function Pipeline({ bot, job }) {
  const { t } = bot;
  return html`<section class="cr-section" aria-label=${t("pipeline.title")}>
    <h2 class="t-label">${t("pipeline.title")}</h2>
    <ol class="cr-pipeline">
      <${Node} bot=${bot} job=${job} node="grounding" />
      <li class="cr-parallel-wrap">
        <ul class="cr-parallel">
          ${RESEARCH.map(([node, key]) => html`<${Node} key=${node} bot=${bot} job=${job} node=${node} count=${job.docCounts?.[key] ?? 0} />`)}
        </ul>
      </li>
      ${AFTER_RESEARCH.map((node) => html`<${Node} key=${node} bot=${bot} job=${job} node=${node} />`)}
    </ol>
    ${job.curation && html`<p class="t-meta cr-note">${t("pipeline.curation", { kept: job.curation.kept ?? 0, total: job.curation.total ?? 0 })}</p>`}
  </section>`;
}

function Timeline({ bot, entries }) {
  const { t, lang } = bot;
  if (!entries.length) return null;
  return html`<section class="cr-section">
    <h2 class="t-label">${t("timeline.title")}</h2>
    <ul class="cr-timeline">
      ${entries.map((e, n) => html`<li key=${n}>
        <span class="t-meta cr-time">${timeOf(e.at, lang)}</span>
        <span>${e.node ? t(`node.${e.node}`) : ""}${e.status ? ` · ${t(`nodeStatus.${e.status}`)}` : ""}${e.text ? `${e.node ? ": " : ""}${e.text}` : ""}</span>
      </li>`)}
    </ul>
  </section>`;
}

function Sources({ bot, list, curation }) {
  const { t } = bot;
  if (!list?.length) return html`<${Empty}>${t("sources.empty")}<//>`;
  return html`<div class="cr-sources">
    ${curation && html`<p class="t-meta">${t("pipeline.curation", { kept: curation.kept ?? 0, total: curation.total ?? 0 })}</p>`}
    <ul>
      ${list.map((s) => html`<li key=${s.url}>
        <${Link} href=${s.url}>${s.title || hostOf(s.url)}<//>
        <span class="t-meta">
          ${hostOf(s.url)}${s.domain ? ` · ${t(`domain.${s.domain}`)}` : ""}${typeof s.score === "number" ? ` · ${t("sources.score", { score: s.score.toFixed(2) })}` : ""}${s.used === false ? ` · ${t("sources.unused")}` : ""}
        </span>
      </li>`)}
    </ul>
  </div>`;
}

function Actions({ bot, job, stale }) {
  const { t } = bot;
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const active = ACTIVE.has(job.status);
  const company = job.company;
  const sendCancel = () => bot.send(t("action.cancel", { company }), { type: "cancel", jobId: job.id });
  const cancel = async () => {
    if (!bot.busy) return sendCancel();
    setCancelling(true);
    await bot.stop();
  };
  // 回合停下来之后才能发取消，否则这句话会排在正在跑的回合后面
  useEffect(() => {
    if (cancelling && !bot.busy) {
      setCancelling(false);
      sendCancel();
    }
  }, [cancelling, bot.busy]);
  useEffect(() => setConfirming(false), [job.id]);
  return html`<div class="cluster cr-actions">
    ${active && html`<${Button} disabled=${cancelling} onClick=${cancel}>${t("action.cancelLabel")}<//>`}
    ${stale && html`<${Button} primary disabled=${bot.busy} onClick=${() => bot.send(t("action.resume", { company }), { type: "resume", jobId: job.id })}>${t("action.resumeLabel")}<//>`}
    ${job.status === "completed" && html`<${Button} disabled=${bot.busy} onClick=${() => bot.send(t("action.pdf", { company }), { type: "export_pdf", jobId: job.id })}>${t(job.pdfPath ? "action.pdfAgainLabel" : "action.pdfLabel")}<//>`}
    ${job.pdfPath && html`<${Button} onClick=${() => bot.openFile(job.pdfPath).catch(() => {})}>${t("action.openPdf")}<//>`}
    ${!active && !job.sample && (confirming
      ? html`<${Button} class="danger" disabled=${bot.busy} onClick=${() => bot.send(t("action.delete", { company }), { type: "delete_job", jobId: job.id })}>${t("action.deleteConfirm")}<//>`
      : html`<${Button} class="ghost" disabled=${bot.busy} onClick=${() => setConfirming(true)}>${t("action.deleteLabel")}<//>`)}
  </div>`;
}

function JobPanel({ bot, job, entries }) {
  const { t } = bot;
  const stale = !bot.sample && !job.sample && !bot.busy && ACTIVE.has(job.status) && Date.now() - new Date(job.updatedAt ?? 0).getTime() > STALE_MS;
  return html`<div class="cr-col">
    <header class="cr-job-head">
      <h2 class="t-title">${job.company}</h2>
      <div class="cluster">
        <span class=${`badge ${statusTone(job.status)}`}>${t(`status.${job.status}`)}</span>
        ${job.track && html`<span class="t-meta">${t(`track.${job.track}`)}</span>`}
        ${job.sample && html`<span class="t-meta">${t("jobs.sampleNote")}</span>`}
      </div>
      ${(job.industry || job.hqLocation) && html`<p class="t-meta">${[job.industry, job.hqLocation].filter(Boolean).join(" · ")}</p>`}
      ${job.companyUrl && html`<${Link} href=${job.companyUrl}>${hostOf(job.companyUrl)}<//>`}
    </header>
    <${Meter} value=${job.status === "completed" ? 100 : job.progress ?? 0} label=${t("pipeline.progress")} />
    ${job.error && html`<${Notice}>${job.error}<//>`}
    ${job.pdfError && html`<${Notice}>${t("pdf.failed", { error: job.pdfError })}<//>`}
    ${stale && html`<${Notice}>${t("job.stale")}<//>`}
    <${Actions} bot=${bot} job=${job} stale=${stale} />
    ${job.pdfPath && html`<p class="t-meta cr-path">${job.pdfPath}</p>`}
    <${Pipeline} bot=${bot} job=${job} />
    <${Timeline} bot=${bot} entries=${entries} />
  </div>`;
}

function Detail({ bot, state, job, tab, onTab }) {
  const { t } = bot;
  const selected = job.id === state.selectedJobId;
  const reportFile = useAppFile(bot, job.reportPath, job.updatedAt);
  const sourcesFile = useAppFile(bot, job.sourcesPath, job.updatedAt);
  const report = reportFile ?? (selected ? state.reportPreview : "");
  const sources = parseSources(sourcesFile) ?? (selected ? state.sourcesPreview : null);
  const tabs = [["report", t("tab.report")], ["sources", t("tab.sources")]];
  return html`<div class="cr-col">
    <div class="cr-tabs" role="tablist">
      ${tabs.map(([id, label]) => html`<button type="button" key=${id} role="tab" aria-selected=${tab === id} class=${tab === id ? "on" : ""} onClick=${() => onTab(id)}>${label}</button>`)}
    </div>
    ${tab === "report"
      ? report ? html`<${Report} text=${report} />` : html`<${Empty}>${t(ACTIVE.has(job.status) ? "report.running" : "report.empty")}<//>`
      : html`<${Sources} bot=${bot} list=${sources} curation=${job.curation} />`}
  </div>`;
}

function App() {
  const bot = useBot();
  const state = bot.state || {};
  const jobs = state.jobs || [];
  const [picked, setPicked] = useState(null);
  const [tab, setTab] = useState(null);
  // Bot 换了选中的任务或标签时，跟着 Bot 走
  useEffect(() => setPicked(null), [state.selectedJobId]);
  useEffect(() => setTab(null), [state.view, state.selectedJobId]);
  if (!bot.ready) return null;
  const { t } = bot;
  const job = jobs.find((j) => j.id === picked) ?? jobs.find((j) => j.id === state.selectedJobId) ?? jobs[0];
  const entries = job ? (state.timeline || []).filter((e) => e.jobId === job.id).slice(-30).reverse() : [];
  return html`<${Page} title=${state.title || t("title")}>
    <${Notice}>${t("disclaimer")}<//>
    <div class="cr-layout">
      <div class="cr-col">
        <${NewJob} bot=${bot} />
        <${JobList} bot=${bot} jobs=${jobs} jobId=${job?.id} onPick=${setPicked} />
      </div>
      ${job
        ? html`<${JobPanel} key=${job.id} bot=${bot} job=${job} entries=${entries} /><${Detail} bot=${bot} state=${state} job=${job} tab=${tab || state.view || "report"} onTab=${setTab} />`
        : html`<div class="cr-col cr-wide"><${Empty}>${t("detail.empty")}<//></div>`}
    </div>
  <//>`;
}

mount(App);
