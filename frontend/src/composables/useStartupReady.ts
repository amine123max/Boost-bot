import { nextTick, onBeforeUnmount, ref, watch } from "vue";
import { boost } from "./useBoost";

export const startupContentReady = ref(false);
export function markStartupContentReady() {
  startupContentReady.value = true;
}

/** Keep the initial ring over the final layout until data, route and local fonts have settled. */
export function useStartupReady(isContentReady: () => boolean = () => boost.ready) {
  const visible = ref(false);
  let disposed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const stop = watch(isContentReady, async ready => {
    if (!ready || visible.value) return;
    await nextTick();
    await Promise.race([document.fonts.ready, new Promise<void>(resolve => { timer = setTimeout(resolve, 1500); })]);
    clearTimeout(timer);
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (!disposed) visible.value = true;
  }, { immediate: true });
  onBeforeUnmount(() => { disposed = true; clearTimeout(timer); stop(); });
  return visible;
}
