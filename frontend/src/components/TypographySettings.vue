<script setup lang="ts">
import { uiPreferences } from "@/composables/useUiPreferences";
import { typographyDefaults } from "@/lib/ui-typography";
import { notify } from "@/composables/useNotifications";
function reset() {
  Object.assign(uiPreferences, typographyDefaults);
  notify("文字显示已重置");
}
</script>
<template>
  <div class="typography-settings">
    <div class="setting-row typography-row">
      <label for="boost-font-size" class="setting-label">界面字号</label>
      <div class="typography-control">
        <input
          id="boost-font-size"
          v-model.number="uiPreferences.fontSize"
          type="range"
          min="11"
          max="16"
          step="0.5"
        /><output for="boost-font-size">{{ uiPreferences.fontSize }} px</output>
      </div>
    </div>
    <div class="setting-row">
      <label for="boost-font-weight" class="setting-label">字重</label
      ><select id="boost-font-weight" v-model.number="uiPreferences.fontWeight">
        <option :value="400">常规</option>
        <option :value="500">中等</option>
        <option :value="600">加粗</option>
      </select>
    </div>
    <div class="setting-row typography-row">
      <label for="boost-letter-spacing" class="setting-label">字间距</label>
      <div class="typography-control">
        <input
          id="boost-letter-spacing"
          v-model.number="uiPreferences.letterSpacing"
          type="range"
          min="-0.3"
          max="1.2"
          step="0.1"
        /><output for="boost-letter-spacing"
          >{{ uiPreferences.letterSpacing.toFixed(1) }} px</output
        >
      </div>
    </div>
    <div class="form-actions">
      <button class="secondary" @click="reset">恢复默认</button>
    </div>
  </div>
</template>
