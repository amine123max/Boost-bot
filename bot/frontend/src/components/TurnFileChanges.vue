<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useId, watch } from 'vue';
import type { Activity } from '../types';
import Icon from './Icon.vue';
import SpringDisclosure from './SpringDisclosure.vue';
import TurnFileDiff from './TurnFileDiff.vue';

type Change = NonNullable<Activity['fileChange']>;
type File = { key:string; name:string; changes:Change[]; added:number|null; removed:number|null };
const props = defineProps<{ steps: Activity[]; running?: boolean; inline?: boolean }>();
const more = ref(false), expanded = ref(true), overrides = ref(new Map<string, boolean>());
const panel = useId();
const preview = ref<{file:File;style:Record<string,string>}>();
let hoverTimer: ReturnType<typeof setTimeout> | undefined;
function clearPreview() { clearTimeout(hoverTimer); preview.value = undefined; }
onBeforeUnmount(clearPreview);
function open(file: File) { return overrides.value.get(file.key) ?? !!props.inline; }
function toggle(file: File) {
  clearPreview();
  overrides.value.set(file.key, !open(file));
}
function hover(event: PointerEvent, file: File) {
  clearPreview();
  if (event.pointerType !== 'mouse' || open(file) || !file.changes.some(change => change.diff?.length)) return;
  const trigger = event.currentTarget as HTMLElement;
  hoverTimer = setTimeout(() => {
    if (!trigger.isConnected || open(file)) return;
    const row = trigger.getBoundingClientRect();
    const column = trigger.closest('.chat-col')?.getBoundingClientRect() ?? row;
    const width = Math.min(column.width, innerWidth - 24);
    const below = innerHeight - row.bottom - 12;
    const above = row.top - 12;
    const upward = below < 270 && above > below;
    preview.value = {file, style:{
      left: Math.max(12, Math.min(column.left, innerWidth - width - 12)) + 'px',
      width: width + 'px',
      maxHeight: Math.max(0, Math.min(290, upward ? above : below)) + 'px',
      ...(upward ? {bottom: (innerHeight - row.top + 4) + 'px'} : {top: (row.bottom + 4) + 'px'}),
    }};
  }, 160);
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
    const item = groups.get(change.key) ?? { key:change.key,name:change.name,changes:[],added:0,removed:0 };
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
async function copy(file: File) {
  const text = file.changes.flatMap(change => (change.diff ?? []).map(row =>
    (row.kind === 'add' ? '+' : row.kind === 'remove' ? '-' : ' ') + row.text)).join('\n');
  try { await navigator.clipboard.writeText(text); } catch { /* Clipboard may be unavailable in a browser embedding. */ }
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
      <Icon name="edit" :size="16" /><span>已编辑 {{ files.length }} 个文件</span>
      <span v-if="added != null" class="add">+{{ added }}</span>
      <span v-if="removed != null" class="remove">−{{ removed }}</span>
      <Icon name="chevron" :size="12" class="disclosure-arrow" />
    </button>
    <SpringDisclosure :id="panel" :open="inline || expanded">
      <div class="file-list">
        <article v-for="(file, index) in shown" :key="file.key" class="file-entry" :class="{ 'is-open':open(file) }">
          <div class="file-header">
            <button type="button" class="file-row" :aria-expanded="open(file)" :aria-controls="panel + '-' + index"
              @pointerenter="hover($event, file)" @pointerleave="clearPreview" @click="toggle(file)" @keydown.esc.stop="clearPreview">
              <span class="file-label">{{ file.name }}</span>
              <span v-if="file.added != null" class="add">+{{ file.added }}</span>
              <span v-if="file.removed != null" class="remove">−{{ file.removed }}</span>
            </button>
            <button v-if="open(file) && file.changes.some(change => change.diff?.length)" type="button" class="copy-diff"
              aria-label="复制文件差异" title="复制文件差异" @click="copy(file)"><Icon name="copy" :size="15" /></button>
          </div>
          <SpringDisclosure :id="panel + '-' + index" :open="open(file)">
            <TurnFileDiff v-if="open(file) || overrides.has(file.key)" :changes="file.changes" />
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
    <div v-if="preview" class="diff-preview" :style="preview.style" aria-hidden="true">
      <div class="preview-title">{{ preview.file.name }}</div>
      <TurnFileDiff :changes="preview.file.changes" preview />
    </div>
  </Teleport>
</template>

<style scoped>
.live-files { width:fit-content; margin:10px auto 3px; padding:6px 11px; display:flex; align-items:center; gap:5px; color:var(--muted); background:var(--pill); border:1px solid var(--line); border-radius:13px; font-size:var(--chat-text-size,var(--fs-lg)); }
.changed-files { min-width:0; margin:8px 0 4px; color:var(--muted); font-size:var(--chat-text-size,var(--fs-lg)); }
.changed-files.inline { margin:3px 0 6px; }
.file-heading,.file-row,.more-files { display:flex; align-items:center; gap:7px; min-width:0; min-height:29px; font-size:inherit; color:inherit; text-align:left; }
.file-heading:hover,.file-row:hover,.more-files:hover,.copy-diff:hover { color:var(--fg); background:transparent; }
button:focus:not(:focus-visible) { outline:none; }
.file-heading[aria-expanded='true'] > .disclosure-arrow { transform:rotate(90deg); }
.file-header { display:flex; align-items:center; min-width:0; }
.file-row { flex:1; padding:4px 0; }
.file-label { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.file-entry.is-open { margin-block:3px 7px; }
.inline .file-entry .file-header { padding-inline:10px; }
.inline .file-header { border-radius:8px 8px 0 0; }
.inline .is-open .file-header { background:var(--pill); }
.inline .file-label { flex:0 1 auto; }
.copy-diff { margin-inline-start:auto; padding:4px 8px; color:inherit; }
.add { color:#53b985; } .remove { color:#e66b68; }
.add,.remove,.disclosure-arrow { flex:none; font-variant-numeric:tabular-nums; }
.diff-preview { position:fixed; z-index:100; overflow:hidden; border-radius:10px; color:var(--muted); font-size:var(--fs-lg); pointer-events:none; background:var(--surface-solid); box-shadow:0 12px 28px #0005; }
.preview-title { padding:7px 10px; background:var(--pill); overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
</style>
