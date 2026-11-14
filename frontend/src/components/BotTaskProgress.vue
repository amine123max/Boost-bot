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
    ? 0
    : Math.max(0, Math.min(100, progress.value)) * 3.6,
);
</script>
<template>
  <span
    class="bot-task-progress"
    :class="[activity.state, { compact, stale: activity.stale, unknown: progress == null }]"
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
        '--bot-task-progress-sweep': `${progressSweep}deg`,
      }"
      :data-progress="progress ?? 'unknown'"
    >
      <span class="bot-task-track" />
      <span
        v-if="progress !== null && activity.state !== 'idle' && activity.state !== 'unavailable'"
        class="bot-task-arc"
      />
    </span>
    <strong v-if="showValue" class="bot-task-number">{{
      progress ?? '—'
    }}</strong>
    <BoostBotAvatar
      v-else
      :size="compact ? 26 : 34"
      :active="active || activity.state === 'working'"
      :thinking="activity.state === 'working'"
      :ambient="compact"
    />
  </span>
</template>
<style scoped>
@property --bot-task-progress-sweep {
  syntax: "<angle>";
  inherits: true;
  initial-value: 0deg;
}
.bot-task-progress.compact {
  width: 32px;
  height: 32px;
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
    currentColor 0deg var(--bot-task-progress-sweep),
    transparent var(--bot-task-progress-sweep) 1turn
  );
  -webkit-mask: radial-gradient(
    farthest-side,
    transparent calc(100% - 3px),
    #000 calc(100% - 1px)
  );
  mask: radial-gradient(
    farthest-side,
    transparent calc(100% - 3px),
    #000 calc(100% - 1px)
  );
}
.bot-task-progress.done .bot-task-arc {
  background: conic-gradient(from -90deg, #22c55e 0deg, #22c55e 1turn);
}
.bot-task-progress.failed .bot-task-arc {
  background: conic-gradient(
    from -90deg,
    #ef4444 0deg var(--bot-task-progress-sweep),
    transparent var(--bot-task-progress-sweep) 1turn
  );
}
.bot-task-progress.waiting .bot-task-arc {
  background: conic-gradient(
    from -90deg,
    #e9ac43 0deg var(--bot-task-progress-sweep),
    transparent var(--bot-task-progress-sweep) 1turn
  );
}
.unknown .bot-task-track { opacity: 0.3; }
.bot-task-progress.done {
  background: color-mix(in srgb, #22c55e 9%, transparent);
  border-radius: 50%;
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
  .bot-task-arc, .bot-task-ring {
    transition: none;
    animation: none !important;
  }
}
:global(html[data-motion="off"]) .bot-task-ring,
:global(html[data-motion="reduce"]) .bot-task-ring { transition: none; }
</style>
