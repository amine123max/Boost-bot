<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { api, enc } from '../api';
import { HOVER_DELAY_MS } from '../lib/hover-delay';
import type { Message } from '../types';

const props = defineProps<{messages:Message[]; conversationId?:string; active?:string; lastVisible?:string}>();
const emit = defineEmits<{jump:[id:string]}>();
const summaries = ref(new Map<string, string>());
const retryAfter = new Map<string, number>();
const pending = new Set<string>();
const engaged = ref(false), selected = ref(''), pointer = ref(''), windowStart = ref(0);
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
let wheelDelta = 0;
let wheelingUntil = 0;
let request: AbortController | undefined;
const points = computed(() => {
  const list: {key:string; message:Message; reply?:Message}[] = [];
  for (const message of props.messages) {
    if (message.role === 'user' && message.content.trim()) list.push({key:String(message.id),message});
    else if (message.role === 'assistant' && !message.backgroundNotice && list.length) {
      const point=list[list.length-1];
      if (!point.message.conversationId || point.message.conversationId === message.conversationId) point.reply=message;
    }
  }
  return list;
});
type Point = (typeof points.value)[number];
const indexOf = (id?: string) => points.value.findIndex(point => point.key === id);
const start = computed(() => Math.max(0, indexOf(props.active)));
const end = computed(() => Math.max(start.value, indexOf(props.lastVisible)));
const selectedIndex = computed(() => indexOf(selected.value));
const focusIndex = computed(() => engaged.value && selectedIndex.value >= 0 ? selectedIndex.value : Math.round((start.value + end.value) / 2));
const windowSize = 32;
const offset = computed(() => {
  const limit = Math.max(0, points.value.length - windowSize);
  return Math.min(limit, engaged.value ? windowStart.value : Math.max(0, focusIndex.value - Math.floor(windowSize / 2)));
});
const visible = computed(() => points.value.slice(offset.value, offset.value + windowSize));
const point = computed(() => engaged.value && selectedIndex.value >= 0 ? points.value[selectedIndex.value] : undefined);
const pointerIndex = computed(() => indexOf(pointer.value));
const previewStyle = computed(() => ({
  top: ((selectedIndex.value - offset.value + .5) / Math.max(1, visible.value.length) * 100) + '%',
}));
const identity = (point:Point) => JSON.stringify([point.message.conversationId || props.conversationId,point.key,point.message.content,point.reply?.id,point.reply?.content]);
function excerpt(text: string, max: number) {
  const chars = Array.from(text.replace(/^\s*#+\s*/gm, '').replace(/\s+/g, ' ').trim());
  return chars.length > max ? chars.slice(0,max).join('') + '…' : chars.join('');
}
async function summarize(point:Point) {
  const conversation = point.message.conversationId || props.conversationId;
  const key=identity(point);
  if (!conversation || typeof point.message.id !== 'number' || pending.has(key) || summaries.value.has(key) || (retryAfter.get(key) ?? 0) > Date.now()) return;
  request?.abort();
  const controller = new AbortController(); request = controller;
  pending.add(key);
  try {
    const result=await api<{summary:string}>(`/conversations/${enc(conversation)}/messages/${point.message.id}/summary`, {
      method:'POST', signal:controller.signal, body:{replyId:typeof point.reply?.id === 'number' ? point.reply.id : undefined},
    });
    if (summaries.value.size >= 32) summaries.value.delete(summaries.value.keys().next().value!);
    summaries.value.set(key,result.summary);
  } catch {
    if (!controller.signal.aborted) {
      if (retryAfter.size >= 32) retryAfter.delete(retryAfter.keys().next().value!);
      retryAfter.set(key, Date.now() + 30_000);
    }
  } finally {
    pending.delete(key);
    if (request === controller) request = undefined;
  }
}
function enter(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return;
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    windowStart.value = offset.value;
    selected.value = points.value[pointerIndex.value >= 0 ? pointerIndex.value : focusIndex.value]?.key ?? '';
    engaged.value = true;
  }, HOVER_DELAY_MS);
}
function close() { clearTimeout(hoverTimer); engaged.value = false; }
function leave() {
  close();
  pointer.value = '';
  wheelDelta = 0;
}
function select(id: string) {
  pointer.value = id;
  if (engaged.value && performance.now() >= wheelingUntil) selected.value = id;
}
function wheel(event: WheelEvent) {
  if (!engaged.value || points.value.length < 2) return;
  event.preventDefault();
  const amount = event.deltaY || event.deltaX;
  wheelDelta += amount * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 160 : 1);
  const ticks = Math.trunc(wheelDelta / 38);
  if (!ticks) return;
  wheelDelta %= 38;
  const index = Math.min(points.value.length - 1, Math.max(0, selectedIndex.value + Math.sign(ticks)));
  if (index === selectedIndex.value) return;
  const id = points.value[index].key;
  selected.value = id;
  windowStart.value = Math.max(0, Math.min(points.value.length - windowSize, index - Math.floor(windowSize/2)));
  wheelingUntil = performance.now() + 240;
}
function click(id: string) { selected.value = id; emit('jump', id); }
function curve(index: number) {
  const y = visible.value.length === 1 ? 0 : 2 * index / (visible.value.length - 1) - 1;
  return Math.round(13 * (1 - y * y));
}
watch(() => point.value ? identity(point.value) : '', (key, _, cleanup) => {
  if (!key || !point.value) return;
  const chosen = point.value;
  const timer = setTimeout(() => void summarize(chosen), HOVER_DELAY_MS);
  cleanup(() => clearTimeout(timer));
});
onBeforeUnmount(() => { clearTimeout(hoverTimer); request?.abort(); });
</script>

