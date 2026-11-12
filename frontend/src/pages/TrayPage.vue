<script setup lang="ts">
import { computed } from "vue";
import BoostIcon from "@/components/BoostIcon.vue";
import BotTaskProgress from "@/components/BotTaskProgress.vue";
import { useBotActivity } from "@/composables/useBotActivity";
import { useTelemetry, formatRate } from "@/composables/useTelemetry";
import { boost, currentAccount } from "@/composables/useBoost";
import { useTrayDock } from "@/composables/useTrayDock";
import { trayPreferences } from "@/composables/useTrayPreferences";
import { isTauriRuntime } from "@/lib/api/transport-runtime";

const { telemetry, error: telemetryError, upload, download } = useTelemetry();
const { activity, label: taskLabel } = useBotActivity();
const { actionError, edge, horizontal, openMain, startDragging } =
  useTrayDock();
const memory = computed(() => formatRate(telemetry.value?.memoryBytes));
const status = computed(() =>
  boost.loading
    ? "连接中"
    : !boost.connected
      ? "未连接"
      : telemetryError.value
        ? "状态不可用"
        : "服务在线",
);
const accountName = computed(() =>
  boost.connected
    ? currentAccount.value?.name || "自动选择账号"
    : "等待服务连接",
);
function percent(value: number | null | undefined) {
  return value == null || !Number.isFinite(value)
    ? null
    : Math.max(0, Math.min(100, Math.round(value)));
}
const primary = computed(() =>
  percent(
    currentAccount.value
      ? currentAccount.value.primaryRemainPercent
      : boost.quotaSummary?.primaryRemainPercent,
  ),
);
const tps = computed(() => activity.value.tokensPerSecond);
const tpsLabel = computed(() =>
  tps.value == null
    ? "—"
    : tps.value >= 1000
      ? `${(tps.value / 1000).toFixed(1)}k`
      : tps.value < 10
        ? tps.value.toFixed(1)
        : Math.round(tps.value).toString(),
);
const metrics = computed(() =>
  [
    {
      key: "upload",
      label: "上传",
      icon: "arrow-up",
      ...upload.value,
    },
    {
      key: "download",
      label: "下载",
      icon: "arrow-down",
      ...download.value,
    },
    {
      key: "memory",
      label: "内核占用",
      icon: "cpu",
      value: memory.value.value,
      unit: memory.value.unit.replace("/s", ""),
    },
  ]
    .filter(
      (metric) =>
        ({
          upload: trayPreferences.showUpload,
          download: trayPreferences.showDownload,
          memory: trayPreferences.showMemory,
        })[metric.key as "upload" | "download" | "memory"],
    )
    .map((metric) => ({
      ...metric,
      fullValue: metric.value,
      fullUnit: metric.unit,
      value:
        metric.value === "—"
          ? "—"
          : Number(metric.value) < 10
            ? Number(metric.value).toFixed(1)
            : Math.round(Number(metric.value)).toString(),
      unit: metric.unit
        .replace("KB", "K")
        .replace("MB", "M")
        .replace("GB", "G"),
    })),
);
</script>

<template>
  <main class="tray-page" aria-label="Boost 右侧悬浮条">
    <aside
      class="tray-rail"
      :class="[
        { 'is-draggable': isTauriRuntime(), 'is-horizontal': horizontal },
        `is-${edge}`,
      ]"
      aria-label="实时指标"
      tabindex="0"
      @pointerdown="startDragging"
      @dblclick="openMain"
      @keydown.enter="openMain"
    >
      <div
        v-if="isTauriRuntime()"
        class="tray-drag-handle"
        aria-hidden="true"
        title="按住拖动悬浮条，可放到屏幕顶部"
      />
      <div
        v-if="trayPreferences.showProgress"
        class="tray-logo"
        :title="taskLabel + ' · ' + accountName"
      >
        <BotTaskProgress
          :activity="activity"
          :label="taskLabel"
          compact
          :show-value="trayPreferences.showRingValues"
        />
        <span class="tray-sr-only" role="status">{{ status }}</span>
      </div>

      <div
        v-if="trayPreferences.showQuota"
        class="tray-quota-ring"
        role="img"
        :class="{
          low: primary != null && primary <= 10,
          unknown: primary == null,
        }"
        :aria-label="
          '5小时剩余额度 ' + (primary == null ? '暂无数据' : primary + '%')
        "
      >
        <span class="tray-ring">
          <svg viewBox="0 0 44 44" aria-hidden="true">
            <circle class="tray-ring-track" cx="22" cy="22" r="19" />
            <circle
              class="tray-ring-value"
              cx="22"
              cy="22"
              r="19"
              pathLength="100"
              stroke-dasharray="100"
              :stroke-dashoffset="100 - (primary ?? 0)"
            />
          </svg>
          <strong
            >{{
              !trayPreferences.showRingValues
                ? ""
                : primary == null
                  ? "—"
                  : primary
            }}<small v-if="trayPreferences.showRingValues && primary != null"
              >%</small
            ></strong
          >
        </span>
      </div>

      <div
        v-if="trayPreferences.showTps"
        class="tray-tps-ring"
        role="img"
        :aria-label="`TPS ${tps == null ? '暂无数据' : tps.toFixed(1) + ' t/s'}`"
        title="最近输出速率 · tokens/s"
        :class="{ 'has-rate': tps != null }"
      >
        <svg viewBox="0 0 32 32" aria-hidden="true">
          <circle class="tps-track" cx="16" cy="16" r="14" />
          <circle
            v-if="tps != null"
            class="tps-arc"
            cx="16"
            cy="16"
            r="14"
            pathLength="100"
            stroke-dasharray="24 76"
          />
        </svg>
        <span v-if="trayPreferences.showRingValues"
          ><strong>{{ tpsLabel }}</strong
          ><small>t/s</small></span
        >
        <BoostIcon v-else name="zap" :size="12" />
      </div>
      <div v-if="metrics.length" class="tray-rail-metrics">
        <div
          v-for="metric in metrics"
          :key="metric.key"
          class="tray-rail-metric"
          :class="'tray-metric-' + metric.key"
          :aria-label="
            metric.label + ' ' + metric.fullValue + ' ' + metric.fullUnit
          "
          :title="metric.label"
        >
          <span class="tray-rail-caption"
            ><BoostIcon :name="metric.icon" :size="9"
          /></span>
          <span class="tray-rail-reading"
            ><strong>{{ metric.value }}</strong
            ><span class="tray-rail-unit">{{ metric.unit }}</span></span
          >
        </div>
      </div>

      <p
        v-if="actionError"
        class="tray-rail-error"
        role="alert"
        :title="actionError"
      >
        操作失败
      </p>
    </aside>
  </main>
</template>

<style>
html.tray-preview-window,
.tray-preview-window body,
.tray-preview-window #app {
  min-width: 0;
  height: 100%;
  background: transparent;
}
.tray-preview-window body {
  padding: 0;
}
</style>

<style scoped src="../styles/tray-dock.css"></style>
