import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

// Preserve velocity when interrupted; a new click or gesture never restarts at zero.
export function useSpringCarousel(
  viewport: Ref<HTMLElement | undefined>,
  index: Ref<number>,
  count: Ref<number>,
  select: (index: number) => void,
) {
  const offset = ref(0),
    dragging = ref(false);
  const width = ref(1);
  let position = 0,
    velocity = 0,
    target = 0,
    frame = 0,
    previousTime = 0;
  let observer: ResizeObserver | undefined;
  let pointer:
    | {
        id: number;
        start: number;
        previous: number;
        at: number;
        position: number;
      }
    | undefined;
  let reduced = false;
  const media = matchMedia("(prefers-reduced-motion: reduce)");
  function render() {
    offset.value = position;
  }
  function stop() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
  }
  function tick(time: number) {
    const dt = Math.min(
      0.032,
      previousTime ? (time - previousTime) / 1000 : 1 / 60,
    );
    previousTime = time;
    // Substeps keep the same spring stable on both 60 Hz and high refresh screens.
    const steps = Math.ceil(dt / 0.008),
      step = dt / steps;
    for (let i = 0; i < steps; i++) {
      velocity += ((target - position) * 280 - velocity * 28) * step;
      position += velocity * step;
    }
    if (Math.abs(target - position) < 0.08 && Math.abs(velocity) < 0.8) {
      position = target;
      velocity = 0;
      render();
      stop();
      return;
    }
    render();
    frame = requestAnimationFrame(tick);
  }
  function animate() {
    if (reduced) {
      stop();
      position = target;
      velocity = 0;
      render();
    } else if (!frame) frame = requestAnimationFrame(tick);
  }
  function sync() {
    target = -Math.max(0, index.value) * width.value;
    if (!dragging.value) animate();
  }
  function motion() {
    reduced = media.matches;
    if (reduced) sync();
  }
  watch([index, count], sync);
  function pointerDown(event: PointerEvent) {
    if (
      event.button !== 0 ||
      (event.target as Element).closest("button, [draggable=true]")
    )
      return;
    stop();
    dragging.value = true;
    velocity = 0;
    pointer = {
      id: event.pointerId,
      start: event.clientX,
      previous: event.clientX,
      at: event.timeStamp,
      position,
    };
    viewport.value?.setPointerCapture(event.pointerId);
  }
  function pointerMove(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const delta = event.clientX - pointer.start;
    let next = pointer.position + delta;
    const min = -(count.value - 1) * width.value;
    if (next > 0) next *= 0.23;
    if (next < min) next = min + (next - min) * 0.23;
    const dt = Math.max(8, event.timeStamp - pointer.at) / 1000;
    velocity =
      0.55 * velocity + (0.45 * (event.clientX - pointer.previous)) / dt;
    position = next;
    pointer.previous = event.clientX;
    pointer.at = event.timeStamp;
    render();
  }
  function pointerUp(event: PointerEvent) {
    if (!pointer || pointer.id !== event.pointerId) return;
    const delta = event.clientX - pointer.start;
    const fast = Math.abs(velocity) > 280 && Math.abs(delta) > 10;
    const next =
      Math.abs(delta) > width.value * 0.2 || fast
        ? index.value + (delta < 0 ? 1 : -1)
        : index.value;
    pointer = undefined;
    dragging.value = false;
    const bounded = Math.max(0, Math.min(count.value - 1, next));
    select(bounded);
    target = -bounded * width.value;
    animate();
  }
  function cancel() {
    pointer = undefined;
    dragging.value = false;
    sync();
  }
  onMounted(() => {
    reduced = media.matches;
    media.addEventListener("change", motion);
    observer = new ResizeObserver((entries) => {
      const next = entries[0]?.contentRect.width || 1;
      if (next === width.value) return;
      stop();
      width.value = next;
      target = -index.value * next;
      position = target;
      velocity = 0;
      render();
    });
    if (viewport.value) observer.observe(viewport.value);
  });
  onBeforeUnmount(() => {
    stop();
    observer?.disconnect();
    media.removeEventListener("change", motion);
  });
  return { offset, dragging, pointerDown, pointerMove, pointerUp, cancel };
}
