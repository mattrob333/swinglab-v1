"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { deleteClip, getClip, getClipBlob, getPlayableBlob, updateClip } from "@/lib/store/local-db";
import type { CameraView, Clip, Handedness } from "@/lib/types";
import { useObjectUrl } from "@/lib/store/hooks";
import { cancelProcessing, enqueueProcessing, holdClip } from "@/lib/media/jobs";
import { restoreOriginal } from "@/lib/media/create-clip";
import { clampTrim, type TrimWindow } from "@/lib/media/trim";
import { clampCrop, type CropValue } from "@/lib/media/crop";
import { SLOMO_CHOICES } from "@/lib/media/slomo";
import { useJob } from "@/lib/media/use-jobs";
import { CropPreview } from "./CropPreview";
import { TrimEditor } from "./TrimEditor";

const VIEWS: { value: CameraView; label: string }[] = [
  { value: "open", label: "Open side" },
  { value: "closed", label: "Closed side" },
  { value: "behind", label: "Behind" },
  { value: "front", label: "Front" },
  { value: "other", label: "Other" },
];

function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  testId,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  testId: string;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-full bg-elevated p-1" data-testid={testId}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-10 flex-1 rounded-full px-2 text-sm font-semibold transition-colors ${
            value === o.value ? "bg-neon text-black" : "text-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface Draft {
  title: string;
  handedness: Handedness;
  sloMoFactor: number;
  cameraView: CameraView;
  trim: TrimWindow;
  crop: CropValue;
}

function draftFrom(clip: Clip): Draft {
  return {
    title: clip.title,
    handedness: clip.handedness,
    sloMoFactor: clip.sloMoFactor,
    cameraView: clip.cameraView,
    trim: clampTrim({ start: clip.trimStart, end: clip.trimEnd || clip.durationSec }, clip.durationSec),
    crop: clampCrop(clip.crop),
  };
}

