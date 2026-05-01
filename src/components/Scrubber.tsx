"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { PHASES, PHASE_POSITIONS, PHASE_LABELS, type Phase } from "@/lib/swing-phases";

interface ScrubberProps {
  progress: number;
  onProgressChange: (p: number) => void;
  currentPhase?: Phase;
  showFrame?: boolean;
  totalFrames?: number;
  currentProgress?: number;
}

export default function Scrubber({ progress, onProgressChange, currentPhase, showFrame, totalFrames, currentProgress }: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const getProgress = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }, []);

  const handleStart = useCallback((clientX: number) => {
    setDragging(true);
    onProgressChange(getProgress(clientX));
  }, [getProgress, onProgressChange]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
      onProgressChange(getProgress(cx));
    };
    const handleUp = () => setDragging(false);
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", handleUp);
    };
  }, [dragging, getProgress, onProgressChange]);

  // Label to show on the floating chip
  const chipLabel = showFrame && totalFrames
    ? `Frame ${Math.round(currentProgress! * totalFrames)}`
    : currentPhase
      ? PHASE_LABELS[currentPhase]
      : "";

  const phaseIdx = currentPhase ? PHASES.indexOf(currentPhase) : 0;
  const phaseColors = ["#7170ff","#5e6ad2","#10b981","#27a644","#f59e0b","#f97316","#ef4444"];
  const chipColor = phaseColors[Math.max(0, Math.min(phaseIdx, 6))];

  return (
    <div className="w-full px-3 pb-3 pt-0 select-none" style={{ touchAction: "none" }}>
      <div
        ref={trackRef}
        className="relative w-full h-10 flex items-center cursor-pointer"
        onMouseDown={(e) => handleStart(e.clientX)}
        onTouchStart={(e) => handleStart(e.touches[0].clientX)}
      >
        {/* Track line */}
        <div className="absolute left-0 right-0 h-[2px] bg-white/[0.06] rounded-full" />

        {/* Active fill */}
        <div className="absolute left-0 h-[2px] rounded-full transition-[width] duration-75"
          style={{ width: `${progress * 100}%`, background: `linear-gradient(90deg, ${chipColor}, ${phaseColors[Math.min(phaseIdx+1,6)]})` }}
        />

        {/* Phase tick dots */}
        {PHASES.map((name, i) => (
          <div key={name} className="absolute -translate-x-1/2 rounded-full transition-all duration-200"
            style={{ left: `${PHASE_POSITIONS[name as Phase] * 100}%`, width: PHASE_POSITIONS[name as Phase] <= progress ? 5 : 3, height: PHASE_POSITIONS[name as Phase] <= progress ? 5 : 3, backgroundColor: PHASE_POSITIONS[name as Phase] <= progress ? phaseColors[i] : "rgba(255,255,255,0.15)" }}
          />
        ))}

        {/* Floating chip */}
        {chipLabel && (
          <div className="absolute -translate-x-1/2 pointer-events-none transition-[left] duration-75" style={{ left: `${progress * 100}%`, top: "-26px" }}>
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold tracking-wider uppercase shadow-lg"
              style={{ backgroundColor: chipColor + "20", border: `1px solid ${chipColor}60`, color: chipColor, backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: chipColor }} />
              {chipLabel}
            </div>
          </div>
        )}

        {/* Scrubber dot */}
        <div className={`absolute -translate-x-1/2 rounded-full bg-white shadow-lg transition-all duration-100 ${dragging ? "w-4 h-4" : "w-3.5 h-3.5"}`}
          style={{ left: `${progress * 100}%`, boxShadow: `0 0 12px ${chipColor}60, 0 0 0 3px ${chipColor}20` }}
        />
      </div>

      {/* Phase labels below */}
      <div className="flex justify-between mt-0.5 px-0">
        {PHASES.map((name) => {
          const isActive = name === currentPhase;
          const i = PHASES.indexOf(name);
          return (
            <button key={name} className={`text-[8px] font-medium transition-all duration-200 cursor-pointer px-0.5 ${isActive ? "text-white/90 font-semibold" : "text-white/20 hover:text-white/40"}`}
              onClick={() => onProgressChange(PHASE_POSITIONS[name])}
              style={{ color: isActive ? phaseColors[i] : undefined }}>
              {PHASE_LABELS[name as Phase]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
