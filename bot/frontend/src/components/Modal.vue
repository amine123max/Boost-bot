<script lang="ts">
import { defineComponent, onMounted, ref, useId } from "vue";
import Icon from "./Icon.vue";
import SpringSurface from "../../../../frontend/src/components/SpringSurface.vue";
export default defineComponent({
  components: { Icon, SpringSurface },
  props: { title: String, wide: Boolean, busy: Boolean },
  emits: ["close"],
  setup(props, { emit }) {
    const dialog = ref<HTMLDialogElement>(),
      titleId = useId();
    let previous: HTMLElement | null;
    onMounted(() => {
      previous = document.activeElement as HTMLElement | null;
      dialog.value?.showModal();
    });
    const visible = ref(true);
    function requestClose() {
      if (!props.busy) visible.value = false;
    }
    function actionClose(event: MouseEvent) {
      if ((event.target as Element).closest("button[data-dialog-close]")) {
        event.preventDefault();
        event.stopPropagation();
        requestClose();
      }
    }
    function close(event: MouseEvent) {
      if (event.target === dialog.value) {
        const b = dialog.value!.getBoundingClientRect();
        if (
          event.clientX < b.left ||
          event.clientX > b.right ||
          event.clientY < b.top ||
          event.clientY > b.bottom
        )
          requestClose();
      }
    }
    const closed = () => {
      previous?.focus?.({ preventScroll: true });
      if (!visible.value) emit("close");
    };
    return {
      dialog,
      titleId,
      close,
      closed,
      visible,
      requestClose,
      actionClose,
    };
  },
});
</script>
<template>
  <Teleport to="body"
    ><SpringSurface kind="dialog" @after-leave="closed"
      ><dialog
        v-if="visible"
        ref="dialog"
        class="workspace-dialog"
        :class="{ 'is-wide': wide }"
        :aria-labelledby="titleId"
        @cancel.prevent="requestClose"
        @click="close"
        @click.capture="actionClose"
      >
        <header>
          <h2 :id="titleId">
            <slot name="heading">{{ title }}</slot>
          </h2>
          <button
            type="button"
            class="icon-button"
            aria-label="关闭"
            :disabled="busy"
            @click="requestClose"
          >
            <Icon name="close" />
          </button>
        </header>
        <slot /></dialog></SpringSurface
  ></Teleport>
</template>
