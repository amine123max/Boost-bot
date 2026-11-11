<script setup lang="ts">
import { inject, ref, onMounted, onBeforeUnmount, nextTick } from "vue";
import { dialogContext } from "./dialog-context";
const context = inject(dialogContext);
const source = ref<HTMLElement>();
const mounted = ref(false);
onMounted(async () => {
  const form = source.value?.closest("form");
  if (form && context) {
    form.id ||= context.formId;
    source.value
      ?.querySelectorAll("button,input")
      .forEach((control) => control.setAttribute("form", form.id));
  }
  if (context) context.actions.value++;
  await nextTick();
  mounted.value = true;
});
onBeforeUnmount(() => {
  if (context) context.actions.value--;
});
</script>
<template>
  <Teleport
    :to="context?.footer.value || 'body'"
    :disabled="!mounted || !context?.footer.value"
    ><div ref="source" class="form-actions dialog-actions"><slot /></div
  ></Teleport>
</template>
