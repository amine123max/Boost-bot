import { onBeforeUnmount, onMounted } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { isTauriRuntime } from "@/lib/api/transport";
import { boost } from "./useBoost";
import { notify } from "./useNotifications";
export function useMainWindowEvents() {
  let disposed = false;
  const stops: UnlistenFn[] = [];
  onMounted(async () => {
    if (!isTauriRuntime()) return;
    for (const [name, handler] of [
      ["main-window-close-action-changed", (value: string) => {
        if (boost.settings && (value === "exit" || value === "minimize")) boost.settings.mainWindowCloseAction = value;
      }],
      ["main-window-close-error", (value: string) => notify(value, true)],
    ] as const) {
      const stop = await listen<string>(name, event => handler(event.payload));
      if (disposed) stop(); else stops.push(stop);
    }
  });
  onBeforeUnmount(() => { disposed = true; stops.forEach(stop => stop()); });
}
