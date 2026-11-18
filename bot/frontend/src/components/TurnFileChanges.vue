<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import type { Activity } from '../types';
import Icon from './Icon.vue';
import SpringDisclosure from './SpringDisclosure.vue';
import TurnFileDiff from './TurnFileDiff.vue';
import CopyButton from './CopyButton.vue';
import { HOVER_DELAY_MS } from '../lib/hover-delay';

type Change = NonNullable<Activity['fileChange']>;
type File = { key:string; name:string; directory?:string; workspacePath?:string; changes:Change[]; added:number|null; removed:number|null };
const props = defineProps<{ steps: Activity[]; running?: boolean; inline?: boolean }>();
const more = ref(false), expanded = ref(true), overrides = ref(new Map<string, boolean>());
const panel = useId();
const preview = ref<{file:File;pathOnly:boolean;style:Record<string,string>}>();
const filePath = (file: File) => file.workspacePath || (file.directory ? file.directory + '/' + file.name : file.name);
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
function clearPreview() { clearTimeout(hoverTimer); preview.value = undefined; }
onBeforeUnmount(clearPreview);
function open(file: File) { return overrides.value.get(file.key) === true; }
function toggle(file: File) {
  clearPreview();
  overrides.value.set(file.key, !open(file));
}
function hover(event: PointerEvent, file: File) {
  clearPreview();
  if (event.pointerType !== 'mouse') return;
  const pathOnly = !!props.inline || open(file) || !file.changes.some(change => change.diff?.length);
  const trigger = event.currentTarget as HTMLElement;
  hoverTimer = setTimeout(() => {
    if (!trigger.isConnected) return;
    const row = trigger.getBoundingClientRect();
    const card = trigger.closest('.changed-files')?.getBoundingClientRect() ?? row;
    const inset = Math.min(24, card.width * .07);
    const width = Math.min(pathOnly ? 320 : card.width - 2 * inset, innerWidth - 24, 700);
    const below = innerHeight - row.bottom - 12;
    const above = row.top - 12;
    const upward = pathOnly ? above >= 34 : below < 270 && above > below;
    const anchor = pathOnly ? row : card;
    preview.value = {file, pathOnly, style:{
      left: Math.max(12, Math.min(anchor.left + (anchor.width - width) / 2, innerWidth - width - 12)) + 'px',
      width: width + 'px',
      maxHeight: Math.max(0, Math.min(290, upward ? above : below)) + 'px',
      ...(upward ? {bottom: (innerHeight - row.top + 4) + 'px'} : {top: (row.bottom + 4) + 'px'}),
    }};
  }, HOVER_DELAY_MS);
}
watch(preview, (value, _, cleanup) => {
  if (!value) return;
  window.addEventListener('scroll', clearPreview, true);
  window.addEventListener('resize', clearPreview);
  cleanup(() => {
    window.removeEventListener('scroll', clearPreview, true);
    window.removeEventListener('resize', clearPreview);
  });
});
const files = computed(() => {
  const groups = new Map<string, File>();
  for (const { fileChange: change } of props.steps) {
    if (!change) continue;
    const item = groups.get(change.key) ?? { key:change.key,name:change.name,directory:change.directory,changes:[],added:0,removed:0 };
    item.directory ||= change.directory;
    if (change.workspacePath) item.workspacePath = change.workspacePath;
    item.changes.push(change);
    item.added = item.added == null || change.added == null ? null : item.added + change.added;
    item.removed = item.removed == null || change.removed == null ? null : item.removed + change.removed;
    groups.set(change.key, item);
  }
  return [...groups.values()];
});
const shown = computed(() => more.value || props.inline ? files.value : files.value.slice(0, 3));
const added = computed(() => files.value.every(file => file.added != null) ? files.value.reduce((n, file) => n + file.added!, 0) : null);
const removed = computed(() => files.value.every(file => file.removed != null) ? files.value.reduce((n, file) => n + file.removed!, 0) : null);
function copyText(file: File) {
  return file.changes.flatMap(change => (change.diff ?? []).map(row =>
    (row.kind === 'add' ? '+' : row.kind === 'remove' ? '-' : ' ') + row.text)).join('\n');
}
</script>

