<script setup lang="ts">
import SpringSurface from "../../../../frontend/src/components/SpringSurface.vue";
import { nextTick, onBeforeUnmount, onMounted, ref, useId } from "vue";
import Icon from "./Icon.vue";
defineProps<{ text: string; label?: string }>();
const id = useId(),
  open = ref(false),
  anchor = ref<HTMLButtonElement>(),
  tip = ref<HTMLElement>();
const position = ref<Record<string, string>>({}),
  target = ref<HTMLElement | string>("body");
async function show() {
  target.value = anchor.value?.closest("dialog") || "body";
  open.value = true;
  await nextTick();
  const box = anchor.value?.getBoundingClientRect(),
    popup = tip.value?.getBoundingClientRect();
  if (!open.value || !box || !popup) return;
  position.value = {
    left: `${Math.max(12, Math.min(box.left, innerWidth - popup.width - 12))}px`,
    top: `${box.bottom + popup.height + 12 < innerHeight ? box.bottom + 8 : Math.max(12, box.top - popup.height - 8)}px`,
  };
}
function hide() {
  open.value = false;
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
  document.removeEventListener("pointerdown", outside);
  removeEventListener("resize", hide);
  removeEventListener("scroll", hide, true);
});
</script>
<template>
  <span class="help-wrap" @mouseenter="show" @mouseleave="hide">
    <button
      ref="anchor"
      class="icon-button help-trigger"
      type="button"
      :aria-label="label || '查看说明'"
      :aria-describedby="open ? id : undefined"
      :aria-expanded="open"
      @focus="show"
      @blur="hide"
      @click="show"
      @mouseleave="hide"
      @keydown.esc.stop.prevent="hide"
    >
      <Icon name="info" :size="16" />
    </button>
    <Teleport :to="target"
      ><SpringSurface kind="tooltip"
        ><span
          v-if="open"
          ref="tip"
          :id="id"
          role="tooltip"
          class="help-popup"
          :style="position"
          >{{ text }}</span
        ></SpringSurface
      ></Teleport
    >
  </span>
</template>
