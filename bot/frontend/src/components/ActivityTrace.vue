<script setup lang="ts">
import { computed, ref } from "vue";
import type { Activity } from "../types";
import { api, enc } from "../api";
import { taskPlan } from "../lib/task-plan";
import { activityGroups } from "../lib/activity-groups";
import Icon from "./Icon.vue";
import Markdown from "./Markdown.vue";
import TaskPlanChecklist from "./TaskPlanChecklist.vue";
import TaskStepStatus from "./TaskStepStatus.vue";
const props = defineProps<{
  steps?: Activity[];
  count?: number;
  conversationId?: string;
  messageId?: number | string;
  running?: boolean;
}>();
const history = ref<Activity[]>([]),
  loading = ref(false),
  error = ref(""),
  fetched = ref(false),
  expanded = ref(false);
const entries = computed(() => props.steps || history.value),
  plan = computed(() => taskPlan(entries.value)),
  groups = computed(() => activityGroups(entries.value));
const shown = computed(() =>
  expanded.value ? groups.value : groups.value.slice(0, 5),
);
const state = (step: Activity) =>
  step.status === "ok"
    ? "done"
    : step.status === "error"
      ? "failed"
      : step.status === "running"
        ? "working"
        : "pending";
const label = (step: Activity) =>
  ({ done: "已完成", failed: "未完成", working: "进行中", pending: "待处理" })[
    state(step)
  ];
const titles: Record<string, string> = {
  model: "模型请求",
  tool: "执行工具",
  retry: "重试",
  error: "执行失败",
  compact: "整理上下文",
};
const title = (step: Activity) =>
  step.title || step.label || titles[step.kind || ""] || "执行步骤";
