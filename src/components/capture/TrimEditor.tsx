"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { renderFrames } from "@/lib/media/thumbnail";
import {
  filmstripTimes,
  formatSeconds,
  moveHandle,
  nudgeHandle,
  shiftWindow,
  timeToFraction,
  type TrimHandle,
  type TrimWindow,
} from "@/lib/media/trim";

const FRAMES = 10;

type Drag = { kind: TrimHandle | "window"; pointerId: number; startX: number; startTrim: TrimWindow };

/**
 * Filmstrip with two big draggable handles (and a draggable window), plus
 * frame-nudge buttons. Calls `onScrub(time)` while dragging so the preview can
 * show the frame under the handle.
 */
export function TrimEditor({
  blob,
  duration,
  fps,
  trim,
  onChange,
  onScrub,
  onScrubEnd,
  videoRef,
}: {
  blob: Blob | null;
  duration: number;
  fps: number | null;
  trim: TrimWindow;
  onChange: (trim: TrimWindow) => void;
  onScrub: (time: number) => void;
  onScrubEnd: () => void;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const [strip, setStrip] = useState<{ blob: Blob | null; urls: (string | null)[] }>({ blob: null, urls: [] });
  const frames: (string | null)[] = strip.blob === blob && blob ? strip.urls : Array(FRAMES).fill(null);
  const [active, setActive] = useState<TrimHandle | "window" | null>(null);

  // Filmstrip thumbnails.
  useEffect(() => {
    if (!blob || !(duration > 0)) return;
    let cancelled = false;
    const urls: string[] = [];
    renderFrames(blob, filmstripTimes(duration, FRAMES), 200, (i, image) => {
      if (cancelled) return;
      const url = URL.createObjectURL(image);
      urls.push(url);
      setStrip((prev) => {
        const next = prev.blob === blob ? prev.urls.slice() : Array<string | null>(FRAMES).fill(null);
        next[i] = url;
        return { blob, urls: next };
      });
    }).catch((err) => console.warn("[trim] filmstrip failed", err));
    return () => {
      cancelled = true;
      urls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [blob, duration]);

  // Playhead follows the video without re-rendering React.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const el = playheadRef.current;
      if (v && el && duration > 0) el.style.left = `${timeToFraction(v.currentTime, duration) * 100}%`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [duration, videoRef]);

  function begin(kind: Drag["kind"], e: React.PointerEvent) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { kind, pointerId: e.pointerId, startX: e.clientX, startTrim: trim };
    setActive(kind);
  }

  function move(e: React.PointerEvent) {
    const d = drag.current;
    if (!d || d.pointerId !== e.pointerId) return;
    // Relative to where the drag began, so grabbing a handle off-center doesn't jump.
    const r = trackRef.current?.getBoundingClientRect();
    const delta = r && r.width > 0 ? ((e.clientX - d.startX) / r.width) * duration : 0;
    let next: TrimWindow;
    if (d.kind === "window") {
      next = shiftWindow(d.startTrim, delta, duration);
      onScrub(next.start);
    } else {
      const base = d.kind === "start" ? d.startTrim.start : d.startTrim.end;
      next = moveHandle(d.startTrim, d.kind, base + delta, duration);
      onScrub(d.kind === "start" ? next.start : next.end);
    }
    onChange(next);
  }

  function end(e: React.PointerEvent) {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    setActive(null);
    onScrubEnd();
  }

  function nudge(handle: TrimHandle, frames: number) {
    const next = nudgeHandle(trim, handle, frames, fps, duration);
    onChange(next);
    onScrub(handle === "start" ? next.start : next.end);
  }

  const startPct = timeToFraction(trim.start, duration) * 100;
  const endPct = timeToFraction(trim.end, duration) * 100;

  return (
    <div className="select-none" data-testid="trim-editor">
      <div className="relative px-5">
        <div
          ref={trackRef}
          className="touch-none-all relative h-16 overflow-visible rounded-xl bg-elevated"
        >
          {/* Filmstrip */}
          <div className="absolute inset-0 flex overflow-hidden rounded-xl">
            {frames.map((url, i) => (
              <div key={i} className="h-full flex-1 overflow-hidden border-r border-black/40 last:border-r-0">
                {url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                  <img src={url} alt="" className="h-full w-full object-cover" draggable={false} />
                ) : (
                  <div className="h-full w-full animate-pulse bg-white/5" />
                )}
              </div>
            ))}
          </div>

          {/* Dim outside the window */}
          <div className="pointer-events-none absolute inset-y-0 left-0 rounded-l-xl bg-black/65" style={{ width: `${startPct}%` }} />
          <div className="pointer-events-none absolute inset-y-0 right-0 rounded-r-xl bg-black/65" style={{ width: `${100 - endPct}%` }} />

          {/* Window: drag to slide */}
          <div
            className={`absolute inset-y-0 cursor-grab border-y-[3px] ${active === "window" ? "border-white" : "border-neon"}`}
            style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
            onPointerDown={(e) => begin("window", e)}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
            aria-hidden
          />

          {/* Playhead */}
          <div ref={playheadRef} className="pointer-events-none absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded bg-white shadow" aria-hidden />

          {/* Handles */}
          {(["start", "end"] as const).map((h) => {
            const pct = h === "start" ? startPct : endPct;
            return (
              <div
                key={h}
                role="slider"
                aria-label={h === "start" ? "Trim start" : "Trim end"}
                aria-valuemin={0}
                aria-valuemax={duration}
                aria-valuenow={h === "start" ? trim.start : trim.end}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") nudge(h, -1);
                  if (e.key === "ArrowRight") nudge(h, 1);
                }}
                className="absolute -top-2 -bottom-2 z-10 flex w-11 cursor-ew-resize items-center justify-center"
                style={{ left: `${pct}%`, transform: `translateX(${h === "start" ? "-100%" : "0"})` }}
                onPointerDown={(e) => begin(h, e)}
                onPointerMove={move}
                onPointerUp={end}
                onPointerCancel={end}
                data-testid={`trim-handle-${h}`}
              >
                <div
                  className={`flex h-full w-5 items-center justify-center bg-neon shadow-lg ${
                    h === "start" ? "ml-auto rounded-l-lg" : "mr-auto rounded-r-lg"
                  } ${active === h ? "scale-x-125" : ""}`}
                >
                  <span className="h-6 w-1 rounded-full bg-black/60" />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Fine nudges + readout */}
      <div className="mt-3 flex items-center justify-between gap-2 px-1 text-xs">
        <NudgePair label="Start" value={trim.start} onNudge={(f) => nudge("start", f)} testId="nudge-start" />
        <div className="text-center">
          <div className="text-[10px] uppercase tracking-wide text-muted">Length</div>
          <div className="font-mono text-sm tabular-nums" data-testid="trim-length">
            {formatSeconds(trim.end - trim.start)}
          </div>
        </div>
        <NudgePair label="End" value={trim.end} onNudge={(f) => nudge("end", f)} testId="nudge-end" />
      </div>
    </div>
  );
}

function NudgePair({
  label,
  value,
  onNudge,
  testId,
}: {
  label: string;
  value: number;
  onNudge: (frames: number) => void;
  testId: string;
}) {
  const btn =
    "flex h-11 w-11 items-center justify-center rounded-full bg-elevated text-white active:bg-white/15 disabled:opacity-40";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} onClick={() => onNudge(-1)} aria-label={`${label} back one frame`} data-testid={`${testId}-back`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </button>
      <div className="min-w-14 text-center">
        <div className="text-[10px] uppercase tracking-wide text-muted">{label}</div>
        <div className="font-mono text-sm tabular-nums">{formatSeconds(value)}</div>
      </div>
      <button type="button" className={btn} onClick={() => onNudge(1)} aria-label={`${label} forward one frame`} data-testid={`${testId}-fwd`}>
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </div>
  );
}
