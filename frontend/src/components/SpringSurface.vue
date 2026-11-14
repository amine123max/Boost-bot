<script setup lang="ts">
import { animateSurface, type SurfaceKind } from "../lib/surface-motion";
withDefaults(defineProps<{ kind?: SurfaceKind }>(), { kind: "menu" });
defineEmits<{ "after-leave": [] }>();
function leave(element: Element, done: () => void, kind: SurfaceKind) {
  const node = element as HTMLElement;
  node.inert = true;
  node.style.pointerEvents = "none";
  node.setAttribute("aria-hidden", "true");
  animateSurface(node, kind, true, () => {
    if (node instanceof HTMLDialogElement) node.close();
    else if (node.matches(":popover-open")) node.hidePopover();
    done();
  });
}
function enter(element: Element, done: () => void, kind: SurfaceKind) {
  const node = element as HTMLElement;
  node.inert = false;
  node.style.removeProperty("pointer-events");
  node.removeAttribute("aria-hidden");
  animateSurface(node, kind, false, done);
}
</script>
<template>
  <Transition
    appear
    :css="false"
    @enter="(el, done) => enter(el, done, kind)"
    @leave="(el, done) => leave(el, done, kind)"
    @after-leave="$emit('after-leave')"
    ><slot
  /></Transition>
</template>
