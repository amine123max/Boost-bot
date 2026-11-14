<script lang="ts">
import { defineComponent, onMounted, ref, useId } from "vue";
import Icon from "./Icon.vue";
import SpringSurface from "../../../../frontend/src/components/SpringSurface.vue";
export default defineComponent({
  components: { Icon, SpringSurface },
  props: { title: String, wide: Boolean, busy: Boolean, compact: Boolean, qr: Boolean },
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
        :class="{ 'is-wide': wide, 'is-compact': compact, 'is-qr': qr }"
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
<style scoped>
.workspace-dialog.is-compact { width: min(384px, calc(100vw - 24px)); }
.workspace-dialog.is-qr { width: min(304px, calc(100vw - 24px)); }
.workspace-dialog.is-compact :deep(.editor-form), .workspace-dialog.is-qr :deep(.editor-form) { gap: 12px; }
.workspace-dialog.is-qr :deep(.dialog-actions) { gap: 6px; flex-wrap: wrap; }
.workspace-dialog.is-qr :deep(.dialog-actions button) { padding-inline: 9px; font-size: 12px; }
.workspace-dialog > :deep(.dialog-actions) { margin: 0; bottom: 0; padding: 10px 16px; flex-wrap: wrap; }
.workspace-dialog :deep(.dialog-actions) { flex-wrap: wrap; }
.workspace-dialog :deep(.dialog-actions > button) { flex: 0 0 auto; white-space: nowrap; }
.workspace-dialog > header > .icon-button { flex: 0 0 28px; width: 28px; height: 28px; }
.workspace-dialog > header > h2 { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
