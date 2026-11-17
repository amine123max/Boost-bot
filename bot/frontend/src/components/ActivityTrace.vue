<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { Activity } from '../types';
import type { TaskNode, TaskNodeReference } from '../../../shared/task-nodes';
import { api, enc } from '../api';
import { useTaskNodes } from '../lib/use-task-nodes';
import TaskStepStatus from './TaskStepStatus.vue';
import ExecutionRecords from './ExecutionRecords.vue';
import HelpTip from './HelpTip.vue';
import Icon from './Icon.vue';
const props = withDefaults(defineProps<{ steps?: Activity[]; count?: number; conversationId?: string; messageId?: number | string; turnId?: string; runId?: string; taskId?: string; ruleId?: string; running?: boolean; startedAt?: number; initialOpen?: boolean; active?: boolean; embedded?: boolean }>(), { active: true });
const history = ref<Activity[]>([]), historyLoading = ref(false), historyError = ref(''), fetched = ref(false);
const opened = ref(!!props.running || !!props.initialOpen), expanded = ref(false);
let controller: AbortController | undefined;
const entries = computed(() => props.steps || history.value);
const observedAt = Date.now(), now = ref(observedAt);
const elapsed = computed(() => Math.max(0, Math.floor((now.value - (props.startedAt || entries.value[0]?.at || observedAt)) / 1000)));
let clock: ReturnType<typeof setInterval> | undefined;
watch(() => [props.running, props.startedAt, props.active, props.embedded], () => {
  clearInterval(clock); clock = undefined; now.value = Date.now();
  if (props.running && props.active && !props.embedded) clock = setInterval(() => { now.value = Date.now(); }, 1000);
}, { immediate: true });
const reference = computed<TaskNodeReference | null>(() => props.runId ? { runId: props.runId } : props.taskId ? { taskId: props.taskId } : props.ruleId ? { ruleId: props.ruleId } : props.conversationId
  ? { conversationId: props.conversationId, ...(typeof props.messageId === 'number' ? { messageId: props.messageId } : props.turnId ? { turnId: props.turnId } : {}) } : null);
