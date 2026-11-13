<script setup lang="ts">
import { ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import BoostDialog from "./BoostDialog.vue";
import BoostIcon from "./BoostIcon.vue";
import HelpHint from "./HelpHint.vue";
const props = defineProps<{
  label: string;
  description?: string;
  value?: string;
  disabled?: boolean;
  confirmLabel?: string;
}>();
const open = ref(false);
const route = useRoute();
const router = useRouter();
watch(
  () => route.query.focus,
  (value) => {
    if (value === props.label && !props.disabled) open.value = true;
  },
  { immediate: true },
);
function close() {
  open.value = false;
  if (route.query.focus === props.label) {
    const { focus: _focus, ...query } = route.query;
    void router.replace({ query });
  }
}
</script>
<template>
  <div class="setting-row">
    <div class="setting-control-label">
      <span>{{ label }}</span
      ><HelpHint v-if="description" :label="label" :text="description" />
      <button
        class="setting-gear"
        :aria-label="`设置${label}`"
        :disabled="disabled"
        @click="open = true"
      >
        <BoostIcon name="settings" :size="17" />
      </button>
    </div>
    <span v-if="value" class="setting-control-value">{{ value }}</span>
  </div>
  <BoostDialog v-if="open" :title="label" @close="close">
    <div class="setting-control-editor">
      <slot :close="close" />
    </div>
    <template #footer
      ><button class="primary" @click="close">{{ confirmLabel || '完成' }}</button></template
    >
  </BoostDialog>
</template>
<style scoped>
.setting-control-label {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
}
.setting-gear {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  color: var(--muted);
  background: transparent;
  border-radius: 6px;
}
.setting-gear:hover {
  background: var(--hover);
  color: var(--text);
}
.setting-control-value {
  color: var(--muted);
  font-size: 14px;
  text-align: right;
  overflow-wrap: anywhere;
}
.setting-control-editor {
  display: grid;
  gap: 16px;
  padding-block: 8px;
}
.setting-control-editor :deep(.setting-label),
.setting-control-editor :deep(input),
.setting-control-editor :deep(select),
.setting-control-editor :deep(textarea) {
  font-size: 16px;
  font-weight: 400;
}
.setting-control-editor :deep(select) {
  width: 100%;
}
</style>
