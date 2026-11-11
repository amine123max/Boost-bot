// PPT 大师的界面：左边项目，中间进度和页面预览，右边导出文件。数据都来自 app/state.json，改数据都交给 Bot。
import { html, mount, useBot, useEffect, useRef, useState, Page, Section, Card, Row, Stack, Grid, Button, Field, Notice, Empty, Meter } from "/boost-bot/amb/botapp/kit/kit.js";

const ACCEPT = ".pdf,.docx,.doc,.md,.txt,.html,.htm,.epub,.ipynb,.xlsx,.xlsm,.pptx,.png,.jpg,.jpeg,.webp";
const RUNNING = new Set(["routed", "guard", "importing", "authoring", "finalizing", "exporting"]);

/** 这条路线会经过哪些阶段 */
function stepsOf(job) {
  if (job.route === "edit_native") return ["importing", "spec_pending", "authoring", "exporting", "done"];
  if (job.route === "create_template" || job.profile === "quick") return ["importing", "authoring", "exporting", "done"];
  return ["importing", "spec_pending", "authoring", "finalizing", "exporting", "done"];
}

const fmtSize = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

/** 一页预览。示例项目的图在界面包里（sample/…），其余的进入视野才从工作区读 */
function PageImage({ bot, page, large, onClick }) {
  const bundled = page.path.startsWith("sample/");
  const [src, setSrc] = useState(bundled ? `./${page.path}` : "");
  const [missing, setMissing] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (bundled) return undefined;
    let alive = true;
    setMissing(false);
    const load = () =>
      bot
        .readImage(page.path)
        .then((r) => {
          if (!alive) return;
          if (r?.url) setSrc(r.url);
          else setMissing(true);
        })
        .catch(() => alive && setMissing(true));
    if (large || !box.current || typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        alive = false;
      };
    }
    const seen = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        seen.disconnect();
        load();
      }
    });
    seen.observe(box.current);
    return () => {
      alive = false;
      seen.disconnect();
    };
  }, [page.path, page.mtime, large]);
  return html`<button type="button" ref=${box} class=${`ppt-page${large ? " large" : ""}`} title=${page.name} onClick=${onClick}>
    ${src && !missing ? html`<img src=${src} alt=${page.name} onError=${() => setMissing(true)} />` : html`<span class="t-meta">${missing ? bot.t("previews.unreadable") : page.name}</span>`}
  </button>`;
}

function JobCard({ bot, job }) {
  const steps = stepsOf(job);
  const now = steps.indexOf(job.phase);
  const stalled = RUNNING.has(job.phase) && !bot.busy && !job.background && !job.sample && !bot.sample;
  const route = job.route === "generate" ? `${bot.t("route.generate")} · ${bot.t(`profile.${job.profile || "default"}`)}` : bot.t(`route.${job.route}`);
  return html`<${Card}>
    <div class="ppt-job-head">
      <span class="ppt-strong">${route}</span>
      <span class=${`t-meta${job.phase === "error" ? " tone-danger" : ""}`}>${job.background && RUNNING.has(job.phase) ? bot.t("job.background") : bot.t(`phase.${job.phase}`)}</span>
    </div>
    ${now >= 0 && html`<ol class="ppt-steps">${steps.map((s, i) => html`<li key=${s} class=${i < now || job.phase === "done" ? "past" : i === now ? "now" : ""} aria-current=${i === now ? "step" : undefined}>${bot.t(`phase.${s}`)}</li>`)}</ol>`}
    ${job.total > 0 && job.phase === "authoring" && html`<div class="ppt-progress"><${Meter} value=${job.done || 0} max=${job.total} label=${bot.t("job.pages", { done: job.done || 0, total: job.total })} /><span class="t-meta">${bot.t("job.pages", { done: job.done || 0, total: job.total })}</span></div>`}
    ${job.message && html`<p class="ppt-text">${job.message}</p>`}
    ${(job.warnings || []).map((w) => html`<p class="ppt-text t-meta" key=${w}>${w}</p>`)}
    ${bot.busy && RUNNING.has(job.phase) && html`<${Row}><${Button} onClick=${() => bot.stop()}>${bot.t("job.stop")}<//><//>`}
    ${stalled && html`<p class="ppt-text t-meta">${bot.t("job.stalled")}</p><${Row}><${Button} onClick=${() => bot.send(bot.t("job.resumeMsg"), { type: "resume", projectId: job.projectId })}>${bot.t("job.resume")}<//><//>`}
  <//>`;
}

