"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import VideoFrameEngine from "@/components/VideoFrameEngine";
import Scrubber from "@/components/Scrubber";
import PhaseLabel from "@/components/PhaseLabel";
import { PRO_SWINGS, YOUTH_SWINGS, type SwingVideoInfo } from "@/lib/videos";
import { PHASES, PHASE_POSITIONS, PHASE_LABELS, type Phase } from "@/lib/swing-phases";

export default function ComparePage() {
  const router = useRouter();
  const [progress, setProgress] = useState(0.667);

  // Active selections (default to first each)
  const [proId, setProId] = useState(PRO_SWINGS[0].id);
  const [youthId, setYouthId] = useState(YOUTH_SWINGS[0].id);
  const [flipPro, setFlipPro] = useState(false);
  const [flipYouth, setFlipYouth] = useState(false);
  const [showProSelector, setShowProSelector] = useState(false);
  const [showYouthSelector, setShowYouthSelector] = useState(false);

  const proSwing = useMemo(() => PRO_SWINGS.find((s) => s.id === proId) || PRO_SWINGS[0], [proId]);
  const youthSwing = useMemo(() => YOUTH_SWINGS.find((s) => s.id === youthId) || YOUTH_SWINGS[0], [youthId]);

  const phase = useMemo(() => {
    const p = Math.max(0, Math.min(1, progress));
    let closest: Phase = "stance";
    let closestDist = Infinity;
    for (const pname of PHASES) {
      const dist = Math.abs(p - PHASE_POSITIONS[pname]);
      if (dist < closestDist) {
        closestDist = dist;
        closest = pname;
      }
    }
    return closest;
  }, [progress]);

  // Determine flips based on handedness
  // Pro auto-flips to match R/L based on chosen pro
  const proHandedness = useMemo(() => {
    const s = PRO_SWINGS.find((s) => s.id === proId);
    return s?.handedness || "R";
  }, [proId]);

  const youthHandedness = useMemo(() => {
    const s = YOUTH_SWINGS.find((s) => s.id === youthId);
    return s?.handedness || "R";
  }, [youthId]);

  // Default: flip pro if different handedness from youth
  const proMirrored = useMemo(() => {
    if (proHandedness !== youthHandedness) return !flipPro;
    return flipPro;
  }, [proHandedness, youthHandedness, flipPro]);

  const handleSelectPro = useCallback((id: string) => {
    setProId(id);
    setShowProSelector(false);
  }, []);

  const handleSelectYouth = useCallback((id: string) => {
    setYouthId(id);
    setShowYouthSelector(false);
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
        <div className="flex items-center gap-1">
          <span className="text-neon text-xl font-bold italic">Swing</span>
          <span className="text-white/50 text-xl italic font-light">Lab</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowProSelector(true)}
            className="text-[11px] text-white border border-white/30 rounded-full px-3 py-1.5 hover:border-neon/60 transition"
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

      {/* Pro Swing */}
      <div className="px-4 flex-1 flex flex-col gap-0 overflow-hidden">
        {/* Pro label row */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{proSwing.label}</span>
          <button
            onClick={() => setFlipPro(!flipPro)}
            className="text-[10px] text-gray-400 hover:text-neon transition"
            title="Toggle flip"
          >
            Flip {proSwing.handedness === "L" ? "(L)" : "(R)"}
          </button>
        </div>
        <VideoFrameEngine
          src={proSwing.src}
          fps={proSwing.fps}
          totalFrames={proSwing.totalFrames}
          phaseFrames={proSwing.defaultPhaseFrames}
          progress={progress}
          phaseNames={PHASES as unknown as string[]}
          phasePositions={PHASE_POSITIONS as unknown as Record<string, number>}
          flipped={proMirrored}
          label="Pro"
        />

        {/* Phase divider */}
        <PhaseLabel phase={phase} />

        {/* Player label row */}
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider font-medium">{youthSwing.label}</span>
          <button
            onClick={() => setFlipYouth(!flipYouth)}
            className="text-[10px] text-gray-400 hover:text-neon transition"
          >
            Flip {youthSwing.handedness === "L" ? "(L)" : "(R)"}
          </button>
        </div>
        <VideoFrameEngine
          src={youthSwing.src}
          fps={youthSwing.fps}
          totalFrames={youthSwing.totalFrames}
          phaseFrames={youthSwing.defaultPhaseFrames}
          progress={progress}
          phaseNames={PHASES as unknown as string[]}
          phasePositions={PHASE_POSITIONS as unknown as Record<string, number>}
          flipped={flipYouth}
          label="Player"
        />
      </div>

      {/* Swap + Phase Sync */}
      <div className="flex items-center justify-center gap-4 py-2">
        <button
          onClick={() => {
            setShowYouthSelector(true);
          }}
          className="flex items-center gap-1 text-[11px] text-gray-400 border border-gray-700 rounded-full px-3 py-1.5 hover:border-neon/40 transition"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17 1l4 4-4 4" />
            <path d="M3 5h18" />
            <path d="M7 23l-4-4 4-4" />
            <path d="M21 19H3" />
          </svg>
          Change Player
        </button>
        <div className="flex items-center gap-2 border border-neon/60 rounded-full px-4 py-1.5">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C8F000" strokeWidth="2.5">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0110 0v4" />
          </svg>
          <span className="text-neon text-xs">Phase Sync</span>
        </div>
      </div>

      {/* Scrubber */}
      <Scrubber
        progress={progress}
        onProgressChange={setProgress}
        currentPhase={phase}
      />

      {/* Pro Selector Modal */}
      {showProSelector && (
        <SwingSelector
          swings={PRO_SWINGS}
          title="Select Pro Swing"
          activeId={proId}
          onSelect={handleSelectPro}
          onClose={() => setShowProSelector(false)}
        />
      )}

      {/* Youth Selector Modal */}
      {showYouthSelector && (
        <SwingSelector
          swings={YOUTH_SWINGS}
          title="Select Player Swing"
          activeId={youthId}
          onSelect={handleSelectYouth}
          onClose={() => setShowYouthSelector(false)}
        />
      )}
    </div>
  );
}

function SwingSelector({
  swings,
  title,
  activeId,
  onSelect,
  onClose,
}: {
  swings: SwingVideoInfo[];
  title: string;
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col safe-top safe-bottom">
      <div className="flex items-center justify-between px-4 py-3">
        <div className="w-10" />
        <h2 className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} className="text-white text-sm">Close</button>
      </div>
      <div className="grid grid-cols-1 gap-3 px-4 flex-1 overflow-y-auto pb-8">
        {swings.map((swing) => (
          <button
            key={swing.id}
            onClick={() => onSelect(swing.id)}
            className={`flex items-center gap-4 bg-surface rounded-xl overflow-hidden border-2 p-3 transition ${
              swing.id === activeId ? "border-neon" : "border-transparent"
            }`}
          >
            {/* Thumbnail placeholder */}
            <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 flex-shrink-0 flex items-center justify-center overflow-hidden">
              <video
                src={swing.src}
                className="w-full h-full object-cover"
                muted
                preload="metadata"
              />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-medium">{swing.label}</p>
              <p className="text-[11px] text-gray-400">
                {swing.handedness === "R" ? "Right" : "Left"} handed ·{" "}
                {(swing.durationMs / 1000).toFixed(1)}s ·{" "}
                {swing.fps}fps
              </p>
            </div>
            {swing.id === activeId && (
              <div className="w-2 h-2 rounded-full bg-neon" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