const fingerprint = computed(() => `${props.running}:${entries.value.map(step => step.id + ':' + step.status).join('|')}`);
const enabled = computed(() => props.active !== false && !!reference.value && (props.embedded || opened.value || !!props.running) && (props.steps !== undefined || fetched.value));
const { nodes, loading, error, stale, refresh } = useTaskNodes(reference, fingerprint, enabled);
const shown = computed(() => expanded.value ? nodes.value : nodes.value.slice(0, 5));
const nodeSteps = (node: TaskNode) => entries.value.filter(step => node.stepIds.includes(step.id));
const parentSteps = (node: TaskNode) => { const childIds = new Set(node.children?.flatMap(child => child.stepIds)); return nodeSteps(node).filter(step => !childIds.has(step.id)); };
const unassigned = computed(() => {
  const assigned = new Set(nodes.value.flatMap(node => node.stepIds));
  return entries.value.filter(step => !assigned.has(step.id));
});
const labels = { pending: '待处理', working: '进行中', done: '已完成', failed: '未完成' };
async function load() {
  if (!opened.value || props.steps !== undefined || fetched.value || historyLoading.value || !props.conversationId || typeof props.messageId !== 'number') return;
  const ac = new AbortController(); controller = ac; historyLoading.value = true; historyError.value = '';
  try {
    const result = await api<{ steps: Activity[] }>(`/conversations/${enc(props.conversationId)}/messages/${props.messageId}/activity`, { signal: ac.signal });
    if (!ac.signal.aborted) { history.value = result.steps; fetched.value = true; }
  } catch (e) { if (!ac.signal.aborted) historyError.value = (e as Error).message; }
  finally { if (controller === ac) { controller = undefined; historyLoading.value = false; } }
}
function toggle(event: Event) { if (event.target !== event.currentTarget) return; opened.value = (event.target as HTMLDetailsElement).open; if (opened.value) void load(); }
watch(() => JSON.stringify(reference.value), () => { controller?.abort(); controller = undefined; history.value = []; fetched.value = false; historyLoading.value = false; historyError.value = ''; expanded.value = false; void load(); });
onBeforeUnmount(() => { controller?.abort(); clearInterval(clock); });
</script>
<template>
  <component :is="embedded ? 'div' : 'details'" class="activity-trace" :class="{ 'trace-embedded': embedded }" :open="embedded ? undefined : opened" @toggle="toggle">
    <summary v-if="!embedded" class="trace-toggle"><Icon name="chevron" :size="14" /><span>{{ running ? `已处理 ${elapsed} 秒` : '已完成' }}</span><HelpTip text="按任务目标归纳大小节点。百分比为归入节点的记录完成比，未知进度留空；展开查看执行明细。" /></summary>
    <div class="trace-content">
      <p v-if="loading && !nodes.length || stale" class="trace-note" role="status">{{ loading && !nodes.length ? '正在整理任务进度…' : '进度待更新' }}</p>
      <p v-if="historyLoading" class="trace-note" role="status">正在加载执行记录…</p>
      <p v-if="historyError || error" class="trace-note" role="status">{{ historyError || error }}<button type="button" class="retry-analysis" :disabled="loading" @click="historyError ? load() : refresh()">重试</button></p>
      <ol v-if="nodes.length" class="trace-nodes">
        <li v-for="node in shown" :key="node.id">
          <component :is="!embedded || node.children?.length ? 'details' : 'div'" class="task-node" :data-state="node.state">
            <component :is="!embedded || node.children?.length ? 'summary' : 'div'" class="node-row"><TaskStepStatus :state="node.state" /><span class="node-title">{{ node.title }}</span><span class="node-progress">{{ node.progress === null ? labels[node.state] : `${node.progress}%` }}</span><span class="sr-only">{{ labels[node.state] }}</span><Icon v-if="!embedded || node.children?.length" name="chevron" :size="12" /></component>
            <div v-if="!embedded || node.children?.length" class="node-body">
              <p v-if="!embedded && node.detail" class="trace-note">{{ node.detail }}</p>
              <ol v-if="node.children?.length" class="trace-nodes">
                <li v-for="child in node.children" :key="child.id"><component :is="embedded ? 'div' : 'details'" class="task-node subnode" :data-state="child.state">
                  <component :is="embedded ? 'div' : 'summary'" class="node-row"><TaskStepStatus :state="child.state" /><span class="node-title">{{ child.title }}</span><span class="node-progress">{{ child.progress === null ? labels[child.state] : `${child.progress}%` }}</span><span class="sr-only">{{ labels[child.state] }}</span><Icon v-if="!embedded" name="chevron" :size="11" /></component>
                  <div v-if="!embedded" class="node-body"><p v-if="child.detail" class="trace-note">{{ child.detail }}</p><ExecutionRecords v-if="nodeSteps(child).length" :steps="nodeSteps(child)" /><p v-else class="trace-note">{{ child.state === 'pending' ? '尚未开始' : '结果见本轮回复' }}</p></div>
                </component></li>
              </ol>
              <template v-if="!embedded"><ExecutionRecords v-if="parentSteps(node).length" :steps="parentSteps(node)" /><p v-else-if="!node.children?.length" class="trace-note">{{ node.state === 'pending' ? '尚未开始' : '结果见本轮回复' }}</p></template>
            </div>
          </component>
        </li>
      </ol>
      <p v-else-if="!loading && !error && !historyLoading" class="trace-note">{{ reference ? '等待任务记录' : '当前记录暂不支持节点分析' }}</p>
      <button v-if="nodes.length > 5" type="button" class="trace-expand" :aria-expanded="expanded" @click="expanded = !expanded"><Icon name="more" :size="13" />{{ expanded ? '收起' : '展开全部' }}</button>
      <details v-if="!embedded && unassigned.length && !historyLoading" class="other-records"><summary>其他执行明细<Icon name="chevron" :size="11" /></summary><ExecutionRecords :steps="unassigned" /></details>
    </div>
  </component>
</template>
<style scoped>
.activity-trace { color:var(--muted); font-size:12px; margin:8px 0; }
.trace-embedded { margin:0; }
.trace-embedded .trace-content { padding:0; }
.trace-toggle { list-style:none; display:flex; align-items:center; gap:7px; cursor:pointer; padding:7px 0; border-bottom:1px solid var(--line-2); }
summary::-webkit-details-marker { display:none; }
.activity-trace[open] > .trace-toggle > :first-child, .task-node[open] > summary > :last-child, .other-records[open] > summary > :last-child { transform:rotate(90deg); }
.trace-content { padding:5px 0; }
.trace-nodes { list-style:none; padding:0; margin:0; display:grid; gap:3px; }
.node-row { display:flex; align-items:center; gap:8px; min-height:30px; padding:2px 0; list-style:none; }
summary.node-row { cursor:pointer; }
.node-title { flex:1; min-width:0; color:var(--fg-2); line-height:1.5; overflow-wrap:anywhere; }
.task-node[data-state="done"] .node-title { color:var(--muted); }
.node-progress { font-size:11px; font-variant-numeric:tabular-nums; white-space:nowrap; }
.node-body { margin:2px 0 7px 22px; padding-left:10px; border-left:1px solid var(--line-2); }
.trace-note { font-size:11px; line-height:1.6; margin:5px 0; overflow-wrap:anywhere; }
.trace-expand, .retry-analysis { display:inline-flex; align-items:center; gap:5px; font-size:11px; color:var(--muted); padding:3px 0; }
.retry-analysis { margin-left:8px; }
.other-records { margin-top:7px; }
.other-records > summary { display:flex; align-items:center; gap:6px; padding:4px 0; font-size:11px; list-style:none; cursor:pointer; }
.sr-only { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); }
</style>
