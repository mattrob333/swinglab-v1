"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import { listClips } from "@/lib/store/local-db";
import { useLocalQuery } from "@/lib/store/hooks";
import type { Clip, ClipKind } from "@/lib/types";
import { loadSampleClips } from "@/lib/dev/samples";
import { resumePendingJobs } from "@/lib/media/jobs";
import { ImportVideoButton } from "@/components/capture/ImportVideoButton";
import { ClipCard } from "./ClipCard";
import { ClipActionSheet } from "./ClipActionSheet";
import { BulkImport } from "./BulkImport";

const TAB_KEY = "swinglab.libraryTab";
const tabListeners = new Set<() => void>();
let memoryTab: ClipKind | null = null;

function readTab(): ClipKind {
  if (memoryTab) return memoryTab;
  try {
    return localStorage.getItem(TAB_KEY) === "athlete" ? "athlete" : "pro";
  } catch {
    return "pro";
  }
}

function writeTab(k: ClipKind) {
  memoryTab = k;
  try {
    localStorage.setItem(TAB_KEY, k);
  } catch {
    // private mode: memory only
  }
  tabListeners.forEach((l) => l());
}

function subscribeTab(l: () => void) {
  tabListeners.add(l);
  return () => {
    tabListeners.delete(l);
  };
}

export function SampleClipsButton({ className, onDone }: { className?: string; onDone?: (added: number) => void }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  return (
    <button
      type="button"
      disabled={state === "loading"}
      className={className}
      data-testid="load-samples"
      onClick={async () => {
        setState("loading");
        try {
          const added = await loadSampleClips();
          onDone?.(added);
          void resumePendingJobs();
        } finally {
          setState("done");
        }
      }}
    >
      {state === "loading" ? "Loading samples…" : "Load sample clips"}
    </button>
  );
}

export function LibraryScreen() {
  const tab = useSyncExternalStore(subscribeTab, readTab, () => "pro" as ClipKind);
  const [menuClip, setMenuClip] = useState<Clip | null>(null);
  const [bulk, setBulk] = useState<{ files: File[] } | null>(null);
  const [pageDrag, setPageDrag] = useState(false);
  const clips = useLocalQuery(() => listClips(), []);

  useEffect(() => {
    void resumePendingJobs();
  }, []);

  const choose = writeTab;

  const shown = (clips ?? []).filter((c) => c.kind === tab);
  const counts = {
    pro: (clips ?? []).filter((c) => c.kind === "pro").length,
    athlete: (clips ?? []).filter((c) => c.kind === "athlete").length,
  };
  const libraryEmpty = clips !== undefined && clips.length === 0;

  return (
    <div
      className="scrollbar-none h-full overflow-y-auto"
      onDragOver={(e) => {
        if (bulk) return;
        if (Array.from(e.dataTransfer.types).includes("Files")) {
          e.preventDefault();
          setPageDrag(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setPageDrag(false);
      }}
      onDrop={(e) => {
        if (bulk) return;
        e.preventDefault();
        setPageDrag(false);
        const files = Array.from(e.dataTransfer.files);
        if (files.length) {
          choose("pro");
          setBulk({ files });
        }
      }}
      data-testid="library"
    >
      <div className="safe-top mx-auto max-w-5xl px-4 pb-10">
        <header className="flex items-end justify-between pt-6 pb-4">
          <h1 className="text-3xl font-bold tracking-tight">Library</h1>
          {tab === "pro" ? (
            <button
              type="button"
              onClick={() => setBulk({ files: [] })}
              className="min-h-11 rounded-full bg-neon px-4 text-sm font-semibold text-black"
              data-testid="add-pros"
            >
              + Add pro videos
            </button>
          ) : (
            <div className="flex gap-2">
              <ImportVideoButton className="min-h-11 rounded-full border border-line px-4 text-sm font-medium">Import</ImportVideoButton>
              <Link href="/capture" className="flex min-h-11 items-center rounded-full bg-neon px-4 text-sm font-semibold text-black">
                Record
              </Link>
            </div>
          )}
        </header>

        <div className="flex rounded-full bg-elevated p-1" role="tablist" aria-label="Library section">
          {(
            [
              { k: "pro", label: "Pros" },
              { k: "athlete", label: "Swings" },
            ] as const
          ).map((t) => (
            <button
              key={t.k}
              role="tab"
              type="button"
              aria-selected={tab === t.k}
              onClick={() => choose(t.k)}
              className={`min-h-11 flex-1 rounded-full text-sm font-semibold ${tab === t.k ? "bg-white text-black" : "text-muted"}`}
              data-testid={`tab-${t.k}`}
            >
              {t.label}
              <span className="ml-1.5 opacity-60">{counts[t.k]}</span>
            </button>
          ))}
        </div>

        {pageDrag && (
          <div className="mt-4 rounded-2xl border-2 border-dashed border-neon bg-neon/5 py-10 text-center font-semibold text-neon">
            Drop to add pro videos
          </div>
        )}

        {clips === undefined ? (
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-elevated" />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <div className="mt-10 flex flex-col items-center px-6 text-center" data-testid="library-empty">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-elevated text-neon">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" aria-hidden>
                <path d="M4 5h6v14H4zM14 5h6v14h-6z" />
              </svg>
            </div>
            <h2 className="mt-4 text-lg font-semibold">{tab === "pro" ? "No pro swings yet" : "No swings yet"}</h2>
            <p className="mt-1 max-w-xs text-sm text-muted">
              {tab === "pro"
                ? "Add pro videos from your computer or iPad. Drag a bunch in at once."
                : "Record a swing or import one from Photos."}
            </p>
            {libraryEmpty && (
              <SampleClipsButton className="mt-6 min-h-11 rounded-full border border-line px-5 text-sm font-medium" />
            )}
          </div>
        ) : (
          <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            {shown.map((c) => (
              <ClipCard key={c.id} clip={c} href={`/clips/${c.id}/edit`} onMenu={setMenuClip} />
            ))}
          </div>
        )}

        <details className="mt-12 text-sm text-muted">
          <summary className="cursor-pointer py-2">Developer</summary>
          <div className="flex flex-wrap items-center gap-3 py-2">
            <SampleClipsButton className="min-h-11 rounded-full border border-line px-4 text-sm text-white" />
            <span className="text-xs">Adds the sample pro and youth videos to this device.</span>
          </div>
        </details>
      </div>

      <ClipActionSheet clip={menuClip} onClose={() => setMenuClip(null)} />
      {bulk && <BulkImport initialFiles={bulk.files} onClose={() => setBulk(null)} />}
    </div>
  );
}
