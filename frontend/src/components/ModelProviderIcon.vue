<script setup lang="ts">
import { computed } from "vue";
import { modelProvider } from "../../../bot/shared/appearance/modelProvider";
import BoostIcon from "./BoostIcon.vue";
const props = withDefaults(defineProps<{ model?: string; manufacturer?: string; size?: number }>(), {
  size: 16,
});
const provider = computed(() => modelProvider(props.model, props.manufacturer));
</script>
<template>
  <BoostIcon
    v-if="provider"
    :name="`provider-${provider}`"
    :size="size"
    :data-provider="provider"
    class="model-provider-icon"
  />
</template>
