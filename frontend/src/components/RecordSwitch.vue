<script setup lang="ts">
defineProps<{ label: string; enabled: boolean; disabled?: boolean }>();
defineEmits<{ toggle: [] }>();
</script>
<template>
  <div class="record-status-control">
    <button
      class="switch"
      role="switch"
      :aria-label="label"
      :aria-checked="enabled"
      :disabled="disabled"
      @click="$emit('toggle')"
    >
      <span /></button
    ><span>{{ enabled ? "启用" : "禁用" }}</span>
  </div>
</template>
