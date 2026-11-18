<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import { api, enc } from '../api';
import { backgroundWork } from '../lib/background-work';
import type { Task } from '../types';
import BackgroundTaskItem from './BackgroundTaskItem.vue';
import Icon from './Icon.vue';
import { HOVER_DELAY_MS } from '../lib/hover-delay';
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
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
function show() { clearTimeout(closeTimer); clearTimeout(hoverTimer); open.value = multiple.value; }
function hover(event: PointerEvent) {
  if (event.pointerType !== 'mouse' || !multiple.value) return;
  clearTimeout(closeTimer);
  clearTimeout(hoverTimer);
  if (!open.value) hoverTimer = setTimeout(show, HOVER_DELAY_MS);
}
function keepOpen() { clearTimeout(closeTimer); }
function close() { clearTimeout(hoverTimer); clearTimeout(closeTimer); open.value = false; }
function toggle() { if (open.value) close(); else show(); }
function leave() { clearTimeout(hoverTimer); clearTimeout(closeTimer); closeTimer = setTimeout(close, 140); }
watch(multiple, value => { if (!value) close(); });
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
onBeforeUnmount(() => { disposed = true; stopPolling(); close(); });
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
    @pointerenter="hover" @pointerleave="leave"
    @focusin="keepOpen" @focusout="event => { if (!(event.currentTarget as HTMLElement).contains(event.relatedTarget as Node)) leave(); }" @keydown.esc.stop="close">
    <button v-if="multiple" type="button" class="tasks-heading" :aria-expanded="open" :aria-controls="panel" @click="toggle">
      <span class="task-ring" :class="{ idle:first.state !== 'working' }" aria-hidden="true" />
      <span class="current-task">{{ first.title }}</span>
      <span class="current-status">{{ status }}</span>
      <span class="task-count">+{{ items.length - 1 }}</span>
    </button>
    <div v-else class="tasks-heading">
      <span class="task-ring" :class="{ idle:first.state !== 'working' }" aria-hidden="true" />
      <span class="current-task">{{ first.title }}</span>
      <span class="current-status">{{ status }}</span>
    </div>
    <Transition name="task-popover">
      <div v-if="multiple && open" :id="panel" class="tasks-list" :inert="!open">
        <BackgroundTaskItem v-for="item in items" :key="item.key" :work="item" :title="item.title" :active="open" flat />
      </div>
    </Transition>
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
.current-status { padding:1px 5px; border-radius:4px; color:var(--amber,#d5a94b); background:color-mix(in srgb,var(--amber,#d5a94b) 16%,transparent); }
.task-count { padding:0 5px; border:1px solid var(--line); border-radius:6px; background:var(--pill); }
.task-ring { flex:none; width:13px; height:13px; border:1.5px solid var(--line); border-top-color:currentColor; border-radius:50%; animation:task-spin .9s linear infinite; }
.task-ring.idle { animation:none; }
.tasks-list { position:absolute; inset-block-start:100%; inset-inline-start:0; z-index:30; display:grid; gap:1px; width:min(320px, 48vw); max-height:min(45dvh,320px); overflow:auto; padding:4px; border-radius:10px; background:var(--bot-task-glass); backdrop-filter:blur(24px); }
.task-popover-enter-active { transition:opacity 190ms ease-out, transform 230ms cubic-bezier(.2,.75,.25,1); }
.task-popover-leave-active { transition:opacity 140ms ease-in, transform 160ms ease-in; pointer-events:none; }
.task-popover-enter-from,.task-popover-leave-to { opacity:0; transform:translateY(-4px); }
@media(max-width:650px) { .tasks-list { inset-inline-start:auto; inset-inline-end:0; width:min(280px,68vw); } }
@keyframes task-spin { to { transform:rotate(360deg); } }
@media(prefers-reduced-motion:reduce) { .task-ring { animation:none; } .task-popover-enter-active,.task-popover-leave-active { transition:none; } }
:global(html[data-motion="off"]) :is(.task-popover-enter-active,.task-popover-leave-active),
:global(html[data-motion="reduce"]) :is(.task-popover-enter-active,.task-popover-leave-active) { transition:none; }
</style>
