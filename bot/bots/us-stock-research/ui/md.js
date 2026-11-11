// 报告用的 Markdown 解析：只解析成数据，由 app.js 渲染成文本节点，不生成 HTML。
// 链接只显示文字和地址，不做成可点的：报告内容可能来自外部资料，不能让它把界面带走。
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/;
const HEADING = /^(#{1,4})\s+(.*)$/;
const RULE = /^\s*([-*_])(\s*\1){2,}\s*$/;
const QUOTE = /^\s*>\s?/;
const BULLET = /^\s*[-*+]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const FENCE = /^\s*```/;

const cellsOf = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());

const startsBlock = (line, next) => HEADING.test(line) || RULE.test(line) || QUOTE.test(line) || BULLET.test(line) || NUMBERED.test(line) || FENCE.test(line) || (TABLE_ROW.test(line) && TABLE_RULE.test(next ?? ""));

/** 文本 → [{ type: "heading" | "rule" | "quote" | "ul" | "ol" | "code" | "table" | "p", ... }] */
export function parseBlocks(text) {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks = [];
  let i = 0;
  const takeWhile = (re, strip) => {
    const out = [];
    while (i < lines.length && re.test(lines[i])) out.push(lines[i++].replace(strip, ""));
    return out;
  };
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) {
      i++;
      continue;
    }
    if (FENCE.test(line)) {
      i++;
      const code = [];
      while (i < lines.length && !FENCE.test(lines[i])) code.push(lines[i++]);
      i++;
      blocks.push({ type: "code", text: code.join("\n") });
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      i++;
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ type: "rule" });
      i++;
      continue;
    }
    if (QUOTE.test(line)) {
      blocks.push({ type: "quote", text: takeWhile(QUOTE, QUOTE).join(" ") });
      continue;
    }
    if (TABLE_ROW.test(line) && TABLE_RULE.test(lines[i + 1] ?? "")) {
      const head = cellsOf(line);
      const align = cellsOf(lines[i + 1]).map((c) => (c.endsWith(":") ? "num" : ""));
      i += 2;
      const rows = [];
      while (i < lines.length && TABLE_ROW.test(lines[i])) rows.push(cellsOf(lines[i++]));
      blocks.push({ type: "table", head, align, rows });
      continue;
    }
    if (BULLET.test(line)) {
      blocks.push({ type: "ul", items: takeWhile(BULLET, BULLET) });
      continue;
    }
    if (NUMBERED.test(line)) {
      blocks.push({ type: "ol", items: takeWhile(NUMBERED, NUMBERED) });
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !startsBlock(lines[i], lines[i + 1])) para.push(lines[i++].trim());
    if (!para.length) para.push(lines[i++].trim());
    blocks.push({ type: "p", text: para.join(" ") });
  }
  return blocks;
}

const INLINE = /`([^`]+)`|\*\*([^*]+)\*\*|\*([^*\s][^*]*)\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** 一行文本 → [{ type: "text" | "code" | "strong" | "em" | "link", text, url? }] */
export function parseInline(text) {
  const s = String(text ?? "");
  const out = [];
  let at = 0;
  for (const m of s.matchAll(INLINE)) {
    if (m.index > at) out.push({ type: "text", text: s.slice(at, m.index) });
    if (m[1] !== undefined) out.push({ type: "code", text: m[1] });
    else if (m[2] !== undefined) out.push({ type: "strong", text: m[2] });
    else if (m[3] !== undefined) out.push({ type: "em", text: m[3] });
    else out.push({ type: "link", text: m[4], url: m[5] });
    at = m.index + m[0].length;
  }
  if (at < s.length) out.push({ type: "text", text: s.slice(at) });
  return out;
}

/** tools.jsonl → 时间线。写坏的行跳过 */
export function parseTrace(text) {
  const out = [];
  for (const line of String(text ?? "").split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row && typeof row.tool === "string") out.push(row);
    } catch {
      /* 跳过 */
    }
  }
  return out;
}
