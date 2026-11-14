<script setup lang="ts">
import { computed } from "vue";
import { modelProvider } from "../../../bot/shared/appearance/modelProvider";
import BoostIcon from "./BoostIcon.vue";
const props = withDefaults(defineProps<{ model?: string; size?: number }>(), {
  size: 16,
});
const provider = computed(() => modelProvider(props.model));
</script>
<template>
  <BoostIcon
    :name="provider ? `provider-${provider}` : 'boxes'"
    :size="size"
    :data-provider="provider || 'unknown'"
    class="model-provider-icon"
  />
</template>
