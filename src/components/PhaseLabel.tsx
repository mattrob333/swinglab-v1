"use client";

import { PHASE_LABELS, type Phase } from "@/lib/swing-phases";

interface PhaseLabelProps {
  phase: Phase;
  isActive?: boolean;
}

export default function PhaseLabel({ phase, isActive = true }: PhaseLabelProps) {
  return (
    <div className="flex items-center gap-3 w-full px-5 py-2">
      <div className="flex-1 h-px bg-neon/40" />
      <div className="flex items-center gap-2 bg-black border border-neon/60 rounded-full px-4 py-1.5">
        <span className="text-neon text-sm font-bold tracking-wide">{PHASE_LABELS[phase]}</span>
      </div>
      <div className="flex-1 h-px bg-neon/40" />
    </div>
  );
}
