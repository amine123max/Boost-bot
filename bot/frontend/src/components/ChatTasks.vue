<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { api, enc } from '../api';
import { backgroundWork } from '../lib/background-work';
import type { Task } from '../types';
import BackgroundTaskItem from './BackgroundTaskItem.vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
const props = defineProps<{ botId: string; tasks: Task[]; configure: boolean }>();
const emit = defineEmits<{ created: [task: Task]; updated: [tasks: Task[]] }>();
const open = ref(false), creating = ref(false), busy = ref(false), title = ref(''), brief = ref(''), requestId = ref(''), budget = ref(1), error = ref('');
const items = computed(() => backgroundWork(props.tasks, []).filter(item => item.state === 'working' || item.state === 'pending'));
const active = computed(() => items.value.length > 0);
const multiple = computed(() => items.value.length > 1);
const first = computed(() => items.value[0]);
const status = computed(() => first.value?.task?.stage?.key === 'working/asking' ? first.value.label
  : first.value?.state === 'working' ? '进行中' : '排队中');
const panel = useId();
let closeTimer: ReturnType<typeof setTimeout> | undefined;
function show() { clearTimeout(closeTimer); open.value = multiple.value; }
function keepOpen() { clearTimeout(closeTimer); }
function leave() { clearTimeout(closeTimer); closeTimer = setTimeout(() => { open.value = false; }, 140); }
watch(multiple, value => { if (!value) open.value = false; });
let timer: ReturnType<typeof setTimeout> | undefined, poll: AbortController | undefined, disposed = false;
function stopPolling() { clearTimeout(timer); poll?.abort(); poll = undefined; }
function schedule() {
  stopPolling();
  if (disposed || !active.value) return;
  timer = setTimeout(async () => {
    if (document.hidden) return schedule();
    const request = new AbortController();
    poll = request;
    try {
      const result = await api<{ tasks: Task[] }>(`/bots/${enc(props.botId)}/chat/tasks`, { signal: request.signal });
      if (!request.signal.aborted) emit('updated', result.tasks);
    } catch { /* Keep the most recent state during a transient load failure. */ }
    finally { if (poll === request) schedule(); }
  }, 3000);
}
watch(active, schedule, { immediate: true });
onBeforeUnmount(() => { disposed = true; stopPolling(); clearTimeout(closeTimer); });
function create(text = '') {
  if (!props.configure || creating.value) return;
  title.value = Array.from(text.trim()).slice(0, 40).join('');
  brief.value = text.trim();
  requestId.value = crypto.randomUUID();
  budget.value = 1;
  error.value = '';
  creating.value = true;
}
async function submit() {
  if (busy.value || !title.value.trim() || !brief.value.trim()) return;
  stopPolling();
  busy.value = true;
  error.value = '';
  try {
    const result = await api<{ task: Task }>(`/bots/${enc(props.botId)}/tasks`, { method:'POST',
      body:{ title:title.value, brief:brief.value, budgetUsd:budget.value, requestId:requestId.value } });
    if (disposed) return;
    creating.value = false;
    emit('created', result.task);
  } catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; schedule(); }
}
defineExpose({ create });
</script>
<template>
  <section v-if="first" class="chat-tasks" aria-label="当前任务"
    @pointerenter="event => { if (event.pointerType === 'mouse') show(); }" @pointerleave="leave"
    @focusin="keepOpen" @focusout="event => { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) leave(); }" @keydown.esc.stop="open = false">
    <button v-if="multiple" type="button" class="tasks-heading" :aria-expanded="open" :aria-controls="panel" @click="show">
      <span class="task-ring" :class="{ idle:first.state !== 'working' }" aria-hidden="true" />
      <span class="current-task" :title="first.title">{{ first.title }}</span>
      <span class="current-status">{{ status }}</span>
      <span class="task-count">+{{ items.length - 1 }}</span>
    </button>
    <div v-else class="tasks-heading">
      <span class="task-ring" :class="{ idle:first.state !== 'working' }" aria-hidden="true" />
      <span class="current-task" :title="first.title">{{ first.title }}</span>
      <span class="current-status">{{ status }}</span>
    </div>
    <div v-if="multiple && open" :id="panel" class="tasks-list">
      <BackgroundTaskItem v-for="item in items" :key="item.key" :work="item" :title="item.title" :active="open" flat />
    </div>
  </section>
  <Modal v-if="creating" compact :busy="busy" title="新增任务" @close="creating = false">
    <form class="editor-form" @submit.prevent="submit">
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <label>任务名称<input v-model="title" required maxlength="40" /></label>
      <label>执行要求<textarea v-model="brief" required maxlength="1500" rows="4" /></label>
      <label>预算上限（美元）<input v-model.number="budget" required type="number" min="0.01" max="100" step="0.01" /></label>
      <footer class="dialog-actions"><button type="button" class="quiet-button" :disabled="busy" @click="creating = false">取消</button><button type="submit" class="primary-button" :disabled="busy">创建任务</button></footer>
    </form>
  </Modal>
</template>
<style scoped>
.chat-tasks { position:relative; min-width:0; max-width:min(38vw, 340px); }
.tasks-heading { display:flex; gap:7px; align-items:center; width:100%; min-height:30px; padding:4px 2px; color:var(--muted); font-size:var(--chat-text-size,var(--fs-lg)); }
.tasks-heading:hover,.tasks-heading[aria-expanded="true"] { color:var(--fg); }
.current-task { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.current-status,.task-count { flex:none; white-space:nowrap; font-size:var(--fs-xs); }
.current-status { color:var(--amber,#d5a94b); }
.task-ring { flex:none; width:13px; height:13px; border:1.5px solid var(--line); border-top-color:currentColor; border-radius:50%; animation:task-spin .9s linear infinite; }
.task-ring.idle { animation:none; }
.tasks-list { position:absolute; inset-block-start:100%; inset-inline-start:0; z-index:30; display:grid; gap:1px; width:min(320px, 48vw); max-height:min(45dvh,320px); overflow:auto; padding:4px; border-radius:10px; background:color-mix(in srgb,var(--surface-solid) 76%,transparent); backdrop-filter:blur(18px) saturate(1.15); }
@media(max-width:650px) { .tasks-list { inset-inline-start:auto; inset-inline-end:0; width:min(280px,68vw); } }
@keyframes task-spin { to { transform:rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .task-ring { animation:none; } }
</style>