/** 需要用户确认的方案：确认之前 Bot 不会往下走 */
function SpecCard({ bot, spec, projectId }) {
  const recommended = (spec.choices || []).find((c) => c.recommended)?.id ?? spec.choices?.[0]?.id;
  const [choice, setChoice] = useState(recommended);
  const [note, setNote] = useState("");
  useEffect(() => setChoice(recommended), [spec.stage, spec.title]);
  const confirm = () => bot.send(bot.t("spec.confirmMsg"), { type: "confirm_spec", stage: spec.stage, projectId, ...(choice ? { choice } : {}) });
  const revise = () => {
    const text = note.trim();
    if (!text) return;
    setNote("");
    bot.send(text, { type: "revise_spec", stage: spec.stage, projectId });
  };
  return html`<${Card} on=${true} class="ppt-spec">
    <span class="t-label">${bot.t(`spec.${spec.stage}`)}</span>
    <h2 class="t-heading ppt-heading">${spec.title}</h2>
    <p class="ppt-text">${spec.summary}</p>
    ${spec.fields?.length > 0 && html`<dl class="ppt-fields">${spec.fields.map((f) => html`<div key=${f.label}><dt class="t-meta">${f.label}</dt><dd>${f.value}</dd></div>`)}</dl>`}
    ${spec.choices?.length > 0 && html`<div class="ppt-choices" role="radiogroup">${spec.choices.map((c) => html`<label key=${c.id} class=${`ppt-choice${choice === c.id ? " on" : ""}`}>
      <input type="radio" name="ppt-spec-choice" checked=${choice === c.id} onChange=${() => setChoice(c.id)} />
      <span><span class="ppt-strong">${c.label}</span>${c.recommended && html`<span class="t-meta"> · ${bot.t("spec.recommended")}</span>`}${c.description && html`<span class="t-meta ppt-block">${c.description}</span>`}</span>
    </label>`)}</div>`}
    <${Row}><${Button} primary disabled=${bot.busy} onClick=${confirm}>${bot.t("spec.confirm")}<//><//>
    <div class="ppt-revise">
      <${Field} label=${bot.t("spec.reviseLabel")} placeholder=${bot.t("spec.revisePlaceholder")} value=${note} onInput=${(e) => setNote(e.target.value)} />
      <${Button} disabled=${bot.busy || !note.trim()} onClick=${revise}>${bot.t("spec.revise")}<//>
    </div>
  <//>`;
}

/** 选好文件之后问一句怎么用。这一步不调模型，点了才开始 */
function PickedCard({ bot, files, onClear }) {
  const paths = files.map((f) => f.path);
  const pptx = files.length === 1 && /\.pptx$/i.test(files[0].name);
  const start = (key, action) => {
    onClear();
    bot.send(bot.t(`start.${key}Msg`), { type: "start", files: paths, ...action });
  };
  const options = pptx
    ? [["edit", { route: "edit_native" }], ["beautify", { route: "generate", profile: "beautify" }], ["template", { route: "create_template" }]]
    : [["quick", { route: "generate", profile: "quick" }], ["default", { route: "generate", profile: "default" }], ["template", { route: "create_template" }]];
  return html`<${Card}>
    <span class="t-label">${bot.t("picked.title")}</span>
    <p class="ppt-text">${files.map((f) => f.name).join("、")}</p>
    <${Row}>
      ${options.map(([key, action], i) => html`<${Button} key=${key} primary=${i === 0} disabled=${bot.busy} onClick=${() => start(key, action)}>${bot.t(`start.${key}`)}<//>`)}
      <${Button} onClick=${onClear}>${bot.t("picked.clear")}<//>
    <//>
  <//>`;
}

