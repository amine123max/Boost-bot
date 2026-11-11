export type AvatarPoint = [number, number]
export const precision = (value: number) => Math.round(value * 1000) / 1000

export function closedAvatarPath(points: AvatarPoint[]) {
  let d = `M${precision(points[0]![0])} ${precision(points[0]![1])}`
  const count = points.length
  for (let i = 0; i < count; i++) {
    const before = points[(i + count - 1) % count]!
    const start = points[i]!
    const end = points[(i + 1) % count]!
    const after = points[(i + 2) % count]!
    d += `C${precision(start[0] + (end[0] - before[0]) / 6)} ${precision(start[1] + (end[1] - before[1]) / 6)} ${precision(end[0] - (after[0] - start[0]) / 6)} ${precision(end[1] - (after[1] - start[1]) / 6)} ${precision(end[0])} ${precision(end[1])}`
  }
  return `${d}Z`
}
