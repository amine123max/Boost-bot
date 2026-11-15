<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue';
import type { Approval } from '../types';
import { api, enc } from '../api';
import PanelSection from './PanelSection.vue';
import Markdown from './Markdown.vue';
const props = defineProps<{ botId: string; configure: boolean; pending: Approval[] }>();
const emit = defineEmits<{ changed: [] }>();
const items = ref<Approval[]>([]), error = ref(''), acting = ref('');
const answers = reactive<Record<string,string>>({});
let generation = 0, disposed = false, controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  clearTimeout(timer); controller?.abort();
  const ticket = ++generation, request = new AbortController(); controller = request;
  try {
    if (document.hidden) return;
    const result = await api<{ approvals: Approval[] }>(`/approvals?bot=${enc(props.botId)}&status=pending`, { signal: request.signal });
    if (!disposed && ticket === generation) { items.value = result.approvals; error.value = ''; }
  } catch (e) { if (!disposed && !request.signal.aborted) error.value = (e as Error).message; }
  finally { if (!disposed && ticket === generation) timer = setTimeout(load, 3000); }
}
async function decide(item: Approval, action: 'approve' | 'deny' | 'answer') {
  if (!props.configure || acting.value) return;
  acting.value = item.id; error.value = '';
  try {
    await api(`/approvals/${enc(item.id)}/${action}`, { method: 'POST', body: action === 'answer' ? { text: answers[item.id] || '' } : {} });
    if (!disposed) { delete answers[item.id]; await load(); emit('changed'); }
  } catch(e) { if (!disposed) error.value = (e as Error).message; }
  finally { acting.value = ''; }
}
watch(() => props.botId, () => { items.value = props.pending; for (const key of Object.keys(answers)) delete answers[key]; void load(); }, { immediate: true });
onBeforeUnmount(() => { disposed = true; generation++; controller?.abort(); clearTimeout(timer); });
</script>
<template>
  <PanelSection title="待审批" :badge="items.length" help="在此处理当前智能体的授权和提问，包含网页、消息渠道与后台任务；允许或拒绝只作用于当前请求。">
    <p v-if="error" class="notice" role="alert">{{ error }}<button @click="load">重试</button></p>
    <article v-for="item in items" :key="item.id" class="panel-approval">
      <h4>{{ item.kind === 'question' ? '需要你的回答' : item.tool || '需要你的授权' }}</h4>
      <Markdown :text="item.prompt || item.summary || item.title || item.detail || ''" />
      <p v-if="item.reason" class="hint">{{ item.reason }}</p>
      <div v-for="(question,index) in item.questions" :key="index"><p>{{ question.question }}</p><p v-if="question.options?.length" class="hint">{{ question.options.map(option => option.label).join(' / ') }}</p></div>
      <template v-if="configure"><form v-if="item.kind === 'question'" @submit.prevent="decide(item, 'answer')"><label>回答<textarea v-model="answers[item.id]" rows="2" required /></label><button class="quiet-button" :disabled="!!acting || !answers[item.id]?.trim()">提交回答</button></form><div v-else class="panel-approval-actions"><button class="primary-button" :disabled="!!acting" @click="decide(item, 'approve')">允许</button><button class="quiet-button" :disabled="!!acting" @click="decide(item, 'deny')">拒绝</button></div></template>
      <p v-else class="hint">请联系管理员处理此请求。</p>
    </article>
    <p v-if="!items.length && !error" class="panel-approval-empty">没有待处理的审批</p>
  </PanelSection>
</template>
<style scoped>
.panel-approval { padding:8px; font-size:12px; overflow-wrap:anywhere; }
.panel-approval+.panel-approval { border-top:1px solid var(--line); }
.panel-approval h4 { margin:0 0 7px; font-size:12px; font-weight:550; }
.panel-approval label { display:grid; gap:6px; margin-bottom:8px; }
.panel-approval textarea { min-width:0; width:100%; padding:7px 9px; border-radius:7px; border:1px solid var(--line); color:var(--fg); background:var(--well); }
.panel-approval-actions { display:flex; gap:7px; margin-top:8px; }
.panel-approval-empty { margin:0; padding:8px; font-size:12px; color:var(--muted); }
</style>
