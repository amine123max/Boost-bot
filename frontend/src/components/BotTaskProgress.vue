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
const progressSweep = computed(() =>
  progress.value == null
    ? 86.4
    : Math.max(5.4, Math.min(100, progress.value)) * 3.6,
);
const progressHue = computed(() =>
  120 * Math.min(1, Math.max(0, progress.value ?? 0) / 100),
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
    <span
      class="bot-task-ring"
      aria-hidden="true"
      :style="{
        '--bot-task-progress-hue': `${activity.state === 'done' ? 120 : progressHue}deg`,
        '--bot-task-progress-sweep': `${progressSweep}deg`,
      }"
      :data-progress="progress ?? 'unknown'"
    >
      <span class="bot-task-track" />
      <span
        v-if="activity.state !== 'idle' && activity.state !== 'unavailable'"
        class="bot-task-arc"
        :class="{ 'is-unknown': progress == null }"
      />
    </span>
    <strong
      v-if="showValue && progress != null"
      class="bot-task-number"
      >{{ progress }}</strong
    >
    <BoostBotAvatar
      v-else
      :size="compact ? 26 : 34"
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
  display: grid;
  place-items: center;
  border-radius: 50%;
  pointer-events: none;
  transition:
    --bot-task-progress-hue 500ms ease,
    --bot-task-progress-sweep 500ms ease;
}
.bot-task-track {
  position: absolute;
  inset: 1px;
  border: 2px solid currentColor;
  border-radius: 50%;
  opacity: 0.12;
}
.bot-task-arc {
  position: absolute;
  inset: 1px;
  border-radius: 50%;
  background: conic-gradient(
    from -90deg,
    hsl(0 82% 48%) 0deg,
    hsl(calc(var(--bot-task-progress-hue) / 2) 82% 48%) calc(var(--bot-task-progress-sweep) / 2),
    hsl(var(--bot-task-progress-hue) 82% 48%) var(--bot-task-progress-sweep),
    transparent var(--bot-task-progress-sweep) 1turn
  );
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 1px));
  mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 1px));
}
.bot-task-progress.done .bot-task-arc {
  background: conic-gradient(from -90deg, #22c55e 0deg, #22c55e 1turn);
}
.bot-task-progress.failed .bot-task-arc {
  background: conic-gradient(from -90deg, #ef4444 0deg var(--bot-task-progress-sweep), transparent var(--bot-task-progress-sweep) 1turn);
}
.bot-task-progress.waiting .bot-task-arc {
  background: conic-gradient(from -90deg, #e9ac43 0deg var(--bot-task-progress-sweep), transparent var(--bot-task-progress-sweep) 1turn);
}
.bot-task-arc.is-unknown {
  background: conic-gradient(from -90deg, var(--tray-muted, #8d929d) 0deg var(--bot-task-progress-sweep), transparent var(--bot-task-progress-sweep) 1turn);
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
