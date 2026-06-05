export function videoFrameCacheKey(src: string, flipped: boolean, idx: number): string {
  return `${src}|${flipped ? "flipped" : "normal"}|${idx}`;
}

export function frameTimeSeconds(frameIndex: number, fps: number): number {
  return frameIndex / fps;
}

export function frameForProgress(
  p: number,
  phaseFrames: Record<string, number>,
  phaseNames: string[],
  phasePositions: Record<string, number>
): number {
  const progress = Math.max(0, Math.min(1, p));
  for (let i = 0; i < phaseNames.length - 1; i++) {
    const aName = phaseNames[i];
    const bName = phaseNames[i + 1];
    const aPos = phasePositions[aName];
    const bPos = phasePositions[bName];
    if (progress >= aPos && progress <= bPos) {
      const local = (progress - aPos) / (bPos - aPos);
      const aFrame = phaseFrames[aName];
      const bFrame = phaseFrames[bName];
      return Math.round(aFrame + local * (bFrame - aFrame));
    }
  }
  return phaseFrames[phaseNames[phaseNames.length - 1]];
}

export function currentPhase(
  p: number,
  phaseNames: string[],
  phasePositions: Record<string, number>
): string {
  const progress = Math.max(0, Math.min(1, p));
  let closest = phaseNames[0];
  let closestDist = Infinity;
  for (const name of phaseNames) {
    const dist = Math.abs(progress - phasePositions[name]);
    if (dist < closestDist) {
      closestDist = dist;
      closest = name;
    }
  }
  return closest;
}
