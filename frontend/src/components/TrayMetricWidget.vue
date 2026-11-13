<script setup lang="ts">
import { computed } from "vue";
import BoostIcon from "./BoostIcon.vue";
import BotTaskProgress from "./BotTaskProgress.vue";
import { trayItems, type TrayWidget } from "@/lib/tray-preferences";
import type { TrayMetric } from "@/composables/useTrayMetrics";
import type { BotActivity } from "@/lib/bot-activity";
const props = defineProps<{
  widget: TrayWidget;
  metric: TrayMetric;
  activity: BotActivity;
  showValues: boolean;
  card?: boolean;
  avatar?: boolean;
}>();
const item = computed(() =>
  trayItems.find((item) => item.key === props.widget.kind)!,
);
const color = computed(() =>
  props.widget.kind === "tps" && props.metric.percent != null
    ? `hsl(${props.metric.percent * 1.2} 67% 48%)`
    : undefined,
);
const points = computed(() => {
  const values = props.metric.history;
  const max = Math.max(1, ...values);
  return values
    .map(
      (v, i) =>
        `${(i * 100) / Math.max(1, values.length - 1)},${28 - (24 * v) / max}`,
    )
    .join(" ");
});
</script>
<template>
  <div
    class="tray-widget"
    :class="[
      { 'as-card': card, 'as-value': widget.display === 'value' },
      `widget-${widget.kind}`,
    ]"
    :style="{ '--widget-color': color }"
    :aria-label="`${item.label}：${metric.value} ${metric.unit}，${metric.note}`"
    :title="metric.note"
  >
    <div class="widget-visual">
      <BotTaskProgress
        v-if="widget.kind === 'progress' && widget.display === 'ring'"
        :activity="activity"
        :label="metric.note"
        compact
        :show-value="showValues && !avatar"
      />
      <span
        v-else-if="widget.kind === 'tps' || widget.display === 'ring'"
        class="widget-ring"
        :class="{
          'is-live':
            widget.kind === 'tps' &&
            metric.percent != null &&
            activity.state === 'working',
        }"
      >
        <svg viewBox="0 0 44 44" aria-hidden="true">
          <circle class="ring-track" cx="22" cy="22" r="19" />
          <circle
            v-if="metric.percent != null"
            class="ring-fill"
            cx="22"
            cy="22"
            r="19"
            pathLength="100"
            stroke-dasharray="100"
            :stroke-dashoffset="100 - metric.percent"
          />
        </svg>
        <span v-if="showValues" class="ring-label"
          ><strong>{{ metric.value }}</strong
          ><small>{{ metric.unit }}</small></span
        >
        <BoostIcon v-else :name="item.icon" :size="14" />
      </span>
      <span v-else class="widget-value"
        ><BoostIcon :name="item.icon" :size="card ? 16 : 10" /><strong>{{
          metric.value
        }}</strong
        ><small>{{ metric.unit }}</small></span
      >
    </div>
    <div v-if="card" class="widget-detail">
      <span class="widget-name">{{ item.label }}</span
      ><span class="widget-note">{{ metric.note }}</span>
    </div>
    <svg
      v-if="card && widget.display === 'card' && points"
      class="widget-chart"
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <polyline
        :points="points"
        fill="none"
        stroke="currentColor"
        stroke-width="1.6"
        vector-effect="non-scaling-stroke"
      />
    </svg>
  </div>
</template>
<style scoped>
.tray-widget {
  --widget-color: var(--blue);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-width: 0;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}
.widget-upload {
  --widget-color: #efa83b;
}
.widget-download {
  --widget-color: #428fed;
}
.widget-memory {
  --widget-color: #a78bda;
}
.widget-visual {
  display: grid;
  place-items: center;
  flex-shrink: 0;
  min-width: 0;
}
.widget-ring {
  position: relative;
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
}
.widget-ring svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  fill: none;
  stroke-width: 2.5;
  transform: rotate(-90deg);
}
.ring-track {
  stroke: var(--border);
}
.widget-tps .ring-track {
  stroke: color-mix(in srgb, var(--muted) 45%, var(--sidebar));
}
.ring-fill {
  stroke: var(--widget-color);
  stroke-linecap: round;
  transition:
    stroke-dashoffset 0.25s,
    stroke 0.4s;
}
.ring-label {
  display: grid;
  gap: 1px;
  text-align: center;
  line-height: 1;
}
.ring-label strong {
  font-size: 9px;
  font-weight: 600;
}
.ring-label small {
  font-size: 6px;
  color: var(--muted);
}
.widget-ring.is-live .ring-fill {
  stroke-dasharray: 72 28;
  animation: tps-live 2s linear infinite;
  transform-origin: 22px 22px;
}
.widget-value {
  display: flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
  color: var(--widget-color);
}
.widget-value strong {
  font-size: 10px;
  font-weight: 600;
}
.widget-value small {
  font-size: 7px;
  color: var(--muted);
}
.as-card {
  position: relative;
  justify-content: flex-start;
  min-height: 82px;
  padding: 12px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 13px;
  overflow: hidden;
}
.as-card .widget-ring {
  width: 44px;
  height: 44px;
}
.as-card .ring-label strong {
  font-size: 13px;
}
.as-card .ring-label small {
  font-size: 8px;
}
.as-card .widget-value {
  flex-wrap: wrap;
  gap: 4px;
}
.as-card .widget-value strong {
  font-size: 17px;
}
.as-card .widget-value small {
  font-size: 9px;
}
.widget-detail {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.widget-name {
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
}
.widget-note {
  font-size: 9px;
  color: var(--muted);
  line-height: 1.4;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.widget-chart {
  position: absolute;
  inset: auto 8px 3px;
  width: calc(100% - 16px);
  height: 19px;
  opacity: 0.25;
  color: var(--widget-color);
  pointer-events: none;
}
@keyframes tps-live {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .widget-ring.is-live .ring-fill {
    animation: none;
  }
  .ring-fill {
    transition: none;
  }
}
</style>
