<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { Bot, Task } from '../types';
import { api, enc } from '../api';
import Icon from './Icon.vue';
import HelpTip from './HelpTip.vue';
import Modal from './Modal.vue';
import SelectControl from './SelectControl.vue';
import PanelSection from './PanelSection.vue';
import BackgroundTaskItem from './BackgroundTaskItem.vue';
import { backgroundWork, type BackgroundRule } from '../lib/background-work';
import { useTaskTitles } from '../composables/useTaskTitles';
const props = defineProps<{ bot: Bot; configure: boolean }>();
const emit = defineEmits<{ open: [task: Task]; saved: [] }>();
const tasks = ref<Task[]>([]), error = ref(''), busy = ref(false), loaded = ref(false), expanded = ref(false);
const rules = ref<BackgroundRule[]>([]);
const panelOpen = ref(false);
const creating = ref(false), formError = ref(''), title = ref(''), brief = ref(''), budget = ref(1), requestId = ref('');
const paused = ref(props.bot.settings.paused), slots = ref(String(props.bot.settings.taskSlots));
const sorted = computed(() => backgroundWork(tasks.value, rules.value));
const visible = computed(() => expanded.value ? sorted.value : sorted.value.slice(0,4));
const titles = useTaskTitles(() => visible.value, () => JSON.stringify([props.bot.settings.modelSource, props.bot.settings.utilityModel, props.bot.defaultModel, props.bot.settings.modelProtocol, props.bot.settings.modelStreaming]), () => panelOpen.value && props.configure);
let generation = 0, timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined, disposed = false;
async function load() {
  clearTimeout(timer); controller?.abort();
  const ticket = ++generation, abort = new AbortController(); controller = abort;
  try {
    if (document.hidden) return;
    const results = await Promise.allSettled([
      api<{ tasks: Task[] }>(`/tasks?bot=${enc(props.bot.id)}&limit=100`, { signal: abort.signal }),
      props.configure ? api<{ rules: BackgroundRule[] }>(`/rules?bot=${enc(props.bot.id)}`, { signal: abort.signal }) : Promise.resolve({ rules: [] as BackgroundRule[] }),
    ]);
    if (ticket === generation && !disposed) {
      if (results[0].status === 'fulfilled' && JSON.stringify(tasks.value) !== JSON.stringify(results[0].value.tasks)) tasks.value = results[0].value.tasks;
      if (results[1].status === 'fulfilled' && JSON.stringify(rules.value) !== JSON.stringify(results[1].value.rules)) rules.value = results[1].value.rules;
      loaded.value = true;
      error.value = results.flatMap(result => result.status === 'rejected' ? [(result.reason as Error).message] : []).join('；');
    }
  } catch (e) { if (!abort.signal.aborted && !disposed) error.value = (e as Error).message; }
  finally { if (ticket === generation && !disposed) timer = setTimeout(load, 2000); }
}
async function settings(patch: { paused?: boolean; taskSlots?: number }) {
  if (busy.value || !props.configure) return;
  busy.value = true; error.value = '';
  try {
    const result = await api<{ settings: Bot['settings'] }>(`/bots/${enc(props.bot.id)}/settings`, { method: 'PUT', body: patch });
    if (!disposed) { paused.value = result.settings.paused; slots.value = String(result.settings.taskSlots); emit('saved'); await load(); }
  } catch (e) { if (!disposed) error.value = (e as Error).message; }
  finally { busy.value = false; }
}
function create() { title.value=''; brief.value=''; budget.value=1; requestId.value=crypto.randomUUID(); formError.value=''; creating.value=true; }
async function submit() {
  if (busy.value) return;
  busy.value=true; formError.value='';
  try {
    await api(`/bots/${enc(props.bot.id)}/tasks`, { method:'POST', body:{ title:title.value, brief:brief.value, budgetUsd:budget.value, requestId:requestId.value } });
    if (!disposed) { creating.value=false; await load(); }
  } catch(e) { if (!disposed) formError.value=(e as Error).message; }
  finally { busy.value=false; }
}
watch(() => [props.bot.settings.paused, props.bot.settings.taskSlots], () => { paused.value=props.bot.settings.paused; slots.value=String(props.bot.settings.taskSlots); });
watch(() => props.bot.id, () => { tasks.value=[]; rules.value=[]; loaded.value=false; expanded.value=false; creating.value=false; void load(); }, { immediate:true });
onBeforeUnmount(() => { disposed=true; generation++; controller?.abort(); clearTimeout(timer); });
</script>
<template>
  <PanelSection class="background-tasks" title="后台任务" @toggle="panelOpen = $event" help="普通任务与定时任务统一展示。展开后只显示该任务的大小节点与实际进度。悬浮标题查看原名，悬浮状态查看失败原因；定时任务显示最近一次结果。暂停后不启动新任务，正在运行的继续完成。">
    <template #actions><button v-if="configure" class="icon-btn task-create" aria-label="新建后台任务" :disabled="busy" @click="create"><Icon name="plus" :size="14" /></button></template>
    <div v-if="configure" class="background-controls">
      <button role="switch" :aria-checked="!paused" aria-label="启用后台任务" :disabled="busy" class="background-toggle" :class="{ enabled: !paused }" @click="settings({paused:!paused})">{{ paused ? '启用' : '已启用' }}</button>
      <span class="background-concurrency"><SelectControl :model-value="slots" :options="Array.from({length:8},(_,i)=>({value:String(i+1),label:(i+1)+'项并发'}))" label="并行后台任务数" :disabled="busy" @update:model-value="settings({taskSlots:Number($event)})" /><HelpTip text="当前智能体允许1–8项并行任务，所有智能体共享宿主的全局执行名额，超出上限的任务自动排队。" label="后台任务并发说明" /></span>
    </div>
    <p v-if="error" class="notice" role="alert">{{ error }}<button @click="load">重试</button></p>
    <div class="background-task-list">
      <BackgroundTaskItem v-for="work in visible" :key="work.key" :work="work" :title="titles.title(work)" :active="panelOpen" />
      <p v-if="loaded && !sorted.length && !error" class="task-empty">暂无后台任务</p>
      <p v-else-if="!loaded && !error" class="task-empty" role="status">正在读取任务…</p>
    </div>
    <button v-if="sorted.length>4" class="more-tasks" :aria-expanded="expanded" @click="expanded=!expanded">{{ expanded ? '收起' : '还有 '+(sorted.length-4)+' 项' }}</button>
  </PanelSection>
  <Modal v-if="creating" compact :busy="busy" title="新建后台任务" @close="creating=false"><form class="editor-form" @submit.prevent="submit">
    <p v-if="formError" class="error-banner" role="alert">{{ formError }}</p>
    <p v-if="paused" class="hint">后台任务已暂停，新任务会排队等待启用。</p>
    <label>任务名称<input v-model="title" required maxlength="40" autocomplete="off" /></label>
    <label>执行要求<textarea v-model="brief" required maxlength="1500" rows="4" /></label>
    <label><span>预算上限（美元）<HelpTip text="达到预算后任务暂停并等待你决定是否追加，默认1美元。" /></span><input v-model.number="budget" type="number" min="0.01" max="100" step="0.01" required /></label>
    <footer class="dialog-actions"><button data-dialog-close type="button" class="quiet-button" :disabled="busy">取消</button><button type="submit" class="primary-button" :disabled="busy">{{ busy?'创建中…':'创建任务' }}</button></footer>
  </form></Modal>
</template>
<style scoped>
.task-create { margin-left:auto; color:var(--muted); font-size:12px; }
.background-controls { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:3px 8px 9px; }
.background-toggle { font-size:11px; color:var(--muted); border-radius:5px; padding:3px 7px; }
.background-toggle.enabled { color:var(--green); background:var(--green-soft); }
.background-concurrency { display:flex; align-items:center; gap:3px; }
.background-concurrency :deep(.select-trigger) { min-height:25px; padding:2px 6px; font-size:11px; border:0; background:transparent; }
.background-task-list { display:grid; gap:5px; }
.task-empty { margin:0; padding:8px; color:var(--muted); font-size:12px; }
.more-tasks { margin:6px 8px 0; color:var(--muted); font-size:11px; }
</style>
