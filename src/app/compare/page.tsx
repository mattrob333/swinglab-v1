"use client";

import { useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import VideoFrameEngine from "@/components/VideoFrameEngine";
import Scrubber from "@/components/Scrubber";
import { PRO_SWINGS, YOUTH_SWINGS, type SwingVideoInfo } from "@/lib/videos";
import {
  PHASES,
  PHASE_POSITIONS,
  PHASE_LABELS,
  type Phase,
} from "@/lib/swing-phases";

export default function ComparePage() {
  const router = useRouter();

  // Sync state — unlocks first for tagging, starts at frame 0
  const [syncLocked, setSyncLocked] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<"pro" | "player">("pro");
  const [sharedProgress, setSharedProgress] = useState(0);
  const [proProgress, setProProgress] = useState(0);
  const [playerProgress, setPlayerProgress] = useState(0);

  // Video selections
  const [proId, setProId] = useState(PRO_SWINGS[0].id);
  const [youthId, setYouthId] = useState(YOUTH_SWINGS[0].id);
  const [flipPro, setFlipPro] = useState(false);
  const [flipYouth, setFlipYouth] = useState(false);
  const [showProSelector, setShowProSelector] = useState(false);
  const [showYouthSelector, setShowYouthSelector] = useState(false);

  // Phase markers: Record<phase, progress-value>. All start at 0.
  // We track separately which phases the user has explicitly marked.
  const [proPhaseMarkers, setProPhaseMarkers] = useState<Record<string, number>>(
    Object.fromEntries(PHASES.map((p) => [p, 0]))
  );
  const [playerPhaseMarkers, setPlayerPhaseMarkers] = useState<Record<string, number>>(
    Object.fromEntries(PHASES.map((p) => [p, 0]))
  );

  // Phase marking set per video
  const emptySet = () => new Set<string>();
  const [proMarked, setProMarked] = useState<Set<string>>(emptySet);
  const [playerMarked, setPlayerMarked] = useState<Set<string>>(emptySet);

  // Reset when video changes
  const selectPro = useCallback((id: string) => {
    setProId(id);
    setProPhaseMarkers(Object.fromEntries(PHASES.map((p) => [p, 0])));
    setProMarked(emptySet());
    setProProgress(0);
    setShowProSelector(false);
  }, []);

  const selectYouth = useCallback((id: string) => {
    setYouthId(id);
    setPlayerPhaseMarkers(Object.fromEntries(PHASES.map((p) => [p, 0])));
    setPlayerMarked(emptySet());
    setPlayerProgress(0);
    setShowYouthSelector(false);
  }, []);

  // Current phase from active progress
  const currentPhase = useMemo(() => {
    const p = syncLocked
      ? sharedProgress
      : selectedVideo === "pro"
        ? proProgress
        : playerProgress;
    let closest: Phase = "stance";
    let closestDist = Infinity;
    for (const name of PHASES) {
      const dist = Math.abs(p - PHASE_POSITIONS[name]);
      if (dist < closestDist) {
        closestDist = dist;
        closest = name;
      }
    }
    return closest;
  }, [syncLocked, sharedProgress, selectedVideo, proProgress, playerProgress]);

  // Scrubber progress
  const scrubberProgress = useMemo(
    () =>
      syncLocked
        ? sharedProgress
        : selectedVideo === "pro"
          ? proProgress
          : playerProgress,
    [syncLocked, sharedProgress, selectedVideo, proProgress, playerProgress]
  );

  const handleScrubberChange = useCallback(
    (p: number) => {
      if (syncLocked) {
        setSharedProgress(p);
      } else if (selectedVideo === "pro") {
        setProProgress(p);
      } else {
        setPlayerProgress(p);
      }
    },
    [syncLocked, selectedVideo]
  );

  // Mark current frame on selected video for the given phase
  const markPhase = useCallback(
    (phaseName: string) => {
      const prog = selectedVideo === "pro" ? proProgress : playerProgress;
      if (selectedVideo === "pro") {
        setProPhaseMarkers((prev) => ({ ...prev, [phaseName]: prog }));
        setProMarked((prev) => new Set(prev).add(phaseName));
      } else {
        setPlayerPhaseMarkers((prev) => ({ ...prev, [phaseName]: prog }));
        setPlayerMarked((prev) => new Set(prev).add(phaseName));
      }
    },
    [selectedVideo, proProgress, playerProgress]
  );

  // Counts
  const proCount = proMarked.size;
  const playerCount = playerMarked.size;
  const all7OnPro = proCount >= 7;
  const all7OnPlayer = playerCount >= 7;
  const all7OnBoth = all7OnPro && all7OnPlayer;

  // Swings
  const proSwing = useMemo(
    () => PRO_SWINGS.find((s) => s.id === proId) || PRO_SWINGS[0],
    [proId]
  );
  const youthSwing = useMemo(
    () => YOUTH_SWINGS.find((s) => s.id === youthId) || YOUTH_SWINGS[0],
    [youthId]
  );

  // Next unmarked phase
  const nextUnmarked = useMemo(() => {
    const mkd = selectedVideo === "pro" ? proMarked : playerMarked;
    return PHASES.find((p) => !mkd.has(p));
  }, [selectedVideo, proMarked, playerMarked]);

  return (
    <div className="flex flex-col min-h-dvh bg-black safe-top safe-bottom">
      {/* Nav Bar */}
      <div className="flex items-center justify-between px-4 py-2.5">
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
          <button onClick={() => setShowProSelector(true)}
            className="text-[11px] text-white border border-white/30 rounded-full px-3 py-1.5 hover:border-neon/60 transition">
            Change Pro
          </button>
          <button className="text-white">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Video area — tight stacked */}
      <div className="px-4 flex flex-col gap-0">
        {/* Pro label */}
        <div className="flex items-center justify-between py-0.5">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">{proSwing.label}</span>
          <button onClick={() => setFlipPro(!flipPro)}
            className="text-[10px] text-gray-400 hover:text-neon transition">
            Flip ({proSwing.handedness})
          </button>
        </div>

        {/* Pro video */}
        <div
          onClick={() => !syncLocked && setSelectedVideo("pro")}
          className={`rounded-xl overflow-hidden transition-all duration-200 cursor-pointer
            ${!syncLocked && selectedVideo === "pro" ? "ring-2 ring-neon ring-offset-2 ring-offset-black" : "ring-0"}`}
        >
          <VideoFrameEngine
            src={proSwing.src}
            fps={proSwing.fps}
            totalFrames={proSwing.totalFrames}
            phaseFrames={proPhaseMarkers}
            progress={syncLocked ? sharedProgress : proProgress}
            phaseNames={PHASES as unknown as string[]}
            phasePositions={PHASE_POSITIONS as unknown as Record<string, number>}
            flipped={flipPro}
            label="Pro"
          />
        </div>

        {/* Player label */}
        <div className="flex items-center justify-between py-0.5 mt-0">
          <span className="text-[10px] text-gray-400 uppercase tracking-wider">{youthSwing.label}</span>
          <button onClick={() => setFlipYouth(!flipYouth)}
            className="text-[10px] text-gray-400 hover:text-neon transition">
            Flip ({youthSwing.handedness})
          </button>
        </div>

        {/* Player video */}
        <div
          onClick={() => !syncLocked && setSelectedVideo("player")}
          className={`rounded-xl overflow-hidden transition-all duration-200 cursor-pointer
            ${!syncLocked && selectedVideo === "player" ? "ring-2 ring-neon ring-offset-2 ring-offset-black" : "ring-0"}`}
        >
          <VideoFrameEngine
            src={youthSwing.src}
            fps={youthSwing.fps}
            totalFrames={youthSwing.totalFrames}
            phaseFrames={playerPhaseMarkers}
            progress={syncLocked ? sharedProgress : playerProgress}
            phaseNames={PHASES as unknown as string[]}
            phasePositions={PHASE_POSITIONS as unknown as Record<string, number>}
            flipped={flipYouth}
            label="Player"
          />
        </div>
      </div>

      {/* Controls area */}
      <div className="px-4 pt-2 pb-0">
        {/* Instruction */}
        {!syncLocked && (
          <div className="text-center mb-1">
            {proCount >= 7 && playerCount < 7 ? (
              <p className="text-[11px] text-emerald-400">
                ✅ All 7 Pro phases marked! Now tap the Player video and mark its 7 phases.
              </p>
            ) : nextUnmarked ? (
              <p className="text-[11px] text-amber-400">
                Scrub <span className="text-white font-semibold">{selectedVideo === "pro" ? "Pro" : "Player"}</span> to find{" "}
                <span className="text-neon font-bold">{PHASE_LABELS[nextUnmarked]}</span> frame, then tap that button.
              </p>
            ) : (
              <p className="text-[11px] text-emerald-400">
                ✅ All 7 phases on both videos! Lock sync to compare.
              </p>
            )}
          </div>
        )}

        {/* Sync locked — phase chip */}
        {syncLocked && (
          <div className="flex items-center justify-center mb-1">
            <div className="flex items-center gap-2 bg-black border border-neon/60 rounded-full px-4 py-1">
              <span className="text-neon text-xs font-bold tracking-wide uppercase">
                {PHASE_LABELS[currentPhase]}
              </span>
            </div>
          </div>
        )}

        {/* Buttons row */}
        <div className="flex items-center justify-center gap-3 mb-1">
          <button
            onClick={() => setShowYouthSelector(true)}
            className="flex items-center gap-1 text-[11px] text-gray-400 border border-gray-700 rounded-full px-3 py-1.5 hover:border-neon/40 transition"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 1l4 4-4 4" /><path d="M3 5h18" /><path d="M7 23l-4-4 4-4" /><path d="M21 19H3" />
            </svg>
            Change Player
          </button>

          {/* Phase Sync */}
          {syncLocked ? (
            <button
              onClick={() => { setSyncLocked(false); setSelectedVideo("pro"); }}
              className="flex items-center gap-1.5 border border-neon/80 rounded-full px-4 py-1.5 bg-neon/10"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#C8F000" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <span className="text-neon text-xs font-medium">Phase Sync On</span>
            </button>
          ) : (
            <button
              onClick={() => { if (all7OnBoth) setSyncLocked(true); }}
              disabled={!all7OnBoth}
              className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 border text-xs transition ${
                all7OnBoth
                  ? "border-neon text-neon bg-neon/10"
                  : "border-gray-600 text-gray-500"
              }`}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" />
                <path d="M7 11V7a5 5 0 0110 0v4" />
              </svg>
              <span>{all7OnBoth ? "Lock Phase Sync" : "Mark all phases first"}</span>
            </button>
          )}
        </div>

        {/* Phase marking buttons */}
        {!syncLocked && (
          <>
            <div className="grid grid-cols-4 gap-1.5 pb-1">
              {PHASES.map((phaseName) => {
                const marked =
                  (selectedVideo === "pro" ? proMarked : playerMarked).has(phaseName);
                const isNext = phaseName === nextUnmarked;
                return (
                  <button
                    key={phaseName}
                    onClick={() => markPhase(phaseName)}
                    className={`text-[10px] font-semibold py-2 rounded-lg transition-all ${
                      marked
                        ? "bg-neon text-black"
                        : isNext
                          ? "bg-neon/20 text-neon border border-neon/40"
                          : "bg-gray-900 text-gray-500 border border-gray-800"
                    }`}
                  >
                    {PHASE_LABELS[phaseName]}
                    {marked ? " ✓" : ""}
                  </button>
                );
              })}
            </div>

            {/* Progress */}
            <div className="flex justify-center gap-4 text-[10px] text-gray-500 pb-1">
              <span className={selectedVideo === "pro" ? "text-neon font-semibold" : ""}>
                Pro: {proCount}/7
              </span>
              <span className={selectedVideo === "player" ? "text-neon font-semibold" : ""}>
                Player: {playerCount}/7
              </span>
            </div>
          </>
        )}
      </div>

      {/* Scrubber */}
      <Scrubber
        progress={scrubberProgress}
        onProgressChange={handleScrubberChange}
        currentPhase={currentPhase}
      />

      {/* Selector modals */}
      {showProSelector && (
        <SwingSelector
          swings={PRO_SWINGS}
          title="Select Pro Swing"
          activeId={proId}
          onSelect={selectPro}
          onClose={() => setShowProSelector(false)}
        />
      )}
      {showYouthSelector && (
        <SwingSelector
          swings={YOUTH_SWINGS}
          title="Select Player Swing"
          activeId={youthId}
          onSelect={selectYouth}
          onClose={() => setShowYouthSelector(false)}
        />
      )}
    </div>
  );
}

function SwingSelector({
  swings, title, activeId, onSelect, onClose,
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
          <button key={swing.id} onClick={() => onSelect(swing.id)}
            className={`flex items-center gap-4 bg-surface rounded-xl overflow-hidden border-2 p-3 transition ${
              swing.id === activeId ? "border-neon" : "border-transparent"}`}>
            <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 flex-shrink-0 flex items-center justify-center overflow-hidden">
              <video src={swing.src} className="w-full h-full object-cover" muted preload="metadata" />
            </div>
            <div className="text-left flex-1">
              <p className="text-sm font-medium">{swing.label}</p>
              <p className="text-[11px] text-gray-400">{swing.handedness === "R" ? "Right" : "Left"} · {(swing.durationMs / 1000).toFixed(1)}s · {swing.fps}fps</p>
            </div>
            {swing.id === activeId && <div className="w-2 h-2 rounded-full bg-neon" />}
          </button>
        ))}
      </div>
    </div>
  );
}
