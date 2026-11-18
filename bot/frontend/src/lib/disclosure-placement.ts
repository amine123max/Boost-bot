import type { Directive } from 'vue';

/** Keep the trigger anchored when expanding above it or collapsing a large panel. */
export const vDisclosurePlacement: Directive<HTMLDetailsElement> = {
  mounted(el) {
    const summary = el.querySelector(':scope > summary');
    if (!(summary instanceof HTMLElement)) return;
    let animation: Animation | undefined;
    let frame = 0;
    let closing = false;
    summary.addEventListener('click', event => {
      const content = [...el.children].find(child => child !== summary);
      if (!(content instanceof HTMLElement)) return;
      const viewport = el.closest<HTMLElement>('.chat-scroll');
      const bounds = viewport?.getBoundingClientRect();
      const initial = summary.getBoundingClientRect();
      const above = initial.top - Math.max(0, bounds?.top ?? 0);
      const below = Math.min(innerHeight, bounds?.bottom ?? innerHeight) - initial.bottom;
      event.preventDefault();
      const wasUp = el.dataset.expand === 'up';
      const opening = !el.open || closing;
      const firstHeight = el.open ? content.getBoundingClientRect().height : 0;
      if (animation) { animation.cancel(); animation = undefined; }
      cancelAnimationFrame(frame);
      closing = !opening;
      if (opening) {
        el.open = true;
        const desired = Math.min(260, Math.max(48, el.getBoundingClientRect().height - initial.height));
        const up = el.dataset.expandMode !== 'down' && below < desired && above > below;
        el.dataset.expand = up ? 'up' : 'down';
        el.style.setProperty('--disclosure-space', Math.max(48, Math.min(280, (up ? above : below) - 10)) + 'px');
      }
      const finish = () => {
        if (!opening) {
          el.open = false;
          delete el.dataset.expand;
          el.style.removeProperty('--disclosure-space');
        }
        closing = false;
        if (viewport && (wasUp || el.dataset.expand === 'up')) viewport.scrollTop += summary.getBoundingClientRect().top - initial.top;
      };
      const motion = document.documentElement.dataset.motion;
      if (matchMedia('(prefers-reduced-motion: reduce)').matches || motion === 'off' || motion === 'reduce' || !content.animate) return finish();
      const target = opening ? content.getBoundingClientRect().height : 0;
      if (Math.abs(firstHeight - target) < 2) return finish();
      const effect = content.animate([
        {height:firstHeight + 'px', minHeight:'0px', overflow:'hidden', opacity:opening && !firstHeight ? .6 : 1},
        {height:target + 'px', minHeight:'0px', overflow:'hidden', opacity:opening ? 1 : .6},
      ], {duration:opening ? 250 : 195, easing:'cubic-bezier(.20,.75,.24,1)', fill:'both'});
      animation = effect;
      if (viewport && (wasUp || el.dataset.expand === 'up')) {
        const anchor = () => {
          if (animation !== effect || !el.isConnected) return;
          viewport.scrollTop += summary.getBoundingClientRect().top - initial.top;
          frame = requestAnimationFrame(anchor);
        };
        anchor();
      }
      effect.onfinish = () => {
        if (animation !== effect) return;
        cancelAnimationFrame(frame);
        effect.cancel();
        animation = undefined;
        finish();
      };
    });
  },
};
