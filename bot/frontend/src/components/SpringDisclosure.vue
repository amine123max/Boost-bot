<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { preferences } from '../preferences';
import { motionAllowed } from '../../../../frontend/src/lib/surface-motion';
const props = defineProps<{ open: boolean }>();
const outer = ref<HTMLElement>(), inner = ref<HTMLElement>();
let animation: Animation | undefined, generation = 0;
function settle() {
  animation?.cancel(); animation = undefined;
  if (!outer.value) return;
  outer.value.style.height = props.open ? 'auto' : '0px';
  outer.value.style.opacity = props.open ? '1' : '0';
}
async function transition() {
  const ticket = ++generation;
  const from = outer.value?.getBoundingClientRect().height || 0;
  animation?.cancel(); animation = undefined;
  await nextTick();
  if (ticket !== generation || !outer.value || !inner.value) return;
  if (!motionAllowed() || preferences.motion !== 'full') { settle(); return; }
  const to = props.open ? inner.value.getBoundingClientRect().height : 0;
  const response = (t: number) => 1 - (1 + 8 * t) * Math.exp(-8 * t), end = response(1);
  const frames = Array.from({ length:25 }, (_, index) => {
    const progress = response(index / 24) / end;
    return { offset:index / 24, height:`${from + (to - from) * progress}px`, opacity:props.open ? Math.min(1, progress * 4) : 1 - progress };
  });
  const current = outer.value.animate(frames, { duration:280, easing:'linear', fill:'both' });
  animation = current;
  try { await current.finished; if (ticket === generation) settle(); } catch { /* A reversal continues from the rendered height. */ }
}
// Only open/close actions animate. Polling and nested content use natural height
// so parent and child size changes cannot repeatedly restart an animation.
watch(() => props.open, transition);
watch(() => preferences.motion, () => { generation++; settle(); });
onMounted(settle);
onBeforeUnmount(() => { generation++; animation?.cancel(); });
</script>
<template>
  <div ref="outer" class="spring-disclosure" :inert="!open" :aria-hidden="!open">
    <div ref="inner"><slot /></div>
  </div>
</template>
<style scoped>
.spring-disclosure { overflow:hidden; overflow-anchor:none; }
.spring-disclosure > div { display:flow-root; }
</style>
