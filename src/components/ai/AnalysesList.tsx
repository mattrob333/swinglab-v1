"use client";

// Past analyses, newest first.

import Link from "next/link";
import { MODEL_LABEL } from "@/lib/ai/client";
import { listAnalyses } from "@/lib/store/local-db";
import { useLocalQuery } from "@/lib/store/hooks";
import { formatReportDate } from "./AnalysisReport";
import { SnapshotThumb } from "./SnapshotThumb";

export function AnalysesList() {
  const analyses = useLocalQuery(() => listAnalyses(), []);
  return (
    <div className="absolute inset-0 overflow-y-auto safe-top" data-testid="analyses-list">
      <header className="flex items-center gap-2 px-2 pb-3 pt-2">
        <Link href="/snaps" className="flex h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          Snaps
        </Link>
        <h1 className="flex-1 text-2xl font-bold">Analyses</h1>
        <span className="px-3 text-sm text-muted">{analyses ? analyses.length : ""}</span>
      </header>
      {analyses && analyses.length === 0 && (
        <div className="flex flex-col items-center gap-4 px-6 pt-16 text-center">
          <p className="text-sm text-muted">
            No analyses yet. In Snaps, tap <span className="font-semibold text-white">Select</span>, pick up to 6 snapshots and tap{" "}
            <span className="font-semibold text-white">Analyze</span>.
          </p>
          <Link href="/snaps" className="flex h-12 items-center rounded-full bg-neon px-6 font-semibold text-black">
            Go to Snaps
          </Link>
        </div>
      )}
      <ul className="mx-auto grid max-w-5xl gap-2 px-3 pb-6 md:grid-cols-2">
        {analyses?.map((a) => (
          <li key={a.id}>
            <Link href={`/analysis/${a.id}`} className="flex gap-3 rounded-2xl border border-line bg-surface p-3" data-testid="analysis-item">
              <div className="flex shrink-0 -space-x-6">
                {a.snapshotIds.slice(0, 3).map((id) => (
                  <SnapshotThumb key={id} id={id} className="h-20 w-[60px] shadow-lg" />
                ))}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-neon/15 px-2 py-0.5 text-[11px] font-bold text-neon">{MODEL_LABEL[a.model]}</span>
                  <span className="truncate text-[11px] text-muted">{formatReportDate(a.createdAt)}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-sm leading-snug">
                  {a.result?.summary || (a.status === "error" ? a.error || "Analysis failed" : "No report")}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {a.snapshotIds.length} snapshot{a.snapshotIds.length === 1 ? "" : "s"}
                  {a.result ? ` · ${a.result.issues.length} issue${a.result.issues.length === 1 ? "" : "s"}` : ""}
                  {a.drillVideos.length ? ` · ${a.drillVideos.length} videos` : ""}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
