<script setup lang="ts">
import { computed, ref, useId } from 'vue';
import type { Activity } from '../types';
import Icon from './Icon.vue';
import TurnFileChanges from './TurnFileChanges.vue';
import ExecutionShell from './ExecutionShell.vue';
import SpringDisclosure from './SpringDisclosure.vue';

const props = defineProps<{ steps: Activity[]; running?: boolean; now?:number }>();
const work = computed(() => props.steps.filter(step => ['tool', 'job', 'subagent'].includes(step.kind || '')));
const active = computed(() => props.running ? work.value.filter(step => step.status === 'running') : []);
const done = computed(() => work.value.filter(step => !active.value.includes(step)));
const auxiliary = computed(() => done.value.filter(step => !step.fileChange));
const expanded = ref(false);
const panelId = useId();

function action(step: Activity) {
  if (step.kind === 'job') return '后台工作';
  if (step.kind === 'subagent') return '协作任务';
  const tool = step.title || '';
  if (/^(?:powershell|pwsh)$/i.test(tool)) return 'PowerShell';
  if (/^(?:bash|shell|terminal|exec|run_command)$/i.test(tool)) return '终端命令';
  if (/^(?:read|list|glob)/.test(tool)) return '读取文件';
  if (/^(?:search|grep|web_search|fetch)/.test(tool)) return '查找资料';
  if (/^(?:write|edit|apply_patch)$/.test(tool)) return '修改文件';
  return tool && tool !== 'tool' ? tool : '工具操作';
}
function stepIcon(step: Activity) {
  if (/^(?:bash|shell|terminal|exec|run_command|pwsh|powershell)$/i.test(step.title || '')) return 'terminal';
  if (/^(?:read|write|edit|apply_patch|create|remove|delete|update|list|find|search|grep|glob|fetch|query)(?:$|[_-])/.test(step.title || '')) return 'edit';
  return step.kind === 'subagent' ? 'team' : 'activity';
}
const groupIcon = computed(() => done.value.some(step => stepIcon(step) === 'edit') ? 'edit' : done.value[0] ? stepIcon(done.value[0]) : 'activity');
const groupLabel = computed(() => {
  const completed = done.value.filter(step => step.status === 'ok' && !step.cut);
  const edited = completed.some(step => step.fileChange || /^(?:write|edit|apply_patch|create|remove|delete|update)(?:$|[_-])/i.test(step.title || ''));
  const ran = completed.some(step => stepIcon(step) === 'terminal');
  const read = completed.some(step => stepIcon(step) === 'edit');
  const labels = [edited ? '编辑了文件' : !ran && read ? '查询了资料' : '', ran ? '运行了命令' : ''].filter(Boolean);
  if (labels.length && completed.length < done.value.length) labels.push('有操作未完成');
  if (edited && !ran && labels.length === 1) return '已编辑的文件';
  return labels.join('、') || (active.value.length ? '正在处理' : '执行了操作');
});
function activeLabel(step: Activity) {
  if (stepIcon(step) === 'terminal') return '正在运行命令';
  if (stepIcon(step) === 'edit') return action(step) === '修改文件' ? '正在编辑文件' : `正在${action(step)}`;
  return `正在运行${action(step)}`;
}
function runningTime(step: Activity) {
  if (!props.now || typeof step.at !== 'number' || !Number.isFinite(step.at)) return '';
  const seconds = Math.max(0, Math.floor((props.now - step.at) / 1000));
  return seconds < 60 ? `${seconds}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : `${Math.floor(seconds / 3600)}h ${Math.floor(seconds / 60) % 60}m`;
}
</script>

<template>
  <div v-if="work.length" class="execution-trail" aria-label="本轮执行">
    <div v-for="step in active" :key="step.id" class="execution-row is-running">
      <Icon :name="stepIcon(step)" :size="16" /><span>{{ activeLabel(step) }}</span>
      <span v-if="stepIcon(step) === 'terminal'" class="command-elapsed">{{ runningTime(step) }}</span>
    </div>
    <div v-if="done.length" class="done-steps">
      <button type="button" class="execution-row" :aria-expanded="expanded" :aria-controls="panelId" @click="expanded = !expanded"><Icon :name="groupIcon" :size="16" /><span>{{ groupLabel }}</span><Icon name="chevron" :size="12" class="execution-chevron" /></button>
      <SpringDisclosure :id="panelId" :open="expanded">
      <TurnFileChanges v-if="!running" :steps="done" inline />
      <ul v-if="auxiliary.length">
        <li v-for="step in auxiliary" :key="step.id">
          <ExecutionShell v-if="step.commandPreview" :command="step.commandPreview" :output="step.shellOutput" :success="step.status === 'ok' && !step.cut" />
          <div v-else class="execution-row">
            <Icon :name="stepIcon(step)" :size="14" />
            <span>{{ step.status === 'ok' && !step.cut ? '已执行' : '未完成' }}</span>
            <code v-if="stepIcon(step) === 'terminal'" class="shell-label">{{ action(step) }}</code>
            <span v-else>{{ action(step) }}</span>
          </div>
        </li>
      </ul>
      </SpringDisclosure>
    </div>
  </div>
</template>

<style scoped>
.execution-trail { color:var(--muted); font-size:var(--chat-text-size,var(--fs-lg)); margin:5px 0 12px; }
.execution-row { display:flex; align-items:center; gap:8px; min-width:0; min-height:25px; padding:2px 0; }
.execution-row span { min-width:0; overflow-wrap:anywhere; }
.execution-row svg, .execution-row small { flex:none; }
.execution-row small { margin-inline-start:auto; font-variant-numeric:tabular-nums; }
.is-running { color:var(--fg-2); }
.command-elapsed { color:var(--muted); font-variant-numeric:tabular-nums; white-space:nowrap; }
button.execution-row:hover { color:var(--fg); background:transparent; }
.execution-chevron { transition:transform 220ms ease-out; }
button[aria-expanded="true"] .execution-chevron { transform:rotate(90deg); }
.shell-label { color:var(--muted); font-size:inherit; }
ul { list-style:none; margin:3px 0 0; padding:0; }
li::marker { content:''; }
@media (prefers-reduced-motion:reduce) { .execution-chevron { transition:none; } }
</style>
