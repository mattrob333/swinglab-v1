// SwingLab Phase Model — from PRD Section 8

export const PHASES = [
  "stance",
  "load",
  "launch",
  "turn",
  "contact",
  "extension",
  "finish",
] as const;

export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  stance: "Stance",
  load: "Load",
  launch: "Launch",
  turn: "Turn",
  contact: "Contact",
  extension: "Extension",
  finish: "Finish",
};

export const PHASE_DESCRIPTIONS: Record<Phase, string> = {
  stance: "Initial setup before load begins",
  load: "Hands and body begin move into launch position",
  launch: "Forward move and swing decision window",
  turn: "Hip/torso rotation into the ball",
  contact: "Bat meets ball or estimated contact frame",
  extension: "Arms extend through hitting zone",
  finish: "Follow-through reaches finish position",
};

// Normalized positions along scrubber (0.0–1.0)
export const PHASE_POSITIONS: Record<Phase, number> = {
  stance: 0.0,
  load: 0.167,
  launch: 0.333,
  turn: 0.5,
  contact: 0.667,
  extension: 0.833,
  finish: 1.0,
};

// Required minimum phases for compare mode
export const REQUIRED_PHASES: Phase[] = [
  "stance",
  "load",
  "launch",
  "contact",
  "finish",
];

export interface PhaseMarker {
  frame: number;
  timeMs: number;
}

export interface PhaseMarkers {
  swingId: string;
  phaseSetVersion: string;
  phases: Record<Phase, PhaseMarker>;
}

export interface FrameCacheManifest {
  id: string;
  swingId: string;
  width: number;
  height: number;
  frameCount: number;
  format: string;
  frameRateForCache: number;
  baseUri: string;
  frames: { index: number; uri: string; timeMs: number }[];
}

export interface ProSwing {
  id: string;
  displayName: string;
  originalHandedness: "R" | "L";
  thumbnailUri: string;
  fps: number;
  durationMs: number;
  frameCount: number;
  phases: Record<Phase, PhaseMarker>;
  frameCacheId: string;
}

export interface PlayerProfile {
  id: string;
  displayName: string;
  defaultHandedness: "R" | "L";
}

export interface SwingClip {
  id: string;
  playerId: string;
  fps: number;
  durationMs: number;
  handedness: "R" | "L";
  phases: Record<Phase, PhaseMarker>;
  frameCacheId: string;
}

export interface ComparisonSession {
  id: string;
  playerSwingId: string;
  proSwingId: string;
  syncMode: "phase_normalized";
  proDisplayFlipX: boolean;
  savedProgress: number;
  createdAt: string;
}

export const DEFAULT_PHASE_SET_VERSION = "v1_default_7_phase";

// PRD Section 9.2 — Frame mapping algorithm
export function frameForProgress(
  progress: number,
  phaseMarkers: Record<Phase, PhaseMarker>,
  phasePositions: Record<Phase, number> = PHASE_POSITIONS
): number {
  const p = Math.max(0, Math.min(1, progress));
  for (let i = 0; i < PHASES.length - 1; i++) {
    const aName = PHASES[i];
    const bName = PHASES[i + 1];
    const aPos = phasePositions[aName];
    const bPos = phasePositions[bName];
    if (p >= aPos && p <= bPos) {
      const local = (p - aPos) / (bPos - aPos);
      const aFrame = phaseMarkers[aName].frame;
      const bFrame = phaseMarkers[bName].frame;
      return Math.round(aFrame + local * (bFrame - aFrame));
    }
  }
  return phaseMarkers.finish.frame;
}

export function currentPhase(
  progress: number,
  phasePositions: Record<Phase, number> = PHASE_POSITIONS
): Phase {
  const p = Math.max(0, Math.min(1, progress));
  let closest: Phase = "stance";
  let closestDist = Infinity;
  for (const phase of PHASES) {
    const dist = Math.abs(p - phasePositions[phase]);
    if (dist < closestDist) {
      closestDist = dist;
      closest = phase;
    }
  }
  return closest;
}
