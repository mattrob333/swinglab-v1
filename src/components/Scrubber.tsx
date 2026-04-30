"use client";

import { useRef, useCallback, useState, useEffect } from "react";
import { PHASES, PHASE_POSITIONS, PHASE_LABELS, type Phase } from "@/lib/swing-phases";

interface ScrubberProps {
  progress: number;
  onProgressChange: (p: number) => void;
  currentPhase: Phase;
  markedPhases?: Phase[];
}

export default function Scrubber({ progress, onProgressChange, currentPhase, markedPhases }: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const getProgressFromEvent = useCallback((e: React.MouseEvent | React.TouchEvent | MouseEvent | TouchEvent) => {
    const track = trackRef.current;
    if (!track) return 0;
    const rect = track.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
    let p = (clientX - rect.left) / rect.width;
    p = Math.max(0, Math.min(1, p));
    return p;
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    const p = getProgressFromEvent(e);
    onProgressChange(p);
  }, [getProgressFromEvent, onProgressChange]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setDragging(true);
    const p = getProgressFromEvent(e);
    onProgressChange(p);
  }, [getProgressFromEvent, onProgressChange]);

  useEffect(() => {
    if (!dragging) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      const track = trackRef.current;
      if (!track) return;
      const rect = track.getBoundingClientRect();
      const clientX = "touches" in e ? e.touches[0].clientX : e.clientX;
      let p = (clientX - rect.left) / rect.width;
      p = Math.max(0, Math.min(1, p));
      onProgressChange(p);
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
  }, [dragging, onProgressChange]);

  // Snap to phase markers
  const phases = PHASES;
  const phasePositions = phases.map((p) => ({ name: p, pos: PHASE_POSITIONS[p] }));

  return (
    <div className="w-full px-5 pb-4 pt-2 select-none">
      {/* Phase labels */}
      <div className="flex justify-between mb-1 px-0">
        {phasePositions.map(({ name, pos }) => {
          const isActive = name === currentPhase;
          return (
            <button
              key={name}
              className={`text-[11px] font-medium transition-colors cursor-pointer ${
                isActive ? "text-neon font-bold" : "text-gray-400"
              }`}
              onClick={() => onProgressChange(pos)}
            >
              {PHASE_LABELS[name as Phase]}
            </button>
          );
        })}
      </div>

      {/* Track */}
      <div
        ref={trackRef}
        className="relative w-full h-8 flex items-center cursor-pointer"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* Track line */}
        <div className="absolute left-0 right-0 h-0.5 bg-gray-600 rounded" />
        {/* Active track fill */}
        <div
          className="absolute left-0 h-0.5 bg-neon rounded transition-[width] duration-75"
          style={{ width: `${progress * 100}%` }}
        />
        {/* Phase tick dots */}
        {phasePositions.map(({ name, pos }) => (
          <div
            key={name}
            className={`absolute w-2 h-2 rounded-full -translate-x-1/2 ${
              pos <= progress ? "bg-neon" : "bg-gray-500"
            }`}
            style={{ left: `${pos * 100}%` }}
          />
        ))}
        {/* Scrubber dot */}
        <div
          className={`absolute w-5 h-5 rounded-full bg-neon -translate-x-1/2 shadow-lg shadow-neon/30 transition-[width,height] ${
            dragging ? "w-6 h-6" : ""
          }`}
          style={{ left: `${progress * 100}%` }}
        />
      </div>
    </div>
  );
}
