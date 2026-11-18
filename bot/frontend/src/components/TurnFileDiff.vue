<script setup lang="ts">
import type { Activity } from '../types';
defineProps<{ changes: NonNullable<Activity['fileChange']>[] }>();
</script>

<template>
  <div v-if="changes.some(change => change.diff?.length)" class="diff-lines" aria-label="已记录的文件差异">
    <template v-for="(change, index) in changes" :key="index">
      <div v-for="(row, line) in change.diff" :key="line" class="diff-line" :data-kind="row.kind">
        <span aria-hidden="true">{{ row.kind === 'add' ? '+' : row.kind === 'remove' ? '−' : ' ' }}</span><code>{{ row.text }}</code>
      </div>
    </template>
  </div>
  <p v-else class="no-diff">这次修改没有可展示的差异。</p>
</template>

<style scoped>
.diff-lines { border-radius:0 0 8px 8px; font-family:var(--code,monospace); font-size:inherit; }
.diff-line { display:flex; min-width:0; line-height:1.42; }
.diff-line span { flex:0 0 26px; text-align:center; background:var(--surface-solid); }
.diff-line code { min-width:0; padding:0 8px; white-space:pre-wrap; overflow-wrap:anywhere; font:inherit; color:inherit; }
.diff-line[data-kind='add'] { background:color-mix(in srgb,#26a269 16%,var(--surface-solid)); }
.diff-line[data-kind='remove'] { background:color-mix(in srgb,#e55454 16%,var(--surface-solid)); }
.diff-line[data-kind='add'] span { color:var(--green); }
.diff-line[data-kind='remove'] span { color:var(--red); }
.no-diff { margin:0; padding:3px 8px; }
</style>
