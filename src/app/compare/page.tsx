"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import VideoFrameEngine from "@/components/VideoFrameEngine";
import Scrubber from "@/components/Scrubber";
import { PRO_SWINGS, YOUTH_SWINGS, type SwingVideoInfo } from "@/lib/videos";
import { PHASES, PHASE_POSITIONS, PHASE_LABELS, type Phase } from "@/lib/swing-phases";

function PhasePill({ phase, marked, isNext, onClick }: {
  phase: string; marked: boolean; isNext: boolean; onClick: () => void;
}) {
  const idx = PHASES.indexOf(phase as Phase);
  const colors = ["#7170ff","#5e6ad2","#10b981","#27a644","#f59e0b","#f97316","#ef4444"];
  const color = colors[idx];
  return (
    <button onClick={onClick}
      className={`flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all duration-200 ${
        marked ? "text-white shadow-lg" : isNext ? "text-white/80 border border-white/20 bg-white/5" : "text-white/30 border border-white/5 bg-transparent"}`}
      style={{ backgroundColor: marked ? color : "transparent", borderColor: marked ? color : isNext ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.05)", boxShadow: marked ? `0 0 16px ${color}40` : "none" }}
    >
      <span className="flex items-center gap-1.5">
        {marked ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
        ) : (
          <span className="text-[9px] font-mono opacity-40">{String(idx + 1).padStart(2, "0")}</span>
        )}
        {PHASE_LABELS[phase as Phase]}
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
  const [selectedVideo, setSelectedVideo] = useState<"pro" | "player">("pro");
  const [sharedProgress, setSharedProgress] = useState(0);
  const [proProgress, setProProgress] = useState(0);
  const [playerProgress, setPlayerProgress] = useState(0);

  // Video selections
  const [proId, setProId] = useState(PRO_SWINGS[0].id);
  const [youthId, setYouthId] = useState(YOUTH_SWINGS[0].id);
  const [flipPro, setFlipPro] = useState(false);
  const [flipYouth, setFlipYouth] = useState(false);

  // Phase markers — start empty, user marks them
  const [proPhaseMarkers, setProPhaseMarkers] = useState<Record<string, number>>(Object.fromEntries(PHASES.map(p => [p, 0])));
  const [playerPhaseMarkers, setPlayerPhaseMarkers] = useState<Record<string, number>>(Object.fromEntries(PHASES.map(p => [p, 0])));
  const [proMarked, setProMarked] = useState<Set<string>>(new Set());
  const [playerMarked, setPlayerMarked] = useState<Set<string>>(new Set());

  const selectSwing = useCallback((id: string, side: "pro" | "player") => {
    if (side === "pro") { setProId(id); setProPhaseMarkers(Object.fromEntries(PHASES.map(p => [p, 0]))); setProMarked(new Set()); setProProgress(0); setShowProSelector(false); }
    else { setYouthId(id); setPlayerPhaseMarkers(Object.fromEntries(PHASES.map(p => [p, 0]))); setPlayerMarked(new Set()); setPlayerProgress(0); setShowYouthSelector(false); }
  }, []);

  // Current active progress
  const activeProgress = syncLocked ? sharedProgress : selectedVideo === "pro" ? proProgress : playerProgress;

  const currentPhase = useMemo(() => {
    const p = activeProgress;
    let closest: Phase = "stance"; let cd = Infinity;
    for (const n of PHASES) { const d = Math.abs(p - PHASE_POSITIONS[n]); if (d < cd) { cd = d; closest = n; } }
    return closest;
  }, [activeProgress]);

  const handleScrub = useCallback((p: number) => {
    if (syncLocked) setSharedProgress(p);
    else if (selectedVideo === "pro") setProProgress(p);
    else setPlayerProgress(p);
  }, [syncLocked, selectedVideo]);

  const markPhase = useCallback((phaseName: string) => {
    const prog = selectedVideo === "pro" ? proProgress : playerProgress;
    if (selectedVideo === "pro") {
      setProPhaseMarkers(p => ({ ...p, [phaseName]: prog }));
      setProMarked(p => new Set(p).add(phaseName));
    } else {
      setPlayerPhaseMarkers(p => ({ ...p, [phaseName]: prog }));
      setPlayerMarked(p => new Set(p).add(phaseName));
    }
  }, [selectedVideo, proProgress, playerProgress]);

  const proCount = proMarked.size;
  const playerCount = playerMarked.size;
  const canLock = proCount >= 7 && playerCount >= 7;

  const proSwing = useMemo(() => PRO_SWINGS.find(s => s.id === proId) || PRO_SWINGS[0], [proId]);
  const youthSwing = useMemo(() => YOUTH_SWINGS.find(s => s.id === youthId) || YOUTH_SWINGS[0], [youthId]);

  const nextUnmarked = useMemo(() => {
    const m = selectedVideo === "pro" ? proMarked : playerMarked;
    return PHASES.find(p => !m.has(p));
  }, [selectedVideo, proMarked, playerMarked]);

  // Determine which video should be dimmed
  const proDimmed = !syncLocked && selectedVideo !== "pro";
  const playerDimmed = !syncLocked && selectedVideo !== "player";

  return (
    <div className="flex flex-col h-dvh bg-[#08090a] text-[#f7f8f8] select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05] shrink-0">
        <button onClick={() => router.push("/")} className="text-white/60 hover:text-white transition-colors">
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
            className="text-[11px] font-medium text-white/50 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1.5 hover:bg-white/[0.06] hover:text-white/80 transition-all">
            Pro
          </button>
          <span className="text-white/[0.08] text-xs">·</span>
          <button className="text-white/30 hover:text-white/60 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
          </button>
        </div>
      </div>

      {/* Video area — zero gap, flex-1 each */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Pro panel */}
        <div
          onClick={() => !syncLocked && setSelectedVideo("pro")}
          className="flex-1 min-h-0 relative cursor-pointer transition-all duration-300"
          style={{ opacity: proDimmed ? 0.4 : 1 }}
        >
          <VideoFrameEngine src={proSwing.src} fps={proSwing.fps} totalFrames={proSwing.totalFrames}
            phaseFrames={proPhaseMarkers} progress={activeProgress}
            phaseNames={PHASES as unknown as string[]} phasePositions={PHASE_POSITIONS as unknown as Record<string, number>}
            flipped={flipPro} label="Pro" />

          {/* Badge overlay — STACKED, two rows */}
          <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-2 pointer-events-none">
            <div className="flex flex-col gap-1">
              {/* Row 1: PRO badge */}
              <div className="bg-[#C8F000] rounded-md px-2 py-0.5 self-start">
                <span className="text-[#08090a] text-[10px] font-bold tracking-wide">PRO</span>
              </div>
              {/* Row 2: Video name */}
              <div className="bg-black/60 backdrop-blur-sm rounded-md px-2 py-0.5 border border-white/[0.08] self-start">
                <span className="text-white/80 text-[10px] font-medium truncate max-w-[140px] block">{proSwing.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="bg-black/50 backdrop-blur-sm rounded-md px-2 py-0.5 text-[9px] text-white/50 border border-white/[0.06]">
                {proSwing.handedness}
              </span>
              <button onClick={(e) => { e.stopPropagation(); setFlipPro(!flipPro); }}
                className="bg-black/50 backdrop-blur-sm rounded-md px-2 py-0.5 border border-white/[0.06] text-[9px] text-white/50 hover:text-white/80 transition-colors pointer-events-auto">
                Flip
              </button>
            </div>
          </div>

          {/* Selection indicator — bottom bar */}
          {!syncLocked && selectedVideo === "pro" && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#C8F000]" />
          )}
        </div>

        {/* Divider — just 1px line */}
        <div className="h-px bg-white/[0.04] shrink-0" />

        {/* Player panel */}
        <div
          onClick={() => !syncLocked && setSelectedVideo("player")}
          className="flex-1 min-h-0 relative cursor-pointer transition-all duration-300"
          style={{ opacity: playerDimmed ? 0.4 : 1 }}
        >
          <VideoFrameEngine src={youthSwing.src} fps={youthSwing.fps} totalFrames={youthSwing.totalFrames}
            phaseFrames={playerPhaseMarkers} progress={activeProgress}
            phaseNames={PHASES as unknown as string[]} phasePositions={PHASE_POSITIONS as unknown as Record<string, number>}
            flipped={flipYouth} label="Player" />

          <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-2 pointer-events-none">
            <div className="flex flex-col gap-1">
              <div className="bg-[#C8F000] rounded-md px-2 py-0.5 self-start">
                <span className="text-[#08090a] text-[10px] font-bold tracking-wide">PLAYER</span>
              </div>
              <div className="bg-black/60 backdrop-blur-sm rounded-md px-2 py-0.5 border border-white/[0.08] self-start">
                <span className="text-white/80 text-[10px] font-medium truncate max-w-[140px] block">{youthSwing.label}</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="bg-black/50 backdrop-blur-sm rounded-md px-2 py-0.5 text-[9px] text-white/50 border border-white/[0.06]">
                {youthSwing.handedness}
              </span>
              <button onClick={(e) => { e.stopPropagation(); setFlipYouth(!flipYouth); }}
                className="bg-black/50 backdrop-blur-sm rounded-md px-2 py-0.5 border border-white/[0.06] text-[9px] text-white/50 hover:text-white/80 transition-colors pointer-events-auto">
                Flip
              </button>
            </div>
          </div>

          {!syncLocked && selectedVideo === "player" && (
            <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[#C8F000]" />
          )}
        </div>
      </div>

      {/* Bottom controls */}
      <div className="border-t border-white/[0.05] px-3 pt-2 pb-0 shrink-0">
        {syncLocked ? (
          /* LOCKED — compact phase chip + unlock */
          <div className="flex items-center justify-center gap-3 pb-1">
            <div className="bg-black border border-neon/60 rounded-full px-4 py-1">
              <span className="text-neon text-xs font-bold tracking-wide uppercase">{PHASE_LABELS[currentPhase]}</span>
            </div>
            <button onClick={() => { setSyncLocked(false); setSelectedVideo("pro"); }}
              className="text-[10px] text-white/50 border border-white/10 rounded-full px-3 py-1.5 hover:text-white/80 transition">
              Unlock
            </button>
          </div>
        ) : (
          /* TAGGING — phase pills + progress */
          <>
            {/* Instruction */}
            <div className="text-center mb-1">
              {nextUnmarked ? (
                <span className="text-[10px] text-amber-400/80 font-medium">
                  Tap {selectedVideo === "pro" ? "Pro" : "Player"} video, scrub to <span className="text-white">{PHASE_LABELS[nextUnmarked]}</span>, then tap the button
                </span>
              ) : (
                <span className="text-[10px] text-emerald-400/80 font-medium">
                  All marked! {canLock ? "Tap Lock to compare" : "Now mark the other video"}
                </span>
              )}
            </div>

            {/* Phase pills */}
            <div ref={tagsRef} className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {PHASES.map((phaseName) => {
                const marked = (selectedVideo === "pro" ? proMarked : playerMarked).has(phaseName);
                const isNext = phaseName === nextUnmarked;
                return <div key={phaseName} data-phase={phaseName}>
                  <PhasePill phase={phaseName} marked={marked} isNext={isNext} onClick={() => markPhase(phaseName)} />
                </div>;
              })}
            </div>

            {/* Progress + Lock */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2 text-[10px]">
                <span className={selectedVideo === "pro" ? "text-white/70 font-medium" : "text-white/30"}>Pro {proCount}/7</span>
                <span className="text-white/15">·</span>
                <span className={selectedVideo === "player" ? "text-white/70 font-medium" : "text-white/30"}>Player {playerCount}/7</span>
              </div>
              {canLock && (
                <button onClick={() => setSyncLocked(true)}
                  className="text-[10px] bg-[#C8F000] text-[#08090a] font-bold rounded-full px-3 py-1 hover:bg-[#d4ff00] transition-colors">
                  Lock Sync
                </button>
              )}
            </div>
          </>
        )}

        {/* Scrubber */}
        <Scrubber
          progress={activeProgress}
          onProgressChange={handleScrub}
          currentPhase={syncLocked ? currentPhase : undefined}
          showFrame={!syncLocked}
          totalFrames={selectedVideo === "pro" ? proSwing.totalFrames : youthSwing.totalFrames}
          currentProgress={activeProgress}
        />
      </div>

      {/* Selector modals */}
      {showProSelector && (
        <SwingSelector swings={PRO_SWINGS} title="Select Pro" activeId={proId}
          onSelect={(id) => selectSwing(id, "pro")} onClose={() => setShowProSelector(false)} />
      )}
      {showYouthSelector && (
        <SwingSelector swings={YOUTH_SWINGS} title="Select Player" activeId={youthId}
          onSelect={(id) => selectSwing(id, "player")} onClose={() => setShowYouthSelector(false)} />
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
              s.id === activeId ? "border-[#C8F000]/50" : "border-white/[0.05]"}`}>
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-gray-800 to-gray-900 overflow-hidden flex-shrink-0">
              <video src={s.src} className="w-full h-full object-cover" muted preload="metadata" />
            </div>
            <div className="text-left flex-1 min-w-0">
              <p className="text-sm font-medium text-white/80 truncate">{s.label}</p>
              <p className="text-[10px] text-white/30">{s.handedness} · {(s.durationMs / 1000).toFixed(1)}s · {s.fps}fps</p>
            </div>
            {s.id === activeId && <div className="w-1.5 h-1.5 rounded-full bg-[#C8F000] flex-shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}
