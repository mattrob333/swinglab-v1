"use client";

import Link from "next/link";
import { useRef } from "react";
import type { Clip } from "@/lib/types";
import { formatSeconds } from "@/lib/media/trim";
import { ClipThumb } from "./ClipThumb";
import { ProcessingBadge } from "./ProcessingBadge";

export function shortDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  if (sameDay) return `Today ${d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * Grid card: thumbnail, title, handedness, date and processing badge. Tapping
 * follows `href`; long-press (or the ⋯ button) calls `onMenu`.
 */
export function ClipCard({
  clip,
  href,
  onMenu,
  subtitle,
}: {
  clip: Clip;
  href: string;
  onMenu?: (clip: Clip) => void;
  subtitle?: string;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);
  const start = useRef({ x: 0, y: 0 });

  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const len = Math.max(0, (clip.trimEnd || clip.durationSec) - clip.trimStart);

  return (
    <div className="group relative" data-testid="clip-card" data-clip-id={clip.id}>
      <Link
        href={href}
        className="block select-none"
        style={{ WebkitTouchCallout: "none" }}
        draggable={false}
        onPointerDown={(e) => {
          longPressed.current = false;
          start.current = { x: e.clientX, y: e.clientY };
          if (!onMenu) return;
          clear();
          timer.current = setTimeout(() => {
            longPressed.current = true;
            onMenu(clip);
          }, 550);
        }}
        onPointerMove={(e) => {
          if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 8) clear();
        }}
        onPointerUp={clear}
        onPointerCancel={clear}
        onContextMenu={(e) => {
          if (onMenu) {
            e.preventDefault();
            clear();
            if (!longPressed.current) onMenu(clip);
            longPressed.current = true;
          }
        }}
        onClick={(e) => {
          if (longPressed.current) {
            e.preventDefault();
            longPressed.current = false;
          }
        }}
      >
        <div className="relative aspect-[3/4] overflow-hidden rounded-2xl border border-line">
          <ClipThumb clipId={clip.id} version={clip.updatedAt} alt={clip.title} className="h-full w-full" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 to-transparent" />
          <span
            className="absolute top-2 left-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-black/65 px-1.5 text-[11px] font-bold text-neon backdrop-blur"
            aria-label={clip.handedness === "L" ? "Left-handed" : "Right-handed"}
          >
            {clip.handedness}
          </span>
          <span className="absolute bottom-2 left-2 font-mono text-[11px] text-white/85 tabular-nums">
            {formatSeconds(len, 1)}
            {clip.sloMoFactor > 1 ? ` · ${clip.sloMoFactor}× slo` : ""}
          </span>
          <ProcessingBadge clip={clip} className="absolute right-2 bottom-2" />
        </div>
        <div className="mt-1.5 px-0.5">
          <div className="truncate text-sm font-medium text-white">{clip.title}</div>
          <div className="truncate text-xs text-muted">{subtitle ?? shortDate(clip.createdAt)}</div>
        </div>
      </Link>
      {onMenu && (
        <button
          type="button"
          aria-label={`More actions for ${clip.title}`}
          onClick={() => onMenu(clip)}
          className="absolute top-1 right-1 flex h-10 w-10 items-center justify-center rounded-full text-white"
          data-testid="clip-menu"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-black/60 backdrop-blur">
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden>
              <circle cx="5" cy="12" r="2" />
              <circle cx="12" cy="12" r="2" />
              <circle cx="19" cy="12" r="2" />
            </svg>
          </span>
        </button>
      )}
    </div>
  );
}
