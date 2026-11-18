<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { api, enc } from '../api';
import type { Activity, LiveTurn, Message } from '../types';
import Markdown from './Markdown.vue';
import MessageBubble from './MessageBubble.vue';
import ConversationProgress from './ConversationProgress.vue';
import TurnFileChanges from './TurnFileChanges.vue';

const props = defineProps<{
  message?: Message; live?: LiveTurn; conversationId?: string; running?: boolean;
  stopping?: boolean; recovering?: boolean; eager?: boolean; framed?: boolean;
}>();
const history = ref<Activity[] | null>(null), failed = ref(false), loading = ref(false), now = ref(Date.now());
let request: AbortController | undefined, clock: ReturnType<typeof setInterval> | undefined;
const started = computed(() => props.live?.startedAt ?? props.live?.steps?.[0]?.at);
const elapsed = computed(() => {
  const ms = props.live ? started.value == null ? undefined : now.value - started.value : props.message?.elapsedMs;
  if (ms == null) return '';
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return seconds >= 60 ? `已处理 ${Math.floor(seconds / 60)} 分钟 ${seconds % 60} 秒` : `已处理 ${seconds} 秒`;
});
const later = computed(() => !!props.message?.hasExecution && history.value == null);
const interim = computed(() => props.live?.interim ?? props.message?.interim ?? []);
const sections = computed(() => {
  const last = interim.value.length + 1;
  const groups = Array.from({ length: last + 1 }, () => [] as Activity[]);
  const completed: Activity[] = [];
  const anchors = new Set<number>();
  for (const step of props.live?.steps ?? history.value ?? []) {
    if (!['tool', 'job', 'subagent'].includes(step.kind || '')) continue;
    const index = step.section == null ? last : Math.max(0, Math.min(interim.value.length, step.section));
    if (props.running && step.status === 'running') groups[index].push(step);
    else { completed.push(step); anchors.add(index); }
  }
  // Keep one disclosure for the entire assistant turn, below its first
  // related narration; live operations can still appear by their current text.
  const anchor = [...interim.value.map((_, index) => index + 1), 0, last].find(index => anchors.has(index));
  if (anchor !== undefined) groups[anchor].push(...completed);
  return groups;
});
const tail = computed(() => sections.value.at(-1) ?? []);
const fileSteps = computed(() => (props.live?.steps ?? history.value ?? []).filter(step => step.fileChange));
const text = computed(() => props.live?.text ?? props.message?.content ?? '');

async function load() {
  const id = props.message?.id, conv = props.message?.conversationId || props.conversationId;
  if (typeof id !== 'number' || !conv || !later.value || loading.value) return;
  const controller = new AbortController();
  request = controller;
  loading.value = true;
  failed.value = false;
  try {
    const data = await api<{ steps: Activity[] }>(`/conversations/${enc(conv)}/messages/${id}/activity?summary=1&changes=1`, { signal: controller.signal });
    if (!controller.signal.aborted) history.value = data.steps;
  } catch { if (!controller.signal.aborted) failed.value = true; }
  finally { if (request === controller) loading.value = false; }
}
watch(() => [props.message?.id, props.conversationId], () => {
  request?.abort(); request = undefined; history.value = null; loading.value = false; failed.value = false;
  if (props.eager) void load();
});
watch(() => [props.eager, props.message?.hasExecution], () => { if (props.eager) void load(); }, { immediate: true });
watch(() => [props.running, started.value], () => {
  clearInterval(clock);
  now.value = Date.now();
  if (props.running && started.value != null) clock = setInterval(() => { now.value = Date.now(); }, 1000);
}, { immediate: true });
onBeforeUnmount(() => { clearInterval(clock); request?.abort(); });
</script>

<template>
  <div class="turn-transcript">
    <div v-if="elapsed" class="turn-elapsed">{{ elapsed }}</div>
    <template v-for="(part, index) in interim" :key="index">
      <Markdown :text="part" />
      <ConversationProgress :steps="sections[index + 1] ?? []" :running="running" />
    </template>
    <MessageBubble v-if="text" :text="text" :created-at="message?.createdAt" :role="message?.role" :framed="framed" :streaming="!!live" />
    <ConversationProgress :steps="sections[0] ?? []" :running="running" />
    <ConversationProgress :steps="tail" :running="running" />
    <TurnFileChanges :steps="fileSteps" :running="!!live && !!running" />
    <slot />
    <p v-if="live && (stopping || !text && !interim.length && !live.steps?.some(step => ['tool', 'job', 'subagent'].includes(step.kind || '')))" class="turn-status" role="status">
      {{ stopping ? '正在结束当前处理…' : recovering ? '正在同步回复…' : '正在准备回复…' }}
    </p>
    <button v-if="later" class="load-steps" type="button" :disabled="loading" @click="load">
      {{ loading ? '正在读取执行记录…' : failed ? '重试读取执行记录' : '查看执行记录' }}
    </button>
  </div>
</template>

<style scoped>
.turn-transcript { min-width:0; font-size:var(--chat-text-size,var(--fs-lg)); }
.turn-elapsed { color:var(--muted); font-size:var(--fs-xs); padding:4px 0 7px; margin-bottom:7px; border-bottom:1px solid var(--line); font-variant-numeric:tabular-nums; }
.turn-status, .load-steps { color:var(--muted); font-size:var(--fs-xs); margin:5px 0; }
.load-steps { padding:3px 0; }
.load-steps:hover { color:var(--fg); }
</style>
