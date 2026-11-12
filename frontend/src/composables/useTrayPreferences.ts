import { reactive, watch } from "vue";
import {
  normalizeTrayPreferences,
  trayPreferenceKey,
  type TrayPreferences,
} from "@/lib/tray-preferences";
function read(): TrayPreferences {
  try {
    return normalizeTrayPreferences(
      JSON.parse(localStorage.getItem(trayPreferenceKey) || "{}"),
    );
  } catch {
    return normalizeTrayPreferences(null);
  }
}
export const trayPreferences = reactive(read());
watch(
  trayPreferences,
  (value) => {
    try {
      localStorage.setItem(trayPreferenceKey, JSON.stringify(value));
    } catch {
      /* Keep the session preference. */
    }
  },
  { deep: true, flush: "sync" },
);
function sync(event: StorageEvent) {
  if (event.key === trayPreferenceKey) Object.assign(trayPreferences, read());
}
window.addEventListener("storage", sync);
if (import.meta.hot)
  import.meta.hot.dispose(() => window.removeEventListener("storage", sync));
