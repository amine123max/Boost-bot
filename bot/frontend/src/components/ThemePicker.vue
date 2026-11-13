<script setup lang="ts">
import { theme, setTheme } from "../host";
const options = [
  { value: "system", label: "跟随系统" },
  { value: "light", label: "浅色" },
  { value: "dark", label: "深色" },
];
function select(value: string, event: MouseEvent) {
  const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
  void setTheme(value, false, {
    x: box.left + box.width / 2,
    y: box.top + box.height / 2,
  });
}
</script>
<template>
  <div class="theme-options" aria-label="主题">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      :aria-label="option.label + '主题'"
      :aria-pressed="theme === option.value"
      @click="select(option.value, $event)"
    >
      <span class="theme-preview" :class="option.value" aria-hidden="true"
        ><span class="theme-side" /><span class="theme-main"
          ><i /><i /><i /></span></span
      ><span>{{ option.label }}</span>
    </button>
  </div>
</template>
<style scoped>
.theme-options {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--space-3);
}
.theme-options > button {
  display: grid;
  gap: var(--space-2);
  text-align: center;
  color: var(--fg-2);
  font-size: var(--fs-sm);
}
.theme-preview {
  --preview-bg: var(--white);
  --preview-line: var(--line);
  display: flex;
  height: 86px;
  border: 1px solid var(--line);
  border-radius: var(--r-xl);
  overflow: hidden;
  background: var(--preview-bg);
  padding: var(--space-1);
}
.theme-preview.dark {
  --preview-bg: var(--black);
}
.theme-preview.system {
  background: linear-gradient(90deg, var(--white) 50%, var(--black) 50%);
}
.theme-side {
  width: 24%;
  background: color-mix(in srgb, var(--muted) 10%, transparent);
  border-radius: var(--r-md) 0 0 var(--r-md);
}
.theme-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: end;
  padding: var(--space-2);
  gap: var(--space-1);
  flex: 1;
}
.theme-main i {
  height: var(--space-1);
  width: 80%;
  border-radius: var(--r-full);
  background: color-mix(in srgb, var(--muted) 25%, transparent);
}
.theme-main i:nth-child(2) {
  width: 55%;
}
.theme-main i:last-child {
  height: var(--space-3);
  width: 100%;
  margin-top: var(--space-1);
}
.theme-options > button[aria-pressed="true"] .theme-preview {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (max-width: 480px) {
  .theme-preview {
    height: 65px;
  }
}
</style>
