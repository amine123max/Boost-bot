import {
  onBeforeUnmount,
  onMounted,
  ref,
  computed,
  watch,
  type Ref,
} from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { trayPreferences } from "./useTrayPreferences";
import { trayLayoutSize } from "@/lib/tray-layout";
import { appClient } from "@/lib/api/app-client";
import { getAppErrorMessage } from "@/lib/api/transport";
import { isTauriRuntime } from "@/lib/api/transport-runtime";

export function useTrayDock(editing: Ref<boolean>) {
  const actionError = ref("");
  const edge = ref("floating");
  const horizontal = ref(trayPreferences.orientation === "horizontal");
  const layout = computed(() =>
    editing.value
      ? {
          horizontalWidth: 392,
          horizontalHeight: 312,
          verticalWidth: 392,
          verticalHeight: 312,
          orientation: "horizontal" as const,
          snap: false,
        }
      : {
          ...trayLayoutSize(trayPreferences),
          orientation: trayPreferences.orientation,
          snap: trayPreferences.snapToEdges,
        },
  );

  let syncing = false,
    queued = false,
    disposed = false,
    dragging = false;
  let restorePosition = trayPreferences.position;
  let layoutTimer: ReturnType<typeof setTimeout> | undefined;
  let stopMoved: (() => void) | undefined;
  async function syncLayout() {
    if (!isTauriRuntime() || dragging || disposed) return;
    if (syncing) {
      queued = true;
      return;
    }
    syncing = true;
    try {
      const next = await appClient.syncTrayLayout(0, 0, {
        ...layout.value,
        position: restorePosition,
      });
      restorePosition = null;
      if (!disposed) {
        edge.value = next.edge;
        horizontal.value = next.horizontal;
        if (
          !editing.value &&
          trayPreferences.dockHorizontal !== next.horizontal
        )
          trayPreferences.dockHorizontal = next.horizontal;
        if (
          !editing.value &&
          Number.isFinite(next.x) &&
          Number.isFinite(next.y)
        )
          trayPreferences.position = { x: next.x, y: next.y };
      }
    } catch (error) {
      actionError.value = getAppErrorMessage(error);
    } finally {
      syncing = false;
      if (queued) {
        queued = false;
        void syncLayout();
      }
    }
  }
  watch(layout, () => {
    if (!isTauriRuntime())
      horizontal.value = layout.value.orientation !== "vertical";
    if (!editing.value) restorePosition = trayPreferences.position;
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => void syncLayout(), 50);
  });
  let origin: { x: number; y: number } | undefined;
  function stopPointer() {
    origin = undefined;
    document.removeEventListener("pointermove", move);
    document.removeEventListener("pointerup", stopPointer);
    document.removeEventListener("pointercancel", stopPointer);
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
    if (
      !isTauriRuntime() ||
      event.button !== 0 ||
      event.pointerType === "touch"
    )
      return;
    if (
      (event.target as Element).closest(
        "button,a,input,select,.tray-editor,[data-carousel-swipe]",
      )
    )
      return;
    origin = { x: event.screenX, y: event.screenY };
    actionError.value = "";
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", stopPointer, { once: true });
    document.addEventListener("pointercancel", stopPointer, { once: true });
  }
  async function openMain() {
    try {
      await appClient.showMainWindow();
    } catch (error) {
      actionError.value = getAppErrorMessage(error);
    }
  }
  function onKeydown(event: KeyboardEvent) {
    if (event.key !== "Escape") return;
    if (editing.value) editing.value = false;
    else if (isTauriRuntime())
      void appClient.hideTrayPreview().catch((error) => {
        actionError.value = getAppErrorMessage(error);
      });
  }
  onMounted(async () => {
    document.documentElement.classList.add("tray-preview-window");
    document.addEventListener("keydown", onKeydown);
    if (!isTauriRuntime()) return;
    try {
      const stop = await getCurrentWindow().onMoved(() => {
        clearTimeout(layoutTimer);
        layoutTimer = setTimeout(() => void syncLayout(), 160);
      });
      if (disposed) stop();
      else {
        stopMoved = stop;
        await syncLayout();
      }
    } catch (error) {
      actionError.value = getAppErrorMessage(error);
    }
  });
  onBeforeUnmount(() => {
    disposed = true;
    stopMoved?.();
    clearTimeout(layoutTimer);
    stopPointer();
    document.documentElement.classList.remove("tray-preview-window");
    document.removeEventListener("keydown", onKeydown);
  });
  return { actionError, edge, horizontal, openMain, startDragging };
}
