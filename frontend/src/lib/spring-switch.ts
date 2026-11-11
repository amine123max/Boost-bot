import type { ObjectDirective } from "vue";
import { softSwitchFrames } from "./soft-switch-motion";
const disposers = new WeakMap<HTMLElement, () => void>();
export const springSwitch: ObjectDirective<HTMLElement> = {
  mounted(group) {
    const indicator = document.createElement("span");
    indicator.className = "spring-indicator";
    indicator.setAttribute("aria-hidden", "true");
    group.prepend(indicator);
    group.classList.add("spring-switch");
    let x: number | null = null,
      width = 0,
      frame = 0;
    let animation: Animation | undefined;
    let selectedButton: HTMLElement | null = null;
    let intendedButton: HTMLElement | null = null,
      intendedAt = 0;
    const clicked = (event: Event) => {
      const button =
        event.target instanceof Element
          ? event.target.closest<HTMLButtonElement>("button")
          : null;
      if (button && group.contains(button) && !button.disabled) {
        intendedButton = button;
        intendedAt = performance.now();
      }
    };
    const update = () => {
      if (
        !group.isConnected ||
        group.getClientRects().length === 0 ||
        !group.offsetWidth
      )
        return;
      const selected = group.querySelector<HTMLElement>(
        'button.selected,button[aria-selected="true"]',
      );
      if (!selected) {
        indicator.hidden = true;
        return;
      }
      indicator.hidden = false;
      const nextX = selected.offsetLeft,
        nextWidth = selected.offsetWidth;
      const changedButton = selected !== selectedButton;
      const userInitiated =
        changedButton &&
        intendedButton === selected &&
        performance.now() - intendedAt < 2500;
      selectedButton = selected;
      if (nextX === x && nextWidth === width) return;
      const previous = x;
      const visual = indicator.getBoundingClientRect(),
        container = group.getBoundingClientRect();
      const previousX = animation ? visual.left - container.left : previous;
      const previousWidth = animation ? visual.width : width;
      animation?.cancel();
      animation = undefined;
      x = nextX;
      width = nextWidth;
      indicator.style.transform = `translateX(${nextX}px)`;
      indicator.style.width = `${nextWidth}px`;
      if (
        previous !== null &&
        userInitiated &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        animation = indicator.animate(
          softSwitchFrames(
            previousX ?? previous,
            nextX,
            previousWidth,
            nextWidth,
          ),
          { duration: 620, easing: "linear" },
        );
        intendedButton = null;
      }
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    const observer = new MutationObserver((mutations) => {
      if (
        mutations.some(
          (m) =>
            m.target instanceof HTMLButtonElement ||
            (m.type === "childList" && m.target === group),
        )
      )
        schedule();
    });
    observer.observe(group, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "aria-selected"],
    });
    const resize = new ResizeObserver(schedule);
    resize.observe(group);
    group.addEventListener("click", clicked);
    schedule();
    disposers.set(group, () => {
      observer.disconnect();
      resize.disconnect();
      group.removeEventListener("click", clicked);
      cancelAnimationFrame(frame);
      animation?.cancel();
      indicator.remove();
    });
  },
  unmounted(group) {
    disposers.get(group)?.();
    disposers.delete(group);
  },
};
