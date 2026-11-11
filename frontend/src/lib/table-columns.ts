export function resizeColumnWeights(
  weights: readonly number[],
  index: number,
  deltaPercent: number,
  minimum = 4,
): number[] {
  const next = [...weights];
  if (
    index < 0 ||
    index >= weights.length - 1 ||
    !Number.isFinite(deltaPercent)
  )
    return next;
  const total = next[index] + next[index + 1];
  const floor = Math.min(minimum, total / 2);
  const left = Math.max(
    floor,
    Math.min(total - floor, next[index] + deltaPercent),
  );
  next[index] = left;
  next[index + 1] = total - left;
  return next;
}
export function normalizeColumnWeights(
  weights: readonly number[],
  count: number,
): number[] {
  const valid = Array.from({ length: count }, (_, i) =>
    Number.isFinite(weights[i]) && weights[i] > 0 ? weights[i] : 1,
  );
  const sum = valid.reduce((a, b) => a + b, 0);
  return valid.map((value) => (value / sum) * 100);
}
