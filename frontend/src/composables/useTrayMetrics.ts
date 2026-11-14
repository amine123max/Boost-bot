import { computed, ref, watch } from "vue";
import { useBotActivity } from "./useBotActivity";
import { useTelemetry, formatRate } from "./useTelemetry";
import { currentAccount, boost } from "./useBoost";
import type { TrayItemKey } from "@/lib/tray-preferences";

export interface TrayMetric {
  value: string;
  unit: string;
  percent: number | null;
  history: number[];
  note: string;
}
export function useTrayMetrics() {
  const { activity, label } = useBotActivity();
  const { telemetry, history } = useTelemetry();
  const tpsHistory = ref<number[]>([]);
  const memoryHistory = ref<number[]>([]);
  watch(telemetry, (value) => {
    if (value?.memoryBytes != null)
      memoryHistory.value = [
        ...memoryHistory.value.slice(-23),
        value.memoryBytes,
      ];
    else memoryHistory.value = [];
  });
  watch(activity, (value) => {
    // Draw only reported token samples, never infer tokens from text length.
    if (value.tokensPerSecond != null)
      tpsHistory.value = [
        ...tpsHistory.value.slice(-23),
        value.tokensPerSecond,
      ];
    else tpsHistory.value = [];
  });
  const quota = computed(
    () =>
      currentAccount.value?.primaryRemainPercent ??
      boost.quotaSummary?.primaryRemainPercent ??
      null,
  );
  const metrics = computed<Record<TrayItemKey, TrayMetric>>(() => {
    const percent =
      quota.value == null
        ? null
        : Math.round(Math.max(0, Math.min(100, quota.value)));
    const tps = activity.value.tokensPerSecond;
    const rate = (
      value: number | null | undefined,
      samples: number[],
      note: string,
    ): TrayMetric => {
      const formatted = formatRate(value);
      return { ...formatted, percent: null, history: samples, note };
    };
    return {
      progress: {
        value:
          activity.value.percent == null ? "—" : String(activity.value.percent),
        unit: "%",
        percent: activity.value.percent,
        history: [],
        note: label.value,
      },
      quota: {
        value: percent == null ? "—" : String(percent),
        unit: "%",
        percent,
        history: [],
        note: "5 小时剩余额度",
      },
      tps: {
        value:
          tps == null
            ? ['idle','waiting'].includes(activity.value.state) ? '0' : "—"
            : tps < 10
              ? tps.toFixed(1)
              : tps >= 1000
                ? `${(tps / 1000).toFixed(1)}k`
                : String(Math.round(tps)),
        unit: "TPS",
        percent: tps == null ? null : Math.min(100, (tps / 40) * 100),
        history: tpsHistory.value,
        note: tps == null ? activity.value.state === 'idle' ? '当前没有模型输出' : '本轮尚未收到输出 Token 用量' : activity.value.rateKind === 'gateway' ? '最近网关请求的输出 Token ÷ 请求用时' : activity.value.rateStale ? '最近请求的输出均速，等待新用量上报' : activity.value.rateKind === 'stream' ? '实时输出 Token / 秒' : '输出 Token ÷ 采样区间用时',
      },
      upload: rate(
        telemetry.value?.uploadBytesPerSecond,
        history.value.slice(-24).map((p) => p.upload),
        "实时上传",
      ),
      download: rate(
        telemetry.value?.downloadBytesPerSecond,
        history.value.slice(-24).map((p) => p.download),
        "实时下载",
      ),
      memory: {
        ...rate(
          telemetry.value?.memoryBytes,
          memoryHistory.value,
          "Boost 服务进程内存",
        ),
        unit: formatRate(telemetry.value?.memoryBytes).unit.replace("/s", ""),
      },
    };
  });
  return { activity, label, metrics };
}
