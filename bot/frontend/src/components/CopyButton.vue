<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';
import Icon from './Icon.vue';
defineOptions({ inheritAttrs:false });
const props = withDefaults(defineProps<{text:string;label:string;size?:number}>(), {size:16});
const copied=ref(false), failed=ref(false);
let timer:ReturnType<typeof setTimeout>|undefined, disposed=false;
async function copy() {
  clearTimeout(timer);
  try {
    if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(props.text);
    else {
      const previous = document.activeElement as HTMLElement | null;
      const field = document.createElement('textarea');
      field.value = props.text;
      field.style.cssText = 'position:fixed;inset-inline-start:-9999px;top:0;opacity:0';
      (previous?.closest('dialog') || document.body).append(field);
      try { field.select(); if (!document.execCommand('copy')) throw new Error('clipboard unavailable'); }
      finally { field.remove(); previous?.focus({preventScroll:true}); }
    }
    if (disposed) return;
    copied.value=true; failed.value=false;
  } catch {
    if (disposed) return;
    copied.value=false; failed.value=true;
  }
  timer=setTimeout(()=>{copied.value=failed.value=false;},1600);
}
onBeforeUnmount(()=>{disposed=true;clearTimeout(timer);});
</script>
<template>
  <button type="button" v-bind="$attrs" :aria-label="copied ? '已复制' : label" :data-copied="copied || undefined" @click.stop="copy">
    <Icon v-if="copied" name="check" :size="size" class="copy-confirm" /><Icon v-else name="copy" :size="size" />
    <span class="sr-only" role="status">{{ copied ? '已复制' : failed ? '复制失败，请手动复制' : '' }}</span>
  </button>
</template>
<style scoped>
.copy-confirm { color:var(--green); animation:copy-confirm 230ms cubic-bezier(.22,.7,.24,1); }
@keyframes copy-confirm { from { opacity:0; transform:scale(.67); } to { opacity:1; transform:scale(1); } }
@media(prefers-reduced-motion:reduce) { .copy-confirm { animation:none; } }
</style>
