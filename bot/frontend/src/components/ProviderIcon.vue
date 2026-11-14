<script setup lang="ts">
import { computed } from "vue";
import Icon from "./Icon.vue";
import { modelProvider } from "../../../shared/appearance/modelProvider";
const props = withDefaults(defineProps<{ model?: string; size?: number }>(), {
  size: 17,
});
const sources = import.meta.glob("../assets/providers/*.svg", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;
const provider = computed(() => modelProvider(props.model));
const svg = computed(
  () => sources[`../assets/providers/${provider.value}.svg`] || "",
);
</script>
<template>
  <span
    v-if="svg"
    class="provider-icon"
    :data-provider="provider"
    aria-hidden="true"
    :style="{ width: size + 'px', height: size + 'px' }"
    v-html="svg"
  /><Icon v-else name="model" :size="size" />
</template>
<style scoped>
.provider-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  color: var(--fg-2);
}
.provider-icon :deep(svg) {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
