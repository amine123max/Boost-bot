<script lang="ts">
import { defineComponent, type PropType } from "vue";
import type { BotAppearance } from "../../../shared/appearance/preferences";
import BotAvatar from "./BotAvatar.vue";
import HelpTip from "./HelpTip.vue";
import SelectControl from "./SelectControl.vue";
import { normalizeBotAppearance } from "../../../shared/appearance/preferences";
import {
  flowAnimations,
  flowContours,
  flowPalettes,
} from "../../../shared/appearance/flowStyle";
export default defineComponent({
  components: { BotAvatar, HelpTip, SelectControl },
  props: {
    modelValue: { type: Object as PropType<BotAppearance>, required: true },
  },
  emits: ["update:modelValue"],
  setup(props, { emit }) {
    return {
      colors: flowPalettes.filter(
        (p) => !["cycle", "custom"].includes(p.value),
      ),
      contours: flowContours.filter((p) => p.value !== "auto"),
      animations: flowAnimations,
      set: (key: keyof BotAppearance, value: string) =>
        emit(
          "update:modelValue",
          normalizeBotAppearance({ ...props.modelValue, [key]: value }),
        ),
    };
  },
});
</script>
<template>
  <div class="appearance-picker">
    <div class="identity-preview">
      <BotAvatar :appearance="modelValue" :size="82" /><span
        >视觉身份<HelpTip
          text="每个智能体拥有独立配色和轮廓。动态效果与 Boost 智能体共用，跟随系统减少动画设置。"
      /></span>
    </div>
    <fieldset>
      <legend>颜色</legend>
      <div class="swatches">
        <button
          v-for="p in colors"
          :key="p.value"
          type="button"
          :aria-label="p.label"
          :aria-pressed="modelValue.palette === p.value"
          class="color-option"
          :style="{ '--swatch-light': p.light, '--swatch-dark': p.dark }"
          @click="set('palette', p.value)"
        >
          <span class="swatch-color" /><small>{{ p.label }}</small>
        </button>
      </div>
    </fieldset>
    <fieldset>
      <legend>轮廓</legend>
      <div class="contours">
        <button
          v-for="p in contours"
          :key="p.value"
          type="button"
          :aria-label="p.label"
          :title="p.label"
          :aria-pressed="modelValue.contour === p.value"
          class="contour-option"
          @click="set('contour', p.value)"
        >
          <BotAvatar
            :size="30"
            :appearance="{
              ...modelValue,
              contour: p.value,
              animation: 'still',
            }"
          /><small>{{ p.label }}</small>
        </button>
      </div>
    </fieldset>
    <div class="animation-options">
      <span>动态效果</span
      ><SelectControl
        :model-value="modelValue.animation"
        :options="animations"
        label="动态效果"
        @update:model-value="set('animation', $event)"
      />
    </div>
  </div>
</template>
<style scoped>
.appearance-picker {
  min-width: 0;
  gap: 12px;
  border-bottom: 0;
  padding-bottom: 0;
}
.appearance-picker fieldset {
  min-width: 0;
}
.appearance-picker legend {
  font-size: 12px;
  color: var(--fg-2);
  margin-bottom: 10px;
}
.swatches,
.contours {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
  gap: 8px;
}
.swatches .color-option,
.contours .contour-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: auto;
  height: 48px;
  border: 0;
  background: transparent;
  border-radius: 7px;
}
.swatches .color-option:hover,
.contours .contour-option:hover {
  background: var(--pill);
}
.swatches .color-option[aria-pressed="true"],
.contours .contour-option[aria-pressed="true"] {
  background: var(--pill);
}
.swatches .color-option[aria-pressed="true"] small,
.contours .contour-option[aria-pressed="true"] small {
  color: var(--fg);
  font-weight: 600;
}
.swatches .swatch-color {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: var(--swatch-light);
}
:global(html[data-theme="dark"]) .swatches .swatch-color {
  background: var(--swatch-dark);
}
.swatches small,
.contours small {
  font-size: 10px;
  line-height: 1.2;
  color: var(--fg-2);
  white-space: nowrap;
}
.swatches button:focus-visible,
.contours button:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.identity-preview {
  justify-content: flex-start;
  gap: 18px;
  padding: 0 0 4px;
}
.identity-preview :deep(svg) {
  width: 52px;
  height: 52px;
}
.animation-options {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  font-size: 12px;
  color: var(--fg-2);
}
.animation-options > .select-control {
  max-width: 220px;
}
@media (max-width: 480px) {
  .swatches,
  .contours {
    grid-template-columns: repeat(auto-fit, minmax(52px, 1fr));
  }
}
</style>
