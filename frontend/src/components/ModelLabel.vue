<script setup lang="ts">
import { modelProviderLabel } from "../../../bot/shared/appearance/modelProvider";
import ModelProviderIcon from "./ModelProviderIcon.vue";
withDefaults(
  defineProps<{
    model?: string | null;
    displayName?: string | null;
    showProvider?: boolean;
  }>(),
  { showProvider: true },
);
</script>
<template>
  <span class="model-label">
    <ModelProviderIcon :model="model || undefined" />
    <span class="model-label-name">{{ displayName || model || "—" }}</span>
    <small v-if="showProvider && model" class="model-provider-tag">{{
      modelProviderLabel(model)
    }}</small>
  </span>
</template>
<style scoped>
.model-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  vertical-align: middle;
}
.model-label-name {
  min-width: 0;
  overflow-wrap: anywhere;
}
.model-provider-tag {
  flex: none;
  font-size: 10px;
  line-height: 1.5;
  font-weight: 400;
  color: var(--muted);
  background: var(--surface);
  border-radius: 4px;
  padding: 1px 5px;
  white-space: nowrap;
}
.model-label > :deep(.boost-icon) {
  flex: none;
}
</style>
