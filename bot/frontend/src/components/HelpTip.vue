<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from "vue";
import Icon from "./Icon.vue";
defineProps<{ text: string; label?: string }>();
const id = useId(),
  open = ref(false),
  anchor = ref<HTMLButtonElement>(),
  tip = ref<HTMLElement>();
const position = ref<Record<string, string>>({}),
  target = ref<HTMLElement | string>("body");
let hideTimer: ReturnType<typeof setTimeout> | undefined;
let pinned = false;
async function show() {
  clearTimeout(hideTimer);
  open.value = true;
  await nextTick();
  const box = anchor.value?.getBoundingClientRect(),
    popup = tip.value?.getBoundingClientRect();
  if (!box || !popup) return;
  position.value = {
    left: `${Math.max(12, Math.min(box.left, innerWidth - popup.width - 12))}px`,
    top: `${box.bottom + popup.height + 12 < innerHeight ? box.bottom + 8 : Math.max(12, box.top - popup.height - 8)}px`,
  };
}
function hide() {
  clearTimeout(hideTimer);
  pinned = false;
  open.value = false;
}
function leave() {
  if (!pinned) hideTimer = setTimeout(hide, 180);
}
function toggle() {
  pinned = !pinned;
  if (pinned) void show();
  else hide();
}
function outside(e: PointerEvent) {
  if (
    !anchor.value?.contains(e.target as Node) &&
    !tip.value?.contains(e.target as Node)
  )
    hide();
}
onMounted(() => {
  target.value = anchor.value?.closest("dialog") || "body";
  document.addEventListener("pointerdown", outside);
  addEventListener("resize", hide);
  addEventListener("scroll", hide, true);
});
onBeforeUnmount(() => {
  clearTimeout(hideTimer);
  document.removeEventListener("pointerdown", outside);
  removeEventListener("resize", hide);
  removeEventListener("scroll", hide, true);
});
</script>
<template>
  <span class="help-wrap" @mouseenter="show" @mouseleave="leave">
    <button
      ref="anchor"
      class="icon-button help-trigger"
      type="button"
      :aria-label="label || '查看说明'"
      :aria-describedby="open ? id : undefined"
      :aria-expanded="open"
      @focus="show"
      @blur="hide"
      @click="toggle"
      @keydown.esc.stop.prevent="hide"
    >
      <Icon name="info" :size="16" />
    </button>
    <Teleport :to="target"
      ><span
        v-if="open"
        ref="tip"
        :id="id"
        role="tooltip"
        class="help-popup"
        :style="position"
        @mouseenter="show"
        @mouseleave="leave"
        >{{ text }}</span
      ></Teleport
    >
  </span>
</template>
