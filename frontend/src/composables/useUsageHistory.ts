import {
  onMounted,
  onActivated,
  onDeactivated,
  onBeforeUnmount,
  ref,
  watch,
} from "vue";
import type { UsageHistory } from "@/types";
import { dashboardClient } from "@/lib/api/dashboard-client";
import { getAppErrorMessage } from "@/lib/api/transport";
import { boost } from "./useBoost";

export function useUsageHistory(keysOnly: boolean) {
  const history = ref<UsageHistory | null>(null),
    loading = ref(false),
    error = ref("");
  let active = false;
  async function reload() {
    if (!boost.ready || loading.value) return;
    loading.value = true;
    try {
      history.value = await dashboardClient.getUsageHistory(keysOnly);
      error.value = "";
    } catch (e) {
      history.value = null;
      error.value = getAppErrorMessage(e);
    } finally {
      loading.value = false;
    }
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  onMounted(() => {
    active = true;
    void reload();
    timer = setInterval(() => {
      if (active && document.visibilityState === "visible") void reload();
    }, 60_000);
  });
  onActivated(() => {
    if (!active) {
      active = true;
      void reload();
    }
  });
  onDeactivated(() => {
    active = false;
  });
  onBeforeUnmount(() => clearInterval(timer));
  watch(
    () => boost.updatedAt,
    () => {
      if (active) void reload();
    },
  );
  return { history, loading, error, reload };
}
