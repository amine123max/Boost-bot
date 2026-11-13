<script lang="ts">
import { defineComponent, onBeforeUnmount, onMounted, ref, useId } from "vue";
import Icon from "./Icon.vue";
export default defineComponent({
  components: { Icon },
  props: { title: String },
  emits: ["close"],
  setup(_, { emit }) {
    const dialog = ref<HTMLDialogElement>(),
      titleId = useId();
    let previous: HTMLElement | null;
    onMounted(() => {
      previous = document.activeElement as HTMLElement | null;
      dialog.value?.showModal();
    });
    onBeforeUnmount(() => {
      dialog.value?.close();
      previous?.focus?.();
    });
    function close(event: MouseEvent) {
      if (event.target === dialog.value) {
        const b = dialog.value!.getBoundingClientRect();
        if (
          event.clientX < b.left ||
          event.clientX > b.right ||
          event.clientY < b.top ||
          event.clientY > b.bottom
        )
          emit("close");
      }
    }
    return { dialog, titleId, close };
  },
});
</script>
<template>
  <Teleport to="body"
    ><dialog
      ref="dialog"
      class="workspace-dialog"
      :aria-labelledby="titleId"
      @cancel.prevent="$emit('close')"
      @click="close"
    >
      <header>
        <h2 :id="titleId">
          <slot name="heading">{{ title }}</slot>
        </h2>
        <button
          type="button"
          class="icon-button"
          aria-label="关闭"
          @click="$emit('close')"
        >
          <Icon name="close" />
        </button>
      </header>
      <slot /></dialog
  ></Teleport>
</template>
