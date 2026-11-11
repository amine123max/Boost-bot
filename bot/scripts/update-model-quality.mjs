#!/usr/bin/env node
// 刷新模型智能快照 assets/model-quality.json（模型选择器的「模型智能」滑块用）。无第三方依赖。
//
//   node scripts/update-model-quality.mjs                  抓 Artificial Analysis 的公开排行榜页面和 Modelflare 的公开价格目录，写快照
//   AA_API_KEY=… node scripts/update-model-quality.mjs     改用 AA 的官方 API（字段没有核对过，见 fromApi）
//   --html <file>      用保存下来的排行榜页面，不去抓
//   --pricing <file>   用保存下来的 Modelflare 价格目录（https://modelflare.dev/api/pricing），不去抓
//   --out <file>       写到别处（默认 assets/model-quality.json）
//   --dry-run          只打印结果，不写文件
//
// 页面结构变了（找不到某一列、行的形状不对、数字解析不出来、行数太少、对上的模型太少）时退出码为 1，
// 说清楚是哪一项不对，原来的快照不动。
//
// 快照只留用得到的：每个 Modelflare 模型 ID 对应的 AA 模型，它默认那一档（链接里没有档位后缀的那一行）和 medium
// 那一档的智能指数（Artificial Analysis Intelligence Index）与每次任务的花费（Cost per Task，美元，官方定价）。
// 对应规则：小写、点换成横线（gpt-6.1-sol → gpt-6-1-sol）；ID 末尾带档位的（gemini-3.8-flash-high）对应那一档；
// 名字对不上的写在 OVERRIDES 里。数据来自 Artificial Analysis，界面上注明出处（他们的免费数据要求署名）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const PAGE_URL = "https://artificialanalysis.ai/leaderboards/models";
export const API_URL = "https://artificialanalysis.ai/api/v2/data/llms/models";
export const PRICING_URL = "https://modelflare.dev/api/pricing";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/** Modelflare 的 ID 和 AA 的 slug 按规则对不上的：Modelflare ID → AA slug（不带档位） */
export const OVERRIDES = {
  "deepseek-v4.1-flash": "deepseek-v4-1-flash-1017",
};

/** 档位：AA 名字括号里的第一个这类词（"max with fallback" → max） */
const EFFORTS = ["minimal", "low", "medium", "high", "xhigh", "max", "non-reasoning"];
/** 合格的门槛：低于这些说明页面结构变了，不写快照 */
export const LIMITS = { minRows: 50, minNumeric: 30, numericShare: 0.9, minMapped: 5 };

export class ShapeError extends Error {}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const textOf = (cell) =>
  cell
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m)))
    .replace(/\s+/g, " ")
    .trim();

