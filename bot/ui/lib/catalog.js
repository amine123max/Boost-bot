// 目录 Bot 在界面这边的状态：目录列表、用户看过哪些、「上新」分组折叠没折叠。
// 看过和折叠只是本机的显示偏好，存在 localStorage 里。
import { createStore } from "./store.js";

const SEEN = "amb-catalog-seen";
const FOLD = "amb-catalog-fold";
/** 侧边栏「上新」最多显示几个：新的顶掉旧的 */
export const LATEST_MAX = 3;

const read = (k, d) => {
  try {
    return JSON.parse(localStorage.getItem(k) || "null") ?? d;
  } catch {
    return d;
  }
};
const write = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* 隐私模式等存不了：只影响小圆点 */
  }
};

export const catalogSeen = createStore(read(SEEN, []));
export const catalogFold = createStore(read(FOLD, false));

export function markCatalogSeen(id) {
  catalogSeen.set((s) => {
    if (s.includes(id)) return s;
    const next = [...s, id].slice(-500);
    write(SEEN, next);
    return next;
  });
}
export function setCatalogFold(v) {
  catalogFold.set(() => v);
  write(FOLD, v);
}

/** 文案按语言取：缺了退回 en，再退回 zh-CN */
export const tr = (v, lang) => (v ? v[lang] ?? v.en ?? v["zh-CN"] : undefined);

/** 还没用过的最新几个 */
export const latestOf = (list) => (list || []).filter((e) => !e.instanceId).slice(0, LATEST_MAX);
