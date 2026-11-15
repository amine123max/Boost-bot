<script setup lang="ts">
import { onBeforeUnmount, ref, useId, watch } from 'vue';
import { motionAllowed } from '../../../../frontend/src/lib/surface-motion';
import HelpTip from './HelpTip.vue';
import Icon from './Icon.vue';
const props = defineProps<{ title: string; help?: string; badge?: number; initiallyOpen?: boolean }>();
const open = ref(!!props.initiallyOpen), content = ref<HTMLElement>(), toggle = ref<HTMLButtonElement>(), id = useId();
let animation: Animation | undefined;
function animate(element: Element, done: () => void, leaving: boolean) {
  const node = element as HTMLElement;
  const from = leaving ? node.getBoundingClientRect().height : parseFloat(node.style.height) || 0;
  const opacity = node.style.opacity ? Number(node.style.opacity) : leaving ? 1 : 0;
  animation?.cancel();
  node.inert = leaving;
  if (!motionAllowed()) { animation = undefined; node.style.removeProperty('height'); node.style.removeProperty('opacity'); done(); return; }
  const to = leaving ? 0 : node.scrollHeight;
  const response = (t: number) => 1 - (1 + 8 * t) * Math.exp(-8 * t);
  const end = response(1);
  const frames = Array.from({ length: 25 }, (_, i) => {
    const progress = response(i / 24) / end;
    return { offset: i / 24, height: `${from + (to-from)*progress}px`, opacity: opacity + ((leaving ? 0 : 1)-opacity)*progress };
  });
  const current = node.animate(frames, { duration: leaving ? 190 : 300, easing: 'linear' });
  animation = current;
  current.finished.then(() => { if (animation === current) { animation = undefined; node.style.removeProperty('height'); node.style.removeProperty('opacity'); done(); } }).catch(() => {});
}
function cancel(element: Element) {
  const node = element as HTMLElement;
  node.style.height = `${node.getBoundingClientRect().height}px`;
  node.style.opacity = getComputedStyle(node).opacity;
  animation?.cancel(); animation = undefined;
}
watch(open, value => { if (!value && content.value?.contains(document.activeElement)) toggle.value?.focus({ preventScroll: true }); });
onBeforeUnmount(() => animation?.cancel());
</script>
<template>
  <section class="panel-section" :aria-label="title">
    <div class="panel-section-heading">
      <button ref="toggle" type="button" class="panel-section-toggle" :aria-expanded="open" :aria-controls="id" @click="open = !open"><Icon name="chevron" :size="12" class="section-chevron" :class="{ expanded: open }" /><span>{{ title }}</span><span v-if="badge" class="section-count">{{ badge }}</span></button>
      <HelpTip v-if="help" :text="help" :label="title + '说明'" />
      <div v-if="$slots.actions" class="panel-section-actions"><slot name="actions" /></div>
    </div>
    <Transition :css="false" @enter="(el, done) => animate(el, done, false)" @leave="(el, done) => animate(el, done, true)" @enter-cancelled="cancel" @leave-cancelled="cancel">
      <div v-show="open" :id="id" ref="content" class="panel-section-content" :inert="!open"><div class="panel-section-inner"><slot /></div></div>
    </Transition>
  </section>
</template>
<style scoped>
.panel-section { min-width: 0; margin-top: 6px; overflow-anchor: none; }
.panel-section-heading { display:flex; align-items:center; gap:4px; min-height:32px; padding:0 8px; }
.panel-section-toggle { display:inline-flex; align-items:center; gap:7px; min-height:28px; min-width:0; padding:4px 6px; border-radius:6px; color:var(--muted); font-size:12px; font-weight:600; text-align:left; transition:background-color 140ms ease,color 140ms ease; }
.panel-section-toggle:hover { background:var(--pill); color:var(--fg); }
.panel-section-toggle:active { background:var(--pill-hover); color:var(--fg); }
.panel-section-toggle:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
.section-chevron { flex:none; transition:transform 220ms ease; }
.section-chevron.expanded { transform:rotate(90deg); }
.section-count { font-size:10px; font-weight:500; color:var(--muted); }
.panel-section-actions { display:inline-flex; align-items:center; gap:5px; margin-left:auto; }
.panel-section-content { overflow:hidden; overflow-anchor:none; }
.panel-section-inner { padding:4px 8px 6px 33px; min-width:0; }
.panel-section-inner :deep(.background-controls),
.panel-section-inner :deep(.background-task-row),
.panel-section-inner :deep(.memory-controls),
.panel-section-inner :deep(.memory-preview-entry),
.panel-section-inner :deep(.panel-approval),
.panel-section-inner :deep(.panel-approval-empty),
.panel-section-inner :deep(.task-empty) { padding-left:0; padding-right:0; }
.panel-section-inner :deep(.bot-channels .row) { --row-pl:0; --row-pr:0; }
.panel-section-inner :deep(.memory-more),.panel-section-inner :deep(.more-tasks) { margin-left:0; margin-right:0; }
.panel-section-inner :deep(.channel-setting-row) { column-gap:6px; }
.panel-section-inner :deep(.channel-setting-row > span) { flex-basis:100%; }
.panel-section-inner :deep(.channel-setting-row > .select-control) { width:auto; max-width:none; flex:1; min-width:0; }
@media(prefers-reduced-motion:reduce) { .section-chevron,.panel-section-toggle { transition:none; } }
</style>
