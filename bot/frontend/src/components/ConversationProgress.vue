<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';
import { api, enc } from '../api';
import type { Activity } from '../types';
import Icon from './Icon.vue';

const props = defineProps<{ steps?: Activity[]; count?: number; conversationId?: string; messageId?: number | string; running?: boolean }>();
const history = ref<Activity[]>([]), loaded = ref(false), loading = ref(false), failed = ref(false);
const controller = new AbortController();
const groups: Record<string, [string, string]> = {
  model: ['正在根据对话上下文组织回复', '已处理本轮模型请求'],
  read: ['正在查阅所需资料', '已查阅相关资料'],
  search: ['正在查找相关信息', '已完成本次检索'],
  write: ['正在整理交付内容', '已更新交付内容'],
  tool: ['正在执行本轮所需操作', '已完成本次操作'],
  subagent: ['正在协调其他智能体处理子任务', '已收到协作结果'],
  compact: ['正在整理较长的对话上下文', '已整理对话上下文'],
  job: ['正在等待后台工作结果', '已收到后台工作结果'],
  steer: ['正在处理你补充的要求', '已收到你补充的要求'],
};
const lines = computed(() => {
  const result: string[] = [];
  for (const step of props.steps ?? history.value) {
    const name = (step.title || '').toLowerCase();
    const kind = step.kind === 'tool' ? /^(read|list|glob)/.test(name) ? 'read'
      : /^(search|grep|web_search|fetch)/.test(name) ? 'search'
      : /^(write|edit|present)/.test(name) ? 'write' : 'tool' : step.kind;
    const group = kind ? groups[kind] : undefined;
    const line = step.kind === 'retry' ? '正在重试暂时未成功的请求'
      : step.status === 'error' || step.kind === 'error' ? '有一步未完成；若回复未能继续，请检查连接后重试。'
      : group?.[step.status === 'running' || step.cut ? 0 : 1];
    if (line && line !== result.at(-1)) result.push(line);
  }
  return result.slice(-8);
});
async function load(event: Event) {
  if (!(event.currentTarget as HTMLDetailsElement).open || props.steps || loaded.value || loading.value ||
    !props.conversationId || typeof props.messageId !== 'number') return;
  loading.value = true;
  failed.value = false;
  try {
    history.value = (await api<{ steps: Activity[] }>(
      `/conversations/${enc(props.conversationId)}/messages/${props.messageId}/activity?summary=1`,
      { signal: controller.signal },
    )).steps;
    loaded.value = true;
  } catch { if (!controller.signal.aborted) failed.value = true; }
  finally { loading.value = false; }
}
onBeforeUnmount(() => controller.abort());
</script>
<template>
  <details v-if="lines.length || (count && !loaded)" class="conversation-progress" @toggle="load">
    <summary><Icon name="chevron" :size="12" /><span>思考</span><small v-if="running && lines.length">{{ lines.at(-1) }}</small></summary>
    <p v-if="loading">正在读取本轮进展…</p>
    <p v-else-if="failed" role="status">暂时无法读取进展。收起后重新展开可重试。</p>
    <ul v-else><li v-for="(line, index) in lines" :key="index">{{ line }}</li></ul>
  </details>
</template>
<style scoped>
.conversation-progress { color:var(--muted); font-size:12px; margin-block:5px 8px; }
summary { display:flex; align-items:center; gap:7px; list-style:none; cursor:pointer; width:fit-content; max-width:100%; }
summary::-webkit-details-marker { display:none; }
details[open] summary > :first-child { transform:rotate(90deg); }
small { min-width:0; font-size:inherit; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
ul { margin:7px 0 3px 6px; border-inline-start:1px solid var(--line); padding-inline-start:22px; }
li, p { margin-block:4px; overflow-wrap:anywhere; }
</style>
