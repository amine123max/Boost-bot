<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, useId } from "vue";
import BoostIcon from "./BoostIcon.vue";
const props = defineProps<{ text: string; label?: string }>();
const id = useId();
const trigger = ref<HTMLElement>();
const tooltip = ref<HTMLElement>();
const open = ref(false);
const position = ref({ left: "0px", top: "0px" });
let hideTimer: ReturnType<typeof setTimeout> | undefined;
async function show() {
  clearTimeout(hideTimer);
  if (open.value) return;
  open.value = true;
  await nextTick();
  if (!open.value || !tooltip.value || !trigger.value) return;
  tooltip.value.showPopover();
  const anchor = trigger.value.getBoundingClientRect();
  const box = tooltip.value.getBoundingClientRect();
  position.value = {
    left: `${Math.max(8, Math.min(anchor.left, window.innerWidth - box.width - 8))}px`,
    top: `${anchor.bottom + box.height + 8 < window.innerHeight ? anchor.bottom + 6 : Math.max(8, anchor.top - box.height - 6)}px`,
  };
}
function hide() {
  clearTimeout(hideTimer);
  tooltip.value?.hidePopover();
  open.value = false;
}
function keepOpen() {
  clearTimeout(hideTimer);
}
function leave() {
  hideTimer = setTimeout(hide, 120);
}
onBeforeUnmount(() => {
  clearTimeout(hideTimer);
});
</script>
<template>
  <span
    class="help-hint"
    @mouseenter="show"
    @mouseleave="leave"
    @keydown.esc.stop="hide"
  >
    <span
      ref="trigger"
      class="help-hint-trigger"
      tabindex="0"
      role="button"
      :aria-label="`${props.label || '帮助'}说明`"
      :aria-describedby="open ? id : undefined"
      @focus="show"
      @blur="leave"
      @click.prevent.stop="open ? hide() : show()"
      @keydown.enter.prevent.stop="open ? hide() : show()"
      @keydown.space.prevent.stop="open ? hide() : show()"
    >
      <BoostIcon name="info" :size="14" />
    </span>
    <span
      v-if="open"
      :id="id"
      ref="tooltip"
      role="tooltip"
      popover="manual"
      class="help-hint-tooltip"
      :style="position"
      @mouseenter="keepOpen"
      @mouseleave="leave"
      >{{ text }}</span
    >
  </span>
</template>
<style>
.help-hint {
  display: inline-flex;
  flex: 0 0 auto;
  vertical-align: middle;
  margin-inline-start: 5px;
}
.help-hint-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  color: var(--muted);
  cursor: help;
  border-radius: 50%;
}
.help-hint-trigger:hover,
.help-hint-trigger:focus-visible {
  color: var(--text);
  background: var(--hover);
}
.help-hint-trigger:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 2px;
}
.help-hint-tooltip {
  position: fixed;
  inset: auto;
  margin: 0;
  width: max-content;
  max-width: min(300px, calc(100vw - 16px));
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--dialog);
  color: var(--text);
  box-shadow: 0 6px 20px #0003;
  font-size: 12px;
  font-weight: 400;
  line-height: 1.6;
  white-space: normal;
  overflow-wrap: anywhere;
  text-align: left;
}
.help-hint-tooltip::backdrop {
  background: transparent;
  pointer-events: none;
}
</style>
