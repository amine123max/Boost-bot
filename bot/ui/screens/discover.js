// 发现页：一句话说明、精选、上新。点卡片直接打开 Bot，点开就是示例界面，不单独做详情页（docs/bot-framework.md）。
import { useMemo, useState } from "preact/hooks";
import { html, Icon } from "../components/ui.js";
import { BotAvatar } from "../components/avatar.js";
import { tr } from "../lib/catalog.js";
import { t, useLang } from "../lib/i18n.js";

/** 目录多到一屏放不下才有搜索框 */
const SEARCH_MIN = 12;

function Card({ entry, lang, onOpen }) {
  const theme = document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
  const thumb = entry.thumbs?.[theme] || entry.thumbs?.light;
  return html`<button type="button" class="discover-card" onClick=${() => onOpen(entry)}>
    <span class="discover-thumb">${thumb ? html`<img src=${`/boost-bot/amb/botapp/thumb/${thumb}`} alt="" loading="lazy" />` : html`<${BotAvatar} char=${entry.avatar} size=${72} />`}</span>
    <span class="discover-meta">
      <${BotAvatar} char=${entry.avatar} size=${32} />
      <span class="discover-text"><span class="title">${tr(entry.name, lang)}</span><span class="t-meta">${tr(entry.summary, lang)}</span></span>
    </span>
  </button>`;
}

export function DiscoverScreen({ catalog, onOpen }) {
  const lang = useLang();
  const [q, setQ] = useState("");
  const list = catalog || [];
  const needle = q.trim().toLowerCase();
  const hits = useMemo(() => {
    if (!needle) return list;
    return list.filter((e) => [tr(e.name, lang), tr(e.summary, lang), ...e.skills.map((s) => s.name)].some((x) => String(x || "").toLowerCase().includes(needle)));
  }, [list, needle, lang]);
  const featured = needle ? [] : hits.filter((e) => e.featured);
  const rest = needle ? hits : hits.filter((e) => !e.featured);
  return html`<section class="discover" data-screen="discover">
    <header class="discover-head">
      <h1 class="t-page">${t("botapp.discover.title")}</h1>
      <p>${t("botapp.discover.lead")}</p>
      ${list.length >= SEARCH_MIN && html`<label class="side-search discover-search"><${Icon} name="search" size="sm" />
        <input type="search" placeholder=${t("common.search")} aria-label=${t("common.search")} value=${q} onInput=${(e) => setQ(e.target.value)} /></label>`}
    </header>
    ${featured.length > 0 && html`<h2 class="discover-part">${t("botapp.discover.featured")}</h2><div class="discover-grid">${featured.map((e) => html`<${Card} key=${e.id} entry=${e} lang=${lang} onOpen=${onOpen} />`)}</div>`}
    ${rest.length > 0 && html`<h2 class="discover-part">${t("botapp.discover.latest")}</h2><div class="discover-grid">${rest.map((e) => html`<${Card} key=${e.id} entry=${e} lang=${lang} onOpen=${onOpen} />`)}</div>`}
    ${!hits.length && html`<p class="hint">${t("botapp.discover.empty")}</p>`}
  </section>`;
}
