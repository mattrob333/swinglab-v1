"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import FrameViewer from "@/components/FrameViewer";
import Scrubber from "@/components/Scrubber";
import PhaseLabel from "@/components/PhaseLabel";
import {
  PHASES,
  type Phase,
  PHASE_POSITIONS,
  currentPhase,
} from "@/lib/swing-phases";

// Mock swing data matching PRD data models (Section 12)
const PRO_FRAMES = 144;
const PLAYER_FRAMES = 120;

const PRO_PHASES: Record<Phase, number> = {
  stance: 0,
  load: 22,
  launch: 38,
  turn: 54,
  contact: 71,
  extension: 88,
  finish: 126,
};

const PLAYER_PHASES: Record<Phase, number> = {
  stance: 2,
  load: 24,
  launch: 36,
  turn: 48,
  contact: 62,
  extension: 76,
  finish: 104,
};

const PRO_SWINGS = [
  { id: "pro_001", name: "Aaron Judge", handedness: "R" as const },
  { id: "pro_002", name: "Shohei Ohtani", handedness: "L" as const },
  { id: "pro_003", name: "Mike Trout", handedness: "R" as const },
  { id: "pro_004", name: "Juan Soto", handedness: "L" as const },
  { id: "pro_005", name: "Mookie Betts", handedness: "R" as const },
];

function frameForProgress(p: number, phaseFrames: Record<Phase, number>): number {
  const progress = Math.max(0, Math.min(1, p));
  for (let i = 0; i < PHASES.length - 1; i++) {
    const aName = PHASES[i];
    const bName = PHASES[i + 1];
    const aPos = PHASE_POSITIONS[aName];
    const bPos = PHASE_POSITIONS[bName];
    if (progress >= aPos && progress <= bPos) {
      const local = (progress - aPos) / (bPos - aPos);
      const aFrame = phaseFrames[aName];
      const bFrame = phaseFrames[bName];
      return Math.round(aFrame + local * (bFrame - aFrame));
    }
  }
  return phaseFrames.finish;
}

export default function ComparePage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0.667); // Start at Contact
  const [proSwing, setProSwing] = useState(PRO_SWINGS[0]);
  const [flipped, setFlipped] = useState(false);
  const [phaseSyncOn, setPhaseSyncOn] = useState(true);
  const [showProSelector, setShowProSelector] = useState(false);

  const phase = useMemo(() => currentPhase(progress), [progress]);
  const proFrame = useMemo(() => frameForProgress(progress, PRO_PHASES), [progress]);
  const playerFrame = useMemo(() => frameForProgress(progress, PLAYER_PHASES), [progress]);

  const handleProgressChange = useCallback((p: number) => {
    setProgress(p);
  }, []);

  const handleSelectPro = useCallback((swing: typeof PRO_SWINGS[0]) => {
    setProSwing(swing);
    setFlipped(swing.handedness !== "R");
    setShowProSelector(false);
  }, []);

  return (
    <div className="flex flex-col min-h-dvh bg-black safe-top safe-bottom">
      {/* Nav Bar */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => router.push("/")} className="text-white">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-1.5">
          <span className="text-neon text-xl font-bold italic">Swing</span>
          <span className="text-white/60 text-xl italic font-light">Lab</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowProSelector(true)}
            className="text-[11px] text-white border border-white/30 rounded-full px-3 py-1.5"
          >
            Change Pro
          </button>
          <button className="text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Pro Swing Frame */}
      <div className="px-4 flex-1 flex flex-col gap-0">
        <FrameViewer
          label="Pro"
          currentPhase={phase}
          frameIndex={proFrame}
          totalFrames={PRO_FRAMES}
          flipped={flipped}
          batterType="pro"
        />

        {/* Phase divider */}
        <PhaseLabel phase={phase} />

        {/* Player Swing Frame */}
        <FrameViewer
          label="Player"
          currentPhase={phase}
          frameIndex={playerFrame}
          totalFrames={PLAYER_FRAMES}
          batterType="player"
        />
      </div>

      {/* Phase Sync Toggle */}
      <div className="flex justify-center py-2">
        <button
          onClick={() => setPhaseSyncOn(!phaseSyncOn)}
          className={`flex items-center gap-2 border rounded-full px-4 py-1.5 text-xs ${
            phaseSyncOn
              ? "border-neon text-neon"
              : "border-gray-600 text-gray-400"
          }`}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          {phaseSyncOn ? "Phase Sync On" : "Phase Sync Off"}
        </button>
      </div>

      {/* Scrubber */}
      <Scrubber
        progress={progress}
        onProgressChange={handleProgressChange}
        currentPhase={phase}
      />

      {/* Pro Selector Modal */}
      {showProSelector && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col safe-top safe-bottom">
          <div className="flex items-center justify-between px-4 py-3">
            <div className="w-10" />
            <h2 className="text-base font-semibold">Select Pro Swing</h2>
            <button onClick={() => setShowProSelector(false)} className="text-white text-sm">Close</button>
          </div>
          <div className="grid grid-cols-2 gap-3 px-4 flex-1 overflow-y-auto pb-8">
            {PRO_SWINGS.map((swing) => (
              <button
                key={swing.id}
                onClick={() => handleSelectPro(swing)}
                className={`bg-surface rounded-xl overflow-hidden border-2 transition ${
                  swing.id === proSwing.id ? "border-neon" : "border-transparent"
                }`}
              >
                <div className="aspect-square bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#C8F000" strokeWidth="1.5">
                    <circle cx="12" cy="8" r="4" />
                    <path d="M4 21v-2a6 6 0 016-6h4a6 6 0 016 6v2" />
                    <path d="M8 4l4-2 4 2" strokeWidth="2" />
                  </svg>
                </div>
                <div className="p-2">
                  <p className="text-xs font-medium">{swing.name}</p>
                  <p className="text-[10px] text-gray-400">{swing.handedness === "R" ? "Right" : "Left"} handed</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
