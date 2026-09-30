"use client";

// One video pane: a local-blob <video> positioned with GPU transforms for crop
// and flip. Gestures (Pointer Events):
//   - one finger horizontal drag = jog (fine scrub, ~1 frame per 6px)
//   - two fingers = pinch/pan the crop (persisted to clip.crop, debounced)
//   - double tap = reset crop

import { useEffect, useRef, useState } from "react";
import { getPlayableBlob, updateClip } from "@/lib/store/local-db";
import { DEFAULT_CROP, type Clip, type Crop } from "@/lib/types";
import type { PlayerEngine } from "@/lib/player/engine";
import { clampCrop, cropTransformCss, pinchCrop, type PinchPoint } from "@/lib/player/geometry";
import { probeFps } from "@/lib/player/fps-probe";

export interface PaneHandle {
  el: HTMLDivElement | null;
  crop: Crop;
}

interface Props {
  clip: Clip | null;
  engine: PlayerEngine;
  flipped: boolean;
  /** File time to open the clip at (used when the clip id changes). */
  startTime?: number;
  onScrub: (t: number) => void;
  onInteract?: () => void;
  /** Called after a clip has been bound to the engine (for re-linking). */
  onClipBound?: () => void;
  handleRef?: React.RefObject<PaneHandle | null>;
  testId: string;
  children?: React.ReactNode;
}

const JOG_PX_PER_FRAME = 6;
const TAP_SLOP = 6;

export function VideoPane({ clip, engine, flipped, startTime, onScrub, onInteract, onClipBound, handleRef, testId, children }: Props) {
  const paneRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const cropRef = useRef<Crop>(clip?.crop ?? DEFAULT_CROP);
  const flippedRef = useRef(flipped);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");

  const clipId = clip?.id ?? null;
  const processed = clip?.processed ?? false;

  const applyTransform = () => {
    const v = videoRef.current;
    if (v) v.style.transform = cropTransformCss(cropRef.current, flippedRef.current);
    if (handleRef) handleRef.current = { el: paneRef.current, crop: cropRef.current };
  };

  // Bind engine to the element for the lifetime of the pane.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    engine.attach(v);
    return () => engine.detach();
  }, [engine]);

  // Load the local blob for the clip.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !clipId) return;
    let cancelled = false;
    let url: string | null = null;
     
    setStatus("loading");
    getPlayableBlob(clipId).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setStatus("error");
        return;
      }
      url = URL.createObjectURL(blob);
      v.src = url;
      if (clip && clip.fps == null) {
        probeFps(clipId, blob).then((fps) => {
          if (!cancelled && fps && engine.clip?.id === clipId) engine.setEstimatedFps(fps);
        });
      }
    });
    const onData = () => !cancelled && setStatus("ready");
    const onErr = () => !cancelled && setStatus("error");
    v.addEventListener("loadeddata", onData);
    v.addEventListener("error", onErr);
    return () => {
      cancelled = true;
      v.removeEventListener("loadeddata", onData);
      v.removeEventListener("error", onErr);
      v.removeAttribute("src");
      v.load();
      if (url) URL.revokeObjectURL(url);
    };
    // Reload only when the clip or its playable file changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clipId, processed, engine]);

  // Keep the engine's view of the clip (trim, fps) current; seek to startTime on a new clip.
  const boundIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!clip) return;
    const isNew = boundIdRef.current !== clip.id;
    boundIdRef.current = clip.id;
    engine.setClip(
      { id: clip.id, trimStart: clip.trimStart, trimEnd: clip.trimEnd, sloMoFactor: clip.sloMoFactor, durationSec: clip.durationSec, fps: clip.fps },
      isNew ? startTime : undefined,
    );
    if (isNew) onClipBound?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip?.id, clip?.trimStart, clip?.trimEnd, clip?.sloMoFactor, clip?.fps, clip?.durationSec, engine]);

  // Crop from the clip (unless a gesture is in progress), flip from props.
  const gestureRef = useRef<GestureState | null>(null);
  useEffect(() => {
    flippedRef.current = flipped;
    if (!gestureRef.current && !saveTimer.current) cropRef.current = clampCrop(clip?.crop ?? DEFAULT_CROP);
    applyTransform();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flipped, clip?.crop.scale, clip?.crop.x, clip?.crop.y, clipId]);

  const persistCrop = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const id = clipId;
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      if (id) void updateClip(id, { crop: { ...cropRef.current } });
    }, 400);
  };

  // ---- gestures ------------------------------------------------------------

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const lastTap = useRef(0);

  const local = (e: { clientX: number; clientY: number }) => {
    const r = paneRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const pinchPoint = (): PinchPoint => {
    const [a, b] = [...pointers.current.values()];
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, dist: Math.hypot(a.x - b.x, a.y - b.y) };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!clip) return;
    onInteract?.();
    paneRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, local(e));
    if (pointers.current.size === 1) {
      const p = local(e);
      gestureRef.current = { kind: "jog", startX: p.x, startY: p.y, startTime: engine.time, moved: false };
    } else if (pointers.current.size === 2) {
      gestureRef.current = { kind: "pinch", from: pinchPoint(), start: { ...cropRef.current } };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, local(e));
    const g = gestureRef.current;
    if (!g) return;
    if (g.kind === "jog") {
      const p = local(e);
      const dx = p.x - g.startX;
      if (!g.moved && Math.abs(dx) < TAP_SLOP && Math.abs(p.y - g.startY) < TAP_SLOP) return;
      g.moved = true;
      onScrub(g.startTime + dx / JOG_PX_PER_FRAME / engine.fps);
    } else if (g.kind === "pinch" && pointers.current.size >= 2) {
      const r = paneRef.current!.getBoundingClientRect();
      cropRef.current = pinchCrop(g.start, g.from, pinchPoint(), r.width, r.height, flippedRef.current);
      applyTransform();
    }
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gestureRef.current;
    if (g?.kind === "pinch") {
      persistCrop();
      // Lifting one finger ends the pinch; don't turn the remaining finger into a jog.
      gestureRef.current = pointers.current.size > 0 ? { kind: "none" } : null;
      return;
    }
    if (g?.kind === "jog" && !g.moved && e.type === "pointerup") {
      const now = performance.now();
      if (now - lastTap.current < 300) {
        cropRef.current = { ...DEFAULT_CROP };
        applyTransform();
        persistCrop();
        lastTap.current = 0;
      } else {
        lastTap.current = now;
      }
    }
    if (pointers.current.size === 0) gestureRef.current = null;
  };

  useEffect(
    () => () => {
      // Flush a pending crop save on unmount.
      if (saveTimer.current && clipId) {
        clearTimeout(saveTimer.current);
        void updateClip(clipId, { crop: { ...cropRef.current } });
      }
    },
    [clipId],
  );

  return (
    <div
      ref={paneRef}
      data-testid={testId}
      className="touch-none-all relative h-full w-full overflow-hidden bg-black"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <video
        ref={videoRef}
        data-testid={`${testId}-video`}
        playsInline
        muted
        preload="auto"
        disablePictureInPicture
        className="pointer-events-none absolute inset-0 h-full w-full origin-center object-contain will-change-transform"
      />
      {clip && status === "loading" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-neon" />
        </div>
      )}
      {status === "error" && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">Could not load video</div>
      )}
      {children}
    </div>
  );
}

type GestureState =
  | { kind: "jog"; startX: number; startY: number; startTime: number; moved: boolean }
  | { kind: "pinch"; from: PinchPoint; start: Crop }
  | { kind: "none" };
