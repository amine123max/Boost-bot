export function installButtonEffects() {
  function ripple(event: PointerEvent | KeyboardEvent) {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (
      event instanceof KeyboardEvent &&
      (event.repeat || !["Enter", " "].includes(event.key))
    )
      return;
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>(
            'button:not([role="switch"]), a.nav-item, a.primary, a.secondary, a.icon-button',
          )
        : null;
    if (!target || target.matches(':disabled,[aria-disabled="true"]')) return;
    const bounds = target.getBoundingClientRect();
    const x =
      event instanceof PointerEvent
        ? event.clientX - bounds.left
        : bounds.width / 2;
    const y =
      event instanceof PointerEvent
        ? event.clientY - bounds.top
        : bounds.height / 2;
    const radius = Math.hypot(
      Math.max(x, bounds.width - x),
      Math.max(y, bounds.height - y),
    );
    const wave = document.createElement("span");
    wave.className = "click-ripple";
    wave.setAttribute("aria-hidden", "true");
    Object.assign(wave.style, {
      width: `${radius * 2}px`,
      height: `${radius * 2}px`,
      left: `${x - radius}px`,
      top: `${y - radius}px`,
    });
    target.append(wave);
    wave.addEventListener("animationend", () => wave.remove(), { once: true });
    setTimeout(() => wave.remove(), 700);
  }
  document.addEventListener("pointerdown", ripple);
  document.addEventListener("keydown", ripple);
  return () => {
    document.removeEventListener("pointerdown", ripple);
    document.removeEventListener("keydown", ripple);
  };
}
