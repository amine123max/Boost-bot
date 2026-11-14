<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "./Icon.vue";
import TaskStepStatus from "./TaskStepStatus.vue";
import type { TaskPlan } from "../lib/task-plan";
const props = withDefaults(
  defineProps<{
    plan: TaskPlan;
    limit?: number;
    loading?: boolean;
    heading?: boolean;
  }>(),
  { limit: 5, heading: true },
);
const expanded = ref(false);
const shown = computed(() =>
  expanded.value ? props.plan.items : props.plan.items.slice(0, props.limit),
);
</script>
<template>
  <div class="task-checklist">
    <div v-if="heading" class="checklist-heading">
      <span
        ><Icon name="tasks" :size="13" />{{
          plan.kind === "plan" ? "任务清单" : "执行记录"
        }}</span
      ><span class="checklist-count">{{ plan.items.length }}</span>
    </div>
    <ol v-if="shown.length" class="checklist-items">
      <li v-for="item in shown" :key="item.id" :class="`step-${item.state}`">
        <TaskStepStatus :state="item.state" /><span
          class="step-text"
          :title="item.text"
          >{{ item.text }}</span
        ><span class="sr-only">{{
          {
            pending: "待处理",
            working: "进行中",
            done: "已完成",
            failed: "失败",
          }[item.state]
        }}</span>
      </li>
    </ol>
    <p v-else class="checklist-empty" role="status">
      {{ loading ? "正在加载执行记录…" : "尚未记录执行步骤" }}
    </p>
    <button
      v-if="plan.items.length > limit"
      class="checklist-expand"
      :aria-expanded="expanded"
      @click="expanded = !expanded"
    >
      <Icon name="chevron" :size="11" :class="{ expanded }" />{{
        expanded ? "收起步骤" : `展开其余 ${plan.items.length - limit} 项`
      }}
    </button>
  </div>
</template>
<style scoped>
.task-checklist {
  background: transparent;
  padding: 0;
  min-width: 0;
}
.checklist-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font-size: 11px;
  color: var(--fg-2);
}
.checklist-heading > span:first-child {
  display: flex;
  align-items: center;
  gap: 6px;
}
.checklist-count {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.checklist-items {
  list-style: none;
  padding: 0;
  margin: 9px 0 0;
  display: grid;
  gap: 5px;
}
.checklist-items li {
  display: flex;
  gap: 7px;
  align-items: center;
  min-height: 24px;
  min-width: 0;
  font-size: 12px;
  line-height: 1.4;
}
.step-text {
  min-width: 0;
  overflow-wrap: anywhere;
}
.step-done .step-text {
  color: var(--muted);
}
.checklist-empty {
  color: var(--muted);
  font-size: 11px;
  margin: 10px 0 1px;
}
.checklist-expand {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 9px;
  padding: 2px 0;
  background: transparent;
  border: 0;
  color: var(--fg-2);
  font-size: 11px;
  cursor: pointer;
}
.checklist-expand .expanded {
  transform: rotate(90deg);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
