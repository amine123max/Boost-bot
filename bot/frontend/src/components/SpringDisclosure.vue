<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { preferences } from "../preferences";
const props = defineProps<{ open: boolean }>();
const outer = ref<HTMLElement>(),
  inner = ref<HTMLElement>();
let frame = 0,
  last = 0,
  position = 0,
  velocity = 0,
  target = 0;
let observer: ResizeObserver | undefined;
const reduced = matchMedia("(prefers-reduced-motion: reduce)");
function paint() {
  if (!outer.value) return;
  outer.value.style.height = `${Math.max(0, position)}px`;
  outer.value.style.opacity = props.open
    ? String(Math.min(1, position / Math.max(1, target)))
    : "1";
}
function finish() {
  position = target;
  velocity = 0;
  frame = 0;
  last = 0;
  paint();
  if (outer.value && props.open) outer.value.style.height = "auto";
}
function step(now: number) {
  const dt = last ? Math.min((now - last) / 1000, 0.032) : 1 / 60;
  last = now;
  velocity += ((target - position) * 290 - velocity * 35) * dt;
  const next = position + velocity * dt;
  if ((target - position) * (target - next) <= 0) {
    finish();
    return;
  }
  position = next;
  paint();
  if (Math.abs(target - position) < 0.2 && Math.abs(velocity) < 0.5) finish();
  else frame = requestAnimationFrame(step);
}
async function update() {
  await nextTick();
  if (!outer.value || !inner.value) return;
  if (!frame) position = outer.value.getBoundingClientRect().height;
  const nextTarget = props.open
    ? inner.value.getBoundingClientRect().height
    : 0;
  if (nextTarget !== target) velocity = 0;
  target = nextTarget;
  if (reduced.matches || preferences.motion !== "full") {
    cancelAnimationFrame(frame);
    finish();
    return;
  }
  if (!frame && Math.abs(position - target) > 0.2)
    frame = requestAnimationFrame(step);
}
watch(() => [props.open, preferences.motion], update);
onMounted(() => {
  observer = new ResizeObserver(update);
  if (inner.value) observer.observe(inner.value);
  reduced.addEventListener("change", update);
  void update();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  observer?.disconnect();
  reduced.removeEventListener("change", update);
});
</script>
<template>
  <div
    ref="outer"
    class="spring-disclosure"
    :inert="!open"
    :aria-hidden="!open"
    style="height: 0; opacity: 0"
  >
    <div ref="inner"><slot /></div>
  </div>
</template>
<style scoped>
.spring-disclosure {
  overflow: hidden;
}
.spring-disclosure > div {
  display: flow-root;
}
</style>
