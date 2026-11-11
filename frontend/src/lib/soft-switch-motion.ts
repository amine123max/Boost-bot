export function softSwitchFrames(
  fromX: number,
  toX: number,
  fromWidth: number,
  toWidth: number,
): Keyframe[] {
  const end = 1 - 9 * Math.exp(-8);
  return Array.from({ length: 25 }, (_, index) => {
    const t = index / 24;
    const progress = (1 - (1 + 8 * t) * Math.exp(-8 * t)) / end;
    return {
      offset: t,
      transform: `translateX(${fromX + (toX - fromX) * progress}px)`,
      width: `${fromWidth + (toWidth - fromWidth) * progress}px`,
    };
  });
}
