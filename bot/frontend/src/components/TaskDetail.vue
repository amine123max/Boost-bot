<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Activity, Task } from "../types";
import { api, enc, download } from "../api";
import Modal from "./Modal.vue";
import Markdown from "./Markdown.vue";
import ActivityTrace from "./ActivityTrace.vue";
const props = defineProps<{ task: Task; configure: boolean }>();
defineEmits<{ close: [] }>();
interface Run {
  id: string;
  state: string;
  outcome?: string;
  steps?: number;
  startedAt?: number;
  finishedAt?: number;
}
const detail = ref<{
    task: Task & { instruction?: string; message?: string };
    runs: Run[];
  }>(),
  error = ref(""),
  busy = ref(false),
  activity = ref<Record<string, Activity[]>>({});
let disposed = false,
  timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  try {
    const d = await api<NonNullable<typeof detail.value>>(
      `/tasks/${enc(props.task.id)}`,
    );
    if (!disposed) detail.value = d;
  } catch (e) {
    if (!disposed) error.value = (e as Error).message;
  } finally {
    if (!disposed) timer = setTimeout(load, 5000);
  }
}
async function steps(run: Run, event: Event) {
  if (!(event.target as HTMLDetailsElement).open || activity.value[run.id])
    return;
  try {
    activity.value[run.id] = (
      await api<{ steps: Activity[] }>(
        `/tasks/${enc(props.task.id)}/runs/${enc(run.id)}/activity`,
      )
    ).steps;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function stop() {
  busy.value = true;
  try {
    await api(`/tasks/${enc(props.task.id)}/stop`, {
      method: "POST",
      body: {},
    });
    clearTimeout(timer);
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function exportTask() {
  try {
    await download(
      `/tasks/${enc(props.task.id)}/export?lang=zh-CN`,
      `${props.task.title}.md`,
    );
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(timer);
});
</script>
<template>
  <Modal :title="task.title" @close="$emit('close')"
    ><div class="editor-form">
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <span class="state-chip">{{
        detail?.task.stage?.label || task.stage?.label || task.status
      }}</span
      ><Markdown
        :text="
          detail?.task.message ||
          detail?.task.summary ||
          detail?.task.instruction ||
          ''
        "
      />
      <details
        v-for="run in detail?.runs"
        :key="run.id"
        @toggle="steps(run, $event)"
      >
        <summary>
          {{
            run.startedAt
              ? new Date(run.startedAt).toLocaleString("zh-CN")
              : "运行记录"
          }}
          · {{ run.outcome || run.state }}
        </summary>
        <ActivityTrace v-if="activity[run.id]" :steps="activity[run.id]" />
      </details>
      <footer class="dialog-actions">
        <button class="quiet-button" @click="exportTask">导出记录</button
        ><button
          v-if="configure && detail?.task.stage?.group === 'working'"
          class="danger-button"
          :disabled="busy"
          @click="stop"
        >
          {{ busy ? "停止中…" : "停止任务" }}
        </button>
      </footer>
    </div></Modal
  >
</template>
