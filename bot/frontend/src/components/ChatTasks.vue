<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { api, enc } from '../api';
import { backgroundWork } from '../lib/background-work';
import type { Task } from '../types';
import BackgroundTaskItem from './BackgroundTaskItem.vue';
import Icon from './Icon.vue';
import Modal from './Modal.vue';
const props = defineProps<{ botId: string; tasks: Task[]; configure: boolean }>();
const emit = defineEmits<{ created: [task: Task]; updated: [tasks: Task[]] }>();
const open = ref(true), creating = ref(false), busy = ref(false), title = ref(''), brief = ref(''), requestId = ref(''), budget = ref(1), error = ref('');
const items = computed(() => backgroundWork(props.tasks, []));
const active = computed(() => items.value.some(item => item.state === 'pending' || item.state === 'working'));
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
onBeforeUnmount(() => { disposed = true; stopPolling(); });
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
    open.value = true;
    emit('created', result.task);
  } catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; schedule(); }
}
defineExpose({ create });
</script>
<template>
  <section v-if="items.length" class="chat-tasks" aria-label="任务列表">
    <button type="button" class="tasks-heading" :aria-expanded="open" @click="open = !open">
      <strong>任务</strong><span>{{ items.filter(item => item.state === 'working').length }} 进行中 · {{ items.filter(item => item.state === 'pending').length }} 待处理</span>
      <Icon name="chevron" :size="13" />
    </button>
    <div v-if="open" class="tasks-list">
      <BackgroundTaskItem v-for="item in items" :key="item.key" :work="item" :title="item.title" :active="open" />
      <button v-if="configure" type="button" class="quiet-button add-task" @click="create()"><Icon name="plus" :size="14" /> 新增任务</button>
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
.chat-tasks { border:1px solid var(--line); border-radius:12px; background:var(--pill); min-width:0; overflow:hidden; }
.tasks-heading { display:flex; gap:9px; align-items:center; width:100%; min-height:32px; padding:5px 10px; font-size:12px; }
.tasks-heading span { color:var(--muted); flex:1; text-align:left; }
.tasks-heading[aria-expanded="true"] > :last-child { transform:rotate(90deg); }
.tasks-list { display:grid; max-height:min(25dvh, 216px); overflow:auto; padding:0 4px 4px; }
.add-task { justify-self:start; margin:4px 5px 1px; }
</style>
