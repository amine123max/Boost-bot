/** Read display-only expiry metadata; never expose upstream credit identifiers. */
export function readResetCreditExpiries(
  raw: string | null | undefined,
): (number | null)[] {
  if (!raw) return [];
  try {
    const source = JSON.parse(raw);
    const reset =
      source?.rate_limit_reset_credits ?? source?.rateLimitResetCredits;
    if (!Array.isArray(reset?.credits)) return [];
    return reset.credits
      .filter((credit: unknown) => {
        if (!credit || typeof credit !== "object" || Array.isArray(credit))
          return false;
        const item = credit as Record<string, unknown>;
        const status = String(item.status ?? "")
          .trim()
          .toLowerCase();
        const kind = String(item.reset_type ?? item.resetType ?? "")
          .trim()
          .toLowerCase();
        return (
          (!status || status === "available") &&
          (!kind || kind === "codex_rate_limits")
        );
      })
      .map((credit: Record<string, unknown>) => {
        const value = credit.expires_at ?? credit.expiresAt;
        const time =
          typeof value === "string" && value.trim() ? Date.parse(value) : NaN;
        return Number.isFinite(time) ? time : null;
      })
      .sort(
        (a: number | null, b: number | null) =>
          (a ?? Infinity) - (b ?? Infinity),
      );
  } catch {
    return [];
  }
}
