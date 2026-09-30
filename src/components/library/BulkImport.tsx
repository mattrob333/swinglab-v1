"use client";

import { useEffect, useRef, useState } from "react";
import type { CameraView, Handedness } from "@/lib/types";
import { createClipFromBlob } from "@/lib/media/create-clip";
import { parseProFilename } from "@/lib/media/filename";
import { enqueueProcessing } from "@/lib/media/jobs";
import { looksLikeVideoFile } from "@/lib/media/mime";
import { useJobs } from "@/lib/media/use-jobs";

type RowStatus = "ready" | "importing" | "imported" | "error";

interface Row {
  key: string;
  file: File;
  name: string;
  handedness: Handedness;
  cameraView: CameraView;
  status: RowStatus;
  clipId?: string;
  error?: string;
}

const VIEWS: { value: CameraView; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "closed", label: "Closed" },
  { value: "behind", label: "Behind" },
  { value: "front", label: "Front" },
  { value: "other", label: "Other" },
];

let rowSeq = 0;

function rowsFromFiles(files: Iterable<File>): Row[] {
  const rows: Row[] = [];
  for (const file of files) {
    if (!looksLikeVideoFile(file.name, file.type)) continue;
    const parsed = parseProFilename(file.name);
    rows.push({
      key: `r${++rowSeq}`,
      file,
      name: parsed.name || "Pro swing",
      handedness: parsed.handedness ?? "R",
      cameraView: parsed.cameraView ?? "open",
      status: "ready",
    });
  }
  return rows;
}

