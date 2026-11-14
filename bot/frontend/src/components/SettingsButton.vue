<script setup lang="ts">
import Icon from "./Icon.vue";
withDefaults(defineProps<{ label?: string }>(), { label: "设置" });
</script>
<template>
  <button
    type="button"
    class="icon-btn settings-button"
    :aria-label="label"
    :title="label"
  >
    <Icon name="settings" :size="19" />
  </button>
</template>
<style scoped>
.settings-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  width: 32px;
  height: 32px;
  padding: 0;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  transition:
    color 140ms ease,
    background-color 140ms ease;
}
.settings-button:hover,
.settings-button[aria-expanded="true"] {
  color: var(--fg);
  background: var(--pill);
}
.settings-button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .settings-button {
    transition: none;
  }
}
</style>
