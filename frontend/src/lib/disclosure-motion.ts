import { motionAllowed } from './surface-motion';

/** Native details keep their semantics and toggle events while both directions animate. */
export function installDisclosureMotion(): () => void {
  const active = new Map<HTMLDetailsElement, { animation: Animation; observer: MutationObserver; open: boolean; height: string; overflow: string }>();
  const finish = (details: HTMLDetailsElement, close: boolean) => {
    const state = active.get(details);
    if (!state) return;
    state.observer.disconnect(); active.delete(details);
    state.animation.cancel();
    details.style.height = state.height; details.style.overflow = state.overflow;
    if (close) details.open = false;
  };
  const frames = (from: number, to: number): Keyframe[] => {
    const response = (t: number) => 1 - (1 + 8 * t) * Math.exp(-8 * t), end = response(1);
    return Array.from({ length: 25 }, (_, index) => ({ offset: index / 24, height: `${from + (to - from) * response(index / 24) / end}px` }));
  };
  function animate(details: HTMLDetailsElement, open: boolean) {
    const previous = active.get(details);
    const from = details.getBoundingClientRect().height;
    const height = previous?.height ?? details.style.height, overflow = previous?.overflow ?? details.style.overflow;
    if (previous) finish(details, false);
    if (!motionAllowed()) { details.open = open; details.dataset.springOpen = String(open); return; }
    details.open = true;
    details.dataset.springOpen = String(open);
    const summary = details.querySelector<HTMLElement>(':scope > summary');
    if (!summary) return;
    const measure = () => {
      details.style.height = height;
      const target = open ? details.getBoundingClientRect().height
        : summary.getBoundingClientRect().height + parseFloat(getComputedStyle(details).paddingTop || '0') + parseFloat(getComputedStyle(details).paddingBottom || '0') + parseFloat(getComputedStyle(details).borderTopWidth || '0') + parseFloat(getComputedStyle(details).borderBottomWidth || '0');
      return target;
    };
    const start = (current: number) => {
      const to = measure();
      details.style.height = `${current}px`; details.style.overflow = 'hidden';
      const animation = details.animate(frames(current, to), { duration: 280, easing: 'linear', fill: 'both' });
      return animation;
    };
    const state = { animation: start(from), observer: new MutationObserver(() => {
      if (!open || !details.isConnected) return;
      const current = details.getBoundingClientRect().height;
      state.animation.cancel(); state.animation = start(current);
      complete();
    }), open, height, overflow };
    const complete = () => { const animation = state.animation; animation.finished.then(() => { if (active.get(details)?.animation === animation) finish(details, !open); }).catch(() => {}); };
    active.set(details, state);
    state.observer.observe(details, { childList: true, subtree: true, characterData: true });
    complete();
  }
  function click(event: MouseEvent) {
    if (event.defaultPrevented || event.button !== 0 || !(event.target instanceof Element)) return;
    const summary = event.target.closest('summary'), details = summary?.parentElement;
    if (!(details instanceof HTMLDetailsElement)) return;
    if (event.target.closest('button, a, input, select, textarea')) return;
    event.preventDefault();
    animate(details, !(active.get(details)?.open ?? details.open));
  }
  const removal = new MutationObserver(() => { for (const details of active.keys()) if (!details.isConnected) finish(details, false); });
  removal.observe(document.documentElement, { childList: true, subtree: true });
  document.addEventListener('click', click);
  return () => { document.removeEventListener('click', click); removal.disconnect(); for (const details of active.keys()) finish(details, false); };
}
