import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import {
  telemetryClient,
  type ServiceTelemetry,
} from "@/lib/api/telemetry-client";
import { boost, isAdmin } from "./useBoost";
import { uiPreferences } from "./useUiPreferences";
export interface TrafficSample {
  at: number;
  upload: number;
  download: number;
}
const telemetry = ref<ServiceTelemetry | null>(null);
const error = ref("");
const history = ref<TrafficSample[]>([]);
let timer: ReturnType<typeof setTimeout> | undefined;
let subscribers = 0;
let polling = false;
async function poll() {
  if (polling) return;
  polling = true;
  try {
    if (
      boost.connected &&
      isAdmin.value &&
      (!uiPreferences.pauseWhenHidden || document.visibilityState === "visible")
    ) {
      const next = await telemetryClient.read();
      if (
        telemetry.value &&
        (telemetry.value.processId !== next.processId ||
          telemetry.value.address !== next.address)
      )
        history.value = [];
      telemetry.value = next;
      error.value = "";
      history.value = [
        ...history.value.filter((p) => p.at > Date.now() - 600000),
        {
          at: Date.now(),
          upload: next.uploadBytesPerSecond,
          download: next.downloadBytesPerSecond,
        },
      ].slice(-600);
    } else telemetry.value = null;
  } catch {
    telemetry.value = null;
    error.value = "内核状态暂不可用";
  } finally {
    polling = false;
    if (subscribers > 0) timer = setTimeout(poll, 1000);
  }
}
export function formatRate(bytes: number | null | undefined) {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0)
    return { value: "—", unit: "B/s" };
  const units = ["B/s", "KB/s", "MB/s", "GB/s"];
  let n = bytes;
  let index = 0;
  while (n >= 1024 && index < units.length - 1) {
    n /= 1024;
    index++;
  }
  return { value: n.toFixed(2), unit: units[index] };
}
export function formatBytes(bytes: number | null | undefined) {
  const rate = formatRate(bytes);
  return `${rate.value} ${rate.unit.replace("/s", "")}`;
}
export function useTelemetry() {
  onMounted(() => {
    subscribers++;
    if (subscribers === 1) void poll();
  });
  onBeforeUnmount(() => {
    subscribers--;
    if (!subscribers) clearTimeout(timer);
  });
  return {
    telemetry,
    error,
    history,
    upload: computed(() => formatRate(telemetry.value?.uploadBytesPerSecond)),
    download: computed(() =>
      formatRate(telemetry.value?.downloadBytesPerSecond),
    ),
  };
}
