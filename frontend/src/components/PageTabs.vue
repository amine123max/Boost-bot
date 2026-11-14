<script lang="ts">
let focusRequest: { label: string; value: string } | null = null;
</script>
<script setup lang="ts">
import { nextTick, onActivated, onMounted, ref, watch } from "vue";
import BoostIcon from "./BoostIcon.vue";
const props = defineProps<{
  label: string;
  selected: string;
  items: { value: string; label: string; icon?: string }[];
}>();
const emit = defineEmits<{ select: [value: string] }>();
const root = ref<HTMLElement>();
async function restoreFocus() {
  await nextTick();
  if (focusRequest?.label !== props.label || focusRequest.value !== props.selected) return;
  const button = root.value?.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]');
  if (button?.isConnected) {
    button.focus({ preventScroll: true });
    if (document.activeElement === button) focusRequest = null;
  }
}
onMounted(restoreFocus);
onActivated(restoreFocus);
watch(() => props.selected, restoreFocus);
async function move(event: KeyboardEvent) {
  if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const current = props.items.findIndex(item => item.value === props.selected);
  const index = event.key === 'Home' ? 0 : event.key === 'End' ? props.items.length - 1
    : (current + (event.key === 'ArrowRight' ? 1 : -1) + props.items.length) % props.items.length;
  focusRequest = { label: props.label, value: props.items[index].value };
  emit('select', props.items[index].value);
  await restoreFocus();
}
</script>
<template>
  <div ref="root" v-spring-switch class="tabs page-control-tabs" role="tablist" :aria-label="label" @keydown="move">
    <button v-for="item in items" :key="item.value" type="button" role="tab"
      :class="{ selected: selected === item.value }" :aria-selected="selected === item.value"
      :tabindex="selected === item.value ? 0 : -1" @click="$emit('select', item.value)">
      <BoostIcon v-if="item.icon" :name="item.icon" :size="16" />{{ item.label }}
    </button>
  </div>
</template>
