import { useEffect, useRef } from 'preact/hooks';
import { html } from './ui.js';
import { mountBotAvatar } from '../boost-appearance/renderer.js';
import { appearancePreferences, onAppearanceChange, returnToBoost } from '../lib/boost-host.js';
export function BoostBrand() {
  return html`<button type="button" class="side-brand boost-brand-return" aria-label="返回 Boost 首页" title="点击智能体返回 Boost 首页" onClick=${returnToBoost}><${BoostAvatar} size=${38} ambient /><span>Boost</span></button>`;
}
export function BoostAvatar({ size = 34, state = 'idle', working = false, active = false, ambient = false }) {
  const svg = useRef(null);
  const current = useRef({});
  current.current = { active, ambient, thinking: working || ['thinking', 'working', 'replying'].includes(state) };
  useEffect(() => {
    if (!svg.current) return;
    const avatar = mountBotAvatar(svg.current, appearancePreferences, () => current.current);
    const unsubscribe = onAppearanceChange(avatar.refresh);
    return () => { unsubscribe(); avatar.dispose(); };
  }, []);
  return html`<svg ref=${svg} viewBox="-4 -4 72 72" style=${{ width: size + 'px', height: size + 'px', display: 'inline-block', flexShrink: 0, overflow: 'visible' }} aria-hidden="true" focusable="false" data-boost-bot-avatar></svg>`;
}
