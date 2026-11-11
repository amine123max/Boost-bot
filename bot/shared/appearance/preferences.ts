import { flowAnimations, flowContours, flowPalettes, type FlowAnimation, type FlowContour, type FlowPalette } from './flowStyle.js';
export const APPEARANCE_KEY = 'boost.bot.appearance.v1';
export interface BotAppearance {
  version: 1;
  animation: FlowAnimation;
  contour: FlowContour;
  palette: FlowPalette;
  customColor: string;
  speed: number;
  size: number;
  followPointer: boolean;
}
export const defaultBotAppearance: BotAppearance = {
  version: 1, animation: 'auto', contour: 'squircle', palette: 'adaptive',
  customColor: '#2563eb', speed: 1, size: 48, followPointer: true,
};
export function normalizeBotAppearance(value: unknown): BotAppearance {
  const v = value && typeof value === 'object' ? value as Partial<BotAppearance> : {};
  const defaults = defaultBotAppearance;
  return {
    version: 1,
    animation: flowAnimations.find(o => o.value === v.animation)?.value ?? defaults.animation,
    contour: flowContours.find(o => o.value === v.contour)?.value ?? defaults.contour,
    palette: flowPalettes.find(o => o.value === v.palette)?.value ?? defaults.palette,
    customColor: /^#[0-9a-f]{6}$/i.test(v.customColor ?? '') ? v.customColor! : defaults.customColor,
    speed: [0.5, 0.75, 1, 1.25, 1.5].includes(v.speed ?? 0) ? v.speed! : defaults.speed,
    size: typeof v.size === 'number' && Number.isInteger(v.size) && v.size >= 28 && v.size <= 80 && v.size % 4 === 0 ? v.size : defaults.size,
    followPointer: typeof v.followPointer === 'boolean' ? v.followPointer : defaults.followPointer,
  };
}
export function loadBotAppearance(): BotAppearance {
  try { return normalizeBotAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) || '{}')); }
  catch { return { ...defaultBotAppearance }; }
}
export function avatarColors(prefs: BotAppearance, cycleInk: string, dark: boolean) {
  const selected = flowPalettes.find(p => p.value === prefs.palette)!;
  const ink = prefs.palette === 'cycle' ? cycleInk : prefs.palette === 'custom' ? prefs.customColor : dark ? selected.dark : selected.light;
  const channels = ink.startsWith('#') ? ink.slice(1).match(/.{2}/g)!.map(c => parseInt(c, 16)) : ink.match(/[\d.]+/g)!.slice(0, 3).map(Number);
  const l = channels.map(channel => { const c = channel / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; });
  return { ink, eyes: (l[0] * .2126 + l[1] * .7152 + l[2] * .0722) > .179 ? '#111113' : '#fff' };
}
