"use client";

// Camera + MediaRecorder helpers for the capture screen.

import { baseMime, pickRecorderMimeType } from "./mime";

export type Facing = "environment" | "user";

export type CameraErrorKind = "denied" | "no-camera" | "unsupported" | "in-use" | "unknown";

export const MAX_RECORD_SEC = 20;

export function cameraConstraints(facing: Facing): MediaStreamConstraints {
  return {
    video: {
      facingMode: facing,
      frameRate: { ideal: 60 },
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
    audio: false,
  };
}

export async function openCamera(facing: Facing): Promise<MediaStream> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error("Camera not available"), { name: "NotSupportedError" });
  }
  return navigator.mediaDevices.getUserMedia(cameraConstraints(facing));
}

export function classifyCameraError(err: unknown): CameraErrorKind {
  const name = (err as { name?: string } | null)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "denied";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "no-camera";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "in-use";
    case "NotSupportedError":
    case "TypeError":
      return "unsupported";
    default:
      return "unknown";
  }
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((t) => t.stop());
}

export interface ZoomRange {
  min: number;
  max: number;
  step: number;
  value: number;
}

/** Hardware zoom range when the camera exposes one (Chrome Android, some Safari). */
export function getZoomRange(track: MediaStreamTrack | undefined): ZoomRange | null {
  if (!track || typeof track.getCapabilities !== "function") return null;
  const caps = track.getCapabilities() as MediaTrackCapabilities & { zoom?: { min: number; max: number; step?: number } };
  if (!caps.zoom || !(caps.zoom.max > caps.zoom.min)) return null;
  const settings = track.getSettings() as MediaTrackSettings & { zoom?: number };
  return {
    min: caps.zoom.min,
    max: caps.zoom.max,
    step: caps.zoom.step || 0.1,
    value: settings.zoom ?? caps.zoom.min,
  };
}

export async function setZoom(track: MediaStreamTrack, zoom: number): Promise<void> {
  await track.applyConstraints({ advanced: [{ zoom } as MediaTrackConstraintSet] });
}

export function supportedRecorderMime(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  return pickRecorderMimeType((t) => MediaRecorder.isTypeSupported(t));
}

/** Thin wrapper over MediaRecorder that resolves the finished Blob on stop. */
export class ClipRecorder {
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private stopped: Promise<Blob>;
  readonly mimeType: string;

  constructor(stream: MediaStream) {
    const picked = supportedRecorderMime();
    const options: MediaRecorderOptions = { videoBitsPerSecond: 12_000_000 };
    if (picked) options.mimeType = picked;
    try {
      this.recorder = new MediaRecorder(stream, options);
    } catch {
      this.recorder = new MediaRecorder(stream);
    }
    this.mimeType = baseMime(this.recorder.mimeType || picked);
    this.stopped = new Promise((resolve, reject) => {
      this.recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) this.chunks.push(e.data);
      };
      this.recorder.onstop = () => resolve(new Blob(this.chunks, { type: this.mimeType }));
      this.recorder.onerror = (e) => reject((e as unknown as { error?: Error }).error ?? new Error("Recording failed"));
    });
  }

  start(): void {
    // Timeslice so a crash/background mid-take still leaves data.
    this.recorder.start(1000);
  }

  get state(): RecordingState {
    return this.recorder.state;
  }

  stop(): Promise<Blob> {
    if (this.recorder.state !== "inactive") this.recorder.stop();
    return this.stopped;
  }
}
