"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import VideoFrameEngine from "@/components/VideoFrameEngine";
import Scrubber from "@/components/Scrubber";
import { PRO_SWINGS, YOUTH_SWINGS, type SwingVideoInfo } from "@/lib/videos";
import { PHASES, PHASE_POSITIONS, PHASE_LABELS, type Phase } from "@/lib/swing-phases";

type CompareSide = "pro" | "player";
type PendingOverwrite = { side: CompareSide; phase: Phase } | null;

function PhasePill({ phase, marked, isNext, overwritePending, onClick }: {
  phase: Phase;
  marked: boolean;
  isNext: boolean;
  overwritePending: boolean;
  onClick: () => void;
}) {
  // Determine color based on phase number
  const idx = PHASES.indexOf(phase);
  const colors = ["#7170ff","#5e6ad2","#10b981","#27a644","#f59e0b","#f97316","#ef4444"];
  const color = colors[idx];

  return (
    <button
      onClick={onClick}
      aria-pressed={marked}
      aria-label={`${marked ? "Replace" : "Mark"} ${PHASE_LABELS[phase]} phase`}
      className={`flex-shrink-0 min-h-11 px-3.5 py-2 rounded-full text-[12px] font-semibold transition-all duration-200
        ${overwritePending
          ? "text-amber-100 border border-amber-300/70 bg-amber-300/15"
          : marked
          ? "text-white shadow-lg"
          : isNext
            ? "text-white/90 border border-white/25 bg-white/[0.08]"
            : "text-white/30 border border-white/5 bg-transparent"
        }
      `}
      style={{
        backgroundColor: overwritePending ? undefined : marked ? color : "transparent",
        borderColor: overwritePending ? undefined : marked ? color : isNext ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.05)",
        boxShadow: overwritePending ? "0 0 14px rgba(252, 211, 77, 0.18)" : marked ? `0 0 16px ${color}40` : "none",
      }}
    >
      <span className="flex items-center gap-1.5 whitespace-nowrap">
        {marked ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <span className="text-[9px] font-mono opacity-40">{String(idx + 1).padStart(2, "0")}</span>
        )}
        {PHASE_LABELS[phase]}
      </span>
    </button>
  );
}

