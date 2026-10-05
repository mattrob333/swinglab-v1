"use client";

// Full-width custom scrubber. The thumb follows the finger immediately (DOM via
// refs, never waiting for the video) and every pointermove writes a new target
// to the engine, whose scheduler coalesces seeks. No React state per frame.

import { useEffect, useRef, useState } from "react";
import { RATES, type PlaybackRate, type PlayerEngine } from "@/lib/player/engine";
import { formatSeconds, frameIndex } from "@/lib/player/time";
import { fineScrubLevel, nextFineDrag, type FineDragState } from "@/lib/player/fine-scrub";

interface Props {
  engine: PlayerEngine;
  /** Scrub to a file time (goes through the compare controller so links apply). */
  onScrub: (t: number) => void;
  onStep: (dir: 1 | -1) => void;
  onTogglePlay: () => void;
  onRate: (r: PlaybackRate) => void;
  onInteract?: () => void;
  linked?: boolean;
  testId: string;
  label: string;
}

export function Scrubber({ engine, onScrub, onStep, onTogglePlay, onRate, onInteract, linked, testId, label }: Props) {
  const trackRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLDivElement>(null);
  const fillRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const frameRef = useRef<HTMLSpanElement>(null);
  const widthRef = useRef(0);
  const dragRef = useRef<{ id: number; left: number; width: number; centerY: number; fine: FineDragState } | null>(null);
  const fineRef = useRef<HTMLSpanElement>(null);
  const lastFracRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [rate, setRateState] = useState<PlaybackRate>(engine.rate);

  // Position the thumb and fill for a fraction of the track. Pure DOM writes.
  const place = (frac: number) => {
    const f = Math.min(1, Math.max(0, frac));
    lastFracRef.current = f;
    const w = widthRef.current;
    if (thumbRef.current) thumbRef.current.style.transform = `translate3d(${(f * w).toFixed(2)}px,0,0)`;
    if (fillRef.current) fillRef.current.style.transform = `scaleX(${f.toFixed(5)})`;
    trackRef.current?.setAttribute("aria-valuenow", (f * 100).toFixed(1));
  };

  const writeLabels = (t: number) => {
    const clip = engine.clip;
    if (!clip) return;
    const rel = (t - engine.trimStart) / (clip.sloMoFactor || 1);
    if (timeRef.current) timeRef.current.textContent = formatSeconds(rel);
    if (frameRef.current) frameRef.current.textContent = `f${frameIndex(clip, t, engine.fps)}`;
  };

  const fracOf = (t: number) => {
    const span = engine.trimEnd - engine.trimStart;
    return span > 0 ? (t - engine.trimStart) / span : 0;
  };

  // Track width for pixel transforms.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      widthRef.current = el.clientWidth;
      place(lastFracRef.current);
    });
    ro.observe(el);
    widthRef.current = el.clientWidth;
    return () => ro.disconnect();
     
  }, []);

  // Follow the engine (playback, frame steps, linked moves) when not dragging.
  useEffect(() => {
    const update = (e: PlayerEngine) => {
      const t = e.time;
      if (!dragRef.current) place(fracOf(t));
      writeLabels(t);
      setPlaying((p) => (p === e.playing ? p : e.playing));
      setRateState((r) => (r === e.rate ? r : e.rate));
    };
    update(engine);
    return engine.subscribe(update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const showFine = (label: string) => {
    const el = fineRef.current;
    if (!el) return;
    el.textContent = label;
    el.style.opacity = label ? "1" : "0";
  };

  const timeAt = (clientX: number, clientY: number) => {
    const d = dragRef.current;
    if (!d) return engine.time;
    const distance = clientY - d.centerY;
    d.fine = nextFineDrag(d.fine, clientX, distance, d.left, d.width);
    showFine(fineScrubLevel(distance).label);
    place(d.fine.frac);
    return engine.trimStart + d.fine.frac * (engine.trimEnd - engine.trimStart);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    const el = trackRef.current;
    if (!el) return;
    onInteract?.();
    el.setPointerCapture(e.pointerId);
    const r = el.getBoundingClientRect();
    dragRef.current = {
      id: e.pointerId,
      left: r.left,
      width: r.width || 1,
      centerY: r.top + r.height / 2,
      fine: { frac: lastFracRef.current, lastX: e.clientX, relative: false },
    };
    el.dataset.dragging = "1";
    const t = timeAt(e.clientX, e.clientY);
    writeLabels(t);
    onScrub(t);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const t = timeAt(e.clientX, e.clientY);
    writeLabels(t);
    onScrub(t);
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    const t = timeAt(e.clientX, e.clientY);
    onScrub(t);
    dragRef.current = null;
    showFine("");
    delete trackRef.current?.dataset.dragging;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      e.stopPropagation();
      onStep(e.key === "ArrowRight" ? 1 : -1);
    } else if (e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onTogglePlay();
    }
  };

  const nextRate = RATES[(RATES.indexOf(rate) + 1) % RATES.length];
  const accent = linked ? "bg-neon" : "bg-white";

  return (
    <div className="flex items-center gap-1 px-1" data-testid={testId}>
      <IconButton label={playing ? "Pause" : "Play"} onClick={() => { onInteract?.(); onTogglePlay(); }} testId={`${testId}-play`}>
        {playing ? <path d="M7 5h3v14H7zM14 5h3v14h-3z" fill="currentColor" /> : <path d="M8 5l11 7-11 7z" fill="currentColor" />}
      </IconButton>
      <IconButton label="Previous frame" onClick={() => { onInteract?.(); onStep(-1); }} testId={`${testId}-prev`}>
        <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </IconButton>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={0}
        data-testid={`${testId}-track`}
        className="touch-none-all group relative h-12 min-w-0 flex-1 cursor-pointer outline-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={onKeyDown}
      >
        {/* rail */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-white/12">
          <div ref={fillRef} className={`h-full w-full origin-left ${linked ? "bg-neon/70" : "bg-white/45"}`} style={{ transform: "scaleX(0)" }} />
        </div>
        {/* thumb: a 0-width anchor translated in px; the knob is centred on it */}
        <div ref={thumbRef} data-testid={`${testId}-thumb`} className="pointer-events-none absolute left-0 top-0 h-full w-0 will-change-transform">
          <div className={`absolute left-0 top-1/2 h-7 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full shadow-[0_0_0_3px_rgba(0,0,0,0.45)] ${accent}`} />
        </div>
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-between text-[10px] leading-3 tabular-nums text-muted">
          <span ref={timeRef} data-testid={`${testId}-time`}>0.00s</span>
          <span ref={fineRef} data-testid={`${testId}-fine`} className="text-neon transition-opacity" style={{ opacity: 0 }} aria-live="polite" />
          <span ref={frameRef}>f0</span>
        </div>
      </div>

      <IconButton label="Next frame" onClick={() => { onInteract?.(); onStep(1); }} testId={`${testId}-next`}>
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth={2.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </IconButton>
      <button
        type="button"
        aria-label={`Speed ${rate}x, tap for ${nextRate}x`}
        data-testid={`${testId}-rate`}
        onClick={() => { onInteract?.(); onRate(nextRate); }}
        className={`h-11 w-11 shrink-0 rounded-xl text-[12px] font-semibold tabular-nums active:bg-white/10 ${rate === 1 ? "text-muted" : "text-neon"}`}
      >
        {rate === 1 ? "1x" : rate === 0.5 ? "½x" : "¼x"}
      </button>
    </div>
  );
}

function IconButton({ label, onClick, children, testId }: { label: string; onClick: () => void; children: React.ReactNode; testId?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      data-testid={testId}
      onClick={onClick}
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white active:bg-white/10"
    >
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>
        {children}
      </svg>
    </button>
  );
}
