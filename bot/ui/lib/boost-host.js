import { loadBotAppearance, normalizeBotAppearance, APPEARANCE_KEY } from '../boost-appearance/preferences.js';
import { setThemeMode } from './theme.js';
let preferences = loadBotAppearance();
const subscribers = new Set();
export const appearancePreferences = () => preferences;
export const onAppearanceChange = (callback) => { subscribers.add(callback); return () => subscribers.delete(callback); };
function publish(value) {
  preferences = normalizeBotAppearance(value);
  try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(preferences)); } catch { /* usable without storage */ }
  for (const callback of subscribers) callback();
}
export function openAppearance() {
  if (window.parent !== window) window.parent.postMessage({ type: 'boost:appearance:open' }, '*');
}
export function returnToBoost() {
  if (window.parent !== window) window.parent.postMessage({ type: 'boost:bot:back' }, '*');
}
window.addEventListener('message', (event) => {
  if (event.source !== window.parent || event.data?.type !== 'boost:appearance') return;
  publish(event.data.preferences);
  const theme = event.data.theme;
  if (['light', 'dark', 'system'].includes(theme)) setThemeMode(theme, true);
});
window.addEventListener('storage', (event) => { if (event.key === APPEARANCE_KEY) publish(loadBotAppearance()); });
export async function ready() {
  await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  window.parent.postMessage({ type: 'boost:bot:ready' }, '*');
  window.parent.postMessage({ type: 'boost:workspace:content-ready' }, '*');
}
