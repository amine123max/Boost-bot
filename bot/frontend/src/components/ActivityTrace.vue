<script setup lang="ts">
import { computed, ref } from "vue";
import type { Activity } from "../types";
import { api, enc } from "../api";
import Icon from "./Icon.vue";
import Markdown from "./Markdown.vue";
import PlanOverview from "./PlanOverview.vue";
import { taskPlan } from "../lib/task-plan";
const props = withDefaults(
  defineProps<{
    steps?: Activity[];
    count?: number;
    conversationId?: string;
    messageId?: number | string;
    running?: boolean;
    overview?: boolean;
    title?: string;
  }>(),
  { overview: true },
);
const history = ref<Activity[]>([]),
  loading = ref(false),
  error = ref(""),
  fetched = ref(false);
const entries = computed(() => props.steps || history.value);
const trace = ref<HTMLDetailsElement>();
const plan = computed(() => taskPlan(entries.value));
const hasError = computed(() =>
  entries.value.some((step) => step.status === "error"),
);
function openTrace() {
  if (trace.value) trace.value.open = true;
}
function exportOverview() {
  const text = `# ${props.title || "本轮处理过程"}\n\n${plan.value.items.map((item) => `- [${item.state === "done" ? "x" : " "}] ${item.text}`).join("\n")}\n`;
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "处理计划.md";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
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
  try {
    const d = await api<{ steps: Activity[] }>(
      `/conversations/${enc(props.conversationId)}/messages/${enc(String(props.messageId))}/activity`,
    );
    history.value = d.steps;
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
  value === undefined
    ? "—"
    : value >= 1000
      ? `${(value / 1000).toFixed(1)}k`
      : String(value);
</script>
<template>
  <PlanOverview
    v-if="overview && entries.length"
    borderless
    :title="
      title?.slice(0, 100) ||
      (plan.kind === 'plan' ? '本轮任务计划' : '本轮处理概览')
    "
    :caption="plan.kind === 'plan' ? '执行计划' : '处理概览'"
    :status="running ? '执行中' : hasError ? '存在失败步骤' : '本轮已结束'"
    :tone="running ? 'working' : hasError ? 'failed' : 'ended'"
    :plan="plan"
    inspect
    @open="openTrace"
    @export="exportOverview"
  />
  <details ref="trace" class="activity-trace" @toggle="load">
    <summary class="trace-toggle">
      <Icon name="chevron" :size="15" /><span>处理过程</span
      ><span v-if="running" class="trace-running">执行中</span
      ><small v-if="count || entries.length"
        >{{ count || entries.length }} 步</small
      >
    </summary>
    <div class="trace-content">
      <div v-if="loading" class="hint" role="status">正在加载过程…</div>
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <details
        v-for="(step, index) in entries"
        :key="step.id"
        class="trace-step"
        :open="index === 0 || undefined"
      >
        <summary>
          <Icon
            :name="step.kind === 'model' ? 'activity' : 'tasks'"
            :size="15"
          /><strong>{{ step.title || step.label || step.kind }}</strong
          ><span class="trace-state" :class="step.status">{{
            step.status === "ok"
              ? "已完成"
              : step.status === "error"
                ? "未完成"
                : "执行中"
          }}</span
          ><span>{{ duration(step.ms) }}</span
          ><Icon name="chevron" :size="13" />
        </summary>
        <p v-if="step.tokens" class="trace-tokens">
          输入 {{ tokens(step.tokens.input) }} tokens <span>·</span> 输出
          {{ tokens(step.tokens.output) }} tokens
        </p>
        <p v-if="step.summary" class="trace-summary">{{ step.summary }}</p>
        <section v-if="step.input" class="trace-detail">
          <h4>输入参数</h4>
          <pre>{{ step.input }}</pre>
        </section>
        <section v-if="step.output" class="trace-detail">
          <h4>{{ step.kind === "model" ? "模型摘要与答复" : "执行结果" }}</h4>
          <Markdown :text="step.output" />
        </section>
        <p v-if="!step.input && !step.output && !step.summary" class="hint">
          {{
            step.status === "running"
              ? "正在执行，等待返回结果…"
              : "此步骤未返回详细内容"
          }}
        </p>
      </details>
    </div>
  </details>
</template>
<style scoped>
.activity-trace {
  color: var(--muted);
  font-size: var(--fs-sm);
  margin: var(--space-2) 0;
}
.activity-trace > summary {
  list-style: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--line-2);
}
.activity-trace > summary small {
  margin-left: auto;
  font-size: var(--fs-xs);
}
.trace-step {
  margin-top: var(--space-2);
  padding: var(--space-3);
  border: 0;
  border-bottom: 1px solid var(--line-2);
  border-radius: 0;
  background: transparent;
  overflow-wrap: anywhere;
}
.trace-step > summary {
  list-style: none;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  cursor: pointer;
}
.trace-step strong {
  color: var(--fg-2);
  flex: 1;
  font-weight: var(--fw-medium);
}
.trace-step[open] > summary {
  margin-bottom: var(--space-2);
}
.trace-step pre {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font: var(--fs-xs)/var(--lh-relaxed) var(--code);
  user-select: text;
}
.trace-summary {
  white-space: pre-wrap;
  margin: var(--space-2) 0;
}
.trace-toggle::-webkit-details-marker,
.trace-step > summary::-webkit-details-marker {
  display: none;
}
.activity-trace[open] > .trace-toggle > svg:first-child {
  transform: rotate(90deg);
}
.trace-content {
  padding-top: var(--space-1);
}
.trace-running {
  font-size: var(--fs-xs);
  color: var(--muted);
}
.trace-tokens {
  color: var(--muted);
  font-size: var(--fs-xs);
  display: flex;
  gap: var(--space-1-5);
}
.trace-detail {
  padding-top: var(--space-2);
}
.trace-detail h4 {
  font-size: var(--fs-xs);
  color: var(--muted);
  font-weight: var(--fw-medium);
  margin: 0 0 var(--space-1);
}
.trace-state {
  font-size: var(--fs-2xs);
  padding: var(--space-0-5) var(--space-1-5);
  border-radius: var(--r-md);
  background: var(--pill);
}
.trace-state.ok {
  color: var(--green);
  background: var(--green-soft);
}
.trace-state.error {
  color: var(--red);
  background: var(--red-soft);
}
.trace-step[open] > summary > svg:last-child {
  transform: rotate(90deg);
}
</style>
