"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";

interface VideoFrameEngineProps {
  src: string;
  fps: number;
  totalFrames: number;
  phaseFrames: Record<string, number>;
  progress: number; // 0-1 normalized swing progress
  phaseNames: string[];
  phasePositions: Record<string, number>;
  flipped?: boolean;
  label: string;
  onFrameUpdate?: (frameIndex: number, phaseName: string) => void;
}

// LRU cache for decoded frames
const frameCache = new Map<number, ImageData>();
const MAX_CACHE = 60;

function getCachedFrame(idx: number): ImageData | undefined {
  return frameCache.get(idx);
}

function setCachedFrame(idx: number, data: ImageData) {
  if (frameCache.size >= MAX_CACHE) {
    const firstKey = frameCache.keys().next().value;
    if (firstKey !== undefined) frameCache.delete(firstKey);
  }
  frameCache.set(idx, data);
}

function frameForProgress(
  p: number,
  phaseFrames: Record<string, number>,
  phaseNames: string[],
  phasePositions: Record<string, number>
): number {
  const progress = Math.max(0, Math.min(1, p));
  for (let i = 0; i < phaseNames.length - 1; i++) {
    const aName = phaseNames[i];
    const bName = phaseNames[i + 1];
    const aPos = phasePositions[aName];
    const bPos = phasePositions[bName];
    if (progress >= aPos && progress <= bPos) {
      const local = (progress - aPos) / (bPos - aPos);
      const aFrame = phaseFrames[aName];
      const bFrame = phaseFrames[bName];
      return Math.round(aFrame + local * (bFrame - aFrame));
    }
  }
  return phaseFrames[phaseNames[phaseNames.length - 1]];
}

function currentPhase(
  p: number,
  phaseNames: string[],
  phasePositions: Record<string, number>
): string {
  const progress = Math.max(0, Math.min(1, p));
  let closest = phaseNames[0];
  let closestDist = Infinity;
  for (const name of phaseNames) {
    const dist = Math.abs(progress - phasePositions[name]);
    if (dist < closestDist) {
      closestDist = dist;
      closest = name;
    }
  }
  return closest;
}

export default function VideoFrameEngine({
  src,
  fps,
  totalFrames,
  phaseFrames,
  progress,
  phaseNames,
  phasePositions,
  flipped = false,
  label,
  onFrameUpdate,
}: VideoFrameEngineProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [ready, setReady] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const lastFrameRef = useRef(-1);

  const targetFrame = useMemo(
    () => frameForProgress(progress, phaseFrames, phaseNames, phasePositions),
    [progress, phaseFrames, phaseNames, phasePositions]
  );

  const activePhase = useMemo(
    () => currentPhase(progress, phaseNames, phasePositions),
    [progress, phaseNames, phasePositions]
  );

  // Render frame to canvas
  const renderFrame = useCallback(
    (frameIndex: number) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      // Check cache first
      const cached = getCachedFrame(frameIndex);
      if (cached) {
        ctx.save();
        if (flipped) {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        ctx.putImageData(cached, 0, 0);
        ctx.restore();
        setCurrentFrame(frameIndex);
        return;
      }

      // Seek video to frame time
      const timeMs = (frameIndex / fps) * 1000;
      const timeSec = timeMs / 1000;

      if (Math.abs(video.currentTime - timeSec) > 0.05) {
        video.currentTime = timeSec;
      }

      // Draw current video frame to canvas
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const size = Math.min(vw, vh);

      // Crop to center 1:1 square
      const sx = (vw - size) / 2;
      const sy = (vh - size) / 2;

      canvas.width = size;
      canvas.height = size;
      ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);

      // Flip if needed
      if (flipped) {
        ctx.save();
        ctx.clearRect(0, 0, size, size);
        ctx.translate(size, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(video, sx, sy, size, size, 0, 0, size, size);
        ctx.restore();
      }

      // Cache the frame data
      try {
        const imageData = ctx.getImageData(0, 0, size, size);
        setCachedFrame(frameIndex, imageData);
      } catch {
        // Cache miss is fine
      }

      setCurrentFrame(frameIndex);
    },
    [fps, flipped]
  );

  // Seek and render when target frame changes
  useEffect(() => {
    if (!ready || !videoRef.current) return;

    const frame = Math.max(0, Math.min(targetFrame, totalFrames - 1));
    if (frame === lastFrameRef.current) return;
    lastFrameRef.current = frame;

    renderFrame(frame);
    onFrameUpdate?.(frame, activePhase);

    // Prefetch nearby frames
    const prefetchRange = 8;
    for (let i = -prefetchRange; i <= prefetchRange; i++) {
      const pf = frame + i;
      if (pf >= 0 && pf < totalFrames && !getCachedFrame(pf)) {
        const video = videoRef.current;
        if (!video) break;
        const timeSec = (pf / fps) / 1000;
        // Use requestIdleCallback to prefetch without blocking UI
        requestIdleCallback(() => {
          video.currentTime = timeSec;
        });
      }
    }
  }, [targetFrame, ready, renderFrame, activePhase, totalFrames, fps, onFrameUpdate]);

  return (
    <div className="relative w-full" style={{ aspectRatio: "1/1" }}>
      {/* Hidden video for frame extraction */}
      <video
        ref={videoRef}
        src={src}
        preload="auto"
        muted
        playsInline
        className="hidden"
        onLoadedMetadata={() => {
          // Initial seek to first phase frame
          setReady(true);
          const firstFrame = phaseFrames[phaseNames[0]] || 0;
          const timeSec = firstFrame / fps;
          if (videoRef.current) {
            videoRef.current.currentTime = timeSec;
          }
        }}
        onError={() => setError("Failed to load video")}
      />

      {/* Visible canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full rounded-xl object-cover"
        style={{ pointerEvents: "none" }}
      />

      {/* Frame info */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-1.5 z-10 pointer-events-none">
        <div className="flex justify-between text-[10px]">
          <span className="text-gray-400">
            Frame {currentFrame}/{totalFrames}
          </span>
          <span className="text-neon/70 font-medium">{activePhase}</span>
        </div>
      </div>

      {/* Loading */}
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-xl z-20">
          <p className="text-gray-400 text-sm">Loading video...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80 rounded-xl z-20">
          <p className="text-red-400 text-sm">{error}</p>
        </div>
      )}
    </div>
  );
}
