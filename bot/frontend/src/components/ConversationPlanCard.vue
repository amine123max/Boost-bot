<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { Approval, LiveTurn, Message, Activity } from "../types";
import { api, enc } from "../api";
import { taskPlan } from "../lib/task-plan";
import PlanOverview from "./PlanOverview.vue";
import TaskPlanChecklist from "./TaskPlanChecklist.vue";
import Modal from "./Modal.vue";
import ActivityTrace from "./ActivityTrace.vue";
const props = defineProps<{
  conversationId: string;
  messages: Message[];
  live: LiveTurn | null;
  pending: Approval[];
}>();
const saved = ref<Activity[]>([]),
  error = ref("");
const open = ref(false);
let controller: AbortController | undefined;
const recent = computed(() =>
  [...props.messages]
    .reverse()
    .find((message) => message.role === "assistant" && message.steps),
);
const steps = computed(() =>
  props.live ? props.live.steps || [] : saved.value,
);
const plan = computed(() => taskPlan(steps.value));
const title = computed(
  () =>
    props.live?.userText ||
    props.messages
      .slice(
        0,
        props.messages.findIndex((message) => message.id === recent.value?.id),
      )
      .reverse()
      .find((message) => message.role === "user")?.content ||
    "当前会话任务",
);
const status = computed(() =>
  props.pending.length
    ? "等待你的回复"
    : props.live
      ? props.live.stopping
        ? "正在停止"
        : "执行中"
      : steps.value.some((step) => step.status === "error")
        ? "存在失败步骤"
        : "本轮已结束",
);
async function load() {
  controller?.abort();
  saved.value = [];
  error.value = "";
  open.value = false;
  if (props.live || !props.conversationId || !recent.value) return;
  const request = new AbortController();
  controller = request;
  try {
    const result = await api<{ steps: Activity[] }>(
      `/conversations/${enc(props.conversationId)}/messages/${enc(String(recent.value.id))}/activity`,
      { signal: request.signal },
    );
    if (!request.signal.aborted) saved.value = result.steps;
  } catch (e) {
    if (!request.signal.aborted) error.value = (e as Error).message;
  }
}
watch(
  [() => props.conversationId, () => recent.value?.id, () => props.live?.id],
  () => void load(),
  { immediate: true },
);
onBeforeUnmount(() => controller?.abort());
function exportPlan() {
  const text = `# ${title.value}\n\n${plan.value.items.map((item) => `- [${item.state === "done" ? "x" : " "}] ${item.text}`).join("\n")}\n`;
  const url = URL.createObjectURL(
    new Blob([text], { type: "text/markdown;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "会话任务计划.md";
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>
<template>
  <PlanOverview
    v-if="error || (plan.items.length && (plan.kind === 'plan' || live))"
    :title="title.slice(0, 90)"
    caption="会话计划"
    :status="status"
    :tone="
      pending.length
        ? 'waiting'
        : live
          ? 'working'
          : steps.some((step) => step.status === 'error')
            ? 'failed'
            : plan.items.every((item) => item.state === 'done')
              ? 'done'
              : 'ended'
    "
    :plan="plan"
    inspect
    :error="error"
    @open="open = true"
    @export="exportPlan"
    @retry="load"
  />
  <Modal v-if="open" title="会话任务计划" @close="open = false"
    ><div class="conversation-plan-detail">
      <h3>{{ title }}</h3>
      <TaskPlanChecklist :plan="plan" :limit="1000" /><ActivityTrace
        :steps="steps"
        :running="!!live"
        :overview="false"
      /></div
  ></Modal>
</template>
<style scoped>
.conversation-plan-detail {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.conversation-plan-detail h3 {
  font-size: 14px;
  font-weight: 500;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
</style>
