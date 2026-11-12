<script setup lang="ts">
import HelpHint from "./HelpHint.vue";
import BoostIcon from "./BoostIcon.vue";
defineProps<{ icon?: string; title: string; description?: string }>();
</script>
<template>
  <div class="empty-state">
    <div class="empty-icon">
      <BoostIcon :name="icon || 'inbox'" :size="38" />
    </div>
    <h3>{{ title }}<HelpHint v-if="description" :label="title" :text="description" /></h3>
    <slot />
  </div>
</template>