function Exports({ bot, project, onError }) {
  const list = project?.exports || [];
  const open = (path, reveal) => bot.openFile(path, { reveal }).catch(() => onError(bot.t("exports.failed")));
  if (!list.length) return html`<${Empty}>${bot.t("exports.empty")}<//>`;
  return html`<${Stack}>
    ${list.map((f) => html`<div class="ppt-export" key=${f.path}>
      <span class="truncate ppt-strong" title=${f.name}>${f.name}</span>
      <span class="t-meta">${[bot.t(`exports.kind.${f.kind || "standard"}`), f.slides ? bot.t("project.pages", { n: f.slides }) : "", f.size ? fmtSize(f.size) : ""].filter(Boolean).join(" · ")}</span>
      ${project.sample
        ? html`<span class="t-meta">${bot.t("exports.sample")}</span>`
        : html`<${Row}>
            <${Button} onClick=${() => open(f.path, false)}>${bot.t(bot.desktop ? "exports.open" : "exports.download")}<//>
            ${bot.desktop && html`<${Button} onClick=${() => open(f.path, true)}>${bot.t("exports.reveal")}<//>`}
          <//>`}
    </div>`)}
  <//>`;
}

function App() {
  const bot = useBot();
  const [selected, setSelected] = useState(null);
  const [focus, setFocus] = useState(null);
  const [picked, setPicked] = useState([]);
  const [error, setError] = useState("");
  const activeId = bot.state?.activeProjectId;
  // Bot 开始做新项目时跟过去
  useEffect(() => {
    setSelected(null);
    setFocus(null);
  }, [activeId]);
  if (!bot.ready) return null;

  const state = bot.state || {};
  const projects = state.projects || [];
  const project = projects.find((p) => p.id === selected) ?? projects.find((p) => p.id === activeId) ?? projects[0];
  const job = state.job && (state.job.projectId === project?.id || RUNNING.has(state.job.phase)) ? state.job : null;
  const previews = project?.previews || [];
  const runtime = state.runtime;

  const pick = async () => {
    setError("");
    try {
      const files = await bot.pickFile({ accept: ACCEPT, multiple: true });
      if (files?.length) setPicked(files);
    } catch {
      setError(bot.t("picked.failed"));
    }
  };

  return html`<${Page} title=${state.title} sub=${bot.t("sub")} actions=${html`<${Button} primary onClick=${pick}>${bot.t("upload")}<//>`}>
    ${runtime && runtime.ready === false && html`<${Notice}>
      <div class="ppt-notice"><span>${bot.t(`runtime.${runtime.problem || "not_installed"}`)}</span>
      ${runtime.problem !== "guard" && html`<${Button} disabled=${bot.busy} onClick=${() => bot.send(bot.t("runtime.recheckMsg"), { type: "recheck" })}>${bot.t("runtime.recheck")}<//>`}</div>
    <//>`}
    ${error && html`<${Notice}>${error}<//>`}
    ${picked.length > 0 && html`<${PickedCard} bot=${bot} files=${picked} onClear=${() => setPicked([])} />`}
    ${state.pendingSpec && html`<${SpecCard} bot=${bot} spec=${state.pendingSpec} projectId=${state.job?.projectId || project?.id || ""} />`}
    ${projects.length === 0
      ? html`<${Empty}>${bot.t("project.none")}<//>`
      : html`<div class="ppt-layout">
          <aside class="ppt-col">
            <${Section} title=${bot.t("project.title")}>
              <div class="ppt-projects">
                ${projects.map((p) => html`<button type="button" key=${p.id} class=${`ppt-project${p.id === project?.id ? " on" : ""}`} aria-current=${p.id === project?.id ? "true" : undefined} onClick=${() => { setSelected(p.id); setFocus(null); }}>
                  <span class="truncate ppt-strong">${p.name}</span>
                  <span class="t-meta">${[bot.t(`kind.${p.kind}`), p.pages ? bot.t("project.pages", { n: p.pages }) : ""].filter(Boolean).join(" · ")}</span>
                </button>`)}
              </div>
            <//>
          </aside>
          <div class="ppt-col">
            ${job && html`<${JobCard} bot=${bot} job=${job} />`}
            <${Section} title=${project?.previewsDraft ? bot.t("previews.draft") : bot.t("previews.title")}>
              ${focus && html`<${PageImage} key=${`large:${focus.path}`} bot=${bot} page=${focus} large=${true} onClick=${() => setFocus(null)} />`}
              ${previews.length
                ? html`<${Grid} class="ppt-pages">${previews.map((p) => html`<${PageImage} key=${p.path} bot=${bot} page=${p} onClick=${() => setFocus(p)} />`)}<//>`
                : html`<${Empty}>${bot.t("previews.empty")}<//>`}
            <//>
          </div>
          <aside class="ppt-col">
            <${Section} title=${bot.t("exports.title")}>
              <${Exports} bot=${bot} project=${project} onError=${setError} />
            <//>
          </aside>
        </div>`}
  <//>`;
}

mount(App);
