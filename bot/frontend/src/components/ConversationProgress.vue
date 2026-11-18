<script setup lang="ts">
import { computed } from 'vue';
import type { Activity } from '../types';
import Icon from './Icon.vue';
import TurnFileChanges from './TurnFileChanges.vue';
import { vDisclosurePlacement } from '../lib/disclosure-placement';

const props = defineProps<{ steps: Activity[]; running?: boolean }>();
const work = computed(() => props.steps.filter(step => ['tool', 'job', 'subagent'].includes(step.kind || '')));
const active = computed(() => props.running ? work.value.filter(step => step.status === 'running') : []);
const done = computed(() => work.value.filter(step => !active.value.includes(step)));
const auxiliary = computed(() => done.value.filter(step => !step.fileChange));

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
</script>

<template>
  <div v-if="work.length" class="execution-trail" aria-label="本轮执行">
    <div v-for="step in active" :key="step.id" class="execution-row is-running">
      <Icon :name="stepIcon(step)" :size="16" /><span>{{ activeLabel(step) }}</span>
    </div>
    <details v-if="done.length" v-disclosure-placement data-expand-mode="down" class="done-steps">
      <summary class="execution-row" :title="`${done.length} 项操作`"><Icon :name="groupIcon" :size="16" /><span>{{ groupLabel }}</span><Icon name="chevron" :size="12" /></summary>
      <div class="execution-content">
      <TurnFileChanges v-if="!running" :steps="done" inline />
      <ul v-if="auxiliary.length">
        <li v-for="step in auxiliary" :key="step.id">
          <details v-if="step.commandPreview" v-disclosure-placement data-expand-mode="down" class="shell-detail">
            <summary class="execution-row">
              <Icon name="terminal" :size="16" />
              <span>{{ step.status === 'ok' && !step.cut ? '已运行命令' : '命令未完成' }}</span><Icon name="chevron" :size="12" />
            </summary>
            <div class="shell-output">
              <div>Shell</div>
              <pre tabindex="0"><code>{{ '$ ' + step.commandPreview }}<template v-if="step.shellOutput">{{ '\n' + step.shellOutput }}</template></code></pre>
              <div class="shell-result"><Icon :name="step.status === 'ok' && !step.cut ? 'check' : 'info'" :size="13" />{{ step.status === 'ok' && !step.cut ? '成功' : '未完成' }}</div>
            </div>
          </details>
          <div v-else class="execution-row">
            <Icon :name="stepIcon(step)" :size="14" />
            <span>{{ step.status === 'ok' && !step.cut ? '已执行' : '未完成' }}</span>
            <code v-if="stepIcon(step) === 'terminal'" class="shell-label">{{ action(step) }}</code>
            <span v-else>{{ action(step) }}</span>
          </div>
        </li>
      </ul>
      </div>
    </details>
  </div>
</template>

<style scoped>
.execution-trail { color:var(--muted); font-size:var(--chat-text-size,var(--fs-lg)); margin:5px 0 12px; }
.execution-row { display:flex; align-items:center; gap:8px; min-width:0; min-height:25px; padding:2px 0; }
.execution-row span { min-width:0; overflow-wrap:anywhere; }
.execution-row svg, .execution-row small { flex:none; }
.execution-row small { margin-inline-start:auto; font-variant-numeric:tabular-nums; }
.is-running { color:var(--fg-2); }
summary { list-style:none; cursor:pointer; width:fit-content; }
summary::-webkit-details-marker { display:none; }
details[open] > summary > svg:last-child { transform:rotate(90deg); }
summary:hover { color:var(--fg); background:transparent; }
summary:focus:not(:focus-visible) { outline:none; }
.done-steps[open] { display:flex; flex-direction:column; }
.execution-content { max-height:var(--disclosure-space, 260px); overflow:auto; scrollbar-width:thin; }
.shell-label { color:var(--muted); font-size:inherit; }
.shell-detail summary:hover .shell-label { color:var(--fg); }
.shell-detail summary { width:auto; }
.shell-detail[open] { display:flex; flex-direction:column; }
.shell-output { margin:3px 0 6px; padding:8px 10px; border:1px solid var(--line); border-radius:10px; background:var(--pill); overflow:auto; max-height:min(230px,var(--disclosure-space,230px)); }
.shell-output pre { margin:8px 0; overflow:auto; max-height:150px; line-height:1.55; scrollbar-width:thin; }
.shell-result { display:flex; align-items:center; justify-content:flex-end; gap:5px; }
ul { list-style:none; margin:3px 0 0; padding:0; max-height:240px; overflow:auto; }
li::marker { content:''; }
</style>
