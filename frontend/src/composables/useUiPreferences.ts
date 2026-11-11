import { reactive, watch } from "vue";
import { defaultThemeColor, resolveThemeColor } from "@/lib/theme-colors";
import {
  resolveTypographyPreferences,
  typographyDefaults,
  typographyVariables,
} from "@/lib/ui-typography";
export const uiDefaults = {
  themeColor: defaultThemeColor,
  ...typographyDefaults,
  typographyVersion: 3,
  showTrafficChart: true,
  showKernelUsage: true,
  pauseWhenHidden: true,
  compactSidebar: false,
  notificationPosition: "top-right" as "top-right" | "bottom-right",
  density: "compact" as "compact" | "comfortable",
};
function readPreferences() {
  try {
    const value = JSON.parse(localStorage.getItem("boost.ui.v1") || "{}");
    return {
      ...uiDefaults,
      themeColor: resolveThemeColor(value.themeColor),
      ...Object.fromEntries(
        Object.keys(uiDefaults)
          .filter(
            (k) =>
              typeof value[k] === "boolean" &&
              typeof uiDefaults[k as keyof typeof uiDefaults] === "boolean",
          )
          .map((k) => [k, value[k]]),
      ),
      notificationPosition:
        value.notificationPosition === "bottom-right"
          ? ("bottom-right" as const)
          : ("top-right" as const),
      density:
        value.density === "comfortable"
          ? ("comfortable" as const)
          : ("compact" as const),
      ...resolveTypographyPreferences(
        value.typographyVersion === 1 ||
        value.typographyVersion === 2 ||
        value.typographyVersion === 3
          ? value
          : {},
        value.typographyVersion,
      ),
    };
  } catch {
    return { ...uiDefaults };
  }
}
export const uiPreferences = reactive(readPreferences());
watch(
  uiPreferences,
  (value) => {
    for (const [key, setting] of Object.entries(typographyVariables(value)))
      document.documentElement.style.setProperty(key, setting);
    document.documentElement.dataset.density = value.density;
    document.documentElement.dataset.accent = resolveThemeColor(value.themeColor);
    document.documentElement.dataset.notifications = value.notificationPosition;
    try {
      localStorage.setItem("boost.ui.v1", JSON.stringify(value));
    } catch {
      /* Preferences still apply to the current session. */
    }
  },
  { immediate: true },
);
