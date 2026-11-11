// 报告用的 Markdown：解析成数据再渲染成文本节点，不生成 HTML。报告内容可能来自外部网页，链接一律走套件的 Link，点开前让用户确认。
import { html, Link, Table } from "/boost-bot/amb/botapp/kit/kit.js";

const HEADING = /^(#{1,4})\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const BULLET = /^\s*[-*+]\s+(.*)$/;
const NUMBER = /^\s*\d+[.)]\s+(.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const INLINE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|`([^`\n]+)`|(https?:\/\/[^\s<>()[\]]+)/g;
const TAIL = /[.,;:!?。，；：！？）)]+$/;

const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

/** 文本 → [{ type: "heading" | "rule" | "quote" | "ul" | "ol" | "table" | "p", ... }] */
export function parseBlocks(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  const isTable = (n) => TABLE_ROW.test(lines[n]) && n + 1 < lines.length && TABLE_RULE.test(lines[n + 1]);
  const startsBlock = (n) => !lines[n].trim() || HEADING.test(lines[n]) || RULE.test(lines[n]) || BULLET.test(lines[n]) || NUMBER.test(lines[n]) || QUOTE.test(lines[n]) || isTable(n);
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
    } else if (HEADING.test(line)) {
      const m = HEADING.exec(line);
      blocks.push({ type: "heading", level: m[1].length, text: m[2].trim() });
      i++;
    } else if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      i++;
    } else if (isTable(i)) {
      const head = cells(lines[i]);
      const rows = [];
      i += 2;
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(cells(lines[i++]));
      blocks.push({ type: "table", head, rows });
    } else {
      const list = [["quote", QUOTE], ["ul", BULLET], ["ol", NUMBER]].find(([, re]) => re.test(line));
      if (list) {
        const [type, re] = list;
        const items = [];
        while (i < lines.length && re.test(lines[i])) items.push(re.exec(lines[i++])[1].trim());
        blocks.push({ type, items });
      } else {
        const para = [];
        while (i < lines.length && !startsBlock(i)) para.push(lines[i++].trim());
        blocks.push({ type: "p", text: para.join(" ") });
      }
    }
  }
  return blocks;
}

function inline(text) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(INLINE)) {
    out.push(text.slice(last, m.index));
    const [whole, label, url, bold, code, bare] = m;
    if (url) out.push(html`<${Link} href=${url}>${label}<//>`);
    else if (bold) out.push(html`<strong>${bold}</strong>`);
    else if (code) out.push(html`<code>${code}</code>`);
    else {
      const clean = bare.replace(TAIL, "");
      out.push(html`<${Link} href=${clean}>${clean}<//>`, whole.slice(clean.length));
    }
    last = m.index + whole.length;
  }
  out.push(text.slice(last));
  return out;
}

function block(b, key) {
  switch (b.type) {
    case "heading": {
      const Tag = `h${Math.min(b.level + 1, 4)}`;
      return html`<${Tag} key=${key}>${inline(b.text)}<//>`;
    }
    case "rule":
      return html`<hr key=${key} />`;
    case "quote":
      return html`<blockquote key=${key}>${b.items.map((it, n) => html`<p key=${n}>${inline(it)}</p>`)}</blockquote>`;
    case "ul":
    case "ol": {
      const Tag = b.type;
      return html`<${Tag} key=${key}>${b.items.map((it, n) => html`<li key=${n}>${inline(it)}</li>`)}<//>`;
    }
    case "table":
      return html`<div class="cr-table" key=${key}><${Table}
        columns=${b.head.map((title, n) => ({ title: inline(title), render: (row) => inline(row[n] ?? "") }))}
        rows=${b.rows}
      /></div>`;
    default:
      return html`<p key=${key}>${inline(b.text)}</p>`;
  }
}

export const Report = ({ text }) => html`<article class="cr-report">${parseBlocks(text).map(block)}</article>`;
