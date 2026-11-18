<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import type { Activity } from '../types';
import type { BackgroundWork } from '../lib/background-work';
import { api, enc } from '../api';
import Icon from './Icon.vue';
import SpringDisclosure from './SpringDisclosure.vue';
import ActivityTrace from './ActivityTrace.vue';
import TaskStepStatus from './TaskStepStatus.vue';

const props = withDefaults(defineProps<{ work: BackgroundWork; title: string; active?: boolean; flat?: boolean }>(), { active: true });
interface Run { id: string; state: string; outcome?: string; error?: string; startedAt?: number; endedAt?: number }
const open = ref(false), visited = ref(false), loading = ref(false), error = ref('');
const steps = ref<Activity[]>([]), run = ref<Run>(), id = useId();
const status = computed(() => props.flat && props.work.state === 'working' && props.work.task?.stage?.key !== 'working/asking' ? '进行中' : props.work.label);
const path = computed(() => `/${props.work.kind === 'rule' ? 'rules' : 'tasks'}/${enc(props.work.id)}`);
let timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined, generation = 0, disposed = false, loadedRunId = '';
function cancel() { generation++; controller?.abort(); clearTimeout(timer); loading.value = false; }
async function load() {
  clearTimeout(timer);
  if (!open.value || !props.active || disposed) return;
  if (document.hidden) { timer = setTimeout(load, 2000); return; }
  controller?.abort();
  const ticket = ++generation, abort = new AbortController(); controller = abort;
  loading.value = !run.value; error.value = '';
  try {
    const result = await api<{ runs: Run[] }>(props.work.kind === 'rule' ? `${path.value}/runs?limit=1` : path.value, { signal: abort.signal });
    if (ticket !== generation || disposed) return;
    const latest = result.runs.find(item => item.id === props.work.runId)
      || (props.work.kind === 'rule' ? result.runs[0] : result.runs.at(-1));
    const cached = loadedRunId === latest?.id && run.value?.state === 'ended';
    if (run.value?.id !== latest?.id) steps.value = [];
    if (!cached) run.value = latest;
    if (latest && !cached) {
      const result = await api<{ steps: Activity[] }>(`${path.value}/runs/${enc(latest.id)}/activity`, { signal: abort.signal });
      if (ticket === generation && !disposed) { steps.value = result.steps; loadedRunId = latest.id; }
    }
  } catch (e) { if (!abort.signal.aborted && !disposed && ticket === generation) error.value = (e as Error).message; }
  finally {
    if (ticket === generation && !disposed) {
      loading.value = false;
      if (open.value && (!run.value || run.value.state !== 'ended')) timer = setTimeout(load, 2000);
    }
  }
}
watch([open, () => props.active], ([value, active]) => { if (value && active) { visited.value = true; void load(); } else cancel(); });
watch(() => props.work.runId, () => { if (open.value) void load(); });
onBeforeUnmount(() => { disposed = true; cancel(); });
</script>
<template>
  <article class="background-task-item" :class="{ flat }">
    <button class="background-task-row" :aria-expanded="open" :aria-controls="id" :aria-label="(open ? '收起任务：' : '展开任务：') + work.title" @click="open = !open">
      <Icon name="chevron" :size="12" class="task-chevron" :class="{ expanded: open }" />
      <TaskStepStatus :state="work.state" />
      <span class="background-task-title" :title="work.title">{{ title }}</span>
      <span class="task-label" :class="work.state === 'done' ? 'is-done' : work.state === 'failed' ? 'is-failed' : 'is-working'" :title="run?.error || work.label">{{ status }}</span>
    </button>
    <SpringDisclosure :id="id" :open="open">
      <div v-if="visited" class="background-task-progress">
        <p v-if="error" class="notice" role="alert">{{ error }} <button @click="load">重试</button></p>
        <p v-if="loading" class="task-note" role="status">正在加载运行记录…</p>
        <ActivityTrace v-else :steps="steps" :run-id="work.kind === 'rule' ? run?.id : undefined" :task-id="work.kind === 'task' ? work.id : undefined" :rule-id="!run && work.kind === 'rule' ? work.id : undefined" :running="!!run && run.state !== 'ended'" :active="open && active" embedded />
      </div>
    </SpringDisclosure>
  </article>
</template>
<style scoped>
.background-task-item { min-width:0; background:var(--pill); border-radius:6px; overflow:hidden; }
.background-task-row { display:flex; align-items:center; gap:6px; text-align:left; width:100%; min-height:30px; padding:7px 10px; border-radius:5px; box-sizing:border-box; }
.background-task-row:hover { background:var(--pill-hover); }
.flat { background:transparent; }
.flat .background-task-row:hover { color:var(--fg); background:transparent; }
.flat .background-task-title { font-size:var(--chat-text-size,var(--fs-lg)); }
.flat .task-label { font-size:var(--fs-xs); padding:0; background:transparent; }
.task-chevron { flex:none; color:var(--muted); transition:transform 220ms ease; }
.task-chevron.expanded { transform:rotate(90deg); }
.background-task-title { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
.task-label { flex:none; font-size:10px; line-height:1.5; padding:2px 6px; border-radius:4px; }
.task-label.is-done { color:var(--green); background:var(--green-soft, color-mix(in srgb, var(--green) 14%, transparent)); }
.task-label.is-working { color:var(--amber,#d5a94b); background:color-mix(in srgb, var(--amber,#d5a94b) 14%, transparent); }
.task-label.is-failed { color:var(--red); background:color-mix(in srgb, var(--red) 14%, transparent); }
.background-task-progress { padding:2px 8px 12px 26px; min-width:0; }
.task-note { color:var(--muted); font-size:11px; margin:5px 0; overflow-wrap:anywhere; }
@media(prefers-reduced-motion:reduce) { .task-chevron { transition:none; } }
:global(html[data-motion="off"]) .task-chevron, :global(html[data-motion="reduce"]) .task-chevron { transition:none; }
</style>
