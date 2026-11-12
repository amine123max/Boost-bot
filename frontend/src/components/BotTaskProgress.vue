<script setup lang="ts">
import BoostBotAvatar from "./BoostBotAvatar.vue";
import type { BotActivity } from "@/lib/bot-activity";
withDefaults(
  defineProps<{
    activity: BotActivity;
    label: string;
    active?: boolean;
    compact?: boolean;
    showValue?: boolean;
  }>(),
  { showValue: false },
);
</script>
<template>
  <span
    class="bot-task-progress"
    :class="[
      activity.state,
      { compact },
      {
        pending: activity.state === 'working' && activity.percent == null,
        stale: activity.stale,
      },
    ]"
    role="progressbar"
    :aria-label="label"
    :aria-valuenow="activity.percent ?? undefined"
    :aria-valuetext="label"
    :aria-valuemin="0"
    :aria-valuemax="100"
    :data-task-state="activity.state"
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
        :stroke-dasharray="activity.percent == null ? '24 76' : '100'"
        :stroke-dashoffset="
          activity.percent == null ? 0 : 100 - activity.percent
        "
      />
    </svg>
    <strong
      v-if="showValue && activity.percent != null"
      class="bot-task-number"
      >{{ activity.percent }}</strong
    >
    <BoostBotAvatar
      v-else
      :size="compact ? 18 : 34"
      :active="active || activity.state === 'working'"
      :thinking="activity.state === 'working'"
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
  transition: stroke-dashoffset 500ms ease;
}
.idle .bot-task-track,
.unavailable .bot-task-track {
  opacity: 0;
}
.pending .bot-task-ring {
  animation: bot-task-orbit 2s linear infinite;
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
.working:not(.pending) .bot-task-arc {
  animation: bot-task-breathe 2.6s ease-in-out infinite;
}
.waiting .bot-task-arc {
  animation: bot-task-breathe 4s ease-in-out infinite;
}
@keyframes bot-task-orbit {
  to {
    transform: rotate(270deg);
  }
}
@keyframes bot-task-breathe {
  50% {
    opacity: 0.5;
  }
}
@media (prefers-reduced-motion: reduce) {
  .bot-task-ring,
  .bot-task-arc {
    animation: none !important;
    transition: none;
  }
}
</style>
