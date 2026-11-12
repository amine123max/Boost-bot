<script setup lang="ts">
import HelpHint from "./HelpHint.vue";
defineProps<{
  label: string;
  description?: string;
  modelValue: boolean;
  disabled?: boolean;
}>();
defineEmits<{ "update:modelValue": [value: boolean] }>();
</script>
<template>
  <div class="setting-row">
    <div class="setting-label">
      {{ label }}
      <HelpHint v-if="description" :label="label" :text="description" />
    </div>
    <button
      class="switch"
      role="switch"
      :aria-label="label"
      :aria-checked="modelValue"
      :disabled="disabled"
      @click="$emit('update:modelValue', !modelValue)"
    >
      <span />
    </button>
  </div>
</template>
