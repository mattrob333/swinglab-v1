"use client";

import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import VideoFrameEngine from "@/components/VideoFrameEngine";
import Scrubber from "@/components/Scrubber";
import { PRO_SWINGS, YOUTH_SWINGS, type SwingVideoInfo } from "@/lib/videos";
import { PHASES, PHASE_POSITIONS, PHASE_LABELS, type Phase } from "@/lib/swing-phases";

type TaggingPhase = "trimming_start" | "trimming_end" | "tagging" | "locked";

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

  // Trim + tagging state
  const [taggingPhase, setTaggingPhase] = useState<TaggingPhase>("trimming_start");
  const [swingStart, setSwingStart] = useState(0);
  const [swingEnd, setSwingEnd] = useState(1);

  // Sync state
  const [selectedVideo, setSelectedVideo] = useState<"pro" | "player">("pro");
  const [sharedProgress, setSharedProgress] = useState(0);
  const [proProgress, setProProgress] = useState(0);
  const [playerProgress, setPlayerProgress] = useState(0);

  // Video selections
  const [proId, setProId] = useState(PRO_SWINGS[0].id);
  const [youthId, setYouthId] = useState(YOUTH_SWINGS[0].id);
  const [flipPro, setFlipPro] = useState(false);
  const [flipYouth, setFlipYouth] = useState(false);

  // Phase markers
  const initMarkers = () => Object.fromEntries(PHASES.map((p) => [p, 0]));
  const [proPhaseMarkers, setProPhaseMarkers] = useState<Record<string, number>>(initMarkers());
  const [playerPhaseMarkers, setPlayerPhaseMarkers] = useState<Record<string, number>>(initMarkers());
  const [proMarked, setProMarked] = useState<Set<string>>(new Set());
  const [playerMarked, setPlayerMarked] = useState<Set<string>>(new Set());

  const selectSwing = useCallback((id: string, side: "pro" | "player") => {
    if (side === "pro") { setProId(id); setProPhaseMarkers(initMarkers()); setProMarked(new Set()); setProProgress(0); setShowProSelector(false); }
    else { setYouthId(id); setPlayerPhaseMarkers(initMarkers()); setPlayerMarked(new Set()); setPlayerProgress(0); setShowYouthSelector(false); }
  }, []);

  const syncLocked = taggingPhase === "locked";
  const trimming = taggingPhase === "trimming_start" || taggingPhase === "trimming_end";

  // Remap scrubber progress to swing range
  const remap = useCallback((p: number) => {
    if (trimming || syncLocked) return p;
    return swingStart + p * (swingEnd - swingStart);
  }, [trimming, syncLocked, swingStart, swingEnd]);

  const activeProgress = syncLocked ? sharedProgress : selectedVideo === "pro" ? proProgress : playerProgress;
  const seekProgress = syncLocked ? sharedProgress : remap(activeProgress);

  const currentPhase = useMemo(() => {
    const p = seekProgress;
    let closest: Phase = "stance"; let cd = Infinity;
    for (const n of PHASES) { const d = Math.abs(p - PHASE_POSITIONS[n]); if (d < cd) { cd = d; closest = n; } }
    return closest;
  }, [seekProgress]);

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

  const activeMarked = selectedVideo === "pro" ? proMarked : playerMarked;

  useEffect(() => {
    if (!nextUnmarked || !tagsRef.current || syncLocked) return;
    const el = tagsRef.current.querySelector(`[data-phase="${nextUnmarked}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }, [nextUnmarked, syncLocked]);

  return (
    <div className="flex flex-col h-dvh bg-[#08090a] text-[#f7f8f8] select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.05]">
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
          <button onClick={() => setShowProSelector(true)} className="text-[11px] font-medium text-white/50 bg-white/[0.03] border border-white/[0.08] rounded-lg px-2.5 py-1.5 hover:bg-white/[0.06] hover:text-white/80 transition-all">Pro</button>
          <span className="text-white/[0.08] text-xs">·</span>
          <button className="text-white/30 hover:text-white/60 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>
          </button>
        </div>
      </div>

      {/* Video area */}
      <div className="flex-1 flex flex-col min-h-0 px-3 gap-[1px] py-1">
        {/* Pro */}
        <div onClick={() => !syncLocked && !trimming && setSelectedVideo("pro")}
          className={`flex-1 min-h-0 relative rounded-lg overflow-hidden transition-all duration-300 cursor-pointer ${
            !syncLocked && !trimming && selectedVideo === "pro"
              ? "ring-[1.5px] ring-[#C8F000]/70 ring-offset-[1px] ring-offset-[#08090a]"
              : "ring-0" + (trimming ? " opacity-60" : "")}`}
        >
          <VideoFrameEngine src={proSwing.src} fps={proSwing.fps} totalFrames={proSwing.totalFrames}
            phaseFrames={proPhaseMarkers} progress={seekProgress}
            phaseNames={PHASES as unknown as string[]} phasePositions={PHASE_POSITIONS as unknown as Record<string, number>}
            flipped={flipPro} label="Pro" />
          <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-2 pointer-events-none">
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-[6px] rounded-full px-2.5 py-1 border border-white/[0.06]">
              <span className="text-[10px] font-medium text-white/80">{proSwing.label}</span>
              <span className={`text-[9px] ${flipPro ? "text-[#C8F000]" : "text-white/40"}`}>{proSwing.handedness}{flipPro ? " →" : ""}</span>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setFlipPro(!flipPro); }} className="pointer-events-auto bg-black/40 backdrop-blur-[6px] rounded-full px-2 py-1 border border-white/[0.06] text-[9px] text-white/50 hover:text-white/80 transition-colors">Flip</button>
          </div>
        </div>

        {/* Player */}
        <div onClick={() => !syncLocked && !trimming && setSelectedVideo("player")}
          className={`flex-1 min-h-0 relative rounded-lg overflow-hidden transition-all duration-300 cursor-pointer ${
            !syncLocked && !trimming && selectedVideo === "player"
              ? "ring-[1.5px] ring-[#C8F000]/70 ring-offset-[1px] ring-offset-[#08090a]"
              : "ring-0" + (trimming ? " opacity-60" : "")}`}
        >
          <VideoFrameEngine src={youthSwing.src} fps={youthSwing.fps} totalFrames={youthSwing.totalFrames}
            phaseFrames={playerPhaseMarkers} progress={seekProgress}
            phaseNames={PHASES as unknown as string[]} phasePositions={PHASE_POSITIONS as unknown as Record<string, number>}
            flipped={flipYouth} label="Player" />
          <div className="absolute top-0 left-0 right-0 flex items-start justify-between p-2 pointer-events-none">
            <div className="flex items-center gap-1.5 bg-black/50 backdrop-blur-[6px] rounded-full px-2.5 py-1 border border-white/[0.06]">
              <span className="text-[10px] font-medium text-white/80">{youthSwing.label}</span>
              <span className={`text-[9px] ${flipYouth ? "text-[#C8F000]" : "text-white/40"}`}>{youthSwing.handedness}{flipYouth ? " →" : ""}</span>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setFlipYouth(!flipYouth); }} className="pointer-events-auto bg-black/40 backdrop-blur-[6px] rounded-full px-2 py-1 border border-white/[0.06] text-[9px] text-white/50 hover:text-white/80 transition-colors">Flip</button>
          </div>
        </div>
      </div>

      {/* Bottom controls */}
      <div className="border-t border-white/[0.05] px-3 pt-2 pb-0">
        {trimming ? (
          <div className="pb-2">
            <p className="text-center text-[11px] text-amber-400 mb-2">
              {taggingPhase === "trimming_start"
                ? "Scrub to the first frame of the swing (Stance), then tap SET STANCE START"
                : "Scrub to the last frame of the swing (Finish), then tap SET FINISH END"}
            </p>
            <div className="flex justify-center">
              <button onClick={taggingPhase === "trimming_start"
                ? () => { setSwingStart(activeProgress); setTaggingPhase("trimming_end"); }
                : () => { setSwingEnd(Math.max(swingStart, activeProgress)); setTaggingPhase("tagging"); }}
                className="bg-[#C8F000] text-[#08090a] text-xs font-bold rounded-lg px-6 py-2.5"
              >
                {taggingPhase === "trimming_start" ? "SET STANCE START" : "SET FINISH END"}
              </button>
            </div>
          </div>
        ) : syncLocked ? (
          <div className="flex items-center justify-center gap-3 pb-1">
            <div className="bg-black border border-neon/60 rounded-full px-4 py-1">
              <span className="text-neon text-xs font-bold tracking-wide uppercase">{PHASE_LABELS[currentPhase]}</span>
            </div>
            <button onClick={() => { setTaggingPhase("tagging"); setSelectedVideo("pro"); }}
              className="text-[10px] text-white/50 border border-white/10 rounded-full px-3 py-1.5 hover:text-white/80 transition">
              Unlock
            </button>
          </div>
        ) : (
          <>
            {/* Phase pill strip */}
            <div ref={tagsRef} className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
              {PHASES.map((phaseName) => {
                const marked = activeMarked.has(phaseName);
                const isNext = phaseName === nextUnmarked;
                return <div key={phaseName} data-phase={phaseName}>
                  <PhasePill phase={phaseName} marked={marked} isNext={isNext} onClick={() => markPhase(phaseName)} />
                </div>;
              })}
            </div>
            {/* Progress + lock */}
            <div className="flex items-center justify-between pb-1">
              <span className="text-[9px] text-white/20 font-medium tracking-wider uppercase">
                {nextUnmarked ? `${selectedVideo === "pro" ? "PRO" : "PLAYER"}: mark ${PHASE_LABELS[nextUnmarked]}` : "All marked!"}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-white/30">{proCount}/7</span>
                <span className="text-[10px] text-white/30">·</span>
                <span className="text-[10px] text-white/30">{playerCount}/7</span>
                {canLock && (
                  <button onClick={() => setTaggingPhase("locked")}
                    className="text-[10px] bg-[#C8F000] text-[#08090a] font-bold rounded-full px-3 py-1">
                    Lock
                  </button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Scrubber */}
        <Scrubber
          progress={activeProgress}
          onProgressChange={handleScrub}
          currentPhase={syncLocked ? currentPhase : undefined}
          showFrame={!syncLocked && !trimming}
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
