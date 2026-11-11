<script setup lang="ts">
import { uiPreferences } from "@/composables/useUiPreferences";
import { themeColors } from "@/lib/theme-colors";
</script>

<template>
  <fieldset class="theme-colors">
    <legend>主题主色</legend>
    <div class="theme-color-options">
      <label
        v-for="color in themeColors"
        :key="color.value"
        class="theme-color-option"
        :title="color.label"
        :style="{ '--swatch': color.swatch }"
      >
        <input
          v-model="uiPreferences.themeColor"
          type="radio"
          name="theme-color"
          :value="color.value"
          :aria-label="`主色：${color.label}`"
        />
        <span />
      </label>
    </div>
  </fieldset>
</template>

<style scoped>
.theme-colors {
  min-width: 0;
  margin: 0;
  padding: 16px 0;
  border: 0;
}
.theme-colors legend {
  float: left;
  margin-bottom: 12px;
  color: var(--text);
}
.theme-color-options {
  display: flex;
  clear: both;
  flex-wrap: wrap;
  gap: 8px;
}
.theme-color-option {
  position: relative;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  cursor: pointer;
}
.theme-color-option input {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: 0;
  padding: 0;
  border: 0;
  opacity: 0;
}
.theme-color-option span {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: var(--swatch);
  box-shadow: 0 0 0 2px var(--border);
}
.theme-color-option input:checked + span {
  outline: 2px solid var(--swatch);
  outline-offset: 3px;
  box-shadow: none;
}
.theme-color-option input:focus-visible + span {
  outline: 2px solid var(--text);
  outline-offset: 3px;
}
</style>