export function ClipEditor({ clipId }: { clipId: string }) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [clip, setClip] = useState<Clip | null | undefined>(undefined);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [paused, setPaused] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const src = useObjectUrl(blob);
  const job = useJob(clipId);

  const trimRef = useRef<TrimWindow>({ start: 0, end: 0 });
  const scrubbing = useRef(false);
  const pausedRef = useRef(false);
  const seek = useRef<{ busy: boolean; since: number; pending: number | null }>({ busy: false, since: 0, pending: null });

  // Don't let background processing start on this clip while it's being edited.
  useEffect(() => holdClip(clipId), [clipId]);

  // Load once per clip (and after "restore original"); edits live in `draft`.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getClip(clipId), getPlayableBlob(clipId)]).then(([c, b]) => {
      if (cancelled) return;
      setClip(c ?? null);
      setBlob(b ?? null);
      if (c) {
        const d = draftFrom(c);
        setDraft(d);
        trimRef.current = d.trim;
      }
    });
    return () => {
      cancelled = true;
    };
  }, [clipId, reload]);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v) return;
    // One seek in flight; newer targets replace the pending one. A seek that
    // never reports `seeked` is abandoned after 750ms.
    if (seek.current.busy && performance.now() - seek.current.since < 750) {
      seek.current.pending = t;
      return;
    }
    seek.current.busy = true;
    seek.current.since = performance.now();
    v.currentTime = t;
  }, []);

  const onVideoEvent = useCallback(
    (type: "seeked" | "loadeddata") => {
      if (type === "loadeddata") {
        const v = videoRef.current;
        if (v && v.currentTime < trimRef.current.start) seekTo(trimRef.current.start);
        return;
      }
      seek.current.busy = false;
      const p = seek.current.pending;
      if (p !== null) {
        seek.current.pending = null;
        seekTo(p);
      }
    },
    [seekTo],
  );

  // Loop the trim window.
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = videoRef.current;
      const { start, end } = trimRef.current;
      const seeking = seek.current.busy && performance.now() - seek.current.since < 750;
      if (v && !scrubbing.current && !pausedRef.current && end > start && !seeking) {
        if (v.currentTime >= end - 0.005 || v.currentTime < start - 0.05 || v.ended) {
          seekTo(start);
          if (v.paused) void v.play().catch(() => {});
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seekTo, src]);

  const patch = (p: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...p } : d));

  function onTrimChange(t: TrimWindow) {
    trimRef.current = t;
    patch({ trim: t });
  }

  function onScrub(time: number) {
    scrubbing.current = true;
    videoRef.current?.pause();
    setPaused(true);
    seekTo(time);
  }

  function onScrubEnd() {
    scrubbing.current = false;
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || pausedRef.current) {
      const { start, end } = trimRef.current;
      if (v.currentTime >= end - 0.01 || v.currentTime < start) seekTo(start);
      setPaused(false);
      void v.play().catch(() => {});
    } else {
      v.pause();
      setPaused(true);
    }
  }

  async function save(d: Draft, c: Clip) {
    const trim = clampTrim(d.trim, c.durationSec);
    await updateClip(c.id, {
      title: d.title.trim() || c.title,
      handedness: d.handedness,
      sloMoFactor: d.sloMoFactor,
      cameraView: d.cameraView,
      trimStart: trim.start,
      trimEnd: trim.end,
      crop: clampCrop(d.crop),
    });
  }

  async function onCompare() {
    if (!clip || !draft || busy) return;
    setBusy("compare");
    await save(draft, clip);
    // Processing runs in the background; the hold is released when we unmount.
    if (!clip.processed) enqueueProcessing(clip.id, { priority: true });
    const param = clip.kind === "pro" ? "top" : "bottom";
    router.push(`/compare?${param}=${encodeURIComponent(clip.id)}`);
  }

  async function onRestore() {
    if (!clip || busy) return;
    setBusy("restore");
    try {
      await restoreOriginal(clip.id);
      setReload((r) => r + 1);
    } finally {
      setBusy(null);
    }
  }

  async function onDelete() {
    if (!clip || busy) return;
    if (!confirm("Delete this swing from this device?")) return;
    setBusy("delete");
    cancelProcessing(clip.id);
    await deleteClip(clip.id);
    router.replace(clip.kind === "pro" ? "/library" : "/");
  }

  function onBack() {
    if (window.history.length > 1) router.back();
    else router.push("/");
  }

  const [originalOf, setOriginalOf] = useState<string | null>(null);
  useEffect(() => {
    if (!clip?.processed) return;
    let cancelled = false;
    getClipBlob(clip.id, "original").then((b) => {
      if (!cancelled && b) setOriginalOf(clip.id);
    });
    return () => {
      cancelled = true;
    };
  }, [clip?.id, clip?.processed]);
  const hasOriginal = !!clip?.processed && originalOf === clip.id;

  if (clip === undefined) {
    return <div className="flex h-full items-center justify-center bg-bg text-muted">Loading…</div>;
  }
  if (clip === null || !draft) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
        <p className="text-lg font-semibold">This clip isn&apos;t on this device.</p>
        <button type="button" className="min-h-12 rounded-full bg-neon px-6 font-semibold text-black" onClick={() => router.push("/")}>
          Go home
        </button>
      </div>
    );
  }

  const isPro = clip.kind === "pro";

  return (
    <div className="fixed inset-0 z-30 flex flex-col bg-bg landscape:flex-row" data-testid="clip-editor">
      {/* Preview column */}
      <div className="flex min-h-0 flex-1 flex-col">
        <header className="safe-top flex items-center gap-2 border-b border-line bg-surface/90 px-2 backdrop-blur">
          <button type="button" onClick={onBack} aria-label="Back" className="flex h-12 w-12 items-center justify-center text-white">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <h1 className="flex-1 truncate text-base font-semibold">{isPro ? "Edit pro clip" : "Trim your swing"}</h1>
          {job && (job.state === "running" || job.state === "queued") && (
            <span className="mr-2 text-xs text-muted">Optimizing {Math.round(job.progress * 100)}%</span>
          )}
        </header>
        <div className="relative min-h-0 flex-1">
          <CropPreview
            src={src}
            videoRef={videoRef}
            crop={draft.crop}
            onCropChange={(c) => patch({ crop: clampCrop(c) })}
            onTap={togglePlay}
            paused={paused}
            onVideoEvent={onVideoEvent}
          />
        </div>
        <div className="border-t border-line bg-surface px-3 pt-4 pb-3">
          <TrimEditor
            blob={blob}
            duration={clip.durationSec}
            fps={clip.fps}
            trim={draft.trim}
            onChange={onTrimChange}
            onScrub={onScrub}
            onScrubEnd={onScrubEnd}
            videoRef={videoRef}
          />
        </div>
      </div>

      {/* Details + primary action */}
      <aside className="flex max-h-[40%] flex-col border-t border-line bg-surface landscape:max-h-none landscape:w-[340px] landscape:border-t-0 landscape:border-l">
        <div className="scrollbar-none min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
          <div className="grid grid-cols-2 gap-3 landscape:grid-cols-1">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">Batter</span>
              <Segmented
                label="Batter handedness"
                value={draft.handedness}
                onChange={(v) => patch({ handedness: v })}
                options={[
                  { value: "L", label: "Lefty" },
                  { value: "R", label: "Righty" },
                ]}
                testId="handedness"
              />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-muted">Slo-mo</span>
              <Segmented
                label="Slo-mo factor"
                value={draft.sloMoFactor}
                onChange={(v) => patch({ sloMoFactor: v })}
                options={SLOMO_CHOICES.map((n) => ({ value: n, label: `${n}×` }))}
                testId="slomo"
              />
            </div>
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-muted">{isPro ? "Player" : "Title"}</span>
            <input
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              className="min-h-11 w-full rounded-xl border border-line bg-elevated px-3 text-base text-white outline-none focus:border-neon"
              data-testid="clip-title"
            />
          </label>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-muted">Camera view</span>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Camera view">
              {VIEWS.map((v) => (
                <button
                  key={v.value}
                  type="button"
                  role="radio"
                  aria-checked={draft.cameraView === v.value}
                  onClick={() => patch({ cameraView: v.value })}
                  className={`min-h-10 rounded-full border px-3 text-sm ${
                    draft.cameraView === v.value ? "border-neon bg-neon/15 text-neon" : "border-line text-muted"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {clip.processed && hasOriginal && (
              <button
                type="button"
                onClick={onRestore}
                disabled={!!busy}
                className="min-h-10 rounded-full border border-line px-3 text-sm text-muted"
              >
                {busy === "restore" ? "Restoring…" : "Re-trim from original"}
              </button>
            )}
            <button type="button" onClick={onDelete} disabled={!!busy} className="min-h-10 rounded-full px-3 text-sm text-red-400">
              Delete
            </button>
          </div>
        </div>
        <div className="safe-bottom border-t border-line px-4 pt-3 pb-3">
          <button
            type="button"
            onClick={onCompare}
            disabled={!!busy}
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-2xl bg-neon text-lg font-bold text-black active:bg-neon-dark disabled:opacity-60"
            data-testid="compare-button"
          >
            Compare
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      </aside>
    </div>
  );
}
