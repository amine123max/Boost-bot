<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, useId, provide } from "vue";
import { dialogContext } from "./dialog-context";
import BoostIcon from "./BoostIcon.vue";
defineProps<{
  title: string;
  wide?: boolean;
  editor?: boolean;
  expanded?: boolean;
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
      :class="{ wide, editor, expanded }"
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
