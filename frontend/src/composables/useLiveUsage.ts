import { onBeforeUnmount, watch } from "vue";
import { boost, perform, refreshAccounts } from "./useBoost";
import { listenUsageRefreshCompleted } from "@/lib/api/usage-refresh-events";
export function useLiveUsage() {
  let stop: (() => void) | undefined;
  let closed = false;
  let refreshing = false;
  const update = async () => {
    if (!boost.ready || document.visibilityState !== "visible" || refreshing)
      return;
    refreshing = true;
    try {
      await perform(refreshAccounts);
    } finally {
      refreshing = false;
    }
  };
  const unwatch = watch(
    () => boost.ready,
    async (ready) => {
      if (!ready || stop) return;
      const dispose = await listenUsageRefreshCompleted(() => void update());
      if (closed) dispose();
      else stop = dispose;
    },
    { immediate: true },
  );
  document.addEventListener("visibilitychange", update);
  onBeforeUnmount(() => {
    closed = true;
    stop?.();
    unwatch();
    document.removeEventListener("visibilitychange", update);
  });
}
