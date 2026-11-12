<script setup lang="ts">
import { computed } from "vue";
import SettingsToggle from "./SettingsToggle.vue";
import HelpHint from "./HelpHint.vue";
import { trayPreferences } from "@/composables/useTrayPreferences";
import { trayItems } from "@/lib/tray-preferences";
const count = computed(
  () => trayItems.filter((item) => trayPreferences[item.key]).length,
);
</script>
<template>
  <div class="tray-display-settings">
    <SettingsToggle
      v-for="item in trayItems"
      :key="item.key"
      :label="item.label"
      :model-value="trayPreferences[item.key]"
      :disabled="count === 1 && trayPreferences[item.key]"
      @update:model-value="trayPreferences[item.key] = $event"
    />
    <SettingsToggle v-model="trayPreferences.showRingValues" label="环内数值" />
    <span class="tray-display-note"
      >TPS<HelpHint
        label="TPS"
        text="使用日志或内置 Bot 报告的输出 token 数与实际时间计算最近采样速率；圆环以固定速度旋转，颜色随 TPS 数值由红色平滑渐变到绿色，达到 40 TPS 时为绿色；速率未知时显示中性色。任务进度由智能体图标外侧的圆环单独显示。"
    /></span>
  </div>
</template>
<style scoped>
.tray-display-note {
  color: var(--muted);
  font-size: 14px;
}
</style>
