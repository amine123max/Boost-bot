<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from "vue";
import Markdown from "./Markdown.vue";
import Icon from "./Icon.vue";
import HelpTip from './HelpTip.vue';

const props = withDefaults(defineProps<{
  text: string;
  role?: string;
  createdAt?: number;
  interim?: string[];
  framed?: boolean;
  streaming?: boolean;
  editable?: boolean;
  editDisabled?: boolean;
  sendEdit?: (text: string) => Promise<boolean>;
}>(), { role: "assistant" });
const editing = ref(false), editText = ref(''), sending = ref(false), editor = ref<HTMLTextAreaElement>();
async function beginEdit() {
  editText.value = props.text; editing.value = true;
  await nextTick(); editor.value?.focus();
  editor.value?.setSelectionRange(editText.value.length, editText.value.length);
}
async function submitEdit() {
  if (!props.sendEdit || sending.value || props.editDisabled || !editText.value.trim()) return;
  sending.value = true;
  try { if (await props.sendEdit(editText.value)) editing.value = false; }
  finally { sending.value = false; }
}
const copied = ref(false), error = ref("");
let timer: ReturnType<typeof setTimeout> | undefined, disposed = false;
const date = computed(() => {
  if (!props.createdAt) return null;
  const value = new Date(props.createdAt);
  return Number.isFinite(value.getTime()) ? value : null;
});
async function copy() {
  clearTimeout(timer);
  copied.value = false;
  error.value = "";
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(props.text);
    else {
      const previous = document.activeElement as HTMLElement | null;
      const field = document.createElement("textarea");
      field.value = props.text;
      field.setAttribute("aria-label", "待复制的消息");
      field.style.cssText = "position:fixed;left:-9999px;top:0;opacity:0";
      (previous?.closest("dialog") || document.body).append(field);
      try {
        field.select();
        if (!document.execCommand("copy")) throw new Error("clipboard unavailable");
      } finally {
        field.remove();
        previous?.focus({ preventScroll: true });
      }
    }
    if (disposed) return;
    copied.value = true;
    timer = setTimeout(() => { copied.value = false; }, 1800);
  } catch {
    if (!disposed) error.value = "复制失败，请选择消息文字手动复制";
  }
}
onBeforeUnmount(() => { disposed = true; clearTimeout(timer); });
</script>

<template>
  <div class="message-content" :class="{ 'user-content': role === 'user', 'system-content': role === 'system', 'framed-content': framed, 'is-editing': editing }">
    <form v-if="editing" class="message-bubble message-editor" @submit.prevent="submitEdit">
      <textarea ref="editor" v-model="editText" aria-label="编辑消息" rows="3" :disabled="sending" @keydown.esc.stop.prevent="!sending && (editing = false)" />
      <div class="message-editor-actions"><HelpTip text="在原会话中修改这条消息并重新生成；此后的旧对话将从当前分支移除，已执行的工具操作不会撤销。" /><button type="button" :disabled="sending" @click="editing = false">取消</button><button type="submit" class="message-edit-send" :disabled="sending || editDisabled || !editText.trim()">{{ sending ? '正在更新…' : '重新生成' }}</button></div>
    </form>
    <div v-else class="message-bubble">
      <Markdown v-for="(value, index) in interim" :key="index" :text="value" />
      <div v-if="text && streaming" class="message-stream-text">{{ text }}</div>
      <Markdown v-else-if="text" :text="text" />
      <slot />
    </div>
    <div v-if="!editing && (date || text)" class="message-actions">
      <button
        v-if="text"
        type="button"
        class="message-copy"
        :aria-label="role === 'user' ? '复制消息' : '复制回复'"
        :title="copied ? '已复制' : role === 'user' ? '复制消息' : '复制回复'"
        @click="copy"
      ><Icon :name="copied ? 'check' : 'copy'" :size="16" /></button>
      <button v-if="text && role === 'user' && editable" type="button" class="message-copy" :disabled="editDisabled" aria-label="重新编辑消息" title="重新编辑消息" @click="beginEdit"><Icon name="edit" :size="17" /></button>
      <time v-if="date" :datetime="date.toISOString()" :title="date.toLocaleString('zh-CN', { hour12: false })">{{ date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }) }}</time>
      <span class="sr-only" role="status">{{ copied ? '已复制' : '' }}</span>
      <span v-if="error" class="message-copy-error" role="alert">{{ error }}</span>
    </div>
  </div>
</template>

<style scoped>
.message-content { display: flex; flex-direction: column; align-items: flex-start; min-width: 0; max-width: 100%; }
.message-bubble { min-width: 0; max-width: 100%; padding: var(--space-1) 0; }
.message-stream-text { white-space: pre-wrap; overflow-wrap: anywhere; line-height: var(--lh-relaxed, 1.6); }
.framed-content .message-bubble, .user-content .message-bubble { padding: var(--space-2-5) var(--space-4); border-radius: var(--r-bubble); }
.framed-content .message-bubble { background: var(--accent-soft); box-shadow: none; }
.user-content { align-items: flex-end; }
.user-content .message-bubble { background: var(--bubble-user); box-shadow: none; }
.system-content .message-bubble { box-shadow: none; }
.message-actions { display: flex; align-items: center; flex-wrap: wrap; gap: var(--space-2); min-height: 28px; padding: var(--space-1) var(--space-1) 0; color: var(--muted); font-size: var(--fs-xs); }
.message-actions time { white-space: nowrap; font-variant-numeric: tabular-nums; }
.message-copy { display: inline-flex; align-items: center; justify-content: center; flex: none; width: 26px; height: 26px; padding: 0; border: 0; border-radius: var(--r-sm); background: transparent; color: inherit; cursor: pointer; transition: color 140ms, background 140ms; }
.message-copy:hover { color: var(--fg); background: var(--pill); }
.message-copy:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
.message-copy-error { color: var(--red); }
.is-editing { width:min(680px, calc(100vw - 96px)); align-items:stretch; }
.message-editor { display:grid; gap:10px; width:100%; box-sizing:border-box; }
.message-editor textarea { width:100%; box-sizing:border-box; resize:vertical; min-height:72px; background:transparent; color:inherit; border:0; padding:0; outline:0; font:inherit; line-height:1.6; }
.message-editor-actions { display:flex; justify-content:flex-end; gap:7px; }
.message-editor-actions button { padding:5px 10px; border:1px solid var(--line); border-radius:12px; background:var(--pill); font-size:12px; }
.message-editor-actions .message-edit-send { color:var(--bg); background:var(--fg); border-color:transparent; }
</style>
