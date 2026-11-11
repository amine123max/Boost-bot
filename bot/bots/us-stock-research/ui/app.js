// 界面显示 app/state.json 里的研究记录。时间线和完整报告从这次研究的文件读（脚本写的 tools.jsonl、Bot 写的 report.md）；
// 示例数据没有这些文件，退回 state 里的 calls 和 preview。选哪一条是界面本地状态，不用走模型。
import { html, mount, useBot, useEffect, useState, Page, Section, Notice, Empty, Meter } from "/boost-bot/amb/botapp/kit/kit.js";
import { parseBlocks, parseInline, parseTrace } from "./md.js";

const ACTIVE = new Set(["planning", "running", "validating"]);
const POLL_MS = 2500;

const statusText = (bot, status) => (ACTIVE.has(status) && !bot.busy ? bot.t("status.stalled") : bot.t(`status.${status}`));

const readText = async (bot, path) => {
  try {
    const file = await bot.readFile(path);
    return typeof file?.text === "string" ? file.text : null;
  } catch {
    return null;
  }
};

/** 读这次研究的文件。Bot 工作时定时刷新，时间线才能实时更新且不用多花一轮模型 */
function useRunFiles(bot, run) {
  const [files, setFiles] = useState({ id: null, report: null, trace: null });
  const id = run?.id;
  const stamp = `${run?.status}|${run?.updatedAt}`;
  useEffect(() => {
    if (!id || bot.sample) return undefined;
    let alive = true;
    const load = async () => {
      const [report, trace] = await Promise.all([readText(bot, `app/reports/${id}/report.md`), readText(bot, `app/reports/${id}/tools.jsonl`)]);
      if (alive) setFiles({ id, report, trace });
    };
    void load();
    const timer = bot.busy ? setInterval(load, POLL_MS) : undefined;
    return () => {
      alive = false;
      if (timer) clearInterval(timer);
    };
  }, [id, stamp, bot.busy, bot.sample]);
  return files.id === id ? files : { report: null, trace: null };
}

const Inline = ({ text }) =>
  parseInline(text).map((part) => {
    if (part.type === "code") return html`<code>${part.text}</code>`;
    if (part.type === "strong") return html`<strong>${part.text}</strong>`;
    if (part.type === "em") return html`<em>${part.text}</em>`;
    if (part.type === "link") return html`${part.text} <span class="t-meta md-url">${part.url}</span>`;
    return part.text;
  });

function Block({ block }) {
  switch (block.type) {
    case "heading": {
      const Tag = `h${Math.min(block.level + 2, 6)}`;
      return html`<${Tag} class=${`md-h md-h${block.level}`}><${Inline} text=${block.text} /><//>`;
    }
    case "rule":
      return html`<hr class="md-rule" />`;
    case "quote":
      return html`<blockquote class="md-quote"><${Inline} text=${block.text} /></blockquote>`;
    case "code":
      return html`<pre class="md-code">${block.text}</pre>`;
    case "ul":
      return html`<ul class="md-list">${block.items.map((item) => html`<li><${Inline} text=${item} /></li>`)}</ul>`;
    case "ol":
      return html`<ol class="md-list">${block.items.map((item) => html`<li><${Inline} text=${item} /></li>`)}</ol>`;
    case "table":
      return html`<div class="md-scroll"><table class="md-table">
        <thead><tr>${block.head.map((cell, i) => html`<th class=${block.align[i] || ""}><${Inline} text=${cell} /></th>`)}</tr></thead>
        <tbody>${block.rows.map((row) => html`<tr>${row.map((cell, i) => html`<td class=${block.align[i] || ""}><${Inline} text=${cell} /></td>`)}</tr>`)}</tbody>
      </table></div>`;
    default:
      return html`<p class="md-p"><${Inline} text=${block.text} /></p>`;
  }
}

const Markdown = ({ text }) => html`<div class="md">${parseBlocks(text).map((block) => html`<${Block} block=${block} />`)}</div>`;

