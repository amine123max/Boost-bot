export const themeColors = [
  { value: "green", label: "绿色", swatch: "#00c950" },
  { value: "emerald", label: "翡翠绿", swatch: "#00bc7d" },
  { value: "teal", label: "青绿色", swatch: "#00bba7" },
  { value: "cyan", label: "青色", swatch: "#00b8db" },
  { value: "sky", label: "天蓝", swatch: "#00a6f4" },
  { value: "blue", label: "蓝色", swatch: "#2b7fff" },
  { value: "indigo", label: "靛蓝", swatch: "#615fff" },
  { value: "violet", label: "紫罗兰", swatch: "#8e51ff" },
  { value: "purple", label: "紫色", swatch: "#ad46ff" },
  { value: "pink", label: "粉色", swatch: "#f6339a" },
  { value: "fuchsia", label: "紫红", swatch: "#e12afb" },
  { value: "rose", label: "玫瑰红", swatch: "#ff2056" },
  { value: "red", label: "红色", swatch: "#fb2c36" },
  { value: "orange", label: "橙色", swatch: "#ff6900" },
  { value: "amber", label: "琥珀", swatch: "#fe9a00" },
  { value: "yellow", label: "黄色", swatch: "#efb100" },
  { value: "lime", label: "石灰绿", swatch: "#7ccf00" },
] as const;

export type ThemeColor = (typeof themeColors)[number]["value"];
export const defaultThemeColor: ThemeColor = "teal";

export function resolveThemeColor(value: unknown): ThemeColor {
  return themeColors.find((color) => color.value === value)?.value ?? defaultThemeColor;
}
