export const chineseFontOptions = [
  {
    value: "system",
    label: "系统默认",
    family: '"Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC"',
  },
  {
    value: "yahei",
    label: "微软雅黑",
    family: '"Microsoft YaHei", "Microsoft YaHei UI"',
  },
  { value: "pingfang", label: "苹方", family: '"PingFang SC", "Heiti SC"' },
  {
    value: "noto-sans",
    label: "思源黑体",
    family: '"Noto Sans CJK SC", "Source Han Sans SC", "Noto Sans SC"',
  },
  {
    value: "simsun",
    label: "宋体",
    family: 'SimSun, "Songti SC", "Noto Serif CJK SC"',
  },
  { value: "kaiti", label: "楷体", family: 'KaiTi, "Kaiti SC", STKaiti' },
  {
    value: "noto-serif",
    label: "思源宋体",
    family: '"Noto Serif CJK SC", "Source Han Serif SC", "Noto Serif SC"',
  },
] as const;

export const englishFontOptions = [
  {
    value: "system",
    label: "系统默认",
    family:
      '"Segoe UI", -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial',
  },
  {
    value: "times-new-roman",
    label: "Times New Roman",
    family: '"Times New Roman", "Liberation Serif", Times',
  },
  {
    value: "arial",
    label: "Arial",
    family: 'Arial, "Liberation Sans", Helvetica',
  },
  {
    value: "georgia",
    label: "Georgia",
    family: 'Georgia, "Times New Roman", "Liberation Serif"',
  },
  {
    value: "consolas",
    label: "Consolas",
    family: 'Consolas, "Cascadia Mono", Menlo, "Liberation Mono"',
  },
] as const;

// These faces are restricted to numeric glyphs in styles/typography-fonts.css.
export const numberFontOptions = [
  { value: "inherit", label: "跟随英文字体", family: "" },
  {
    value: "times-new-roman",
    label: "Times New Roman",
    family: '"Boost Digits Times"',
  },
  { value: "arial", label: "Arial", family: '"Boost Digits Arial"' },
  { value: "consolas", label: "Consolas", family: '"Boost Digits Consolas"' },
] as const;

export const typographyDefaults = {
  fontSize: 13,
  fontWeight: 400,
  letterSpacing: 0,
  chineseFont: "system",
  englishFont: "system",
  numberFont: "inherit",
};

function fontOption<T extends { value: string; family: string }>(
  options: readonly T[],
  value: unknown,
) {
  return options.find((option) => option.value === value) || options[0];
}

export function resolveTypographyPreferences(
  value: Record<string, unknown>,
  version: unknown,
) {
  const typography = normalizeTypography(value);
  if (
    typography.fontWeight === 400 &&
    ((version === 1 &&
      typography.fontSize === 15 &&
      typography.letterSpacing === 0.5) ||
      (version === 2 &&
        typography.fontSize === 14 &&
        typography.letterSpacing === 0))
  ) {
    return {
      ...typography,
      fontSize: typographyDefaults.fontSize,
      letterSpacing: typographyDefaults.letterSpacing,
    };
  }
  return typography;
}

function bounded(value: unknown, min: number, max: number, fallback: number) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}
export function normalizeTypography(value: Record<string, unknown>) {
  return {
    chineseFont: fontOption(chineseFontOptions, value.chineseFont).value,
    englishFont: fontOption(englishFontOptions, value.englishFont).value,
    numberFont: fontOption(numberFontOptions, value.numberFont).value,
    fontSize:
      Math.round(
        bounded(value.fontSize, 11, 16, typographyDefaults.fontSize) * 2,
      ) / 2,
    fontWeight: [400, 500, 600].includes(Number(value.fontWeight))
      ? Number(value.fontWeight)
      : typographyDefaults.fontWeight,
    letterSpacing:
      Math.round(
        bounded(
          value.letterSpacing,
          -0.3,
          1.2,
          typographyDefaults.letterSpacing,
        ) * 10,
      ) / 10,
  };
}
export function typographyVariables(value: Record<string, unknown>) {
  const settings = normalizeTypography(value);
  const chinese = fontOption(chineseFontOptions, settings.chineseFont).family;
  const english = fontOption(englishFontOptions, settings.englishFont).family;
  const numbers = fontOption(numberFontOptions, settings.numberFont).family;
  const family = [
    numbers,
    english,
    chinese,
    '"Microsoft YaHei", "PingFang SC", sans-serif',
  ]
    .filter(Boolean)
    .join(", ");
  return {
    "--ui-font-family": family,
    "--font-scale": String(settings.fontSize / 14),
    "--data-font-scale": String(settings.fontSize / 15),
    "--ui-body-weight": String(settings.fontWeight),
    "--ui-heading-weight": String(Math.min(700, settings.fontWeight + 100)),
    "--ui-letter-spacing": settings.letterSpacing + "px",
  };
}