/** "59" → 59，"$7.76" → 7.76，"--" / 空 → null，其他 → NaN（解析失败） */
export function numberOf(s) {
  const v = String(s ?? "").trim();
  if (!v || v === "--" || v === "—" || v === "-") return null;
  const n = Number(v.replace(/^\$/, "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : NaN;
}

/** "GPT-6 Astra (high)" → { base: "GPT-6 Astra", variant: "high" }；括号里没有档位词（"(0902)"）时 variant 为空 */
export function splitVariant(name) {
  const m = name.match(/^(.*?)\s*\(([^)]*)\)\s*$/);
  if (!m) return { base: name, variant: "" };
  const variant = m[2].toLowerCase().split(/[\s,]+/).find((w) => EFFORTS.includes(w)) ?? "";
  return variant ? { base: m[1], variant } : { base: name, variant: "" };
}

/**
 * 解析排行榜页面的表格：按表头文字找列（Model、Artificial Analysis Intelligence Index、Cost per Task），
 * 每行取名字、档位、slug（/models/<slug> 链接）、智能指数与每次任务的花费。结构不对时抛 ShapeError。
 */
export function parseLeaderboard(html) {
  const table = html.match(/<table[\s\S]*?<\/table>/i)?.[0];
  if (!table) throw new ShapeError("no <table> on the leaderboard page");
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);
  const cellsOf = (row) => [...row.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((m) => m[1]);
  const headAt = rows.findIndex((r) => cellsOf(r).some((c) => /^Model$/i.test(textOf(c))));
  if (headAt < 0) throw new ShapeError('no header row with a "Model" column');
  const head = cellsOf(rows[headAt]).map(textOf);
  const col = (label, re) => {
    const i = head.findIndex((h) => re.test(h));
    if (i < 0) throw new ShapeError(`missing column "${label}" (header: ${head.join(" | ")})`);
    return i;
  };
  const cName = col("Model", /^Model$/i);
  const cIntel = col("Artificial Analysis Intelligence Index", /Intelligence Index/i);
  const cCost = col("Cost per Task", /Cost per Task/i);
  const body = rows.slice(headAt + 1);
  const out = [];
  let badShape = 0;
  let noLink = 0;
  for (const r of body) {
    const cells = cellsOf(r);
    if (cells.length !== head.length) {
      badShape++;
      continue;
    }
    const slug = r.match(/href="\/models\/([a-z0-9][a-z0-9.-]*)"/i)?.[1]?.toLowerCase();
    if (!slug) {
      noLink++;
      continue;
    }
    const name = textOf(cells[cName]);
    out.push({ name, slug, ...splitVariant(name), intelligence: numberOf(textOf(cells[cIntel])), costPerTask: numberOf(textOf(cells[cCost])) });
  }
  if (badShape > body.length * 0.1) throw new ShapeError(`${badShape} of ${body.length} rows don't have the ${head.length} header columns`);
  if (noLink > body.length * 0.1) throw new ShapeError(`${noLink} of ${body.length} rows have no /models/<slug> link`);
  return out;
}

/**
 * AA 官方 API（/api/v2/data/llms/models，要 x-api-key）的行。没有 Key 核对过字段：智能指数取
 * evaluations.artificial_analysis_intelligence_index，每次任务的花费认这几个名字；一个都没有时抛错（别用页面以外的东西猜）。
 */
export function fromApi(json) {
  const list = Array.isArray(json?.data) ? json.data : Array.isArray(json) ? json : null;
  if (!list) throw new ShapeError("API response has no data array");
  const cost = (m) => m.cost_per_task_usd ?? m.cost_per_task ?? m.evaluations?.cost_per_task ?? m.pricing?.cost_per_task;
  if (!list.some((m) => cost(m) !== undefined)) throw new ShapeError("API response has no cost per task; unset AA_API_KEY to use the public page");
  return list.map((m) => {
    const name = String(m.name ?? "");
    const num = (v) => (v === null || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : NaN);
    return { name, slug: String(m.slug ?? "").toLowerCase(), ...splitVariant(name), intelligence: num(m.evaluations?.artificial_analysis_intelligence_index), costPerTask: num(cost(m)) };
  });
}

/** 数字列的健康检查：有值（不是 --）的格子绝大多数要解析得出数字，而且够多行两个都有 */
export function checkRows(rows) {
  if (rows.length < LIMITS.minRows) throw new ShapeError(`only ${rows.length} rows (need at least ${LIMITS.minRows})`);
  for (const [key, label] of [["intelligence", "Intelligence Index"], ["costPerTask", "Cost per Task"]]) {
    const filled = rows.filter((r) => r[key] !== null);
    const ok = filled.filter((r) => Number.isFinite(r[key]));
    if (ok.length < LIMITS.minNumeric) throw new ShapeError(`only ${ok.length} rows have a number in "${label}" (need at least ${LIMITS.minNumeric})`);
    if (ok.length < filled.length * LIMITS.numericShare) throw new ShapeError(`"${label}" didn't parse as a number in ${filled.length - ok.length} of ${filled.length} filled rows`);
  }
  const both = rows.filter((r) => Number.isFinite(r.intelligence) && Number.isFinite(r.costPerTask)).length;
  if (both < LIMITS.minNumeric) throw new ShapeError(`only ${both} rows have both an intelligence index and a cost per task`);
}

/** 按模型归组：slug 去掉档位后缀就是这个模型（gpt-6-astra-medium → gpt-6-astra）；默认那一档是 slug 不带后缀的那一行 */
export function groupRows(rows) {
  const groups = new Map();
  for (const r of rows) {
    const base = r.variant && r.slug.endsWith(`-${r.variant}`) ? r.slug.slice(0, -r.variant.length - 1) : r.slug;
    const g = groups.get(base) ?? { name: r.base, rows: {} };
    if (r.slug === base) g.default = r;
    if (r.variant && !g.rows[r.variant]) g.rows[r.variant] = r;
    groups.set(base, g);
  }
  return groups;
}

/** Modelflare ID → 对应规则下的 AA slug：去掉前缀、小写、点和下划线换成横线 */
export function normalizeId(id) {
  return String(id).replace(/^.*\//, "").toLowerCase().replace(/[._\s]+/g, "-");
}

/** 一个 Modelflare 模型对应哪个 AA 模型；ID 末尾带档位的（-high）固定取那一档。对不上时 undefined */
export function mapModel(id, groups) {
  const want = OVERRIDES[id] ?? normalizeId(id);
  if (groups.has(want)) return { base: want };
  const m = want.match(/-(minimal|low|medium|high|xhigh|max)$/);
  if (m && groups.has(want.slice(0, -m[0].length))) return { base: want.slice(0, -m[0].length), variant: m[1] };
  return undefined;
}

const usable = (r) => r && Number.isFinite(r.intelligence) && Number.isFinite(r.costPerTask) && r.costPerTask >= 0;
const pick = (r) => ({ intelligence: r.intelligence, costPerTask: r.costPerTask });

/** 生成快照：只含对得上、而且有数字的 Modelflare 模型 */
export function buildSnapshot(rows, modelIds, { updatedAt, source }) {
  const groups = groupRows(rows);
  const models = {};
  for (const id of [...new Set(modelIds)].sort()) {
    const hit = mapModel(id, groups);
    if (!hit) continue;
    const g = groups.get(hit.base);
    let entry;
    if (hit.variant) {
      const r = g.default?.variant === hit.variant ? g.default : g.rows[hit.variant];
      if (usable(r)) entry = { aa: hit.base, name: g.name, default: { variant: hit.variant, ...pick(r) } };
    } else {
      const d = usable(g.default) ? { variant: g.default.variant || undefined, ...pick(g.default) } : undefined;
      const med = g.rows.medium && g.rows.medium !== g.default && usable(g.rows.medium) ? pick(g.rows.medium) : undefined;
      if (d || med) entry = { aa: hit.base, name: g.name, ...(d ? { default: d } : {}), ...(med ? { medium: med } : {}) };
    }
    if (entry) models[id] = entry;
  }
  return { updatedAt, source, attribution: "Artificial Analysis (artificialanalysis.ai)", models };
}

/** Modelflare 价格目录里的模型 ID */
export function modelflareIds(pricing) {
  const list = Array.isArray(pricing?.data) ? pricing.data : null;
  if (!list) throw new ShapeError("Modelflare pricing catalog has no data array");
  return list.map((e) => String(e.model_name ?? "")).filter(Boolean);
}

async function get(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return res;
}

async function main(argv) {
  const arg = (name) => {
    const i = argv.indexOf(name);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const out = path.resolve(arg("--out") ?? path.join(ROOT, "assets", "model-quality.json"));
  const htmlFile = arg("--html");
  const pricingFile = arg("--pricing");
  const key = process.env.AA_API_KEY?.trim();

  let rows;
  let source;
  if (key && !htmlFile) {
    rows = fromApi(await (await get(API_URL, { "x-api-key": key, Accept: "application/json" })).json());
    source = API_URL;
  } else {
    const html = htmlFile ? fs.readFileSync(htmlFile, "utf8") : await (await get(PAGE_URL, { "User-Agent": UA, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" })).text();
    rows = parseLeaderboard(html);
    source = PAGE_URL;
  }
  checkRows(rows);
  const pricing = pricingFile ? JSON.parse(fs.readFileSync(pricingFile, "utf8")) : await (await get(PRICING_URL, { Accept: "application/json" })).json();
  const snap = buildSnapshot(rows, modelflareIds(pricing), { updatedAt: new Date().toISOString().slice(0, 10), source });
  const mapped = Object.keys(snap.models);
  if (mapped.length < LIMITS.minMapped) throw new ShapeError(`only ${mapped.length} Modelflare models matched an AA entry (need at least ${LIMITS.minMapped})`);

  const text = JSON.stringify(snap, null, 2) + "\n";
  console.log(`${rows.length} AA rows, ${mapped.length} Modelflare models matched: ${mapped.join(", ")}`);
  if (argv.includes("--dry-run")) return void console.log(text);
  const tmp = `${out}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, out);
  console.log(`wrote ${path.relative(process.cwd(), out) || out}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`update-model-quality: ${e instanceof ShapeError ? "the source changed shape: " : ""}${e.message}`);
    console.error("the existing snapshot was left untouched");
    process.exit(1);
  });
}
