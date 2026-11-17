<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Activity } from '../types';
import { activityGroups } from '../lib/activity-groups';
import TaskStepStatus from './TaskStepStatus.vue';
import Markdown from './Markdown.vue';
import Icon from './Icon.vue';
const props = defineProps<{ steps: Activity[] }>();
const expanded = ref(false);
const groups = computed(() => activityGroups(props.steps));
const shown = computed(() => expanded.value ? groups.value : groups.value.slice(0, 5));
const state = (step: Activity) => step.status === 'ok' ? 'done' : step.status === 'error' ? 'failed' : step.status === 'running' ? 'working' : 'pending';
const duration = (ms?: number) => ms === undefined ? '' : ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} 秒`;
</script>
<template>
  <ol class="execution-records">
    <li v-for="group in shown" :key="group.step.id">
      <details>
        <summary><TaskStepStatus :state="state(group.step)" /><span>{{ group.step.title || group.step.label || '执行记录' }}</span><small>{{ duration(group.step.ms) }}</small><Icon name="chevron" :size="11" /></summary>
        <div class="record-body">
          <p v-if="group.step.summary">{{ group.step.summary }}</p>
          <template v-if="group.step.input"><h4>输入</h4><pre>{{ group.step.input }}</pre></template>
          <template v-if="group.step.output"><h4>结果</h4><Markdown :text="group.step.output" /></template>
          <p v-if="group.step.tokens">输入 {{ group.step.tokens.input ?? '—' }} · 输出 {{ group.step.tokens.output ?? '—' }} tokens</p>
          <ul v-if="group.events.length"><li v-for="event in group.events" :key="event.id"><TaskStepStatus :state="state(event)" /><span>{{ event.summary || event.output || event.title }}</span></li></ul>
          <p v-if="!group.step.input && !group.step.output && !group.step.summary">{{ group.step.status === 'running' ? '正在执行，等待结果…' : '未返回额外内容' }}</p>
        </div>
      </details>
    </li>
  </ol>
  <button v-if="groups.length > 5" type="button" class="records-more" :aria-expanded="expanded" @click="expanded = !expanded"><Icon name="more" :size="13" />{{ expanded ? '收起记录' : `还有 ${groups.length - 5} 条记录` }}</button>
</template>
<style scoped>
.execution-records { list-style:none; padding:0; margin:0; display:grid; gap:2px; }
summary { display:flex; align-items:center; gap:7px; min-height:28px; list-style:none; cursor:pointer; font-size:12px; }
summary::-webkit-details-marker { display:none; }
summary > span { flex:1; min-width:0; overflow-wrap:anywhere; }
summary small { font-size:10px; white-space:nowrap; }
details[open] > summary > :last-child { transform:rotate(90deg); }
.record-body { margin:3px 0 7px 20px; padding-left:10px; border-left:1px solid var(--line-2); font-size:11px; overflow-wrap:anywhere; }
.record-body p { margin:6px 0; white-space:pre-wrap; }
.record-body h4 { margin:6px 0 3px; font-size:11px; font-weight:500; }
.record-body pre { white-space:pre-wrap; overflow-wrap:anywhere; font:11px/1.6 var(--code); }
.record-body ul { list-style:none; padding:0; display:grid; gap:5px; }
.record-body li { display:flex; gap:6px; align-items:flex-start; }
.records-more { display:inline-flex; align-items:center; gap:5px; padding:3px 0; margin-top:4px; font-size:11px; color:var(--muted); }
</style>
