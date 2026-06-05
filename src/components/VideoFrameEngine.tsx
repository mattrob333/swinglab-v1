"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import {
  currentPhase,
  frameForProgress,
  frameTimeSeconds,
  videoFrameCacheKey,
} from "./video-frame-engine-utils";

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

// LRU cache for decoded frames. The key must include source/rendering options
// because two players can request the same frame index from different videos.
const frameCache = new Map<string, ImageData>();
const MAX_CACHE = 60;

function getCachedFrame(key: string): ImageData | undefined {
  return frameCache.get(key);
}

function setCachedFrame(key: string, data: ImageData) {
  if (frameCache.size >= MAX_CACHE) {
    const firstKey = frameCache.keys().next().value;
    if (firstKey !== undefined) frameCache.delete(firstKey);
  }
  frameCache.set(key, data);
}

function seekVideo(
  video: HTMLVideoElement,
  timeSec: number,
  toleranceSec: number
): Promise<void> {
  if (Math.abs(video.currentTime - timeSec) <= toleranceSec) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("error", handleError);
    };
    const handleSeeked = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Failed to seek video"));
    };

    video.addEventListener("seeked", handleSeeked, { once: true });
    video.addEventListener("error", handleError, { once: true });
    video.currentTime = timeSec;
  });
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
  const renderRequestRef = useRef(0);
  const onFrameUpdateRef = useRef(onFrameUpdate);

  const targetFrame = useMemo(
    () => frameForProgress(progress, phaseFrames, phaseNames, phasePositions),
    [progress, phaseFrames, phaseNames, phasePositions]
  );

  const activePhase = useMemo(
    () => currentPhase(progress, phaseNames, phasePositions),
    [progress, phaseNames, phasePositions]
  );

  useEffect(() => {
    lastFrameRef.current = -1;
  }, [src, flipped]);

  useEffect(() => {
    onFrameUpdateRef.current = onFrameUpdate;
  }, [onFrameUpdate]);

  // Render frame to canvas
  const renderFrame = useCallback(
    async (frameIndex: number, requestId: number): Promise<boolean> => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return false;

      const ctx = canvas.getContext("2d");
      if (!ctx) return false;

      // Check cache first
      const cacheKey = videoFrameCacheKey(src, flipped, frameIndex);
      const cached = getCachedFrame(cacheKey);
      if (cached) {
        if (requestId !== renderRequestRef.current) return false;
        canvas.width = cached.width;
        canvas.height = cached.height;
        ctx.putImageData(cached, 0, 0);
        setError(null);
        setCurrentFrame(frameIndex);
        return true;
      }

      // Seek video to frame time
      const timeSec = frameTimeSeconds(frameIndex, fps);
      const toleranceSec = Math.min(0.001, 0.25 / fps);

      try {
        await seekVideo(video, timeSec, toleranceSec);
      } catch {
        if (requestId === renderRequestRef.current) {
          setError("Failed to seek video");
        }
        return false;
      }
      if (requestId !== renderRequestRef.current) return false;

      // Draw current video frame to canvas
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      const size = Math.min(vw, vh);
      if (size <= 0) return false;

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
        setCachedFrame(cacheKey, imageData);
      } catch {
        // Cache miss is fine
      }

      setError(null);
      setCurrentFrame(frameIndex);
      return true;
    },
    [fps, flipped, src]
  );

  // Seek and render when target frame changes
  useEffect(() => {
    if (!ready || !videoRef.current) return;

    const frame = Math.max(0, Math.min(targetFrame, totalFrames - 1));
    if (frame === lastFrameRef.current) return;
    lastFrameRef.current = frame;
    const requestId = renderRequestRef.current + 1;
    renderRequestRef.current = requestId;

    void renderFrame(frame, requestId).then((rendered) => {
      if (!rendered || requestId !== renderRequestRef.current) return;
      onFrameUpdateRef.current?.(frame, activePhase);
    });
  }, [targetFrame, ready, renderFrame, activePhase, totalFrames]);

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
        style={{ border: "2px solid #C8F000" }}
      />

      {/* Label badge */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/80 rounded-full px-3 py-1 text-xs font-medium z-10">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a6 6 0 016-6h4a6 6 0 016 6v2" />
        </svg>
        <span>{label}</span>
      </div>

      {/* Flip indicator */}
      {flipped && (
        <div className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 text-[10px] text-neon z-10">
          Mirrored
        </div>
      )}

      {/* Frame info */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 z-10">
        <div className="flex justify-between text-[10px]">
          <span className="text-gray-300">
            Frame {currentFrame}/{totalFrames}
          </span>
          <span className="text-neon font-medium">{activePhase}</span>
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
