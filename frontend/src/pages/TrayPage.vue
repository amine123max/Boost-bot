<script setup lang="ts">
import { computed } from "vue";
import BoostIcon from "@/components/BoostIcon.vue";
import BotTaskProgress from "@/components/BotTaskProgress.vue";
import { useBotActivity } from "@/composables/useBotActivity";
import { useTelemetry, formatRate } from "@/composables/useTelemetry";
import { boost, currentAccount } from "@/composables/useBoost";
import { useTrayDock } from "@/composables/useTrayDock";
import { isTauriRuntime } from "@/lib/api/transport-runtime";

const { telemetry, error: telemetryError, upload, download } = useTelemetry();
const { activity, label: taskLabel } = useBotActivity();
const {
  expanded,
  pinned,
  actionError,
  busy,
  enter,
  leave,
  blur,
  togglePin,
  collapse,
  dismiss,
  openMain,
  startDragging,
} = useTrayDock();
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
const planLabel = computed(() => {
  const plan = currentAccount.value?.planType?.trim();
  return plan && plan.toLowerCase() !== "unknown" ? plan : "";
});
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
const secondary = computed(() =>
  percent(
    currentAccount.value
      ? currentAccount.value.secondaryRemainPercent
      : boost.quotaSummary?.secondaryRemainPercent,
  ),
);
const quotas = computed(() => [
  { label: "5小时内", title: "5 小时额度", value: primary.value },
  { label: "7天内", title: "7 天额度", value: secondary.value },
]);
const metrics = computed(() => [
  {
    key: "upload",
    label: "上传",
    caption: "上行",
    icon: "arrow-up",
    ...upload.value,
  },
  {
    key: "download",
    label: "下载",
    caption: "下行",
    icon: "arrow-down",
    ...download.value,
  },
  {
    key: "memory",
    label: "内核占用",
    caption: "内存",
    icon: "cpu",
    value: memory.value.value,
    unit: memory.value.unit.replace("/s", ""),
  },
]);
function focusOut(event: FocusEvent) {
  if (
    !(event.relatedTarget instanceof Node) ||
    !(event.currentTarget as HTMLElement).contains(event.relatedTarget)
  )
    blur();
}
</script>

