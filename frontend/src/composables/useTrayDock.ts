import { onBeforeUnmount, onMounted, ref } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { appClient } from "@/lib/api/app-client";
import { getAppErrorMessage } from "@/lib/api/transport";
import { isTauriRuntime } from "@/lib/api/transport-runtime";

export function useTrayDock() {
  const expanded = ref(false);
  const pinned = ref(false);
  const actionError = ref("");
  const busy = ref(false);
  let collapseTimer: ReturnType<typeof setTimeout> | undefined;
  let requested = false;
  let resizing: Promise<void> | undefined;
  let disposed = false;
  let hoverSuppressed = false;

  function cancelCollapse() {
    clearTimeout(collapseTimer);
  }
  function setExpanded(value: boolean): Promise<void> {
    cancelCollapse();
    requested = value;
    if (resizing) return resizing;
    resizing = (async () => {
      try {
        while (!disposed && expanded.value !== requested) {
          const next = requested;
          await appClient.setTrayPreviewExpanded(next);
          if (!disposed) expanded.value = next;
        }
      } catch (error) {
        actionError.value = getAppErrorMessage(error);
        requested = expanded.value;
      }
    })().finally(() => {
      resizing = undefined;
    });
    return resizing;
  }
  function enter() {
    cancelCollapse();
    if (hoverSuppressed) return;
    void setExpanded(true);
  }
  function leave() {
    hoverSuppressed = false;
    blur();
  }
  function blur() {
    cancelCollapse();
    if (!pinned.value)
      collapseTimer = setTimeout(() => void setExpanded(false), 240);
  }
  function togglePin() {
    pinned.value = !pinned.value;
    hoverSuppressed = !pinned.value;
    void setExpanded(pinned.value);
  }
  function collapse() {
    hoverSuppressed = true;
    pinned.value = false;
    return setExpanded(false);
  }
  function startDragging(event: PointerEvent) {
    if (!isTauriRuntime() || event.button !== 0) return;
    event.preventDefault();
    void getCurrentWindow()
      .startDragging()
      .catch((error) => (actionError.value = getAppErrorMessage(error)));
  }
  async function windowAction(action: () => Promise<unknown>) {
    if (busy.value) return;
    busy.value = true;
    actionError.value = "";
    try {
      await collapse();
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
    if (expanded.value) void collapse();
    else dismiss();
  }
  onMounted(() => {
    document.documentElement.classList.add("tray-preview-window");
    document.addEventListener("keydown", onKeydown);
  });
  onBeforeUnmount(() => {
    disposed = true;
    cancelCollapse();
    document.documentElement.classList.remove("tray-preview-window");
    document.removeEventListener("keydown", onKeydown);
  });
  return {
    expanded,
    pinned,
    actionError,
    busy,
    enter,
    leave,
    blur,
    togglePin,
    collapse,
    startDragging,
    dismiss,
    openMain,
  };
}
