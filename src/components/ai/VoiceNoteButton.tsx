"use client";

// Tap to record a voice note, tap again to stop; the audio is transcribed on
// the server and handed to onText. Recording stops by itself after 2 minutes.
// No audio is kept on the device: without a connection the button is disabled
// ("Voice notes need a connection").

import { useEffect, useRef, useState } from "react";
import { AiError, MAX_VOICE_NOTE_MS, formatClock, pickAudioMime, transcribeAudio } from "@/lib/ai/client";
import { useAiStatus } from "./useAiStatus";

type Phase = "idle" | "starting" | "recording" | "transcribing";

interface Props {
  onText: (text: string) => void;
  /** Called when recording starts (e.g. to keep a toast from auto-dismissing). */
  onActive?: () => void;
  className?: string;
  /** Where the status bubble opens relative to the button. */
  bubble?: "above" | "below";
  testId?: string;
}

const MIC = "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3";

export function VoiceNoteButton({ onText, onActive, className = "", bubble = "above", testId = "voice-note" }: Props) {
  const { gate } = useAiStatus();
  const g = gate("transcribe");
  const [phase, setPhase] = useState<Phase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const rec = useRef<{ recorder: MediaRecorder; stream: MediaStream; chunks: Blob[]; started: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  }, [onText]);

  // Timer and auto-stop while recording.
  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => {
      const r = rec.current;
      if (!r) return;
      const ms = Date.now() - r.started;
      setElapsed(ms);
      if (ms >= MAX_VOICE_NOTE_MS) stop();
    }, 250);
    return () => clearInterval(t);
  }, [phase]);

  // Hide transient messages.
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(null), 5000);
    return () => clearTimeout(t);
  }, [message]);

  // Release the mic and cancel uploads if the host unmounts.
  useEffect(
    () => () => {
      const r = rec.current;
      rec.current = null;
      if (r) {
        r.recorder.onstop = null;
        if (r.recorder.state !== "inactive") r.recorder.stop();
        r.stream.getTracks().forEach((t) => t.stop());
      }
      abort.current?.abort();
    },
    [],
  );

  async function start() {
    setMessage(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setMessage("This browser can't record audio.");
      return;
    }
    setPhase("starting");
    onActive?.();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    } catch (e) {
      setPhase("idle");
      const name = (e as { name?: string })?.name;
      setMessage(
        name === "NotAllowedError" || name === "SecurityError"
          ? "Microphone access is off. Allow it in Settings to record voice notes."
          : "Couldn't start the microphone.",
      );
      return;
    }
    const mime = pickAudioMime((m) => MediaRecorder.isTypeSupported(m));
    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setPhase("idle");
      setMessage("This browser can't record audio.");
      return;
    }
    const entry = { recorder, stream, chunks: [] as Blob[], started: Date.now() };
    rec.current = entry;
    recorder.ondataavailable = (ev) => {
      if (ev.data.size > 0) entry.chunks.push(ev.data);
    };
    recorder.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      if (rec.current !== entry) return;
      rec.current = null;
      const type = recorder.mimeType || mime || "audio/mp4";
      void upload(new Blob(entry.chunks, { type }), type);
    };
    recorder.start(1000);
    setElapsed(0);
    setPhase("recording");
  }

  function stop() {
    const r = rec.current;
    if (!r || r.recorder.state === "inactive") return;
    setPhase("transcribing");
    r.recorder.stop();
  }

  async function upload(blob: Blob, type: string) {
    if (!navigator.onLine) {
      setPhase("idle");
      setMessage("Voice notes need a connection.");
      return;
    }
    const ac = new AbortController();
    abort.current = ac;
    try {
      const text = await transcribeAudio(blob, type, ac.signal);
      if (ac.signal.aborted) return;
      if (text) onTextRef.current(text);
      else setMessage("Didn't catch anything. Try again closer to the mic.");
    } catch (e) {
      if (ac.signal.aborted) return;
      setMessage(e instanceof AiError ? e.message : "Couldn't transcribe that voice note.");
    } finally {
      if (abort.current === ac) abort.current = null;
      if (!ac.signal.aborted) setPhase("idle");
    }
  }

  const recording = phase === "recording";
  const busy = phase === "starting" || phase === "transcribing";
  const unavailable = !g.enabled && phase === "idle";
  const label = recording
    ? `Stop recording (${formatClock(elapsed)})`
    : phase === "transcribing"
      ? "Transcribing voice note"
      : g.enabled
        ? "Record a voice note"
        : `Voice note unavailable: ${g.reason}`;

  const bubbleText = message ?? (phase === "transcribing" ? "Transcribing…" : null);

  return (
    <div className={`relative shrink-0 ${className}`}>
      <button
        type="button"
        onClick={() => (recording ? stop() : unavailable ? setMessage(g.reason) : start())}
        disabled={busy}
        aria-disabled={unavailable || busy}
        aria-label={label}
        title={label}
        aria-pressed={recording}
        data-testid={testId}
        data-phase={phase}
        data-reason={g.enabled ? undefined : g.reason ?? undefined}
        className={`flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full px-3 text-sm font-semibold tabular-nums transition-colors ${
          recording ? "bg-red-500 text-white" : "bg-elevated text-white"
        } disabled:text-muted aria-disabled:text-muted aria-disabled:opacity-60`}
      >
        {recording ? (
          <>
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
            </span>
            <span data-testid={`${testId}-timer`}>{formatClock(elapsed)}</span>
          </>
        ) : busy ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-muted border-t-transparent" aria-hidden />
        ) : (
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d={MIC} />
          </svg>
        )}
      </button>
      {bubbleText && (
        <div
          role="status"
          data-testid={`${testId}-message`}
          className={`absolute right-0 z-10 w-56 rounded-xl border border-line bg-elevated px-3 py-2 text-xs text-white shadow-xl ${
            bubble === "above" ? "bottom-full mb-2" : "top-full mt-2"
          }`}
        >
          {bubbleText}
        </div>
      )}
    </div>
  );
}
