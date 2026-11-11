<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ name: string; size?: number }>();
const sources = import.meta.glob("../../../assets/icons/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const svg = computed(() =>
  (
    sources[`../../../assets/icons/${props.name}.svg`] ||
    sources["../../../assets/icons/circle-help.svg"]
  ).replace(/stroke-width="[\d.]+"/g, 'stroke-width="1.8"'),
);
</script>
<template>
  <span
    class="boost-icon"
    aria-hidden="true"
    :style="{ width: `${size || 20}px`, height: `${size || 20}px` }"
    v-html="svg"
  />
</template>
