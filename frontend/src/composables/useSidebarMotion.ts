import { nextTick, onBeforeUnmount, watch, type Ref } from 'vue';
import { uiPreferences } from './useUiPreferences';
import { motionAllowed } from '@/lib/surface-motion';
import { softSwitchFrames } from '@/lib/soft-switch-motion';

/** Animate the real column, preserving the displayed position on rapid reversal. */
export function useSidebarMotion(shell: Ref<HTMLElement | undefined>) {
  let animations: Animation[] = [], version = 0;
  const cancel = () => { animations.forEach(animation => animation.cancel()); animations = []; };
  watch(() => uiPreferences.compactSidebar, async () => {
    const node = shell.value, turn = ++version;
    if (!node || innerWidth <= 760) return;
    const from = Number.parseFloat(getComputedStyle(node).gridTemplateColumns);
    const icons = [...node.querySelectorAll<HTMLElement>('.brand-avatar-trigger,.sidebar-search > .boost-icon,.nav-item > .boost-icon')].map(element => ({ element, x: element.getBoundingClientRect().x }));
    cancel();
    await nextTick();
    if (turn !== version || !node.isConnected || !motionAllowed()) return;
    const to = Number.parseFloat(getComputedStyle(node).gridTemplateColumns);
    if (!Number.isFinite(from) || !Number.isFinite(to) || Math.abs(to - from) < .1) return;
    const frames = softSwitchFrames(0, 0, from, to);
    animations.push(node.animate(frames.map(frame => ({ offset: frame.offset, gridTemplateColumns: `${frame.width} minmax(0, 1fr)` })), { duration: 420, easing: 'linear' }));
    for (const { element, x } of icons) {
      const delta = x - element.getBoundingClientRect().x;
      animations.push(element.animate(frames.map(frame => ({ offset: frame.offset, transform: `translateX(${delta * (1 - (Number.parseFloat(String(frame.width)) - from) / (to - from))}px)` })), { duration: 420, easing: 'linear' }));
    }
    const current = animations;
    void Promise.allSettled(current.map(animation => animation.finished)).then(() => { if (animations === current) animations = []; });
  }, { flush: 'pre' });
  onBeforeUnmount(() => { version++; cancel(); });
}
