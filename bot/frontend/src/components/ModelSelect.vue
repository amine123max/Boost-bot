<script setup lang="ts">
import { computed } from "vue";
import SelectControl from "./SelectControl.vue";
const props = withDefaults(
  defineProps<{
    modelValue: string;
    models: string[];
    label: string;
    defaultLabel?: string;
    disabled?: boolean;
    allowDefault?: boolean;
  }>(),
  { defaultLabel: "跟随工作台默认模型", allowDefault: true },
);
defineEmits<{ "update:modelValue": [value: string] }>();
const options = computed(() => [
  ...(props.allowDefault
    ? [
        {
          value: "",
          label: props.defaultLabel,
          group: "默认",
          ...(/deepseek|gpt|glm|claude|gemini|qwen|kimi|grok/i.test(
            props.defaultLabel,
          )
            ? { model: props.defaultLabel }
            : {}),
        },
      ]
    : []),
  ...(props.modelValue && !props.models.includes(props.modelValue)
    ? [
        {
          value: props.modelValue,
          label: props.modelValue,
          group: "当前配置",
          model: props.modelValue,
        },
      ]
    : []),
  ...[...new Set(props.models)]
    .sort((a, b) => a.localeCompare(b))
    .map((value) => ({ value, label: value, group: "可用模型", model: value })),
]);
</script>
<template>
  <SelectControl
    :model-value="modelValue"
    :options="options"
    :label="label"
    :placeholder="defaultLabel"
    :disabled="disabled"
    searchable
    @update:model-value="$emit('update:modelValue', $event)"
  />
</template>
