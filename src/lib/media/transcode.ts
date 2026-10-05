"use client";

// Seek-friendly re-encode of a clip's trim window with Mediabunny / WebCodecs:
// MP4 (fast start), H.264 when the device can encode it, a keyframe every
// frame or two, max 1080p (rotation baked in), no audio.

import {
  BufferTarget,
  Conversion,
  ConversionCanceledError,
  Mp4OutputFormat,
  Output,
  Quality,
  getFirstEncodableVideoCodec,
  type VideoCodec,
} from "mediabunny";
import { planEncode } from "./encode-plan";
import { openInput, probeVideo } from "./probe";

/**
 * Codec preference. H.264 plays everywhere (iPhone/iPad Safari included). VP9-in-MP4
 * is only a fallback for Chromium builds without an H.264 encoder (e.g. Linux
 * Chromium); such a device can play its own VP9 output.
 */
export const DEFAULT_CODECS: VideoCodec[] = ["avc", "vp9"];

export interface TranscodeOptions {
  start: number;
  end: number;
  /** Keyframe every N frames (1 = every frame). */
  keyFrameEveryFrames?: number;
  codecs?: VideoCodec[];
  onProgress?: (fraction: number) => void;
  signal?: AbortSignal;
}

export type TranscodeResult =
  | {
      status: "done";
      blob: Blob;
      durationSec: number;
      fps: number | null;
      width: number;
      height: number;
      codec: VideoCodec;
      bitrate: number;
      keyFrameInterval: number;
      elapsedMs: number;
    }
  | { status: "unsupported"; reason: string };

export function webCodecsAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.VideoEncoder === "function" && typeof window.VideoDecoder === "function";
}

export async function transcodeTrimmed(source: Blob, opts: TranscodeOptions): Promise<TranscodeResult> {
  const t0 = performance.now();
  if (!webCodecsAvailable()) return { status: "unsupported", reason: "WebCodecs is not available in this browser" };

  const input = openInput(source);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track");
    if (!(await track.canDecode())) {
      return { status: "unsupported", reason: `This device can't decode ${(await track.getCodec()) ?? "this video"}` };
    }
    const [dw, dh] = await Promise.all([track.getDisplayWidth(), track.getDisplayHeight()]);
    let fps: number | null = null;
    try {
      fps = (await track.computeFrameRateMetrics({ targetPacketCount: 128 })).bestGuessFrameRate || null;
    } catch {
      fps = null;
    }
    const plan = planEncode(dw, dh, fps, opts.keyFrameEveryFrames ?? 2);
    const format = new Mp4OutputFormat({ fastStart: "in-memory" });
    const supported = format.getSupportedVideoCodecs();
    const candidates = (opts.codecs ?? DEFAULT_CODECS).filter((c) => supported.includes(c));
    const codec = await getFirstEncodableVideoCodec(candidates, {
      width: plan.width,
      height: plan.height,
      bitrate: plan.bitrate,
    });
    if (!codec) return { status: "unsupported", reason: "No H.264 video encoder on this device" };

    const output = new Output({ format, target: new BufferTarget() });
    const duration = await track.computeDuration();
    const start = Math.max(0, Math.min(opts.start, duration));
    const end = Math.max(start + 0.01, Math.min(opts.end, duration));
    const conversion = await Conversion.init({
      input,
      output,
      trim: { start, end },
      video: {
        codec,
        width: plan.width,
        height: plan.height,
        fit: "contain",
        allowTransformationMetadata: false,
        quality: new Quality({ bitrate: plan.bitrate }),
        keyFrameInterval: plan.keyFrameInterval,
        forceTranscode: true,
      },
      audio: { discard: true },
      tags: {},
      showWarnings: false,
    });
    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks.map((d) => d.reason).join(", ");
      return { status: "unsupported", reason: `Conversion not possible (${reasons || "unknown"})` };
    }
    if (opts.onProgress) conversion.onProgress = (p) => opts.onProgress?.(Math.min(1, Math.max(0, p)));
    const abort = () => void conversion.cancel();
    opts.signal?.addEventListener("abort", abort, { once: true });
    try {
      await conversion.execute();
    } finally {
      opts.signal?.removeEventListener("abort", abort);
    }
    const buffer = output.target.buffer;
    if (!buffer) throw new Error("Encoder produced no data");
    const blob = new Blob([buffer], { type: "video/mp4" });
    const probed = await probeVideo(blob);
    return {
      status: "done",
      blob,
      durationSec: probed.durationSec,
      fps: probed.fps ?? fps,
      width: probed.width || plan.width,
      height: probed.height || plan.height,
      codec,
      bitrate: plan.bitrate,
      keyFrameInterval: plan.keyFrameInterval,
      elapsedMs: Math.round(performance.now() - t0),
    };
  } finally {
    input.dispose();
  }
}

export function isCancel(err: unknown): boolean {
  return err instanceof ConversionCanceledError;
}