function sizeLabel(bytes: number) {
  return bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.round(bytes / 1e3)} KB`;
}

/**
 * "Add pro videos": multi-file picker + drag-and-drop, one editable row per
 * file, then "Import all" creates pro clips and queues their processing.
 */
export function BulkImport({ initialFiles, onClose }: { initialFiles?: File[]; onClose: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => rowsFromFiles(initialFiles ?? []));
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const jobs = useJobs();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !running && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, running]);

  const addFiles = (files: FileList | File[] | null | undefined) => {
    if (!files) return;
    setRows((prev) => [...prev, ...rowsFromFiles(Array.from(files))]);
  };

  const update = (key: string, patch: Partial<Row>) =>
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function importAll() {
    setRunning(true);
    const todo = rows.filter((r) => r.status === "ready" || r.status === "error");
    for (const r of todo) {
      update(r.key, { status: "importing", error: undefined });
      try {
        const { clip } = await createClipFromBlob(r.file, {
          kind: "pro",
          title: r.name.trim() || "Pro swing",
          handedness: r.handedness,
          cameraView: r.cameraView,
        });
        enqueueProcessing(clip.id);
        update(r.key, { status: "imported", clipId: clip.id });
      } catch (err) {
        update(r.key, { status: "error", error: err instanceof Error ? err.message : "Import failed" });
      }
    }
    setRunning(false);
  }

  const pendingCount = rows.filter((r) => r.status === "ready" || r.status === "error").length;
  const allImported = rows.length > 0 && pendingCount === 0;

  function rowProgress(r: Row): { label: string; pct: number; tone: string } {
    if (r.status === "ready") return { label: "Ready", pct: 0, tone: "text-muted" };
    if (r.status === "importing") return { label: "Reading…", pct: 5, tone: "text-white" };
    if (r.status === "error") return { label: r.error ?? "Failed", pct: 0, tone: "text-red-400" };
    const job = r.clipId ? jobs[r.clipId] : undefined;
    if (!job || job.state === "done") return { label: "Done", pct: 100, tone: "text-neon" };
    if (job.state === "running") return { label: `Optimizing ${Math.round(job.progress * 100)}%`, pct: 10 + job.progress * 90, tone: "text-white" };
    if (job.state === "queued") return { label: "Imported · waiting to optimize", pct: 10, tone: "text-muted" };
    if (job.state === "unsupported") return { label: "Imported (original kept)", pct: 100, tone: "text-neon" };
    return { label: "Imported · optimize failed", pct: 100, tone: "text-amber-400" };
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-6" data-testid="bulk-import">
      <div
        className={`safe-bottom flex max-h-[92%] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl border bg-surface sm:max-h-full sm:rounded-3xl ${
          dragOver ? "border-neon" : "border-line"
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          addFiles(e.dataTransfer.files);
        }}
        role="dialog"
        aria-label="Add pro videos"
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Add pro videos</h2>
            <p className="text-xs text-muted">Names come from the file names. Fix them before importing.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={running}
            className="flex h-11 w-11 items-center justify-center rounded-full text-muted disabled:opacity-40"
            aria-label="Close"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="scrollbar-none min-h-0 flex-1 overflow-y-auto px-4 py-4">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className={`flex w-full flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-4 py-6 text-center ${
              dragOver ? "border-neon bg-neon/5" : "border-white/15"
            }`}
            data-testid="bulk-choose"
          >
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-neon" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 16V4M7 9l5-5 5 5M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
            </svg>
            <span className="font-semibold">Choose videos</span>
            <span className="text-xs text-muted">or drop them here · MP4 / MOV / WebM</span>
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="video/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
            data-testid="bulk-input"
          />

          {rows.length > 1 && (
            <div className="mt-4 flex items-center gap-2 text-xs text-muted">
              Set all:
              {(["L", "R"] as const).map((h) => (
                <button
                  key={h}
                  type="button"
                  className="min-h-9 rounded-full border border-line px-3 text-white"
                  onClick={() => setRows((prev) => prev.map((r) => (r.status === "ready" ? { ...r, handedness: h } : r)))}
                >
                  {h === "L" ? "Lefty" : "Righty"}
                </button>
              ))}
            </div>
          )}

          <ul className="mt-3 space-y-2">
            {rows.map((r) => {
              const editable = r.status === "ready" || r.status === "error";
              const p = rowProgress(r);
              return (
                <li key={r.key} className="rounded-2xl border border-line bg-elevated p-3" data-testid="bulk-row">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={r.name}
                      onChange={(e) => update(r.key, { name: e.target.value })}
                      disabled={!editable}
                      aria-label="Player name"
                      className="min-h-11 min-w-0 flex-1 basis-48 rounded-xl border border-line bg-bg px-3 text-base text-white outline-none focus:border-neon disabled:opacity-70"
                      data-testid="bulk-name"
                    />
                    <div className="flex rounded-full bg-bg p-1" role="radiogroup" aria-label="Handedness">
                      {(["L", "R"] as const).map((h) => (
                        <button
                          key={h}
                          type="button"
                          role="radio"
                          aria-checked={r.handedness === h}
                          disabled={!editable}
                          onClick={() => update(r.key, { handedness: h })}
                          className={`h-9 w-10 rounded-full text-sm font-bold ${r.handedness === h ? "bg-neon text-black" : "text-muted"}`}
                        >
                          {h}
                        </button>
                      ))}
                    </div>
                    <select
                      value={r.cameraView}
                      disabled={!editable}
                      onChange={(e) => update(r.key, { cameraView: e.target.value as CameraView })}
                      aria-label="Camera view"
                      className="min-h-11 rounded-xl border border-line bg-bg px-2 text-sm text-white"
                    >
                      {VIEWS.map((v) => (
                        <option key={v.value} value={v.value}>
                          {v.label}
                        </option>
                      ))}
                    </select>
                    {editable && !running && (
                      <button
                        type="button"
                        aria-label={`Remove ${r.file.name}`}
                        onClick={() => setRows((prev) => prev.filter((x) => x.key !== r.key))}
                        className="flex h-11 w-11 items-center justify-center rounded-full text-muted"
                      >
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
                          <path d="M6 6l12 12M18 6L6 18" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    <span className="min-w-0 flex-1 truncate text-muted">
                      {r.file.name} · {sizeLabel(r.file.size)}
                    </span>
                    <span className={`shrink-0 ${p.tone}`} data-testid="bulk-status">
                      {p.label}
                    </span>
                  </div>
                  {r.status !== "ready" && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                      <div className="h-full rounded-full bg-neon transition-[width] duration-300" style={{ width: `${p.pct}%` }} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>

        <div className="flex items-center gap-3 border-t border-line px-4 py-3">
          <span className="flex-1 text-xs text-muted">
            {rows.length === 0 ? "No files yet" : `${rows.length} file${rows.length === 1 ? "" : "s"}`}
            {allImported ? " · optimizing continues in the background" : ""}
          </span>
          {allImported ? (
            <button type="button" onClick={onClose} className="min-h-12 rounded-full bg-neon px-6 font-semibold text-black">
              Done
            </button>
          ) : (
            <button
              type="button"
              onClick={importAll}
              disabled={running || pendingCount === 0}
              className="min-h-12 rounded-full bg-neon px-6 font-semibold text-black disabled:opacity-40"
              data-testid="bulk-import-all"
            >
              {running ? "Importing…" : `Import all${pendingCount ? ` (${pendingCount})` : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
