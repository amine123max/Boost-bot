<script setup lang="ts">
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
      <p v-if="description">{{ description }}</p>
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
