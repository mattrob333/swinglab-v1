"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClipFromBlob } from "@/lib/media/create-clip";
import {
  ClipRecorder,
  MAX_RECORD_SEC,
  classifyCameraError,
  getZoomRange,
  openCamera,
  setZoom,
  stopStream,
  type CameraErrorKind,
  type Facing,
  type ZoomRange,
} from "@/lib/media/recorder";
import { formatClock } from "@/lib/media/trim";
import { ImportVideoButton } from "./ImportVideoButton";

type Phase = "starting" | "ready" | "recording" | "saving" | "error";

const ERROR_COPY: Record<CameraErrorKind, { title: string; body: string }> = {
  denied: {
    title: "Camera access is off",
    body: "Allow the camera for this site (iPhone: Settings → Apps → Safari → Camera), or import a swing from Photos.",
  },
  "no-camera": { title: "No camera found", body: "This device has no camera we can use. Import a swing from Photos instead." },
  "in-use": { title: "Camera is busy", body: "Another app is using the camera. Close it and try again, or import a video." },
  unsupported: {
    title: "Camera not available",
    body: "This browser can't open the camera here (it needs HTTPS). Import a video from Photos instead.",
  },
  unknown: { title: "Couldn't start the camera", body: "Try again, or import a swing from Photos." },
};

function IconButton({
  label,
  onClick,
  disabled,
  children,
  testId,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  testId?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      data-testid={testId}
      className="flex h-12 w-12 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur disabled:opacity-40"
    >
      {children}
    </button>
  );
}

