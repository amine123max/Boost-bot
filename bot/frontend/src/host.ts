import { ref } from "vue";
import {
  applyThemeWithTransition,
  type ThemeOrigin,
} from "../../../frontend/src/lib/theme-transition";
import {
  loadBotAppearance,
  normalizeBotAppearance,
} from "../../shared/appearance/preferences.js";

export const brandAppearance = ref(loadBotAppearance());
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
  if (event.source !== parent || event.data?.type !== "boost:appearance")
    return;
  brandAppearance.value = normalizeBotAppearance(event.data.preferences);
  if (["light", "dark", "system"].includes(event.data.theme))
    setTheme(event.data.theme, true);
});
media.addEventListener("change", applyTheme);
applyTheme();
