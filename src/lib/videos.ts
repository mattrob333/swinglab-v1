// Video metadata extracted from actual files

export interface SwingVideoInfo {
  id: string;
  label: string;
  src: string;
  fps: number;
  durationMs: number;
  width: number;
  height: number;
  handedness: "R" | "L";
  isPro: boolean;
  totalFrames: number;
  // Default phase frame estimates (will be refined by tag screen)
  // These map the swing portion of the video — about 30-50% of total duration
  defaultPhaseFrames: Record<string, number>;
}

export const PRO_SWINGS: SwingVideoInfo[] = [
  {
    id: "jacjson-holiday",
    label: "Jaclson Holiday",
    src: "/videos/pro/Jaclson Holiday.mp4",
    fps: 30,
    durationMs: 38220,
    width: 800,
    height: 800,
    handedness: "L",
    isPro: true,
    totalFrames: Math.round(30 * 38.22),
    // Swing roughly frames 400-800 of 1146 total
    defaultPhaseFrames: {
      stance: 420,
      load: 500,
      launch: 560,
      turn: 620,
      contact: 680,
      extension: 730,
      finish: 800,
    },
  },
  {
    id: "pro-79cd",
    label: "Pro Swing 02",
    src: "/videos/pro/optimized_79cd08c2-f901-47b4-9e80-fc8296fc601b_optimized.mp4",
    fps: 120,
    durationMs: 33600,
    width: 1080,
    height: 1080,
    handedness: "R",
    isPro: true,
    totalFrames: Math.round(120 * 33.6),
    defaultPhaseFrames: {
      stance: 400,
      load: 500,
      launch: 580,
      turn: 650,
      contact: 720,
      extension: 780,
      finish: 850,
    },
  },
  {
    id: "pro-8f95",
    label: "Pro Swing 03",
    src: "/videos/pro/optimized_8f95d8a1-1d19-4387-ba30-1df57b81c259_optimized.mp4",
    fps: 120,
    durationMs: 36660,
    width: 1080,
    height: 1080,
    handedness: "R",
    isPro: true,
    totalFrames: Math.round(120 * 36.66),
    defaultPhaseFrames: {
      stance: 400,
      load: 500,
      launch: 580,
      turn: 650,
      contact: 720,
      extension: 780,
      finish: 850,
    },
  },
];

export const YOUTH_SWINGS: SwingVideoInfo[] = [
  {
    id: "youth-nov2023",
    label: "Youth Swing Nov 2023",
    src: "/videos/youth/youth-nov2023.mp4",
    fps: 30,
    durationMs: 13610,
    width: 760,
    height: 780,
    handedness: "R",
    isPro: false,
    totalFrames: Math.round(30 * 13.61),
    defaultPhaseFrames: {
      stance: 60,
      load: 100,
      launch: 140,
      turn: 180,
      contact: 220,
      extension: 260,
      finish: 310,
    },
  },
  {
    id: "youth-jul2024",
    label: "Youth Swing Jul 2024",
    src: "/videos/youth/20240721_101054.mp4",
    fps: 30,
    durationMs: 8960,
    width: 1440,
    height: 1440,
    handedness: "L",
    isPro: false,
    totalFrames: Math.round(30 * 8.96),
    defaultPhaseFrames: {
      stance: 50,
      load: 80,
      launch: 110,
      turn: 140,
      contact: 170,
      extension: 200,
      finish: 240,
    },
  },
  {
    id: "youth-opt",
    label: "Youth Swing (Opt)",
    src: "/videos/youth/optimized_38a9bdbd-6417-4d00-b133-fe33a7668b25_optimized.mp4",
    fps: 120,
    durationMs: 2590,
    width: 1080,
    height: 1080,
    handedness: "R",
    isPro: false,
    totalFrames: Math.round(120 * 2.59),
    defaultPhaseFrames: {
      stance: 10,
      load: 35,
      launch: 60,
      turn: 85,
      contact: 110,
      extension: 130,
      finish: 160,
    },
  },
];

export function getProSwing(id: string): SwingVideoInfo | undefined {
  return PRO_SWINGS.find((s) => s.id === id);
}

export function getYouthSwing(id: string): SwingVideoInfo | undefined {
  return YOUTH_SWINGS.find((s) => s.id === id);
}