export function Recorder() {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<ClipRecorder | null>(null);
  const startedAtRef = useRef(0);
  const stoppingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>("starting");
  const [errorKind, setErrorKind] = useState<CameraErrorKind>("unknown");
  const [facing, setFacing] = useState<Facing>("environment");
  const [elapsed, setElapsed] = useState(0);
  const [zoom, setZoomState] = useState<ZoomRange | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Open (or re-open) the camera whenever the facing changes or the user retries.
  useEffect(() => {
    let cancelled = false;
    openCamera(facing)
      .then((stream) => {
        if (cancelled) {
          stopStream(stream);
          return;
        }
        streamRef.current = stream;
        const v = videoRef.current;
        if (v) {
          v.srcObject = stream;
          void v.play().catch(() => {});
        }
        setZoomState(getZoomRange(stream.getVideoTracks()[0]));
        setPhase("ready");
      })
      .catch((err) => {
        if (cancelled) return;
        console.warn("[capture] camera error", err);
        setErrorKind(classifyCameraError(err));
        setPhase("error");
      });
    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [facing, attempt]);

  const stopRecording = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec || stoppingRef.current) return;
    stoppingRef.current = true;
    setPhase("saving");
    try {
      const blob = await rec.stop();
      recorderRef.current = null;
      stopStream(streamRef.current);
      const { clip } = await createClipFromBlob(blob, { kind: "athlete" });
      router.push(`/clips/${clip.id}/edit`);
    } catch (err) {
      console.error("[capture] save failed", err);
      setSaveError(err instanceof Error ? err.message : "Couldn't save the recording.");
      setPhase("error");
      setErrorKind("unknown");
    } finally {
      stoppingRef.current = false;
    }
  }, [router]);

  // Timer + auto-stop.
  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      const sec = (performance.now() - startedAtRef.current) / 1000;
      setElapsed(sec);
      if (sec >= MAX_RECORD_SEC) void stopRecording();
    }, 100);
    return () => clearInterval(id);
  }, [phase, stopRecording]);

  // Stop if the app is backgrounded mid-take.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden" && recorderRef.current) void stopRecording();
    };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [stopRecording]);

  function startRecording() {
    const stream = streamRef.current;
    if (!stream || phase !== "ready") return;
    try {
      const rec = new ClipRecorder(stream);
      rec.start();
      recorderRef.current = rec;
      startedAtRef.current = performance.now();
      setElapsed(0);
      setPhase("recording");
    } catch (err) {
      console.error("[capture] MediaRecorder failed", err);
      setSaveError("Recording isn't supported in this browser. Import a video instead.");
      setErrorKind("unsupported");
      setPhase("error");
    }
  }

  async function onZoom(value: number) {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track || !zoom) return;
    setZoomState({ ...zoom, value });
    try {
      await setZoom(track, value);
    } catch {
      // ignore: some devices report zoom but reject changes
    }
  }

  const recording = phase === "recording";
  const progress = Math.min(1, elapsed / MAX_RECORD_SEC);
  const R = 44;
  const C = 2 * Math.PI * R;

  return (
    <div className="fixed inset-0 z-40 overflow-hidden bg-black text-white" data-testid="recorder" data-phase={phase}>
      <video ref={videoRef} className="absolute inset-0 h-full w-full object-cover" autoPlay muted playsInline />

      {/* Top bar: above the error/saving overlays so Close is always reachable */}
      <div className="safe-top absolute inset-x-0 top-0 z-30 bg-gradient-to-b from-black/60 to-transparent">
        <div className="flex items-center justify-between px-4 pt-3 pb-6">
          <IconButton
            label="Close"
            onClick={() => (window.history.length > 1 ? router.back() : router.push("/"))}
            disabled={recording || phase === "saving"}
            testId="recorder-close"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </IconButton>
          <div
            className={`flex items-center gap-2 rounded-full px-3 py-1.5 font-mono text-base tabular-nums ${recording ? "bg-red-600" : "bg-black/45"} ${phase === "error" ? "invisible" : ""}`}
            data-testid="rec-timer"
          >
            {recording && <span className="h-2 w-2 animate-pulse rounded-full bg-white" aria-hidden />}
            {formatClock(elapsed)} <span className="opacity-60">/ {formatClock(MAX_RECORD_SEC)}</span>
          </div>
          <IconButton
            label="Switch camera"
            onClick={() => {
              setPhase("starting");
              setFacing((f) => (f === "environment" ? "user" : "environment"));
            }}
            disabled={recording || phase === "saving" || phase === "error"}
            testId="switch-camera"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 8h3l2-2h6l2 2h3v11H4z" />
              <path d="M9.5 13.5a2.8 2.8 0 0 0 5-1.5M14.5 11.5a2.8 2.8 0 0 0-5 1.5" />
              <path d="M14.5 9.5v2h-2M9.5 15.5v-2h2" />
            </svg>
          </IconButton>
        </div>
      </div>

      {/* Error / permission state */}
      {phase === "error" && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-bg/95 px-6" data-testid="camera-error">
          <div className="w-full max-w-sm text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-elevated text-muted">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round">
                <path d="M4 7h3l2-3h6l2 3h3v13H4z" />
                <path d="M3 3l18 18" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold">{saveError ? "Something went wrong" : ERROR_COPY[errorKind].title}</h1>
            <p className="mt-2 text-sm text-muted">{saveError ?? ERROR_COPY[errorKind].body}</p>
            <div className="mt-6 flex flex-col gap-3">
              <ImportVideoButton className="min-h-12 rounded-full bg-neon px-6 font-semibold text-black">
                Import from Photos
              </ImportVideoButton>
              <button
                type="button"
                className="min-h-12 rounded-full border border-line px-6 font-medium"
                onClick={() => {
                  setSaveError(null);
                  setPhase("starting");
                  setAttempt((a) => a + 1);
                }}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === "saving" && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-black/70" data-testid="saving">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-neon border-t-transparent" aria-hidden />
          <p className="text-sm font-medium">Saving swing…</p>
        </div>
      )}

      {/* Controls: bottom row in portrait, right column in landscape */}
      <div
        className="safe-bottom absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/70 to-transparent landscape:inset-x-auto landscape:inset-y-0 landscape:right-0 landscape:bg-gradient-to-l"
        style={{ paddingRight: "env(safe-area-inset-right)" }}
      >
        <div className="flex flex-col items-center gap-4 px-6 pt-10 pb-6 landscape:h-full landscape:justify-center landscape:px-5 landscape:pt-4">
          {zoom && (
            <label className="flex w-full max-w-xs items-center gap-3 text-xs landscape:w-40">
              <span className="font-semibold tabular-nums">{zoom.value.toFixed(1)}×</span>
              <input
                type="range"
                min={zoom.min}
                max={zoom.max}
                step={zoom.step}
                value={zoom.value}
                onChange={(e) => onZoom(parseFloat(e.target.value))}
                className="h-11 flex-1 accent-[#c8f000]"
                aria-label="Zoom"
              />
            </label>
          )}
          <div className="flex w-full max-w-sm items-center justify-between landscape:w-auto landscape:flex-col-reverse landscape:gap-8">
            <ImportVideoButton className="flex h-12 min-w-12 flex-col items-center justify-center rounded-2xl bg-black/45 px-3 text-[11px] font-medium backdrop-blur disabled:opacity-40">
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 16l5-5 4 4 3-3 6 6" />
              </svg>
              <span className="sr-only">Import from Photos</span>
            </ImportVideoButton>

            <button
              type="button"
              aria-label={recording ? "Stop recording" : "Start recording"}
              onClick={() => (recording ? void stopRecording() : startRecording())}
              disabled={!(phase === "ready" || recording)}
              data-testid="record-button"
              className="relative flex h-24 w-24 items-center justify-center disabled:opacity-50"
            >
              <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden>
                <circle cx="50" cy="50" r={R} fill="none" stroke="white" strokeOpacity={0.9} strokeWidth={5} />
                {recording && (
                  <circle
                    cx="50"
                    cy="50"
                    r={R}
                    fill="none"
                    stroke="#c8f000"
                    strokeWidth={5}
                    strokeDasharray={C}
                    strokeDashoffset={C * (1 - progress)}
                    strokeLinecap="round"
                  />
                )}
              </svg>
              <span
                className={`block bg-red-600 transition-all duration-200 ${recording ? "h-9 w-9 rounded-lg" : "h-[76px] w-[76px] rounded-full"}`}
              />
            </button>

            {/* Spacer keeps the record button centered */}
            <div className="h-12 w-12" aria-hidden />
          </div>
          <p className="text-xs text-white/70" aria-live="polite">
            {phase === "starting" ? "Starting camera…" : recording ? "Tap to stop" : `Up to ${MAX_RECORD_SEC}s`}
          </p>
        </div>
      </div>
    </div>
  );
}