export default function ComparePage() {
  const router = useRouter();
  const tagsRef = useRef<HTMLDivElement>(null);
  const [showProSelector, setShowProSelector] = useState(false);
  const [showYouthSelector, setShowYouthSelector] = useState(false);

  // Core state
  const [syncLocked, setSyncLocked] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<CompareSide>("pro");
  const [sharedProgress, setSharedProgress] = useState(0);
  const [proProgress, setProProgress] = useState(0);
  const [playerProgress, setPlayerProgress] = useState(0);
  const [proCurrentFrame, setProCurrentFrame] = useState(0);
  const [playerCurrentFrame, setPlayerCurrentFrame] = useState(0);

  // Video selections
  const [proId, setProId] = useState(PRO_SWINGS[0].id);
  const [youthId, setYouthId] = useState(YOUTH_SWINGS[0].id);
  const [flipPro, setFlipPro] = useState(false);
  const [flipYouth, setFlipYouth] = useState(false);

  // Phase markers
  const initMarkers = (swing: SwingVideoInfo) => ({ ...swing.defaultPhaseFrames });
  const [proPhaseMarkers, setProPhaseMarkers] = useState<Record<string, number>>(
    () => initMarkers(PRO_SWINGS[0])
  );
  const [playerPhaseMarkers, setPlayerPhaseMarkers] = useState<Record<string, number>>(
    () => initMarkers(YOUTH_SWINGS[0])
  );
  const [proMarked, setProMarked] = useState<Set<string>>(new Set());
  const [playerMarked, setPlayerMarked] = useState<Set<string>>(new Set());
  const [pendingOverwrite, setPendingOverwrite] = useState<PendingOverwrite>(null);

  const selectSwing = useCallback((id: string, side: CompareSide) => {
    if (side === "pro") {
      const nextSwing = PRO_SWINGS.find((s) => s.id === id) || PRO_SWINGS[0];
      setProId(id);
      setProPhaseMarkers(initMarkers(nextSwing));
      setProMarked(new Set());
      setPendingOverwrite(null);
      setProProgress(0);
      setProCurrentFrame(nextSwing.defaultPhaseFrames.stance ?? 0);
      setShowProSelector(false);
    } else {
      const nextSwing = YOUTH_SWINGS.find((s) => s.id === id) || YOUTH_SWINGS[0];
      setYouthId(id);
      setPlayerPhaseMarkers(initMarkers(nextSwing));
      setPlayerMarked(new Set());
      setPendingOverwrite(null);
      setPlayerProgress(0);
      setPlayerCurrentFrame(nextSwing.defaultPhaseFrames.stance ?? 0);
      setShowYouthSelector(false);
    }
  }, []);

  // Current phase
  const currentPhase = useMemo(() => {
    const p = syncLocked ? sharedProgress : selectedVideo === "pro" ? proProgress : playerProgress;
    let closest: Phase = "stance";
    let cd = Infinity;
    for (const n of PHASES) {
      const d = Math.abs(p - PHASE_POSITIONS[n]);
      if (d < cd) { cd = d; closest = n; }
    }
    return closest;
  }, [syncLocked, sharedProgress, selectedVideo, proProgress, playerProgress]);

  const scrubberProgress = useMemo(
    () => syncLocked ? sharedProgress : selectedVideo === "pro" ? proProgress : playerProgress,
    [syncLocked, sharedProgress, selectedVideo, proProgress, playerProgress]
  );

  const handleScrub = useCallback((p: number) => {
    if (syncLocked) setSharedProgress(p);
    else if (selectedVideo === "pro") setProProgress(p);
    else setPlayerProgress(p);
  }, [syncLocked, selectedVideo]);

  const markPhase = useCallback((phaseName: Phase) => {
    const activeMarked = selectedVideo === "pro" ? proMarked : playerMarked;
    if (activeMarked.has(phaseName)) {
      const isConfirming =
        pendingOverwrite?.side === selectedVideo && pendingOverwrite.phase === phaseName;
      if (!isConfirming) {
        setPendingOverwrite({ side: selectedVideo, phase: phaseName });
        return;
      }
    }

    const frame = selectedVideo === "pro" ? proCurrentFrame : playerCurrentFrame;
    if (selectedVideo === "pro") {
      setProPhaseMarkers(p => ({ ...p, [phaseName]: frame }));
      setProMarked(p => new Set(p).add(phaseName));
    } else {
      setPlayerPhaseMarkers(p => ({ ...p, [phaseName]: frame }));
      setPlayerMarked(p => new Set(p).add(phaseName));
    }
    setPendingOverwrite(null);
  }, [selectedVideo, proCurrentFrame, playerCurrentFrame, proMarked, playerMarked, pendingOverwrite]);

  const proCount = proMarked.size;
  const playerCount = playerMarked.size;
  const all7OnBoth = proCount >= 7 && playerCount >= 7;

  const proSwing = useMemo(() => PRO_SWINGS.find(s => s.id === proId) || PRO_SWINGS[0], [proId]);
  const youthSwing = useMemo(() => YOUTH_SWINGS.find(s => s.id === youthId) || YOUTH_SWINGS[0], [youthId]);

  const nextUnmarked = useMemo(() => {
    const m = selectedVideo === "pro" ? proMarked : playerMarked;
    return PHASES.find(p => !m.has(p));
  }, [selectedVideo, proMarked, playerMarked]);

  // Auto-scroll phase pills to the next unmarked
  useEffect(() => {
    if (!nextUnmarked || !tagsRef.current || syncLocked) return;
    const el = tagsRef.current.querySelector(`[data-phase="${nextUnmarked}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [nextUnmarked, syncLocked]);

  const activeLabel = selectedVideo === "pro" ? "Pro" : "Player";
  const activePendingOverwrite = pendingOverwrite?.side === selectedVideo ? pendingOverwrite : null;
  const statusText = activePendingOverwrite
    ? `Tap ${PHASE_LABELS[activePendingOverwrite.phase]} again to replace ${activeLabel} marker`
    : syncLocked
      ? "Synced compare: scrub both swings by matching phases"
      : nextUnmarked
        ? `Tagging ${activeLabel}: mark ${PHASE_LABELS[nextUnmarked]}`
        : selectedVideo === "pro" && playerCount < 7
          ? "Pro complete. Tap Player to tag their phases"
          : selectedVideo === "player" && proCount < 7
            ? "Player complete. Tap Pro to tag their phases"
            : "Both swings tagged. Lock sync when ready";

  return (
    <div className="flex flex-col h-dvh bg-[#08090a] text-[#f7f8f8] select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
        <button
          onClick={() => router.push("/")}
          className="min-h-11 min-w-11 -ml-2 grid place-items-center text-white/60 hover:text-white transition-colors"
          aria-label="Back"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex items-center gap-0.5">
          <span className="text-[#C8F000] text-lg font-bold italic tracking-tight">Swing</span>
          <span className="text-white/40 text-lg italic font-light">Lab</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowProSelector(true)}
            className="min-h-11 text-[12px] font-medium text-white/70 bg-white/[0.04] border border-white/[0.08] rounded-lg px-3 hover:bg-white/[0.08] hover:text-white transition-all">
            Pro
          </button>
          <span className="text-white/[0.08] text-xs">|</span>
          <button className="min-h-11 min-w-11 grid place-items-center text-white/40 hover:text-white/70 transition-colors" aria-label="More options">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 flex flex-col min-h-0 px-3 gap-[1px] py-1">
        {/* Pro */}
        <div
          onClick={() => !syncLocked && setSelectedVideo("pro")}
          className={`flex-1 min-h-0 relative rounded-lg overflow-hidden transition-all duration-300 cursor-pointer
            ${!syncLocked && selectedVideo === "pro" ? "ring-[1.5px] ring-[#C8F000]/70 ring-offset-[1px] ring-offset-[#08090a]" : "ring-0"}
          `}
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
            onFrameUpdate={(frame) => setProCurrentFrame(frame)}
          />
          <div className="absolute top-1.5 right-1.5 flex items-start pointer-events-none">
            <button
              onClick={(e) => { e.stopPropagation(); setFlipPro(!flipPro); }}
              className="pointer-events-auto min-h-10 rounded-full bg-black/35 backdrop-blur-[6px] px-3 text-[11px] font-medium text-white/60 border border-white/[0.08] hover:bg-black/55 hover:text-white/90 transition-colors"
              aria-pressed={flipPro}
            >
              Flip
            </button>
          </div>
        </div>

        {/* Player */}
        <div
          onClick={() => !syncLocked && setSelectedVideo("player")}
          className={`flex-1 min-h-0 relative rounded-lg overflow-hidden transition-all duration-300 cursor-pointer
            ${!syncLocked && selectedVideo === "player" ? "ring-[1.5px] ring-[#C8F000]/70 ring-offset-[1px] ring-offset-[#08090a]" : "ring-0"}
          `}
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
            onFrameUpdate={(frame) => setPlayerCurrentFrame(frame)}
          />
          <div className="absolute top-1.5 right-1.5 flex items-start pointer-events-none">
            <button
              onClick={(e) => { e.stopPropagation(); setFlipYouth(!flipYouth); }}
              className="pointer-events-auto min-h-10 rounded-full bg-black/35 backdrop-blur-[6px] px-3 text-[11px] font-medium text-white/60 border border-white/[0.08] hover:bg-black/55 hover:text-white/90 transition-colors"
              aria-pressed={flipYouth}
            >
              Flip
            </button>
          </div>
        </div>
      </div>

      {/* Bottom panel */}
      <div className="border-t border-white/[0.05] px-3 pt-2 pb-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-[12px] font-semibold text-white/80">
              {syncLocked ? "Synced compare" : `Tagging ${activeLabel}`}
            </p>
            <p className="truncate text-[10px] text-white/35">
              {selectedVideo === "pro" ? proSwing.label : youthSwing.label}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] p-1">
            {(["pro", "player"] as const).map((side) => (
              <button
                key={side}
                onClick={() => !syncLocked && setSelectedVideo(side)}
                disabled={syncLocked}
                className={`min-h-9 rounded-full px-3 text-[11px] font-semibold transition ${
                  selectedVideo === side && !syncLocked
                    ? "bg-[#C8F000] text-black"
                    : "text-white/45 hover:text-white/80 disabled:hover:text-white/45"
                }`}
                aria-pressed={selectedVideo === side && !syncLocked}
              >
                {side === "pro" ? "Pro" : "Player"}
              </button>
            ))}
          </div>
        </div>

        {/* Phase buttons strip (tagging mode) */}
        {!syncLocked && (
          <div className="mb-2">
            <div ref={tagsRef} className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {PHASES.map((phaseName) => {
                const marked = (selectedVideo === "pro" ? proMarked : playerMarked).has(phaseName);
                const isNext = phaseName === nextUnmarked;
                const overwritePending =
                  pendingOverwrite?.side === selectedVideo && pendingOverwrite.phase === phaseName;
                return (
                  <div key={phaseName} data-phase={phaseName}>
                    <PhasePill
                      phase={phaseName}
                      marked={marked}
                      isNext={isNext}
                      overwritePending={overwritePending}
                      onClick={() => markPhase(phaseName)}
                    />
                  </div>
                );
              })}
            </div>
            {/* Progress */}
            <div className="flex items-center justify-between gap-3 px-0.5">
              <span className={`min-w-0 flex-1 truncate text-[10px] font-medium ${activePendingOverwrite ? "text-amber-200" : "text-white/35"}`}>
                {statusText}
              </span>
              <div className="flex items-center gap-3 text-[10px]">
                <span className={selectedVideo === "pro" ? "text-white/80" : "text-white/30"}>
                  Pro <span className={proCount >= 7 ? "text-emerald-400" : "text-white/50"}>{proCount}/7</span>
                </span>
                <span className={selectedVideo === "player" ? "text-white/80" : "text-white/30"}>
                  Player <span className={playerCount >= 7 ? "text-emerald-400" : "text-white/50"}>{playerCount}/7</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {syncLocked && (
          <div className="mb-2 rounded-md border border-white/[0.06] bg-white/[0.03] px-3 py-2">
            <p className="text-[11px] font-medium text-white/70">{statusText}</p>
          </div>
        )}

        {/* Controls row */}
        <div className="flex items-center justify-between mb-1">
          <div className="min-w-0 flex items-center gap-2">
            <button
              onClick={() => setShowYouthSelector(true)}
              className="min-h-10 rounded-full pr-3 text-[11px] text-white/45 hover:text-white/75 transition-colors flex items-center gap-1"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 1l4 4-4 4" /><path d="M3 5h18" /><path d="M7 23l-4-4 4-4" /><path d="M21 19H3" />
              </svg>
              Player
            </button>
            <span className="hidden min-w-0 truncate text-[10px] text-white/25 sm:block">
              {statusText}
            </span>
          </div>

          {/* Phase sync toggle */}
          <button
            onClick={() => {
              if (syncLocked) { setSyncLocked(false); setSelectedVideo("pro"); }
              else if (all7OnBoth) setSyncLocked(true);
            }}
            aria-pressed={syncLocked}
            aria-label={syncLocked ? "Unlock phase sync" : all7OnBoth ? "Lock phase sync" : `Finish tagging both swings before locking sync`}
            className={`min-h-11 flex items-center gap-1.5 text-[12px] font-semibold rounded-full px-4 transition-all ${
              syncLocked
                ? "bg-[#C8F000]/10 text-[#C8F000] border border-[#C8F000]/30"
                : all7OnBoth
                  ? "bg-white/5 text-white/60 border border-white/10 hover:bg-white/10"
                  : "bg-transparent text-white/20 border border-white/5"
            }`}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <rect x="3" y="11" width="18" height="11" rx="2" />
              <path d={syncLocked ? "M7 11V7a5 5 0 0110 0v4" : "M8 11V7a4 4 0 118 0v4"} />
            </svg>
            {syncLocked ? "Synced" : all7OnBoth ? "Lock Sync" : "Tag First"}
          </button>
        </div>

        {/* Scrubber */}
        <Scrubber
          progress={scrubberProgress}
          onProgressChange={handleScrub}
          currentPhase={currentPhase}
        />
      </div>

      {/* Selector modals */}
      {showProSelector && (
        <SwingSelector swings={PRO_SWINGS} title="Select Pro" activeId={proId}
          onSelect={(id) => selectSwing(id, "pro")}
          onClose={() => setShowProSelector(false)} />
      )}
      {showYouthSelector && (
        <SwingSelector swings={YOUTH_SWINGS} title="Select Player" activeId={youthId}
          onSelect={(id) => selectSwing(id, "player")}
          onClose={() => setShowYouthSelector(false)} />
      )}
    </div>
  );
}

function SwingSelector({ swings, title, activeId, onSelect, onClose }: {
  swings: SwingVideoInfo[]; title: string; activeId: string;
  onSelect: (id: string) => void; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.05]">
        <button onClick={onClose} className="text-white/50 hover:text-white transition-colors text-sm">Cancel</button>
        <h2 className="text-sm font-medium text-white/80">{title}</h2>
        <div className="w-10" />
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {swings.map((s) => (
          <button key={s.id} onClick={() => onSelect(s.id)}
            className={`w-full flex items-center gap-3 bg-white/[0.02] hover:bg-white/[0.05] rounded-lg p-3 border transition-all ${
              s.id === activeId ? "border-[#C8F000]/50" : "border-white/[0.05]"
            }`}>
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden flex-shrink-0">
              <video src={s.src} className="w-full h-full object-cover" muted preload="metadata" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-medium text-white/80 truncate">{s.label}</p>
              <p className="text-[10px] text-white/30">{s.handedness === "R" ? "Right" : "Left"} | {(s.durationMs / 1000).toFixed(1)}s | {s.fps}fps</p>
            </div>
            {s.id === activeId && <div className="w-1.5 h-1.5 rounded-full bg-[#C8F000] flex-shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}
