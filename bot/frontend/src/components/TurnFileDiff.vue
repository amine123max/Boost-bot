<script setup lang="ts">
import type { Activity } from '../types';
defineProps<{ changes: NonNullable<Activity['fileChange']>[]; preview?: boolean }>();
</script>

<template>
  <div v-if="changes.some(change => change.diff?.length)" class="diff-lines" :tabindex="preview ? undefined : 0" aria-label="已记录的文件差异">
    <template v-for="(change, index) in changes" :key="index">
      <div v-for="(row, line) in change.diff" :key="line" class="diff-line" :data-kind="row.kind">
        <span aria-hidden="true">{{ row.kind === 'add' ? '+' : row.kind === 'remove' ? '−' : ' ' }}</span><code>{{ row.text }}</code>
      </div>
    </template>
  </div>
  <p v-else class="no-diff">这次修改没有可展示的差异。</p>
</template>

<style scoped>
.diff-lines { max-height:230px; overflow:auto; border-radius:0 0 8px 8px; scrollbar-width:thin; font-family:var(--code,monospace); font-size:inherit; }
.diff-line { display:flex; width:max-content; min-width:100%; line-height:1.6; }
.diff-line span { position:sticky; inset-inline-start:0; flex:0 0 26px; text-align:center; background:var(--surface-solid); }
.diff-line code { padding:0 8px; white-space:pre; font:inherit; color:inherit; }
.diff-line[data-kind='add'] { background:color-mix(in srgb,#26a269 16%,var(--surface-solid)); }
.diff-line[data-kind='remove'] { background:color-mix(in srgb,#e55454 16%,var(--surface-solid)); }
.diff-line[data-kind='add'] span { color:var(--green); }
.diff-line[data-kind='remove'] span { color:var(--red); }
.no-diff { margin:0; padding:5px 8px; }
</style>
