<script setup lang="ts">
import { onMounted, onBeforeUnmount, onActivated, onDeactivated, ref, watch } from 'vue';
import { botAppearance } from '@/composables/useBotAppearance';
import { mountBotAvatar } from '../../../bot/shared/appearance/renderer';
import type { BotAppearance } from '../../../bot/shared/appearance/preferences';
const props = defineProps<{ active?: boolean; thinking?: boolean; size?: number; ambient?: boolean; appearance?: BotAppearance }>();
const svg = ref<SVGSVGElement>();
let controller: ReturnType<typeof mountBotAvatar> | undefined;
function mount() {
  controller?.dispose();
  if (svg.value) controller = mountBotAvatar(svg.value, () => props.appearance || botAppearance, () => props);
}
onMounted(mount);
onActivated(mount);
onDeactivated(() => controller?.dispose());
onBeforeUnmount(() => controller?.dispose());
watch(botAppearance, () => controller?.refresh(), { deep: true });
watch(() => props.appearance, () => controller?.refresh(), { deep: true });
</script>
<template>
  <svg ref="svg" class="boost-bot-avatar" :style="{ width: `${size ?? botAppearance.size}px`, height: `${size ?? botAppearance.size}px` }" viewBox="-4 -4 72 72" aria-hidden="true" focusable="false" data-boost-bot-avatar>
    <rect x="7" y="7" width="50" height="50" rx="20" fill="currentColor" />
    <path d="M24 24v14M40 24v14" stroke="var(--bg)" stroke-width="7" stroke-linecap="round" />
  </svg>
</template>
<style scoped>
.boost-bot-avatar { display: block; flex-shrink: 0; overflow: visible; }
</style>
