<script setup lang="ts">
import { computed, ref, watch } from "vue";
import BoostIcon from "./BoostIcon.vue";
const props = defineProps<{ code: string; country?: string }>();
const failed = ref(false);
const code = computed(() =>
  /^[a-z]{2}$/i.test(props.code) ? props.code.toLowerCase() : "xx",
);
watch(code, () => {
  failed.value = false;
});
</script>
<template>
  <BoostIcon v-if="failed || code === 'xx'" name="globe-2" :size="25" /><img
    v-else
    class="country-flag"
    :src="`/boost-assets/flags/${code}.svg`"
    :alt="country || code.toUpperCase()"
    width="28"
    height="21"
    @error="failed = true"
  />
</template>
