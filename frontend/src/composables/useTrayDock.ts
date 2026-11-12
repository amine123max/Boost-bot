import { onBeforeUnmount, onMounted, ref, computed, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { trayPreferences } from "./useTrayPreferences";
import { appClient } from "@/lib/api/app-client";
import { getAppErrorMessage } from "@/lib/api/transport";
import { isTauriRuntime } from "@/lib/api/transport-runtime";

export function useTrayDock() {
  const actionError = ref("");
  const busy = ref(false);
  const edge = ref("floating");
  const horizontal = ref(false);
  const rings = computed(
    () =>
      [
        trayPreferences.showProgress,
        trayPreferences.showQuota,
        trayPreferences.showTps,
      ].filter(Boolean).length,
  );
  const metrics = computed(
    () =>
      [
        trayPreferences.showUpload,
        trayPreferences.showDownload,
        trayPreferences.showMemory,
      ].filter(Boolean).length,
  );
  let syncing = false;
  let syncQueued = false;
  async function syncLayout() {
    if (!isTauriRuntime() || dragging || disposed) return;
    if (syncing) {
      syncQueued = true;
      return;
    }
    syncing = true;
    try {
      const next = await appClient.syncTrayLayout(rings.value, metrics.value);
      if (!disposed && next?.edge) {
        edge.value = next.edge;
        horizontal.value = next.horizontal;
      }
    } catch (error) {
      actionError.value = getAppErrorMessage(error);
    } finally {
      syncing = false;
      if (syncQueued) {
        syncQueued = false;
        void syncLayout();
      }
    }
  }
  const stopPreferences = watch([rings, metrics], () => {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => void syncLayout(), 50);
  });
  let stopMoved: (() => void) | undefined;
  let disposed = false;
  let layoutTimer: ReturnType<typeof setTimeout> | undefined;
  let dragging = false;
  let origin: { x: number; y: number } | undefined;
  function stopPointer() {
    origin = undefined;
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", stopPointer);
  }
  function move(event: PointerEvent) {
    if (
      !origin ||
      dragging ||
      Math.hypot(event.screenX - origin.x, event.screenY - origin.y) < 4
    )
      return;
    stopPointer();
    dragging = true;
    void getCurrentWindow()
      .startDragging()
      .catch((error) => {
        actionError.value = getAppErrorMessage(error);
      })
      .finally(() => {
        dragging = false;
        void syncLayout();
      });
  }
  function startDragging(event: PointerEvent) {
    if (!isTauriRuntime() || event.button !== 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest("button, a, input")
    )
      return;
    origin = { x: event.screenX, y: event.screenY };
    actionError.value = "";
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stopPointer, { once: true });
  }

  async function windowAction(action: () => Promise<unknown>) {
    if (busy.value) return;
    busy.value = true;
    actionError.value = "";
    try {
      await action();
    } catch (error) {
      actionError.value = getAppErrorMessage(error);
    } finally {
      busy.value = false;
    }
  }
  function dismiss() {
    void windowAction(() => appClient.hideTrayPreview());
  }
  function openMain() {
    void windowAction(() => appClient.showMainWindow());
  }
  function onKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    dismiss();
  }
  onMounted(async () => {
    if (isTauriRuntime()) {
      const stop = await getCurrentWindow().onMoved(() => {
        clearTimeout(layoutTimer);
        layoutTimer = setTimeout(() => void syncLayout(), 120);
      });
      if (disposed) stop();
      else {
        stopMoved = stop;
        await syncLayout();
      }
    }
    document.documentElement.classList.add("tray-preview-window");
    document.addEventListener("keydown", onKeydown);
  });
  onBeforeUnmount(() => {
    disposed = true;
    stopPreferences();
    stopMoved?.();
    clearTimeout(layoutTimer);
    stopPointer();
    document.documentElement.classList.remove("tray-preview-window");
    document.removeEventListener("keydown", onKeydown);
  });
  return {
    actionError,
    edge,
    horizontal,
    busy,
    startDragging,
    dismiss,
    openMain,
  };
}
