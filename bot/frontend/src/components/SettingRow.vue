<script setup lang="ts">
import HelpTip from "./HelpTip.vue";
defineProps<{ label: string; help?: string }>();
</script>
<template>
  <div class="preference-row">
    <span class="preference-label"
      >{{ label }}<HelpTip v-if="help" :text="help" :label="`${label}说明`"
    /></span>
    <div class="preference-control"><slot /></div>
  </div>
</template>
<style scoped>
.preference-row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: 42px;
  padding: 7px 0;
}
.preference-row + .preference-row {
  border-top: 1px solid var(--line-2);
}
.preference-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--fg);
}
.preference-control {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 8px;
  min-width: 0;
  width: 300px;
  max-width: 58%;
}
.preference-control :deep(.model-select) {
  width: 300px;
  max-width: 100%;
}
.preference-control :deep(.select-control) {
  width: 100%;
}
.preference-control :deep(select),
.preference-control :deep(textarea),
.preference-control :deep(input:not([type="checkbox"])) {
  max-width: 100%;
  width: 100%;
  padding: 6px 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface);
  color: var(--fg);
}
.preference-control :deep(textarea) {
  resize: vertical;
  min-height: 72px;
  width: 300px;
  line-height: 1.6;
  font: inherit;
}
.preference-control :deep(input[type="time"]) {
  width: 140px;
}
.preference-control :deep(input:focus-visible),
.preference-control :deep(select:focus-visible),
.preference-control :deep(textarea:focus-visible) {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.preference-control :deep(input[type="checkbox"]) {
  appearance: none;
  width: 34px;
  height: 20px;
  padding: 2px;
  border: 0;
  border-radius: 20px;
  background: var(--muted);
  position: relative;
  cursor: pointer;
  transition: background 0.18s;
}
.preference-control :deep(input[type="checkbox"])::after {
  content: "";
  display: block;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: white;
  transition: transform 0.18s;
}
.preference-control :deep(input[type="checkbox"]:checked) {
  background: var(--accent);
}
.preference-control :deep(input[type="checkbox"]:checked)::after {
  transform: translateX(14px);
}
.preference-control :deep(input:disabled),
.preference-control :deep(select:disabled) {
  opacity: 0.5;
  cursor: not-allowed;
}
@media (max-width: 600px) {
  .preference-row {
    gap: 8px;
    padding: 7px 0;
    flex-wrap: wrap;
  }
  .preference-control {
    max-width: 65%;
  }
  .preference-control :deep(select) {
    width: 170px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .preference-control :deep(input) {
    transition: none;
  }
}
</style>
