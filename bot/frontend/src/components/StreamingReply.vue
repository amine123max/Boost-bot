<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps<{ text: string }>();
const root = ref<HTMLElement>();
let node: Text | undefined, rendered = '', frame = 0;
function paint() {
  frame = 0;
  if (!node) return;
  const text = props.text;
  if (text === rendered) return;
  if (text.startsWith(rendered)) node.appendData(text.slice(rendered.length));
  else node.data = text;
  rendered = text;
}
onMounted(() => {
  node = document.createTextNode('');
  root.value?.append(node);
  paint();
});
watch(() => props.text, () => {
  if (!frame) frame = requestAnimationFrame(paint);
}, { flush: 'post' });
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>

<template><div ref="root" class="message-stream-text" /></template>
<style scoped>
.message-stream-text { white-space:pre-wrap; overflow-wrap:anywhere; line-height:var(--lh-relaxed, 1.6); }
</style>
