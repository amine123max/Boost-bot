// 动效的 JS 一侧：读取 CSS 时长 token、尊重"减少 / 关闭动画"、让退场动画播完再卸载。
// 时长只在 tokens/motion.css 里定义一次，JS 用 ms("--dur-base") 读，不要再写死毫秒数。
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";

const mq = window.matchMedia("(prefers-reduced-motion: reduce)");

/** 减少或关闭了动画：<html data-motion>（lib/prefs.js 解析设置 › 外观 › 动画）不是 full；没有这个属性时看系统 */
export const reducedMotion = () => {
  const m = document.documentElement.dataset.motion;
  return m ? m !== "full" : mq.matches;
};

/** "--dur-base" → 180；token 不存在或不是时长时返回 fallback */
export function ms(token, fallback = 0) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return fallback;
  return v.endsWith("ms") ? n : v.endsWith("s") ? n * 1000 : fallback;
}

/**
 * 进出场：open 变 false 后再保留挂载 exit 时长，期间 leaving = true（给元素加 .leaving 或 .anim-*-out）。
 *   const { mounted, leaving } = usePresence(open);
 *   if (!mounted) return null;
 */
export function usePresence(open, exit = "--dur-base") {
  const [state, setState] = useState(open ? "open" : "closed");
  useEffect(() => {
    if (open) return setState("open");
    if (state === "closed") return;
    setState("leaving");
    const t = setTimeout(() => setState("closed"), ms(exit, 180));
    return () => clearTimeout(t);
  }, [open]);
  return { mounted: open || state !== "closed", leaving: !open && state !== "closed" };
}

/**
 * 列表里的行增删：新出现的行 state 是 "enter"（at 是它出现的时刻），被删的行留在原位 state 是 "leave"，淡出 exit 时长后才真的消失。
 * 第一次拿到列表不算新增。传完整的列表，不要传搜索过滤后的，否则搜索也会算成增删。
 *   const rows = useListPresence(bots); // [{ item, state, at }]
 */
export function useListPresence(items, exit = "--dur-base") {
  const prev = useRef(null);
  const timers = useRef(new Set());
  const [fx, setFx] = useState({ enter: {}, leave: [] });
  useLayoutEffect(() => {
    const before = prev.current;
    if (items) prev.current = items;
    if (!before || !items) return;
    const now = new Set(items.map((x) => x.id));
    const had = new Set(before.map((x) => x.id));
    const entered = items.filter((x) => !had.has(x.id)).map((x) => x.id);
    const left = before.flatMap((item, index) => (now.has(item.id) ? [] : [{ item, index }]));
    if (!entered.length && !left.length) return;
    const at = Date.now();
    setFx((f) => ({ enter: { ...f.enter, ...Object.fromEntries(entered.map((id) => [id, at])) }, leave: [...f.leave, ...left] }));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setFx((f) => ({ enter: Object.fromEntries(Object.entries(f.enter).filter(([id]) => !entered.includes(id))), leave: f.leave.filter((l) => !left.includes(l)) }));
    }, ms(exit, 180));
    timers.current.add(timer);
  }, [items]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const rows = (items || []).map((item) => ({ item, state: fx.enter[item.id] ? "enter" : "", at: fx.enter[item.id] }));
  for (const { item, index } of fx.leave) if (!rows.some((r) => r.item.id === item.id)) rows.splice(Math.min(index, rows.length), 0, { item, state: "leave" });
  return rows;
}
