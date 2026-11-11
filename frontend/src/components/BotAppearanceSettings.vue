<script setup lang="ts">
import BoostBotAvatar from './BoostBotAvatar.vue';
import SettingsToggle from './SettingsToggle.vue';
import { botAppearance, flowAnimations, flowContours, flowPalettes, resetBotAppearance } from '@/composables/useBotAppearance';
</script>
<template>
  <section class="bot-appearance-settings" aria-label="智能体外观设置">
    <div class="bot-avatar-preview"><BoostBotAvatar :size="112" active /><strong>Boost 智能体</strong></div>
    <div class="bot-appearance-grid">
      <label>动画表情<select v-model="botAppearance.animation" aria-label="动画表情"><option v-for="option in flowAnimations" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
      <label>身体轮廓<select v-model="botAppearance.contour" aria-label="身体轮廓"><option v-for="option in flowContours" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
      <label>智能体颜色<select v-model="botAppearance.palette" aria-label="智能体颜色"><option v-for="option in flowPalettes" :key="option.value" :value="option.value">{{ option.label }}</option></select></label>
      <label v-if="botAppearance.palette === 'custom'">自定义颜色<input v-model="botAppearance.customColor" type="color" aria-label="自定义颜色" /></label>
      <label>动画速度<select v-model.number="botAppearance.speed" aria-label="动画速度"><option v-for="speed in [.5, .75, 1, 1.25, 1.5]" :key="speed" :value="speed">{{ speed }}×</option></select></label>
      <label>入口大小 <span class="hint">{{ botAppearance.size }} px</span><input v-model.number="botAppearance.size" aria-label="入口大小" type="range" min="28" max="80" step="4" /></label>
    </div>
    <SettingsToggle v-model="botAppearance.followPointer" label="视线跟随指针" />
    <button class="secondary" @click="resetBotAppearance">恢复默认外观</button>
  </section>
</template>
<style scoped>
.bot-appearance-settings { display: grid; gap: 18px; }
.bot-avatar-preview { display: flex; align-items: center; gap: 14px; padding: 10px; border-radius: 12px; background: var(--card); }
.bot-avatar-preview strong { font-size: 20px; }
.bot-appearance-grid { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 16px; }
.bot-appearance-grid label { display: grid; align-content: start; gap: 8px; }
.bot-appearance-grid select { width: 100%; }
@media (max-width: 480px) { .bot-appearance-grid { grid-template-columns: 1fr; } }
</style>
