export type ThemeOrigin = { x: number; y: number };
type ThemeTransition = {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition: () => void;
};
type TransitionDocument = Document & {
  startViewTransition?: (apply: () => void | Promise<void>) => ThemeTransition;
};
let active: ThemeTransition | undefined;
export function appearanceMode(theme?: string) {
  return theme === "business" ? "light" : theme === "tech" ? "system" : "dark";
}
export function isDarkAppearance(mode: string, systemDark: boolean) {
  return mode === "dark" || (mode === "system" && systemDark);
}
export function themeCircle(
  origin: ThemeOrigin,
  width: number,
  height: number,
) {
  const x = Math.max(0, Math.min(width, origin.x)),
    y = Math.max(0, Math.min(height, origin.y));
  return {
    x,
    y,
    radius: Math.ceil(
      Math.hypot(Math.max(x, width - x), Math.max(y, height - y)),
    ),
  };
}
export async function applyThemeWithTransition(
  nextMode: string,
  apply: () => void | Promise<void>,
  origin?: ThemeOrigin,
) {
  const doc = document as TransitionDocument,
    root = document.documentElement;
  const dark = isDarkAppearance(
    nextMode,
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const previousDark = isDarkAppearance(
    root.dataset.theme || "dark",
    matchMedia("(prefers-color-scheme: dark)").matches,
  );
  if (
    previousDark === dark ||
    !doc.startViewTransition ||
    matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    await apply();
    return;
  }
  if (active) {
    active.skipTransition();
    await active.finished.catch(() => {});
  }
  root.classList.add("theme-transition");
  root.dataset.themeTransition = dark ? "dark" : "light";
  let applied = false;
  const applyOnce = async () => {
    if (!applied) {
      applied = true;
      await apply();
    }
  };
  let transition: ThemeTransition | undefined;
  try {
    transition = doc.startViewTransition(applyOnce);
    active = transition;
    await transition.ready;
    const circle = themeCircle(
      origin || { x: innerWidth / 2, y: innerHeight / 2 },
      innerWidth,
      innerHeight,
    );
    const closed = `circle(0px at ${circle.x}px ${circle.y}px)`,
      open = `circle(${circle.radius}px at ${circle.x}px ${circle.y}px)`;
    const animation = root.animate(
      { clipPath: dark ? [open, closed] : [closed, open] },
      {
        duration: 640,
        easing: "cubic-bezier(.22, .7, .2, 1)",
        fill: "both",
        pseudoElement: dark
          ? "::view-transition-old(root)"
          : "::view-transition-new(root)",
      },
    );
    await Promise.all([
      transition.finished.catch(() => {}),
      animation.finished.catch(() => {}),
    ]);
  } catch {
    await applyOnce();
    transition?.skipTransition();
  } finally {
    if (!transition || active === transition) {
      active = undefined;
      root.classList.remove("theme-transition");
      delete root.dataset.themeTransition;
    }
  }
}