<template>
  <div v-if="files.length && running" class="live-files" role="status">
    {{ files.length }} 个文件已更改
    <span v-if="added != null" class="add">+{{ added }}</span>
    <span v-if="removed != null" class="remove">−{{ removed }}</span>
  </div>
  <div v-else-if="files.length" class="changed-files" :class="{ inline }">
    <button v-if="!inline" type="button" class="file-heading" :aria-expanded="expanded" :aria-controls="panel"
      @click="expanded = !expanded; clearPreview()">
      <span class="summary-icon"><Icon name="changes" :size="18" /></span>
      <span class="summary-text">
        <strong>已编辑 {{ files.length }} 个文件</strong>
        <span v-if="added != null || removed != null" class="summary-totals">
          <span v-if="added != null" class="add">+{{ added }}</span>
          <span v-if="removed != null" class="remove">−{{ removed }}</span>
        </span>
      </span>
      <Icon name="chevron" :size="12" class="disclosure-arrow" />
    </button>
    <SpringDisclosure :id="panel" :open="inline || expanded">
      <div class="file-list">
        <article v-for="file in shown" :key="file.key" class="file-entry" :class="{ 'is-open':open(file) }">
          <div class="file-header">
            <button type="button" class="file-row" :aria-expanded="open(file)" :aria-controls="panel + '-' + file.key"
              @click="toggle(file)" @keydown.esc.stop="clearPreview">
              <Icon v-if="inline" name="edit" :size="16" class="file-edit-icon" />
              <span v-if="inline" class="file-action">{{ file.changes[0].operation === 'create' ? '已创建' : '已编辑' }}</span>
              <span class="file-label"><span class="file-target" @pointerenter="hover($event, file)" @pointerleave="clearPreview"><span v-if="!inline && file.directory" class="file-directory">{{ file.directory }}/</span>{{ file.name }}</span></span>
              <span v-if="file.added != null" class="add">+{{ file.added }}</span>
              <span v-if="file.removed != null" class="remove">−{{ file.removed }}</span>
            </button>
          </div>
          <SpringDisclosure :id="panel + '-' + file.key" :open="open(file)">
            <div v-if="open(file) || overrides.has(file.key)" class="diff-shell">
              <div class="diff-header">
                <span class="diff-name"><span v-if="file.directory" class="file-directory">{{ file.directory }}/</span>{{ file.name }}</span>
                <span v-if="file.added != null" class="add">+{{ file.added }}</span>
                <span v-if="file.removed != null" class="remove">−{{ file.removed }}</span>
                <CopyButton v-if="file.changes.some(change => change.diff?.length)" class="copy-diff"
                  label="复制文件差异" :text="copyText(file)" :size="15" />
              </div>
              <TurnFileDiff :changes="file.changes" />
            </div>
          </SpringDisclosure>
        </article>
        <button v-if="!inline && files.length > 3" type="button" class="more-files" :aria-expanded="more"
          @click="more = !more; clearPreview()">
          {{ more ? '收起其余文件' : '再显示 ' + (files.length - 3) + ' 个文件' }}<Icon name="chevron" :size="12" />
        </button>
      </div>
    </SpringDisclosure>
  </div>
  <Teleport to="body">
    <div v-if="preview" class="diff-preview" :class="{ 'path-preview': preview.pathOnly }" :style="preview.style" aria-hidden="true">
      <div v-if="preview.pathOnly" class="path-label">{{ filePath(preview.file) }}</div>
      <template v-else>
      <div class="diff-header">
        <span class="diff-name">{{ filePath(preview.file) }}</span>
        <span v-if="preview.file.added != null" class="add">+{{ preview.file.added }}</span>
        <span v-if="preview.file.removed != null" class="remove">−{{ preview.file.removed }}</span>
      </div>
      <TurnFileDiff :changes="preview.file.changes" />
      </template>
    </div>
  </Teleport>
