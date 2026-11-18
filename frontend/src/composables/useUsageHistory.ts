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
import { isManagementReadBusy } from "@/lib/api/transport-errors";
import { boost } from "./useBoost";

export function useUsageHistory(keysOnly: boolean) {
  const history = ref<UsageHistory | null>(null),
    loading = ref(false),
    error = ref("");
  let active = false;
  let attempts = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  async function reload() {
    if (!active || !boost.ready || loading.value) return;
    clearTimeout(retry);
    loading.value = true;
    try {
      history.value = await dashboardClient.getUsageHistory(keysOnly);
      error.value = "";
      attempts = 0;
    } catch (e) {
      if (isManagementReadBusy(e)) {
        if (active) retry = setTimeout(() => void reload(), Math.min(320 * 2 ** attempts++, 15_000));
      } else {
        attempts = 0;
        error.value = getAppErrorMessage(e);
      }
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
    clearTimeout(retry);
    attempts = 0;
  });
  onBeforeUnmount(() => {
    active = false;
    clearTimeout(retry);
    clearInterval(timer);
  });
  watch(
    () => [boost.ready, boost.refreshVersion],
    () => {
      if (active) void reload();
    },
  );
  return { history, loading, error, reload };
}