<template>
  <nav v-if="visible.length" class="conversation-timeline" :class="{ 'is-engaged':engaged }"
    aria-label="会话进度" :style="{ '--dial-height':Math.max(28, visible.length * 7) + 'px' }"
    @pointerenter="enter" @pointerleave="leave" @wheel="wheel" @keydown.esc.stop="close">
    <button v-for="(mark, index) in visible" :key="mark.key" type="button" class="timeline-mark"
      :class="{ 'is-range':index + offset >= start && index + offset <= end, 'is-selected':engaged && selected===mark.key }"
      :aria-current="active===mark.key ? 'location' : undefined" :style="{ '--curve':curve(index) + 'px' }"
      :aria-label="'跳转到：' + excerpt(mark.message.content,60)"
      @pointerenter="select(mark.key)" @click="click(mark.key)"><span /></button>
    <button v-if="point" type="button" class="timeline-preview" :style="previewStyle" @click="click(point.key)">
      {{ excerpt(summaries.get(identity(point)) || point.message.content, 55) }}
    </button>
  </nav>
</template>

<style scoped>
.conversation-timeline { position:absolute; z-index:calc(var(--z-float) + 1); inset-inline-start:5px; inset-block-start:calc(var(--head-h) + 10px); inset-block-end:calc(var(--chat-dock-height,76px) + 10px); margin-block:auto; width:30px; height:var(--dial-height); max-height:calc(100% - var(--head-h) - var(--chat-dock-height,76px) - 20px); display:flex; flex-direction:column; }
.timeline-mark { flex:1 1 0; min-height:0; width:100%; padding:0 3px; display:flex; align-items:center; text-align:left; }
.timeline-mark span { display:block; width:5px; height:2px; transform:translateX(0); background:var(--muted); opacity:.32; transition:width 180ms, opacity 180ms, transform 210ms ease-out; }
.is-engaged .timeline-mark span { opacity:.42; transform:translateX(var(--curve)); }
.timeline-mark.is-range span { width:7px; opacity:.61; background:var(--accent); }
.timeline-mark[aria-current] span,.is-engaged .timeline-mark.is-selected span,.timeline-mark:focus-visible span { width:10px; opacity:.9; background:var(--accent); }
.timeline-preview { position:absolute; inset-inline-start:100%; transform:translateY(-50%); width:max-content; max-width:min(330px,calc(100vw - 65px)); box-sizing:border-box; padding:6px 11px; border-radius:10px; border:1px solid var(--line); background:var(--bot-neutral-panel); color:var(--fg); font-size:var(--fs-lg); font-weight:var(--fw-semibold); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; cursor:pointer; text-align:left; }
@media (prefers-reduced-motion:reduce) { .timeline-mark span { transition:none; } }
</style>
