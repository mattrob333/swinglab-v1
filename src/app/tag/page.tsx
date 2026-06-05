"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Scrubber from "@/components/Scrubber";
import { PHASES, PHASE_POSITIONS, PHASE_LABELS, REQUIRED_PHASES, currentPhase, type Phase } from "@/lib/swing-phases";

// Mock frame count
const TOTAL_FRAMES = 156;

export default function TagSwingPage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0);
  const [phaseMarkers, setPhaseMarkers] = useState<Record<Phase, number | null>>({
    stance: null,
    load: null,
    launch: null,
    turn: null,
    contact: null,
    extension: null,
    finish: null,
  });
  const [nextPhaseIndex, setNextPhaseIndex] = useState(0);

  const phase = useMemo(() => currentPhase(progress), [progress]);

  const currentFrame = useMemo(() => {
    const p = Math.max(0, Math.min(1, progress));
    return Math.round(p * (TOTAL_FRAMES - 1));
  }, [progress]);

  const markCurrentPhase = useCallback((phaseName: Phase) => {
    setPhaseMarkers((prev) => ({
      ...prev,
      [phaseName]: currentFrame,
    }));
    // Auto-advance to next phase
    const nextIdx = PHASES.indexOf(phaseName) + 1;
    if (nextIdx < PHASES.length) {
      setNextPhaseIndex(nextIdx);
      // Move scrubber toward next phase position
      setProgress(PHASE_POSITIONS[PHASES[nextIdx]]);
    }
  }, [currentFrame]);

  const requiredMarked = useMemo(
    () => REQUIRED_PHASES.every((p) => phaseMarkers[p] !== null),
    [phaseMarkers]
  );

  // Generate frame preview at current position
  const framePreviewStyle = useMemo(() => {
    // Simulate a frame preview with position-relative batter pose
    const progressInSwing = Math.max(0, Math.min(1, progress));
    const stanceY = 0.3;
    const contactY = 0.5;
    const yPos = stanceY + (contactY - stanceY) * Math.min(1, progressInSwing * 2);
    
    // Bat angle changes with swing
    const batRotation = progressInSwing * 160 - 20; // -20 to 140 degrees
    
    return { yPos, batRotation };
  }, [progress]);

  return (
    <div className="flex flex-col min-h-dvh bg-black safe-top safe-bottom">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={() => router.push("/")} className="text-white">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-1">
          <span className="text-neon text-lg font-bold italic">Swing</span>
          <span className="text-white/50 text-lg italic font-light">Lab</span>
        </div>
        <button
          onClick={() => router.push("/compare")}
          disabled={!requiredMarked}
          className={`text-xs font-semibold rounded-full px-4 py-1.5 transition ${
            requiredMarked
              ? "bg-neon text-black"
              : "bg-gray-800 text-gray-500 cursor-not-allowed"
          }`}
        >
          Save &amp; Compare
        </button>
      </div>

      {/* Frame Preview */}
      <div className="flex-1 px-4 flex flex-col items-center justify-center">
        <div className="relative w-full max-w-[80vw] aspect-square bg-gradient-to-b from-gray-900 via-green-900/20 to-amber-900/20 rounded-xl overflow-hidden border border-gray-800">
          {/* Simulated frame content */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div
              className="relative transition-all duration-200"
              style={{
                transform: `translateY(${(framePreviewStyle.yPos - 0.3) * 100}px)`,
              }}
            >
              {/* Player body silhouette */}
              <div className="flex flex-col items-center">
                {/* Helmet */}
                <div className="w-8 h-6 bg-gray-900 rounded-t-full" />
                {/* Head */}
                <div className="w-8 h-8 bg-amber-800/60 rounded-full -mt-2" />
                {/* Torso */}
                <div className="w-12 h-16 bg-blue-900 rounded-lg -mt-1" />
                {/* Bat */}
                <div
                  className="w-1.5 h-16 bg-amber-700 -mt-8 origin-bottom transition-transform duration-200"
                  style={{ transform: `rotate(${framePreviewStyle.batRotation}deg)` }}
                />
              </div>
            </div>
          </div>

          {/* Frame info overlay */}
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2">
            <div className="flex justify-between text-[11px]">
              <span className="text-gray-300">Frame {currentFrame}/{TOTAL_FRAMES}</span>
              <span className="text-neon">{PHASE_LABELS[phase]}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Phase Buttons */}
      <div className="px-4 py-2">
        <div className="grid grid-cols-4 gap-2">
          {PHASES.map((phaseName, i) => {
            const marked = phaseMarkers[phaseName] !== null;
            const isNext = i === nextPhaseIndex;
            return (
              <button
                key={phaseName}
                onClick={() => markCurrentPhase(phaseName)}
                disabled={i > nextPhaseIndex && !marked}
                className={`rounded-lg py-2 text-[11px] font-semibold transition-all ${
                  marked
                    ? "bg-neon text-black"
                    : isNext
                    ? "bg-neon/20 text-neon border border-neon/40"
                    : "bg-gray-900 text-gray-500"
                }`}
              >
                {i + 1}. {PHASE_LABELS[phaseName]}
                {marked && " done"}
              </button>
            );
          })}
        </div>
      </div>

      {/* Phase Validation */}
      {!requiredMarked && (
        <p className="text-center text-[11px] text-amber-400 px-4 pb-1">
          Mark at least Stance, Load, Launch, Contact, and Finish to compare
        </p>
      )}

      {/* Scrubber */}
      <Scrubber
        progress={progress}
        onProgressChange={setProgress}
        currentPhase={phase}
      />
    </div>
  );
}
