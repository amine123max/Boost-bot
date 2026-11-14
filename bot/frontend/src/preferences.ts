import { reactive } from "vue";

const defaults = {
  text: "md",
  font: "system",
  width: "normal",
  motion: "full",
  codeWrap: "off",
};
const choices: Record<keyof typeof defaults, string[]> = {
  text: ["sm", "md", "lg", "xl"],
  font: ["system", "serif"],
  width: ["normal", "wide", "full"],
  motion: ["full", "reduce", "off"],
  codeWrap: ["on", "off"],
};
const storageKey = "boost.bot.preferences.v1";
function load() {
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(localStorage.getItem(storageKey) || "{}");
  } catch {
    /* Use explicit defaults. */
  }
  return Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [
      key,
      choices[key as keyof typeof defaults].includes(String(raw[key]))
        ? raw[key]
        : value,
    ]),
  ) as typeof defaults;
}
export const preferences = reactive(load());
export function applyPreferences() {
  for (const [key, value] of Object.entries(preferences))
    document.documentElement.dataset[key] = value;
}
addEventListener("storage", (event) => {
  if (event.key !== storageKey) return;
  Object.assign(preferences, load());
  applyPreferences();
});
export function savePreferences() {
  applyPreferences();
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences));
  } catch {
    /* Current view still applies. */
  }
}
