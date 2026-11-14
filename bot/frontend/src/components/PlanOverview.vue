<script setup lang="ts">
import Icon from "./Icon.vue";
import TaskPlanChecklist from "./TaskPlanChecklist.vue";
import type { TaskPlan } from "../lib/task-plan";
withDefaults(
  defineProps<{
    title: string;
    summary?: string;
    caption?: string;
    status: string;
    tone: string;
    plan: TaskPlan;
    inspect?: boolean;
    loading?: boolean;
    error?: string;
    question?: string;
    borderless?: boolean;
  }>(),
  { caption: "任务概览" },
);
const emit = defineEmits<{ open: []; retry: [] }>();
</script>
<template>
  <article
    class="task-overview"
    :class="{ borderless }"
    :aria-label="`${caption}：${title}`"
  >
    <header class="overview-heading">
      <span class="overview-caption"
        ><span class="overview-mark"><Icon name="tasks" :size="13" /></span
        >{{ caption }}</span
      >
    </header>
    <h3>{{ title }}</h3>
    <p v-if="summary" class="overview-summary">{{ summary }}</p>
    <TaskPlanChecklist v-if="inspect && plan.kind==='plan'" :plan="plan" :loading="loading" />
    <p v-if="question" class="overview-question">{{ question }}</p>
    <p v-if="error" class="overview-error" role="alert">
      {{ error }}<button @click="emit('retry')">重试</button>
    </p>
    <footer class="overview-footer">
      <span class="overview-status" :class="tone">{{ status }}</span
      ><button v-if="inspect" class="overview-open" @click="emit('open')">
        查看任务<Icon name="chevron" :size="11" />
      </button>
    </footer>
  </article>
</template>
<style scoped>
.task-overview {
  padding: 10px 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  min-width: 0;
}
.task-overview.borderless {
  border: 0;
  background: transparent;
  border-radius: 0;
  padding: 8px 0;
  margin-block: 6px 12px;
}
.overview-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}
.overview-caption {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: var(--fg-2);
}
.overview-mark {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  color: var(--accent);
}
.task-overview h3 {
  font-size: 13px;
  line-height: 1.4;
  font-weight: 550;
  margin: 0 0 5px;
  overflow-wrap: anywhere;
}
.overview-summary {
  color: var(--muted);
  font-size: 11px;
  line-height: 1.45;
  margin: 0 0 11px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.overview-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  margin-top: 11px;
}
.overview-status {
  font-size: 10px;
  line-height: 1.4;
  padding: 3px 6px;
  border-radius: 5px;
  background: var(--well);
  color: var(--fg-2);
}
.overview-status.done {
  background: color-mix(in srgb, #38a577 12%, transparent);
  color: #38a577;
}
.overview-status.failed {
  background: color-mix(in srgb, #d76564 12%, transparent);
  color: #d76564;
}
.overview-status.waiting {
  background: color-mix(in srgb, #c69442 12%, transparent);
  color: #c69442;
}
.overview-open {
  display: flex;
  align-items: center;
  gap: 3px;
  border: 1px solid var(--line);
  border-radius: 6px;
  background: var(--pill);
  color: var(--fg);
  padding: 4px 7px;
  font-size: 10px;
  cursor: pointer;
}
.overview-question {
  font-size: 11px;
  color: var(--fg-2);
  line-height: 1.5;
  margin: 10px 0 0;
}
.overview-error {
  font-size: 11px;
  color: var(--danger, #d76564);
  line-height: 1.4;
  margin: 9px 0 0;
  overflow-wrap: anywhere;
}
.overview-error button {
  background: none;
  border: 0;
  color: inherit;
  text-decoration: underline;
  margin-left: 5px;
  cursor: pointer;
}
</style>
