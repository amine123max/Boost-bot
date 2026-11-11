export const typographyDefaults = {
  fontSize: 13,
  fontWeight: 400,
  letterSpacing: 0,
};

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
  return {
    "--font-scale": String(settings.fontSize / 14),
    "--data-font-scale": String(settings.fontSize / 15),
    "--ui-body-weight": String(settings.fontWeight),
    "--ui-heading-weight": String(Math.min(700, settings.fontWeight + 100)),
    "--ui-letter-spacing": settings.letterSpacing + "px",
  };
}
