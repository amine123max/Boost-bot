<script lang="ts">
import { defineComponent, type PropType } from "vue";
import type { BotAppearance } from "../../../shared/appearance/preferences";
import BotAvatar from "./BotAvatar.vue";
import HelpTip from "./HelpTip.vue";
import { normalizeBotAppearance } from "../../../shared/appearance/preferences";
import {
  flowAnimations,
  flowContours,
  flowPalettes,
} from "../../../shared/appearance/flowStyle";
export default defineComponent({
  components: { BotAvatar, HelpTip },
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
          :style="{ '--swatch': p.dark }"
          @click="set('palette', p.value)"
        >
          <span />
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
          @click="set('contour', p.value)"
        >
          <BotAvatar
            :size="30"
            :appearance="{
              ...modelValue,
              contour: p.value,
              animation: 'still',
            }"
          />
        </button>
      </div>
    </fieldset>
    <label
      >动态效果<select
        :value="modelValue.animation"
        @change="set('animation', ($event.target as HTMLSelectElement).value)"
      >
        <option v-for="a in animations" :value="a.value">{{ a.label }}</option>
      </select></label
    >
  </div>
</template>
