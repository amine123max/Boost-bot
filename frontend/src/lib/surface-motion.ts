export type SurfaceKind = "dialog" | "menu" | "page" | "tooltip";
const running = new WeakMap<HTMLElement, Animation>();
export function motionAllowed(): boolean {
  return (
    !matchMedia("(prefers-reduced-motion: reduce)").matches &&
    !["off", "reduce"].includes(document.documentElement.dataset.motion || "")
  );
}

/** One damped spring for dialogs, menus and pages; transform/opacity only. */
export function surfaceFrames(kind: SurfaceKind, leaving = false): Keyframe[] {
  const distance = kind === "dialog" ? 10 : kind === "tooltip" ? 3 : 5;
  // Critically damped: acceleration without overshoot or a second recoil.
  const response = (t: number) => 1 - (1 + 9 * t) * Math.exp(-9 * t);
  const end = response(1);
  return Array.from({ length: 33 }, (_, index) => {
    const t = index / 32;
    const p = response(t) / end;
    return {
      offset: t,
      transform: `translateY(${leaving ? -distance * 0.5 * p : distance * (1 - p)}px)`,
      opacity: leaving ? Math.max(0, 1 - t * 1.3) : Math.min(1, t * 5),
    };
  });
}

export function animateSurface(
  node: HTMLElement,
  kind: SurfaceKind,
  leaving = false,
  done?: () => void,
): void {
  running.get(node)?.cancel();
  running.delete(node);
  if (!motionAllowed()) {
    done?.();
    return;
  }
  const animation = node.animate(surfaceFrames(kind, leaving), {
    duration:
      kind === "tooltip"
        ? leaving
          ? 120
          : 180
        : leaving
          ? 160
          : kind === "page"
            ? 260
            : 380,
    easing: "linear",
  });
  running.set(node, animation);
  animation.finished
    .then(() => {
      if (running.get(node) === animation) running.delete(node);
      done?.();
    })
    .catch(() => {});
}

export const springPage = {
  mounted(node: HTMLElement) {
    animateSurface(node, "page");
  },
  updated(
    node: HTMLElement,
    binding: { value: string; oldValue: string | null },
  ) {
    if (binding.value !== binding.oldValue) animateSurface(node, "page");
  },
  beforeUnmount(node: HTMLElement) {
    running.get(node)?.cancel();
    running.delete(node);
  },
};
