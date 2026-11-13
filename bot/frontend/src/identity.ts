import { normalizeBotAppearance } from "../../shared/appearance/preferences";
import type { Bot } from "./types";
const paletteDefaults = [
  "blue",
  "cyan",
  "rose",
  "amber",
  "violet",
  "emerald",
  "orange",
  "adaptive",
];
const contourDefaults = [
  "circle",
  "squircle",
  "star",
  "capsule",
  "diamond",
  "flower",
  "triangle",
  "drop",
];
export function identityFor(bot?: Bot) {
  if (bot?.settings?.appearance)
    return normalizeBotAppearance(bot.settings.appearance);
  let hash = 0;
  for (const c of String(bot?.id || "default"))
    hash = (Math.imul(hash, 31) + c.charCodeAt(0)) >>> 0;
  const legacy: Record<string, string> = {
    blue: "blue",
    green: "emerald",
    yellow: "amber",
    red: "rose",
    purple: "violet",
    orange: "orange",
  };
  return normalizeBotAppearance({
    palette:
      legacy[bot?.settings?.avatar || ""] ||
      paletteDefaults[hash % paletteDefaults.length],
    contour: contourDefaults[(hash >>> 3) % contourDefaults.length],
    animation: "natural",
  });
}
