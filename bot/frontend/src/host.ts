import { ref } from "vue";
import { resolveThemeColor } from "../../../frontend/src/lib/theme-colors";
import {
  applyThemeWithTransition,
  type ThemeOrigin,
} from "../../../frontend/src/lib/theme-transition";
import {
  loadBotAppearance,
  normalizeBotAppearance,
} from "../../shared/appearance/preferences.js";

export const brandAppearance = ref(loadBotAppearance());
function applyAccent(value: unknown) {
  const accent = resolveThemeColor(value);
  document.documentElement.dataset.accent = accent;
  try { localStorage.setItem("boost.bot.accent.v1", accent); } catch { /* storage optional */ }
}
try { applyAccent(new URLSearchParams(location.search).get("boostAccent") || localStorage.getItem("boost.bot.accent.v1") || JSON.parse(localStorage.getItem("boost.ui.v1") || "{}").themeColor); }
catch { applyAccent(undefined); }
function savedTheme() {
  try {
    return (
      new URLSearchParams(location.search).get("boostTheme") ||
      localStorage.getItem("boost.theme.v1") ||
      "system"
    );
  } catch {
    return "system";
  }
}
export const theme = ref(savedTheme());
export const canShowDirectory = ref(false);
const directoryRequests = new Map<string, { resolve: () => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
export function showDirectory(path: string): Promise<void> {
  if (!canShowDirectory.value || parent === window) return Promise.reject(new Error('请在 Boost 桌面版中显示目录'));
  const id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { directoryRequests.delete(id); reject(new Error('显示目录超时，请重试')); }, 10000);
    directoryRequests.set(id, { resolve, reject, timer });
    post({ type: 'boost:directory:show', id, path });
  });
}
const media = matchMedia("(prefers-color-scheme: dark)");
function applyTheme() {
  document.documentElement.dataset.theme =
    theme.value === "system" ? (media.matches ? "dark" : "light") : theme.value;
}
export async function setTheme(
  value: string,
  fromHost = false,
  origin?: ThemeOrigin,
) {
  const next = ["light", "dark", "system"].includes(value) ? value : "system";
  if (next === theme.value) return;
  if (!fromHost && parent !== window) {
    post({ type: "boost:theme", mode: next, origin });
    return;
  }
  const apply = () => {
    theme.value = next;
    applyTheme();
    try {
      localStorage.setItem("boost.theme.v1", next);
    } catch {
      /* storage optional */
    }
  };
  // The parent already owns the full-window transition when it sends appearance.
  if (fromHost) apply();
  else await applyThemeWithTransition(next, apply, origin);
  if (!fromHost) post({ type: "boost:theme", mode: next });
}
function post(data: Record<string, unknown>) {
  if (parent !== window) parent.postMessage(data, "*");
}
export function back() {
  post({ type: "boost:bot:back" });
}
export async function ready() {
  await Promise.race([
    document.fonts.ready,
    new Promise((resolve) => setTimeout(resolve, 1500)),
  ]);
  requestAnimationFrame(() => {
    post({ type: "boost:bot:ready" });
    post({ type: "boost:workspace:content-ready" });
  });
}
window.addEventListener("message", (event) => {
  if (event.source === parent && event.data?.type === 'boost:directory:result') {
    const request = directoryRequests.get(event.data.id);
    if (!request) return;
    directoryRequests.delete(event.data.id); clearTimeout(request.timer);
    if (event.data.error) request.reject(new Error(String(event.data.error))); else request.resolve();
    return;
  }
  if (event.source !== parent || event.data?.type !== "boost:appearance")
    return;
  brandAppearance.value = normalizeBotAppearance(event.data.preferences);
  canShowDirectory.value = event.data.canShowDirectory === true;
  if (event.data.accent !== undefined) applyAccent(event.data.accent);
  if (["light", "dark", "system"].includes(event.data.theme))
    setTheme(event.data.theme, true);
});
media.addEventListener("change", applyTheme);
applyTheme();
