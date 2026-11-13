<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, useId, provide } from "vue";
import { dialogContext } from "./dialog-context";
import BoostIcon from "./BoostIcon.vue";
defineProps<{
  title: string;
  wide?: boolean;
  editor?: boolean;
  expanded?: boolean;
  confirmation?: boolean;
}>();
const emit = defineEmits<{ close: [] }>();
const titleId = useId();
const footer = ref<HTMLElement>();
const actions = ref(0);
provide(dialogContext, { footer, actions, formId: `${titleId}-form` });
const dialog = ref<HTMLDialogElement>();
const previous = document.activeElement as HTMLElement | null;
onMounted(() => dialog.value?.showModal());
onBeforeUnmount(() => {
  dialog.value?.close();
  previous?.focus();
});
</script>
<template>
  <Teleport to="body"
    ><dialog
      ref="dialog"
      :aria-labelledby="titleId"
      class="modal"
      :class="{ wide, editor, expanded, confirmation }"
      @cancel.prevent="emit('close')"
      @click="$event.target === dialog && emit('close')"
    >
      <div class="modal-heading">
        <slot name="title-leading" />
        <h2 :id="titleId">{{ title }}</h2>
        <slot name="title-extra" />
        <button
          class="icon-button"
          aria-label="关闭对话框"
          @click="emit('close')"
        >
          <BoostIcon name="x" />
        </button>
      </div>
      <div class="modal-content"><slot /></div>
      <footer
        ref="footer"
        v-show="$slots.footer || actions"
        class="modal-footer"
      >
        <slot name="footer" />
      </footer></dialog
  ></Teleport>
</template>
<style scoped>
.modal.confirmation {
  width: min(440px, calc(100vw - 32px));
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 16px 48px #0003;
  overflow: hidden;
}
.confirmation .modal-heading {
  gap: 11px;
  padding: 19px 20px 13px;
  align-items: center;
}
.confirmation .modal-heading h2 {
  font-size: 18px;
  font-weight: 650;
  letter-spacing: -0.2px;
}
.confirmation .modal-heading > .icon-button {
  width: 26px;
  height: 26px;
  padding: 4px;
  border-radius: 7px;
  color: var(--muted);
}
.confirmation .modal-content {
  padding: 4px 22px 20px;
}
.confirmation .modal-footer {
  padding: 14px 20px 18px;
  border-top: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  background: color-mix(in srgb, var(--text) 1.5%, var(--dialog));
}
</style>
