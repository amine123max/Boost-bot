<script setup lang="ts">
import BoostIcon from "./BoostIcon.vue";
defineProps<{ icon?: string; title: string; description?: string }>();
</script>
<template>
  <div class="empty-state">
    <div class="empty-icon">
      <BoostIcon :name="icon || 'inbox'" :size="38" />
    </div>
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <slot />
  </div>
</template>