async function load(event: Event) {
  if (
    !(event.target as HTMLDetailsElement).open ||
    props.steps ||
    fetched.value ||
    loading.value ||
    !props.conversationId ||
    !props.messageId
  )
    return;
  loading.value = true;
  error.value = "";
  try {
    history.value = (
      await api<{ steps: Activity[] }>(
        `/conversations/${enc(props.conversationId)}/messages/${enc(String(props.messageId))}/activity`,
      )
    ).steps;
    fetched.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
const duration = (ms?: number) =>
  ms === undefined
    ? ""
    : ms < 1000
      ? `${ms} ms`
      : `${(ms / 1000).toFixed(1)} 秒`;
const tokens = (value?: number) =>
  value === undefined ? "—" : value.toLocaleString("zh-CN");
</script>
<template>
  <details class="activity-trace" @toggle="load">
    <summary class="trace-toggle">
      <Icon name="chevron" :size="14" /><span>处理过程</span
      ><span v-if="running" class="trace-running">执行中</span
      ><small v-if="count || entries.length"
        >{{
          entries.length
            ? plan.kind === "plan"
              ? plan.items.length
              : groups.length
            : count
        }}
        步</small
      >
    </summary>
    <div class="trace-content">
      <p v-if="loading" class="trace-note" role="status">正在加载步骤…</p>
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <TaskPlanChecklist
        v-if="plan.kind === 'plan'"
        :plan="plan"
        :heading="false"
      />
      <component
        :is="plan.kind === 'plan' ? 'details' : 'div'"
        class="trace-execution"
        :class="{ 'has-plan': plan.kind === 'plan' }"
      >
        <summary v-if="plan.kind === 'plan'" class="trace-execution-toggle">
          执行明细<Icon name="chevron" :size="12" />
        </summary>
        <ol class="trace-tasks">
          <li v-for="(group, index) in shown" :key="group.step.id">
            <details class="trace-step" :data-state="state(group.step)">
              <summary>
                <TaskStepStatus :state="state(group.step)" /><span
                  class="trace-number sr-only"
                  >步骤 {{ index + 1 }}</span
                ><strong>{{ title(group.step) }}</strong
                ><small v-if="group.events.length" class="trace-attempts"
                  >{{ group.events.length }} 条记录</small
                ><span class="trace-time">{{ duration(group.step.ms) }}</span
                ><span class="sr-only">{{ label(group.step) }}</span
                ><Icon name="chevron" :size="12" />
              </summary>
              <div class="trace-step-body">
                <p v-if="group.step.tokens" class="trace-note">
                  输入 {{ tokens(group.step.tokens.input) }} · 输出
                  {{ tokens(group.step.tokens.output) }} tokens
                </p>
                <p v-if="group.step.summary" class="trace-summary">
                  {{ group.step.summary }}
                </p>
                <section v-if="group.step.input" class="trace-detail">
                  <h4>输入参数</h4>
                  <pre>{{ group.step.input }}</pre>
                </section>
                <section v-if="group.step.output" class="trace-detail">
                  <h4>
                    {{
                      group.step.kind === "model"
                        ? "模型摘要与答复"
                        : "执行结果"
                    }}
                  </h4>
                  <Markdown :text="group.step.output" />
                </section>
                <ol
                  v-if="group.events.length"
                  class="trace-request-events"
                  aria-label="请求与重试记录"
                >
                  <li v-for="item in group.events" :key="item.id">
                    <TaskStepStatus :state="state(item)" />
                    <div>
                      <strong>{{ title(item) }}</strong>
                      <p>
                        {{ item.summary || item.output || item.detail || "" }}
                      </p>
                    </div>
                  </li>
                </ol>
                <p
                  v-if="
                    !group.step.input &&
                    !group.step.output &&
                    !group.step.summary &&
                    !group.events.length
                  "
                  class="trace-note"
                >
                  {{
                    group.step.status === "running"
                      ? "正在执行，等待结果…"
                      : "此步骤未返回详细内容"
                  }}
                </p>
              </div>
            </details>
          </li>
        </ol>
        <button
          v-if="groups.length > 5"
          type="button"
          class="trace-expand"
          :aria-expanded="expanded"
          @click="expanded = !expanded"
        >
          <Icon name="more" :size="13" />{{
            expanded ? "收起步骤" : `还有 ${groups.length - 5} 项`
          }}
        </button>
      </component>
    </div>
  </details>
</template>
<style scoped>
.activity-trace {
  color: var(--muted);
  font-size: 12px;
  margin: 8px 0;
}
.trace-toggle {
  list-style: none;
  display: flex;
  align-items: center;
  gap: 7px;
  cursor: pointer;
  padding: 7px 0;
  border-bottom: 1px solid var(--line-2);
}
.trace-toggle small {
  margin-left: auto;
  font-size: 11px;
}
.trace-toggle::-webkit-details-marker,
.trace-step > summary::-webkit-details-marker,
.trace-execution > summary::-webkit-details-marker {
  display: none;
}
.activity-trace[open] > .trace-toggle > svg:first-child,
.trace-step[open] > summary > svg:last-child,
.trace-execution[open] > summary > svg {
  transform: rotate(90deg);
}
.trace-content {
  padding: 5px 0;
}
.trace-running {
  font-size: 11px;
}
.trace-tasks {
  display: grid;
  gap: 2px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.trace-step {
  border: 0;
  background: transparent;
  min-width: 0;
}
.trace-step > summary {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 29px;
  list-style: none;
  cursor: pointer;
  padding: 2px 0;
}
.trace-step > summary strong {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  color: var(--fg-2);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}
.trace-step[data-state="done"] > summary strong {
  color: var(--muted);
}
.trace-step > summary > svg:last-child {
  opacity: 0.6;
  flex: none;
}
.trace-step > summary:hover {
  color: var(--fg);
}
.trace-attempts,
.trace-time {
  font-size: 10px;
  white-space: nowrap;
  flex: none;
}
.trace-step-body {
  margin: 2px 0 7px 22px;
  padding: 4px 0 5px 10px;
  border-left: 1px solid var(--line-2);
  font-size: 11px;
  overflow-wrap: anywhere;
}
.trace-note {
  margin: 5px 0;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.trace-summary {
  white-space: pre-wrap;
  margin: 6px 0;
}
.trace-detail h4 {
  margin: 7px 0 4px;
  font-size: 11px;
  font-weight: 500;
}
.trace-detail pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: 11px/1.6 var(--code);
}
.trace-execution-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  font-size: 11px;
  padding: 8px 0 4px;
  list-style: none;
}
.trace-request-events {
  list-style: none;
  padding: 0;
  margin: 6px 0;
  display: grid;
  gap: 6px;
}
.trace-request-events > li {
  display: flex;
  align-items: flex-start;
  gap: 7px;
}
.trace-request-events strong {
  font-size: 11px;
  font-weight: 500;
}
.trace-request-events p {
  margin: 3px 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.trace-expand {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  padding: 3px 0;
  font-size: 11px;
  color: var(--muted);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
