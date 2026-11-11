// 沿帕累托前沿选模型（模型选择器的两个滑块；不依赖界面，单元测试直接引入）。
//
// 候选：选择器列表里的模型（这个账户能用的），而且 /models/info 给了它的 quality 和 factors：
//   - quality：Artificial Analysis 的智能指数与每次任务的花费（官方定价），取应用实际用的那一档（服务端 model-quality.ts）；
//   - factors：三种性价比（Key 的路由策略）下实际付的比例（分组倍率 × 售价倍率，服务端 model-info.ts）。
// 花费 = 每次任务的花费 × 当前性价比的比例。前沿 = 没有别的模型又便宜又不笨（花费 ≤、智能 ≥，至少一项严格）的那些。
// 前沿上最多取 5 档，最便宜的和最强的总在，中间几档按智能均匀地挑。
import { normModel, sameModel } from "./models.js";

/** 性价比的三档，滑块从左到右：省钱 / 均衡 / 质量 */
export const STRATEGIES = ["low_cost", "balanced", "stable"];
export const DEFAULT_STRATEGY = "balanced";
/** 第二个滑块最多几档；档名按 levelOf 映射到 5 个词上 */
export const MAX_STOPS = 5;

/** 这个模型的资料：先按完整 ID，再按最后一段（内置网关的 provider/model） */
function infoOf(info, id) {
  const n = normModel(id);
  return info[n] || info[n.slice(n.lastIndexOf("/") + 1)];
}

/** 候选点：{ id, intelligence, cost }；同一个模型（带不带 modelflare/ 前缀）只算一次 */
export function candidates(models, info, strategy) {
  const out = [];
  const seen = new Set();
  for (const id of models || []) {
    const i = infoOf(info || {}, id);
    const f = i && i.factors ? Number(i.factors[strategy]) : NaN;
    if (!i || !i.quality || !Number.isFinite(f) || f < 0) continue;
    const key = normModel(id);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id, intelligence: i.quality.intelligence, cost: i.quality.costPerTask * f });
  }
  return out;
}

/** 前沿：按花费从低到高，智能也从低到高。花费相同只留更聪明的；完全相同的两个留 ID 排前面的 */
export function paretoFrontier(points) {
  const sorted = [...points].sort((a, b) => a.cost - b.cost || b.intelligence - a.intelligence || String(a.id).localeCompare(String(b.id)));
  const out = [];
  let best = -Infinity;
  for (const p of sorted) {
    if (p.intelligence > best) {
      out.push(p);
      best = p.intelligence;
    }
  }
  return out;
}

/** 从前沿上挑最多 max 档：两头总在，中间每一档挑智能最接近均分点、还没被挑过的 */
export function pickStops(front, max = MAX_STOPS) {
  if (front.length <= max) return front.slice();
  const lo = front[0].intelligence;
  const hi = front[front.length - 1].intelligence;
  const chosen = new Set([0, front.length - 1]);
  for (let k = 1; k < max - 1; k++) {
    const target = lo + ((hi - lo) * k) / (max - 1);
    let at = -1;
    let gap = Infinity;
    for (let i = 1; i < front.length - 1; i++) {
      if (chosen.has(i)) continue;
      const d = Math.abs(front[i].intelligence - target);
      if (d < gap) {
        gap = d;
        at = i;
      }
    }
    if (at >= 0) chosen.add(at);
  }
  return [...chosen].sort((a, b) => a - b).map((i) => front[i]);
}

/** n 档里的第 i 档用哪个档名（0 最低 … 4 最高）：两头总是最低、最高，中间按位置取 */
export function levelOf(i, n) {
  return n <= 1 ? MAX_STOPS - 1 : Math.round((i * (MAX_STOPS - 1)) / (n - 1));
}

/** 恢复默认时停在哪一档：居中，偶数档时偏便宜的那一档 */
export const defaultStop = (n) => Math.max(0, Math.floor((n - 1) / 2));

/** 当前模型是第几档；不在档上时 -1 */
export const stopIndex = (stops, current) => stops.findIndex((s) => sameModel(s.id, current));

/**
 * 当前模型不在档上时，它落在哪两档之间（按智能，小数）：方向键从这里往上或往下走到最近的一档。
 * 没有它的资料时 undefined。
 */
export function anchorOf(stops, point) {
  if (!point || !stops.length) return undefined;
  const v = point.intelligence;
  if (v <= stops[0].intelligence) return -0.5;
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1].intelligence;
    const b = stops[i].intelligence;
    if (v <= b) return i - 1 + (b === a ? 0.5 : Math.min(0.9, Math.max(0.1, (v - a) / (b - a))));
  }
  return stops.length - 0.5;
}

/** 一次算齐：候选、前沿、档位、当前模型在哪一档（-1 = 自定义）和它的位置 */
export function tiers(models, info, strategy, current) {
  const points = candidates(models, info, strategy);
  const stops = pickStops(paretoFrontier(points));
  const cur = current ? stopIndex(stops, current) : -1;
  const anchor = cur < 0 ? anchorOf(stops, points.find((p) => sameModel(p.id, current))) : undefined;
  return { points, stops, cur, anchor };
}
