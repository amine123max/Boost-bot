<script setup lang="ts">
defineProps<{ error?: string }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <div class="boost-startup" role="status" aria-live="polite" :aria-label="error || '正在加载 Boost'">
    <span v-if="!error" class="boost-loading-ring boost-startup-spinner" aria-hidden="true" />
    <div v-else class="boost-startup-caption"><p>{{ error }}</p><button class="primary" @click="$emit('retry')">重新连接</button></div>
  </div>
</template>
<style scoped>
.boost-startup { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; background: var(--bg); }
.boost-startup-caption { display: grid; justify-items: center; gap: 18px; max-width: min(520px, 80vw); text-align: center; color: var(--muted); }
</style>