function RunList({ bot, runs, current, onPick }) {
  return html`<${Section} title=${bot.t("runs")}>
    <ul class="runs">
      ${runs.map(
        (run) => html`<li key=${run.id}>
          <button type="button" class=${run.id === current?.id ? "run on" : "run"} aria-current=${run.id === current?.id ? "true" : undefined} onClick=${() => onPick(run.id)}>
            <span class="run-q">${run.question}</span>
            <span class="t-meta">${statusText(bot, run.status)}</span>
          </button>
        </li>`,
      )}
    </ul>
  <//>`;
}

function Plan({ bot, run }) {
  const plan = run.plan || [];
  if (!plan.length) return html`<${Section} title=${bot.t("plan")}><${Empty}>${bot.t("noPlan")}<//><//>`;
  const done = plan.filter((step) => step.done).length;
  return html`<${Section} title=${bot.t("plan")}>
    <${Meter} value=${done} max=${plan.length} label=${bot.t("progress", { done, total: plan.length })} />
    <p class="t-meta step-count">${bot.t("progress", { done, total: plan.length })}</p>
    <ul class="plan">
      ${plan.map(
        (step) => html`<li class=${step.done ? "step done" : "step"}>
          <span class="step-mark" role="img" aria-label=${bot.t(step.done ? "stepDone" : "stepTodo")}>${step.done ? "✓" : "○"}</span>
          <span>${step.text}</span>
        </li>`,
      )}
    </ul>
  <//>`;
}

function Timeline({ bot, calls }) {
  if (!calls.length) return html`<${Section} title=${bot.t("calls")}><${Empty}>${bot.t("noCalls")}<//><//>`;
  return html`<${Section} title=${bot.t("calls")}>
    <ol class="calls">
      ${calls.map(
        (call) => html`<li class="call">
          <span class="call-tool">${call.tool}</span>
          <span class="call-target">${call.target}</span>
          ${call.url && call.url !== call.target && html`<span class="t-meta md-url">${call.url}</span>`}
          ${call.status >= 300 || call.status === 0 ? html`<span class="t-meta">${bot.t("callFailed", { status: call.status })}</span>` : null}
          ${call.cached && html`<span class="t-meta">${bot.t("callCached")}</span>`}
        </li>`,
      )}
    </ol>
  <//>`;
}

function Limitations({ bot, run }) {
  if (!run.limitations?.length) return null;
  return html`<${Section} title=${bot.t("limitations")}>
    <ul class="md-list">${run.limitations.map((text) => html`<li>${text}</li>`)}</ul>
  <//>`;
}

function Report({ bot, run, report }) {
  const text = report ?? run.preview;
  return html`<${Section} title=${bot.t("report")}>
    ${text ? html`<${Markdown} text=${text} />` : html`<${Empty}>${bot.t("noReport")}<//>`}
    ${report && html`<p class="t-meta md-url">${bot.t("reportFile", { path: `app/reports/${run.id}/report.md` })}</p>`}
  <//>`;
}

function App() {
  const bot = useBot();
  const [picked, setPicked] = useState(null);
  const runs = bot.state?.runs || [];
  const newest = runs[0]?.id;
  // 新研究开始时跳到它
  useEffect(() => setPicked(null), [newest]);
  const run = runs.find((r) => r.id === picked) || runs[0];
  const files = useRunFiles(bot, run);
  if (!bot.ready) return null;
  const trace = parseTrace(files.trace);
  const calls = trace.length ? trace : run?.calls || [];
  return html`<${Page} title=${bot.state?.title || bot.bot?.name} sub=${bot.t("scope")}>
    <${Notice}>${bot.t("notice")}<//>
    ${run
      ? html`<div class="layout">
          <div class="pane"><${RunList} bot=${bot} runs=${runs} current=${run} onPick=${setPicked} /></div>
          <div class="pane">
            <${Plan} bot=${bot} run=${run} />
            <${Timeline} bot=${bot} calls=${calls} />
            <${Limitations} bot=${bot} run=${run} />
          </div>
          <div class="pane report"><${Report} bot=${bot} run=${run} report=${files.report} /></div>
        </div>`
      : html`<${Empty}>${bot.t("empty")}<//>`}
  <//>`;
}

mount(App);
