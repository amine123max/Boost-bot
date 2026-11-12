<script setup lang="ts">
import { computed } from "vue";
import BoostBotAvatar from "./BoostBotAvatar.vue";
import type { BotActivity } from "@/lib/bot-activity";
const props = withDefaults(
  defineProps<{
    activity: BotActivity;
    label: string;
    active?: boolean;
    compact?: boolean;
    showValue?: boolean;
  }>(),
  { showValue: false },
);
const progress = computed(() =>
  props.activity.state === "done" ? 100 : props.activity.percent,
);
const progressColor = computed(() => {
  if (props.activity.state === "done") return "#22c55e";
  if (props.activity.state === "failed") return "#ef4444";
  if (props.activity.state === "waiting") return "#e9ac43";
  if (progress.value == null) return "var(--tray-muted, #8d929d)";
  const hue = 142 * Math.min(1, Math.max(0, progress.value) / 100);
  return `hsl(${hue} 71% 45%)`;
});
const ringProgress = computed(() =>
  progress.value === 0 ? 1.5 : progress.value,
);
</script>
<template>
  <span
    class="bot-task-progress"
    :class="[
      activity.state,
      { compact, stale: activity.stale },
    ]"
    role="progressbar"
    :aria-label="label"
    :aria-valuenow="progress ?? undefined"
    :aria-valuetext="label"
    :aria-valuemin="0"
    :aria-valuemax="100"
    :data-task-state="activity.state"
    :style="{ color: progressColor }"
  >
    <svg class="bot-task-ring" viewBox="0 0 48 48" aria-hidden="true">
      <circle class="bot-task-track" cx="24" cy="24" r="21" />
      <circle
        v-if="activity.state !== 'idle' && activity.state !== 'unavailable'"
        class="bot-task-arc"
        cx="24"
        cy="24"
        r="21"
        pathLength="100"
        :stroke-dasharray="ringProgress == null ? '24 76' : '100'"
        :stroke-dashoffset="ringProgress == null ? 0 : 100 - ringProgress"
      />
    </svg>
    <strong
      v-if="showValue && progress != null"
      class="bot-task-number"
      >{{ progress }}</strong
    >
    <BoostBotAvatar
      v-else
      :size="compact ? 40 : 34"
      :active="active || activity.state === 'working'"
      :thinking="activity.state === 'working'"
      :ambient="compact"
    />
    <span
      v-if="compact && activity.state === 'done'"
      class="bot-task-complete-dot"
      aria-hidden="true"
    />
  </span>
</template>
<style scoped>
.bot-task-progress.compact {
  width: 28px;
  height: 28px;
}
.bot-task-number {
  font-size: 10px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.bot-task-progress.stale .bot-task-arc {
  opacity: 0.4;
}
.bot-task-progress {
  position: relative;
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  color: var(--tray-accent, #65bfa1);
  transition: color 500ms ease;
}
.bot-task-ring {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  transform: rotate(-90deg);
}
.bot-task-ring circle {
  fill: none;
  stroke-width: 2;
}
.bot-task-track {
  stroke: currentColor;
  opacity: 0.12;
}
.bot-task-arc {
  stroke: currentColor;
  stroke-linecap: round;
  transition: stroke-dashoffset 500ms ease, stroke 500ms ease;
}
.bot-task-complete-dot {
  position: absolute;
  right: 2px;
  bottom: 2px;
  z-index: 1;
  width: 8px;
  height: 8px;
  border: 1.5px solid var(--tray-bg, #111214);
  border-radius: 50%;
  background: #22c55e;
  box-shadow: 0 0 0 1px #22c55e;
}
.idle .bot-task-track,
.unavailable .bot-task-track {
  opacity: 0;
}
.waiting {
  color: #e9ac43;
}
.failed {
  color: #e17c79;
}
.stopped,
.unavailable {
  color: var(--tray-muted, #8d929d);
}
@media (prefers-reduced-motion: reduce) {
  .bot-task-arc {
    transition: none;
  }
}
</style>
