"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { clampCrop, cropTransform, isIdentityCrop, panBy, zoomAt, type CropValue } from "@/lib/media/crop";

/**
 * Video preview with pinch-zoom / drag-pan framing (saved as Clip.crop) and
 * tap to play/pause. During a gesture the transform is written straight to the
 * DOM; React state is only updated when the gesture ends.
 */
export function CropPreview({
  src,
  videoRef,
  crop,
  onCropChange,
  onTap,
  paused,
  onVideoEvent,
}: {
  src: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  crop: CropValue;
  onCropChange: (crop: CropValue) => void;
  onTap: () => void;
  paused: boolean;
  onVideoEvent?: (type: "seeked" | "loadeddata") => void;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  const live = useRef<CropValue>(crop);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: boolean; startX: number; startY: number; lastDist: number; lastMid: { x: number; y: number } | null }>({
    moved: false,
    startX: 0,
    startY: 0,
    lastDist: 0,
    lastMid: null,
  });
  const [interacting, setInteracting] = useState(false);

  // Keep the live value in sync with the committed prop (e.g. Reset).
  useEffect(() => {
    live.current = crop;
    apply(crop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [crop.scale, crop.x, crop.y]);

  function apply(c: CropValue) {
    const v = videoRef.current;
    if (v) v.style.transform = cropTransform(c);
  }

  function rect() {
    return boxRef.current?.getBoundingClientRect() ?? new DOMRect(0, 0, 1, 1);
  }

  function focusFromClient(x: number, y: number) {
    const r = rect();
    return { fx: (x - r.left) / r.width - 0.5, fy: (y - r.top) / r.height - 0.5 };
  }

  function update(c: CropValue) {
    live.current = clampCrop(c);
    apply(live.current);
  }

  function onPointerDown(e: React.PointerEvent) {
    boxRef.current?.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (pointers.current.size === 1) {
      g.moved = false;
      g.startX = e.clientX;
      g.startY = e.clientY;
    }
    g.lastMid = null;
    g.lastDist = 0;
    setInteracting(true);
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const r = rect();
    const g = gesture.current;
    if (pointers.current.size === 1) {
      const dx = (e.clientX - prev.x) / r.width;
      const dy = (e.clientY - prev.y) / r.height;
      if (Math.hypot(e.clientX - g.startX, e.clientY - g.startY) > 6) g.moved = true;
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (g.moved) update(panBy(live.current, dx, dy));
      return;
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const [a, b] = [...pointers.current.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    g.moved = true;
    if (g.lastMid && g.lastDist > 0) {
      const { fx, fy } = focusFromClient(mid.x, mid.y);
      let next = zoomAt(live.current, dist / g.lastDist, fx, fy);
      next = panBy(next, (mid.x - g.lastMid.x) / r.width, (mid.y - g.lastMid.y) / r.height);
      update(next);
    }
    g.lastDist = dist;
    g.lastMid = mid;
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    g.lastMid = null;
    g.lastDist = 0;
    if (pointers.current.size === 0) {
      setInteracting(false);
      if (!g.moved && e.type === "pointerup") onTap();
      else onCropChange(live.current);
    }
  }

  function onWheel(e: React.WheelEvent) {
    const { fx, fy } = focusFromClient(e.clientX, e.clientY);
    update(zoomAt(live.current, Math.exp(-e.deltaY * 0.0025), fx, fy));
    onCropChange(live.current);
  }

  function onDoubleClick(e: React.MouseEvent) {
    const { fx, fy } = focusFromClient(e.clientX, e.clientY);
    const next = live.current.scale > 1.05 ? { scale: 1, x: 0, y: 0 } : zoomAt(live.current, 2.5, fx, fy);
    update(next);
    onCropChange(live.current);
  }

  const zoomed = !isIdentityCrop(crop);

  return (
    <div
      ref={boxRef}
      className="touch-none-all relative h-full w-full overflow-hidden bg-black"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
      onDoubleClick={onDoubleClick}
      data-testid="crop-preview"
    >
      {src && (
        <video
          ref={videoRef}
          src={src}
          className="absolute inset-0 h-full w-full origin-center object-contain will-change-transform"
          style={{ transform: cropTransform(crop) }}
          muted
          playsInline
          autoPlay
          preload="auto"
          onSeeked={() => onVideoEvent?.("seeked")}
          onLoadedData={() => onVideoEvent?.("loadeddata")}
          data-testid="edit-video"
        />
      )}

      {interacting && (
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute inset-y-0 left-1/3 w-px bg-white/25" />
          <div className="absolute inset-y-0 left-2/3 w-px bg-white/25" />
          <div className="absolute inset-x-0 top-1/3 h-px bg-white/25" />
          <div className="absolute inset-x-0 top-2/3 h-px bg-white/25" />
        </div>
      )}

      {paused && !interacting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-black/50 backdrop-blur">
            <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 fill-white">
              <path d="M7 5v14l12-7z" />
            </svg>
          </span>
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between p-3">
        <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-medium text-white/80 backdrop-blur">
          {zoomed ? `${crop.scale.toFixed(1)}× crop` : "Pinch to zoom · drag to frame"}
        </span>
        {zoomed && (
          <button
            type="button"
            className="pointer-events-auto min-h-11 rounded-full bg-black/60 px-4 text-sm font-semibold text-white backdrop-blur"
            onPointerDown={(e) => e.stopPropagation()}
            onPointerUp={(e) => e.stopPropagation()}
            onClick={() => onCropChange({ scale: 1, x: 0, y: 0 })}
            data-testid="crop-reset"
          >
            Reset
          </button>
        )}
      </div>
    </div>
  );
}
