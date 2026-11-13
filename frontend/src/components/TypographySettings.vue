<script setup lang="ts">
import { uiPreferences } from "@/composables/useUiPreferences";
import {
  typographyDefaults,
  chineseFontOptions,
  englishFontOptions,
  numberFontOptions,
} from "@/lib/ui-typography";
import { notify } from "@/composables/useNotifications";
function reset() {
  Object.assign(uiPreferences, typographyDefaults);
  notify("文字显示已重置");
}
</script>
<template>
  <div class="typography-settings">
    <div class="setting-row typography-font-row">
      <label for="boost-chinese-font" class="setting-label">中文字体</label>
      <select id="boost-chinese-font" v-model="uiPreferences.chineseFont">
        <option
          v-for="font in chineseFontOptions"
          :key="font.value"
          :value="font.value"
        >
          {{ font.label }}
        </option>
      </select>
    </div>
    <div class="setting-row typography-font-row">
      <label for="boost-english-font" class="setting-label">英文字体</label>
      <select id="boost-english-font" v-model="uiPreferences.englishFont">
        <option
          v-for="font in englishFontOptions"
          :key="font.value"
          :value="font.value"
        >
          {{ font.label }}
        </option>
      </select>
    </div>
    <div class="setting-row typography-font-row">
      <label for="boost-number-font" class="setting-label">数字字体</label>
      <select id="boost-number-font" v-model="uiPreferences.numberFont">
        <option
          v-for="font in numberFontOptions"
          :key="font.value"
          :value="font.value"
        >
          {{ font.label }}
        </option>
      </select>
    </div>
    <div class="typography-preview" role="group" aria-label="字体效果预览">
      <span class="typography-preview-caption">效果预览</span>
      <p lang="zh-CN">中文字体 · 清晰呈现每一项数据</p>
      <p lang="en">The quick brown fox · Boost</p>
      <p class="typography-preview-numbers">0123456789 · $18,699.92 · 90.7%</p>
    </div>
    <p class="typography-font-note">
      即时生效并保存在本机。使用已安装的字体，未安装时自动使用替代字体。
    </p>
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
<style scoped>
.typography-font-row select {
  width: min(210px, 60%);
}
.typography-preview {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px 16px;
  margin: 12px 0 8px;
  background: var(--surface);
  display: grid;
  gap: 8px;
  overflow-wrap: anywhere;
}
.typography-preview-caption,
.typography-font-note {
  font-size: calc(11px * var(--font-scale));
  color: var(--muted);
  line-height: 1.6;
}
.typography-preview p {
  font-size: calc(16px * var(--font-scale));
  line-height: 1.5;
}
.typography-preview .typography-preview-numbers {
  font-size: calc(20px * var(--font-scale));
  font-variant-numeric: tabular-nums;
}
.typography-font-note {
  margin-bottom: 8px;
}
</style>
