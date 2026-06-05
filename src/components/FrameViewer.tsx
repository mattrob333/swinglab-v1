"use client";

import { useRef, useEffect, useCallback } from "react";
import { type Phase } from "@/lib/swing-phases";

interface FrameViewerProps {
  label: "Pro" | "Player";
  currentPhase: Phase;
  frameIndex: number;
  totalFrames: number;
  flipped?: boolean;
  borderColor?: string;
  batterType: "pro" | "player";
}

// Draw a baseball batter silhouette at a given phase position
function drawBatter(
  ctx: CanvasRenderingContext2D,
  phase: Phase,
  width: number,
  height: number,
  handedness: "R" | "L",
  isPro: boolean
) {
  const cx = width / 2;
  const cy = height * 0.55;

  ctx.save();

  // Flip for left-handed
  if (handedness === "L") {
    ctx.translate(width, 0);
    ctx.scale(-1, 1);
  }

  // Colors
  const jerseyColor = isPro ? "#1a1a2e" : "#1B3A5C";
  const pantsColor = isPro ? "#e8e8e8" : "#d4d4d4";
  const skinColor = "#d4a574";
  const batColor = "#c4956a";
  const helmetColor = "#111";

  // Helper: draw body with rotation
  const bodyRotation = (() => {
    switch (phase) {
      case "stance": return -0.05;
      case "load": return -0.15;
      case "launch": return 0.1;
      case "turn": return 0.35;
      case "contact": return 0.5;
      case "extension": return 0.3;
      case "finish": return -0.1;
    }
  })();

  const armAngle = (() => {
    switch (phase) {
      case "stance": return -0.3;
      case "load": return -0.5;
      case "launch": return 0.2;
      case "turn": return 0.8;
      case "contact": return 1.2;
      case "extension": return 1.5;
      case "finish": return 0.6;
    }
  })();

  const batAngle = (() => {
    switch (phase) {
      case "stance": return -0.4;
      case "load": return -0.8;
      case "launch": return 0.4;
      case "turn": return 1.0;
      case "contact": return 1.6;
      case "extension": return 2.0;
      case "finish": return 1.0;
    }
  })();

  const kneeBend = (() => {
    switch (phase) {
      case "stance": return 0.85;
      case "load": return 0.75;
      case "launch": return 0.9;
      case "turn": return 0.95;
      case "contact": return 0.95;
      case "extension": return 0.9;
      case "finish": return 0.7;
    }
  })();

  // Draw legs
  const legLength = 60 * kneeBend;
  const hipY = cy - 25;

  ctx.strokeStyle = pantsColor;
  ctx.lineWidth = 8;
  ctx.lineCap = "round";

  // Back leg
  ctx.beginPath();
  ctx.moveTo(cx - 8, hipY);
  ctx.lineTo(cx - 12, hipY + legLength);
  ctx.stroke();

  // Front leg (rotated forward during swing)
  const frontLegX = cx + 12 + bodyRotation * 20;
  ctx.beginPath();
  ctx.moveTo(cx + 8, hipY);
  ctx.lineTo(frontLegX, hipY + legLength * 0.9);
  ctx.stroke();

  // Torso
  const torsoTop = hipY - 40;
  const torsoAngle = bodyRotation * 0.3;
  ctx.fillStyle = jerseyColor;
  ctx.save();
  ctx.translate(cx + torsoAngle * 15, hipY - 20);
  ctx.rotate(torsoAngle);
  ctx.fillRect(-18, -20, 36, 40);
  ctx.restore();

  // Helmet/head
  ctx.fillStyle = helmetColor;
  ctx.beginPath();
  ctx.arc(cx + torsoAngle * 10, torsoTop - 5, 14, 0, Math.PI * 2);
  ctx.fill();

  // Bat
  const batX = cx + 20 + armAngle * 25;
  const batY = (hipY + torsoTop) / 2;
  ctx.save();
  ctx.translate(batX, batY);
  ctx.rotate(batAngle);
  ctx.fillStyle = batColor;
  ctx.fillRect(-4, -35, 8, 65);
  ctx.restore();

  // Arms
  ctx.strokeStyle = skinColor;
  ctx.lineWidth = 5;
  // Back arm
  ctx.beginPath();
  ctx.moveTo(cx - 8 + torsoAngle * 10, torsoTop + 8);
  ctx.lineTo(batX - 5, batY - 10);
  ctx.stroke();
  // Front arm
  ctx.beginPath();
  ctx.moveTo(cx + 8 + torsoAngle * 10, torsoTop + 8);
  ctx.lineTo(batX + 5, batY - 5);
  ctx.stroke();

  ctx.restore();
}

export default function FrameViewer({
  label,
  currentPhase,
  frameIndex,
  totalFrames,
  flipped = false,
  borderColor = "#C8F000",
  batterType,
}: FrameViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);
    canvas.width = size * 2; // retina
    canvas.height = size * 2;
    ctx.scale(2, 2);

    // Clear
    ctx.fillStyle = "#0a0a0a";
    ctx.fillRect(0, 0, size, size);

    // Stadium background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, size);
    grad.addColorStop(0, "#1a2a1a");
    grad.addColorStop(0.4, "#2a5a2a");
    grad.addColorStop(1, "#3a2a1a");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Crowd dots
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    for (let i = 0; i < 50; i++) {
      const x = (i * 37 + 13) % size;
      const y = (i * 23 + 7) % (size * 0.35);
      ctx.fillRect(x, y, 3, 5);
    }

    // Batter
    drawBatter(ctx, currentPhase, size, size, flipped ? "L" : "R", batterType === "pro");

    // Phase label at bottom
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(0, size - 28, size, 28);
    ctx.fillStyle = "#C8F000";
    ctx.font = "12px -apple-system, system-ui, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`${label} - Phase ${currentPhase}`, 10, size - 10);
    ctx.textAlign = "right";
    ctx.fillStyle = "#888";
    ctx.font = "11px -apple-system, system-ui, sans-serif";
    ctx.fillText(`Frame ${frameIndex}/${totalFrames}`, size - 10, size - 10);
  }, [label, currentPhase, frameIndex, totalFrames, flipped, batterType]);

  useEffect(() => {
    draw();
    const handleResize = () => draw();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [draw]);

  return (
    <div className="relative w-full aspect-square rounded-xl overflow-hidden" style={{ border: `2px solid ${borderColor}` }}>
      <canvas ref={canvasRef} className="w-full h-full" />
      {/* Label badge */}
      <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-black/80 rounded-full px-3 py-1 text-xs font-medium">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21v-2a6 6 0 016-6h4a6 6 0 016 6v2" />
        </svg>
        <span>{label}</span>
      </div>
      {/* Flip indicator */}
      {flipped && (
        <div className="absolute top-2 right-2 bg-black/60 rounded-full px-2 py-0.5 text-[10px] text-neon">
          Mirrored
        </div>
      )}
    </div>
  );
}
