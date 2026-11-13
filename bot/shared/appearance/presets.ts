import { normalizeBotAppearance } from "./preferences.js";

/** Shared visual identities for Boost navigation, Bot settings and avatar pickers. */
export const botAppearancePresets = [
  {
    key: "classic",
    label: "经典",
    palette: "adaptive",
    contour: "circle",
    animation: "natural",
  },
  {
    key: "ocean",
    label: "海蓝",
    palette: "blue",
    contour: "capsule",
    animation: "curious",
  },
  {
    key: "coral",
    label: "珊瑚",
    palette: "rose",
    contour: "star",
    animation: "playful",
  },
  {
    key: "mint",
    label: "薄荷",
    palette: "cyan",
    contour: "squircle",
    animation: "jelly",
  },
  {
    key: "iris",
    label: "鸢尾",
    palette: "violet",
    contour: "flower",
    animation: "natural",
  },
  {
    key: "amber",
    label: "琥珀",
    palette: "amber",
    contour: "drop",
    animation: "greeting",
  },
].map((value) => ({
  key: value.key,
  label: value.label,
  appearance: normalizeBotAppearance(value),
}));
