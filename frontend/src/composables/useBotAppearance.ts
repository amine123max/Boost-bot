import { reactive, watch } from 'vue';
import { APPEARANCE_KEY, loadBotAppearance, defaultBotAppearance, normalizeBotAppearance } from '../../../bot/shared/appearance/preferences';
export { flowAnimations, flowContours, flowPalettes } from '../../../bot/shared/appearance/flowStyle';
export const botAppearance = reactive(loadBotAppearance());
watch(botAppearance, (value) => {
  try { localStorage.setItem(APPEARANCE_KEY, JSON.stringify(value)); } catch { /* Session preferences still work. */ }
}, { deep: true });
window.addEventListener('storage', (event) => {
  if (event.key === APPEARANCE_KEY) Object.assign(botAppearance, loadBotAppearance());
});
export function resetBotAppearance() { Object.assign(botAppearance, defaultBotAppearance); }
export function setBotAppearance(value: unknown) { Object.assign(botAppearance, normalizeBotAppearance(value)); }
