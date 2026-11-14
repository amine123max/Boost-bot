<script setup lang="ts">
import { computed } from 'vue';
const props = withDefaults(defineProps<{ channel: string; size?: number }>(), { size: 17 });
const sources = import.meta.glob('../assets/channels/*.svg', { query: '?raw', import: 'default', eager: true }) as Record<string,string>;
const svg = computed(() => sources[`../assets/channels/${props.channel}.svg`] || '');
</script>
<template><span v-if="svg" class="channel-brand-icon" :data-channel="channel" aria-hidden="true" :style="{width:size+'px',height:size+'px'}" v-html="svg" /></template>
<style scoped>
.channel-brand-icon { display:inline-flex; align-items:center; justify-content:center; flex:none; color:var(--fg-2); }
.channel-brand-icon :deep(svg) { display:block; width:100%; height:100%; }
</style>
