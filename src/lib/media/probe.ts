"use client";

// Reads duration, display size, rotation, codec and frame rate from a video
// Blob with Mediabunny, falling back to a <video> element when the container or
// codec can't be parsed/decoded here.

import { ALL_FORMATS, BlobSource, EncodedPacketSink, Input, type InputVideoTrack } from "mediabunny";
import { suggestSloMoFactor, type SloMoSuggestion } from "./slomo";

export interface ProbeResult {
  durationSec: number;
  /** Display size after rotation. */
  width: number;
  height: number;
  rotation: 0 | 90 | 180 | 270;
  codec: string | null;
  fps: number | null;
  mimeType: string | null;
  sloMo: SloMoSuggestion;
  /** Whether WebCodecs can decode this video here (needed for Mediabunny thumbnails/transcode). */
  decodable: boolean;
  source: "mediabunny" | "video-element";
}

export function openInput(blob: Blob): Input {
  return new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
}

async function measureFps(track: InputVideoTrack): Promise<number | null> {
  try {
    const m = await track.computeFrameRateMetrics({ targetPacketCount: 256 });
    const fps = m.bestGuessFrameRate;
    if (Number.isFinite(fps) && fps > 0) return Math.round(fps * 100) / 100;
  } catch {
    // fall through to packet stats
  }
  try {
    const stats = await track.computePacketStats(120);
    if (stats.averagePacketRate > 0) return Math.round(stats.averagePacketRate * 100) / 100;
  } catch {
    // unknown
  }
  return null;
}

async function probeWithMediabunny(blob: Blob): Promise<ProbeResult> {
  const input = openInput(blob);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) throw new Error("No video track in this file");
    const [width, height, rotation, codec, fps, mimeType, decodable, tags] = await Promise.all([
      track.getDisplayWidth(),
      track.getDisplayHeight(),
      track.getRotation(),
      track.getCodec(),
      measureFps(track),
      input.getMimeType().catch(() => null),
      track.canDecode().catch(() => false),
      input.getMetadataTags().catch(() => ({ raw: undefined })),
    ]);
    // Times throughout the app are file timestamps (what <video>.currentTime reports),
    // so duration is the end timestamp, not end - first.
    const durationSec = Math.max(0, await track.computeDuration());
    return {
      durationSec,
      width,
      height,
      rotation,
      codec,
      fps,
      mimeType,
      sloMo: suggestSloMoFactor({ fps, rawTags: tags.raw as Record<string, unknown> | undefined }),
      decodable,
      source: "mediabunny",
    };
  } finally {
    input.dispose();
  }
}

/** Metadata via a <video> element. Handles MediaRecorder WebM that reports Infinity duration. */
export function probeWithVideoElement(blob: Blob): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    const url = URL.createObjectURL(blob);
    let settled = false;
    const done = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    const finish = () =>
      done(() =>
        resolve({
          durationSec: video.duration,
          width: video.videoWidth,
          height: video.videoHeight,
          rotation: 0,
          codec: null,
          fps: null,
          mimeType: blob.type || null,
          sloMo: { factor: 1, reason: "Real time" },
          decodable: false,
          source: "video-element",
        }),
      );
    const timer = setTimeout(() => done(() => reject(new Error("Timed out reading video"))), 15000);
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) finish();
      else {
        // Seek far past the end to force the browser to compute the duration.
        video.ondurationchange = () => {
          if (Number.isFinite(video.duration)) finish();
        };
        video.currentTime = 1e9;
      }
    };
    video.onerror = () => done(() => reject(new Error("This video format can't be played on this device")));
    video.src = url;
  });
}

export async function probeVideo(blob: Blob): Promise<ProbeResult> {
  try {
    const r = await probeWithMediabunny(blob);
    if (r.durationSec > 0 && r.width > 0 && r.height > 0) return r;
  } catch (err) {
    console.warn("[probe] Mediabunny could not read the file, falling back to <video>", err);
  }
  return probeWithVideoElement(blob);
}

/** Diagnostics: how many packets are key frames and the largest gap between them. */
export async function inspectKeyFrames(blob: Blob): Promise<{ packets: number; keyPackets: number; maxGop: number }> {
  const input = openInput(blob);
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return { packets: 0, keyPackets: 0, maxGop: 0 };
    const sink = new EncodedPacketSink(track);
    let packets = 0;
    let keyPackets = 0;
    let gop = 0;
    let maxGop = 0;
    for await (const p of sink.packets(undefined, undefined, { metadataOnly: true })) {
      packets++;
      if (p.type === "key") {
        keyPackets++;
        gop = 1;
      } else gop++;
      maxGop = Math.max(maxGop, gop);
    }
    return { packets, keyPackets, maxGop };
  } finally {
    input.dispose();
  }
}
