<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { Activity, Task } from "../types";
import { api, enc } from "../api";
import { taskPlan } from "../lib/task-plan";
import PlanOverview from "./PlanOverview.vue";
const props = defineProps<{ task: Task; inspect: boolean }>();
const emit = defineEmits<{ open: [task: Task] }>();
const steps = ref<Activity[]>([]),
  loading = ref(false),
  error = ref("");
let controller: AbortController | undefined;
let cachedRun: string | undefined;
const plan = computed(() => taskPlan(steps.value));
const tone = computed(() =>
  props.task.stage?.key === "failed"
    ? "failed"
    : props.task.stage?.key === "ready"
      ? "done"
      : props.task.stage?.group === "needs" ||
          props.task.stage?.key === "stopped"
        ? "waiting"
        : "working",
);
async function load() {
  controller?.abort();
  if (!props.inspect) return;
  const request = new AbortController();
  controller = request;
  loading.value = true;
  error.value = "";
  try {
    let id = props.task.live?.runId || cachedRun;
    if (!id || !props.task.live) {
      const detail = await api<{ runs: Array<{ id: string }> }>(
        `/tasks/${enc(props.task.id)}`,
        { signal: request.signal },
      );
      id = detail.runs[0]?.id;
    }
    if (!id) {
      steps.value = [];
      return;
    }
    cachedRun = id;
    const result = await api<{ steps: Activity[] }>(
      `/tasks/${enc(props.task.id)}/runs/${enc(id)}/activity`,
      { signal: request.signal },
    );
    if (!request.signal.aborted) steps.value = result.steps;
  } catch (e) {
    if (!request.signal.aborted) error.value = (e as Error).message;
  } finally {
    if (!request.signal.aborted) loading.value = false;
  }
}
watch(
  () => [
    props.task.id,
    props.task.updatedAt,
    props.task.live?.steps,
    props.inspect,
  ],
  () => void load(),
  { immediate: true },
);
onBeforeUnmount(() => controller?.abort());
</script>
<template>
  <PlanOverview
    :title="task.title"
    :summary="task.latest || task.summary"
    :status="task.stage?.label || task.status || '等待执行'"
    :tone="tone"
    :plan="plan"
    :inspect="inspect"
    :loading="loading"
    :error="error"
    :question="task.question?.text"
    @open="emit('open', task)"
    @retry="load"
  />
</template>
