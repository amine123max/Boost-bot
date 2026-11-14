<script setup lang="ts">
import Icon from "./Icon.vue";
defineProps<{ state: "pending" | "working" | "done" | "failed" }>();
</script>
<template>
  <span class="task-step-status" :class="`is-${state}`" aria-hidden="true"
    ><Icon v-if="state === 'done'" name="check" :size="13" /><Icon
      v-else-if="state === 'failed'"
      name="close"
      :size="13" /><span v-else class="task-step-ring"
  /></span>
</template>
<style scoped>
.task-step-status {
  display: inline-grid;
  place-items: center;
  width: 15px;
  height: 18px;
  flex: none;
  color: var(--muted);
}
.task-step-ring {
  width: 12px;
  height: 12px;
  box-sizing: border-box;
  border: 1.5px dotted currentColor;
  border-radius: 50%;
  opacity: 0.6;
}
.is-working .task-step-ring {
  border-style: solid;
  border-right-color: transparent;
  opacity: 1;
  animation: task-step-turn 0.85s linear infinite;
}
.is-done {
  color: var(--green);
}
.is-failed {
  color: var(--red);
}
@keyframes task-step-turn {
  to {
    transform: rotate(360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .task-step-ring {
    animation: none !important;
  }
}
:global(html[data-motion="off"]) .task-step-ring,
:global(html[data-motion="reduce"]) .task-step-ring {
  animation: none;
}
</style>
