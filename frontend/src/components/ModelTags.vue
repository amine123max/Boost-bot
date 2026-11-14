<script setup lang="ts">
import { computed } from "vue";
import ModelLabel from "./ModelLabel.vue";
const props = defineProps<{ value: string }>();
const models = computed(() => [
  ...new Set(
    props.value
      .split(/[,\n]/)
      .map((model) => model.trim())
      .filter(Boolean),
  ),
]);
</script>
<template>
  <span v-if="models.length" class="model-tags"
    ><ModelLabel v-for="model in models" :key="model" :model="model"
  /></span>
</template>
<style scoped>
.model-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 12px;
}
</style>
