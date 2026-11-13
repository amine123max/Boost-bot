import { reactive, watch } from "vue";
import {
  normalizeTrayPreferences,
  trayPreferenceKey,
  legacyTrayPreferenceKey,
  type TrayPreferences,
} from "@/lib/tray-preferences";
function read(): TrayPreferences {
  try {
    return normalizeTrayPreferences(
      JSON.parse(
        localStorage.getItem(trayPreferenceKey) ||
          localStorage.getItem(legacyTrayPreferenceKey) ||
          "{}",
      ),
    );
  } catch {
    return normalizeTrayPreferences(null);
  }
}
export const trayPreferences = reactive(read());
let applyingStorage = false;
watch(
  trayPreferences,
  (value) => {
    if (applyingStorage) return;
    try {
      const serialized = JSON.stringify(value);
      if (localStorage.getItem(trayPreferenceKey) !== serialized)
        localStorage.setItem(trayPreferenceKey, serialized);
    } catch {
      /* Keep the session preference. */
    }
  },
  { deep: true, flush: "sync" },
);
function sync(event: StorageEvent) {
  if (event.key !== trayPreferenceKey) return;
  applyingStorage = true;
  try {
    Object.assign(trayPreferences, read());
  } finally {
    applyingStorage = false;
  }
}
window.addEventListener("storage", sync);
if (import.meta.hot)
  import.meta.hot.dispose(() => window.removeEventListener("storage", sync));