<template>
  <main
    class="tray-page"
    :class="{ 'is-expanded': expanded }"
    aria-label="Boost 右侧悬浮条"
    @pointerenter="enter"
    @pointerleave="leave"
    @focusin="enter"
    @focusout="focusOut"
  >
    <section
      v-if="expanded"
      id="tray-details"
      class="tray-details"
      aria-label="监控详情"
    >
      <header class="tray-header">
        <span
          class="tray-panel-brand"
          :class="{ 'is-draggable': isTauriRuntime() }"
          @pointerdown="startDragging"
        >
          <img
            src="/boost-assets/images/favicon.png"
            alt=""
            width="19"
            height="19"
          />
          <span class="brand-word">Boost</span>
        </span>
        <div class="tray-panel-actions">
          <button
            class="tray-pin tray-action"
            :class="{ active: pinned }"
            :aria-label="pinned ? '取消固定详情' : '固定详情'"
            :title="pinned ? '取消固定详情' : '固定详情'"
            :aria-pressed="pinned"
            @click="togglePin"
          >
            <BoostIcon name="pin" :size="14" />
          </button>
          <button
            class="tray-close tray-action"
            aria-label="收起详情"
            title="收起详情 · Esc"
            @click="collapse"
          >
            <BoostIcon name="chevron-right" :size="16" />
          </button>
        </div>
      </header>

      <div class="tray-account-card">
        <div class="tray-account-heading">
          <p class="tray-status">
            <span
              class="status-dot"
              :class="{ online: boost.connected && !telemetryError }"
            />
            {{
              activity.state !== "idle" && activity.state !== "unavailable"
                ? taskLabel
                : status
            }}
          </p>
          <span v-if="planLabel" class="tray-plan" :title="planLabel">{{
            planLabel
          }}</span>
        </div>
        <p class="tray-account" :title="accountName">{{ accountName }}</p>
      </div>

      <div class="tray-quotas" aria-label="账号剩余额度">
        <div
          v-for="quota in quotas"
          :key="quota.label"
          class="tray-quota"
          :class="{
            low: quota.value != null && quota.value <= 10,
            unknown: quota.value == null,
          }"
        >
          <div class="tray-quota-caption">
            <span>{{ quota.title }}</span>
            <strong
              >{{ quota.value == null ? "—" : quota.value
              }}<small v-if="quota.value != null">%</small></strong
            >
          </div>
          <div
            class="tray-quota-track"
            role="progressbar"
            :aria-label="quota.label + '剩余额度'"
            :aria-valuenow="quota.value ?? undefined"
            :aria-valuetext="
              quota.value == null ? '暂无额度数据' : quota.value + '%'
            "
            :aria-valuemin="0"
            :aria-valuemax="100"
          >
            <span :style="{ width: (quota.value ?? 0) + '%' }" />
          </div>
        </div>
      </div>

      <dl class="tray-metrics" aria-label="实时内核状态">
        <div
          v-for="metric in metrics"
          :key="metric.key"
          :class="'tray-metric-' + metric.key"
        >
          <dt>
            <span class="tray-metric-icon"
              ><BoostIcon :name="metric.icon" :size="13" /></span
            >{{ metric.label }}
          </dt>
          <dd>
            {{ metric.value }}<span>{{ metric.unit }}</span>
          </dd>
        </div>
      </dl>

      <p v-if="actionError" class="tray-error" role="alert">
        {{ actionError }}
      </p>
      <button class="tray-open" :disabled="busy" @click="openMain">
        <span>打开 Boost</span><BoostIcon name="arrow-up-right" :size="14" />
      </button>
    </section>

    <aside class="tray-rail" aria-label="实时指标">
      <div
        v-if="isTauriRuntime()"
        class="tray-drag-handle"
        aria-hidden="true"
        title="按住拖动悬浮条，可放到屏幕顶部"
        @pointerdown.prevent.stop="startDragging"
      />
      <button
        class="tray-logo"
        aria-label="固定或收起监控详情"
        aria-controls="tray-details"
        :aria-expanded="expanded"
        :aria-pressed="pinned"
        :title="taskLabel + ' · ' + accountName"
        @click="togglePin"
      >
        <BotTaskProgress
          :activity="activity"
          :label="taskLabel"
          :active="expanded"
        />
        <span class="tray-sr-only" role="status">{{ status }}</span>
      </button>

      <button
        class="tray-quota-ring"
        :class="{
          low: primary != null && primary <= 10,
          unknown: primary == null,
        }"
        :aria-label="
          '5小时剩余额度 ' + (primary == null ? '暂无数据' : primary + '%')
        "
        :aria-expanded="expanded"
        @click="togglePin"
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
            >{{ primary == null ? "—" : primary
            }}<small v-if="primary != null">%</small></strong
          >
        </span>
        <span class="tray-ring-label">5h 余量</span>
      </button>

      <div class="tray-rail-metrics">
        <button
          v-for="metric in metrics"
          :key="metric.key"
          class="tray-rail-metric"
          :class="'tray-metric-' + metric.key"
          :aria-label="metric.label + ' ' + metric.value + ' ' + metric.unit"
          :aria-expanded="expanded"
          :title="metric.label"
          @click="togglePin"
        >
          <span class="tray-rail-caption"
            ><BoostIcon :name="metric.icon" :size="11" /><span>{{
              metric.caption
            }}</span></span
          >
          <strong>{{ metric.value }}</strong>
          <span class="tray-rail-unit">{{ metric.unit }}</span>
        </button>
      </div>

      <p
        v-if="actionError && !expanded"
        class="tray-rail-error"
        role="alert"
        :title="actionError"
      >
        操作失败
      </p>
      <div class="tray-rail-actions">
        <button
          class="tray-action"
          aria-label="打开 Boost"
          title="打开 Boost"
          :disabled="busy"
          @click="openMain"
        >
          <BoostIcon name="arrow-up-right" :size="15" />
        </button>
        <button
          class="tray-action"
          aria-label="隐藏悬浮条"
          title="隐藏悬浮条"
          :disabled="busy"
          @click="dismiss"
        >
          <BoostIcon name="x" :size="12" />
        </button>
      </div>
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
  padding: 8px;
}
</style>

<style scoped src="../styles/tray-dock.css"></style>