</template>

<style scoped>
.live-files { width:fit-content; margin:0 auto 2px; padding:6px 11px; display:flex; align-items:center; gap:5px; color:var(--muted); background:var(--bot-neutral-panel); border:1px solid var(--line); border-radius:13px; font-size:var(--chat-text-size,var(--fs-lg)); font-variant-numeric:tabular-nums; }
.changed-files { min-width:0; margin:5px 0 3px; color:var(--muted); font-size:var(--chat-text-size,var(--fs-lg)); }
.changed-files:not(.inline) { --change-chrome:color-mix(in srgb,var(--fg) 5%,transparent); border:1px solid var(--line); border-radius:12px; background:var(--bot-queue-glass); overflow:hidden; }
.changed-files.inline { margin:1px 0 3px; }
.file-heading,.file-row,.more-files { display:flex; align-items:center; gap:7px; min-width:0; min-height:24px; line-height:1.35; font-size:inherit; color:inherit; text-align:left; }
.file-heading:hover,.file-row:hover,.more-files:hover,.copy-diff:hover { color:var(--fg); background:transparent; }
button:focus:not(:focus-visible) { outline:none; }
.file-heading[aria-expanded='true'] > .disclosure-arrow { transform:rotate(90deg); }
.changed-files:not(.inline) > .file-heading { width:100%; min-height:42px; padding:5px 12px; background:var(--change-chrome); }
.changed-files:not(.inline) .more-files { width:100%; background:var(--change-chrome); }
.summary-icon { display:grid; place-items:center; width:29px; height:29px; flex:none; border-radius:7px; background:var(--surface-solid); }
.summary-text { display:grid; flex:1; }
.summary-totals { display:flex; gap:5px; }
.file-header { display:flex; align-items:center; min-width:0; }
.file-row { flex:1; padding:2px 0; }
.file-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.changed-files:not(.inline) .file-label { color:var(--fg-2); }
.file-directory { color:var(--muted); }
.file-entry.is-open { margin-block:1px 3px; }
.changed-files:not(.inline) :is(.file-header,.more-files) { padding-inline:12px; }
.inline .file-row { flex:0 1 auto; gap:5px; }
.inline .file-label { flex:0 1 auto; text-decoration:underline dotted; text-underline-offset:3px; }
.file-edit-icon,.file-action { flex:none; }
.inline .file-row:not(:hover,:focus-visible) :is(.add,.remove) { color:inherit; }
.copy-diff { display:grid; place-items:center; margin-inline-start:auto; padding:2px 6px; color:inherit; }
.diff-shell { margin:1px 0 2px; border:1px solid var(--line); border-radius:10px; background:var(--bot-neutral-row); overflow:hidden; }
.changed-files:not(.inline) .diff-shell { margin-inline:12px; }
.diff-header { display:flex; align-items:center; gap:6px; padding:3px 10px; min-height:25px; line-height:1.35; background:var(--bot-neutral-panel); border-block-end:1px solid var(--line); }
.diff-name { min-width:0; overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
.add { color:#53b985; } .remove { color:#e66b68; }
.add,.remove,.disclosure-arrow { flex:none; font-variant-numeric:tabular-nums; }
.diff-preview { position:fixed; z-index:100; overflow:hidden; border:1px solid var(--line); border-radius:10px; color:var(--muted); font-size:var(--fs-lg); pointer-events:none; background:var(--bot-neutral-row); box-shadow:0 12px 28px #0005; }
.path-label { padding:7px 10px; text-align:center; color:var(--fg); background:var(--bot-neutral-panel); overflow-wrap:anywhere; }
</style>
