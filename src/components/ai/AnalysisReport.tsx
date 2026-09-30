"use client";

// Coaching report for one analysis: summary, strengths, issues by severity
// (with phase badges and the snapshots that show them), drills, cues and the
// next focus, plus drill videos, share and delete.

import { useState } from "react";
import {
  AiError,
  MODEL_LABEL,
  PHASE_LABEL,
  SEVERITY_LABEL,
  analysisShareText,
  drillsRequestFor,
  findDrillVideos,
  groupIssuesBySeverity,
} from "@/lib/ai/client";
import { deleteAnalysis, listClips, listSnapshots, putAnalysis } from "@/lib/store/local-db";
import { useLocalQuery } from "@/lib/store/hooks";
import type { Analysis, SwingIssue } from "@/lib/types";
import { DrillVideos } from "./DrillVideos";
import { SnapshotThumb } from "./SnapshotThumb";
import { inferHandedness } from "./snapshot-data";
import { useAiStatus } from "./useAiStatus";

const SEVERITY_STYLE: Record<SwingIssue["severity"], string> = {
  high: "bg-red-500/15 text-red-300 border-red-500/30",
  medium: "bg-amber-400/15 text-amber-200 border-amber-400/30",
  low: "bg-sky-400/10 text-sky-200 border-sky-400/25",
};

export function formatReportDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

interface Props {
  analysis: Analysis;
  /** Called after the analysis is deleted. */
  onDeleted: () => void;
  /** Tighter layout when shown in a side-by-side comparison. */
  compact?: boolean;
}

export function AnalysisReport({ analysis, onDeleted, compact = false }: Props) {
  const r = analysis.result;
  const { gate } = useAiStatus();
  const drillsGate = gate("drills");
  const snaps = useLocalQuery(() => listSnapshots(), []);
  const clips = useLocalQuery(() => listClips(), []);
  const onDevice = new Set((snaps ?? []).map((s) => s.id));
  const [finding, setFinding] = useState(false);
  const [drillError, setDrillError] = useState<string | null>(null);
  const [shareNote, setShareNote] = useState<string | null>(null);

  async function findVideos() {
    if (!r) return;
    setFinding(true);
    setDrillError(null);
    try {
      const selected = (snaps ?? []).filter((s) => analysis.snapshotIds.includes(s.id));
      const handedness = inferHandedness(selected, clips ?? []);
      const videos = await findDrillVideos(drillsRequestFor(r, handedness));
      if (videos.length === 0) setDrillError("No videos found for these issues.");
      else await putAnalysis({ ...analysis, drillVideos: videos });
    } catch (e) {
      setDrillError(e instanceof AiError ? e.message : "Couldn't find drill videos.");
    } finally {
      setFinding(false);
    }
  }

  async function share() {
    const text = analysisShareText(analysis);
    try {
      if (navigator.share) {
        await navigator.share({ title: "SwingLab swing report", text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setShareNote("Report copied");
    } catch (e) {
      if ((e as { name?: string })?.name === "AbortError") return;
      setShareNote("Couldn't share");
    }
    setTimeout(() => setShareNote(null), 2500);
  }

  async function remove() {
    if (!window.confirm("Delete this analysis?")) return;
    await deleteAnalysis(analysis.id);
    onDeleted();
  }

  const pad = compact ? "px-3" : "px-4";

  return (
    <article className={`flex flex-col gap-5 pb-8 ${pad}`} data-testid="analysis-report" data-model={analysis.model}>
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-neon px-2.5 py-1 text-xs font-bold text-black" data-testid="report-model">
            {MODEL_LABEL[analysis.model]}
          </span>
          <span className="truncate text-xs text-muted">{formatReportDate(analysis.createdAt)}</span>
        </div>
        {analysis.modelId && <span className="text-[11px] text-muted/70">{analysis.modelId}</span>}
      </header>

      {!r ? (
        <p className="rounded-2xl bg-red-500/10 p-4 text-sm text-red-300">{analysis.error || "This analysis has no report."}</p>
      ) : (
        <>
          <section>
            <p className={`${compact ? "text-base" : "text-lg"} leading-snug`} data-testid="report-summary">
              {r.summary}
            </p>
            <div className="mt-3 flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {analysis.snapshotIds.map((id) =>
                onDevice.has(id) || snaps === undefined ? <SnapshotThumb key={id} id={id} className="h-20 w-[60px]" zoomable /> : null,
              )}
            </div>
          </section>

          {r.strengths.length > 0 && (
            <section>
              <SectionTitle>Strengths</SectionTitle>
              <ul className="flex flex-col gap-1.5">
                {r.strengths.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm leading-snug">
                    <span className="mt-0.5 text-neon" aria-hidden>
                      ✓
                    </span>
                    <span>{s}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r.issues.length > 0 && (
            <section data-testid="report-issues">
              <SectionTitle>What to fix</SectionTitle>
              <div className="flex flex-col gap-4">
                {groupIssuesBySeverity(r.issues).map((g) => (
                  <div key={g.severity}>
                    <h4 className="mb-2 text-sm font-semibold text-white/80">{SEVERITY_LABEL[g.severity]}</h4>
                    <ul className="flex flex-col gap-2">
                      {g.issues.map((issue, i) => (
                        <li key={i} className={`rounded-2xl border p-3 ${SEVERITY_STYLE[issue.severity]}`} data-testid="report-issue" data-severity={issue.severity}>
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-semibold text-white">{issue.title}</span>
                            <span className="rounded-full bg-black/30 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
                              {PHASE_LABEL[issue.phase]}
                            </span>
                          </div>
                          <p className="mt-1 text-sm leading-snug text-white/85">{issue.detail}</p>
                          {issue.snapshotIds.some((id) => onDevice.has(id)) && (
                            <div className="mt-2 flex gap-2 overflow-x-auto scrollbar-none">
                              {issue.snapshotIds
                                .filter((id) => onDevice.has(id))
                                .map((id) => (
                                  <SnapshotThumb key={id} id={id} className="h-16 w-12" zoomable label={`Snapshot showing ${issue.title}`} />
                                ))}
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          )}

          {r.drills.length > 0 && (
            <section>
              <SectionTitle>Drills</SectionTitle>
              <ul className={`grid gap-2 ${compact ? "" : "lg:grid-cols-2"}`}>
                {r.drills.map((d, i) => (
                  <li key={i} className="rounded-2xl border border-line bg-surface p-3" data-testid="report-drill">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold">{d.name}</span>
                      {d.reps && <span className="shrink-0 rounded-full bg-elevated px-2 py-0.5 text-xs font-semibold text-neon">{d.reps}</span>}
                    </div>
                    {d.why && <p className="mt-1 text-xs text-muted">{d.why}</p>}
                    {d.howTo && <p className="mt-1.5 text-sm leading-snug">{d.howTo}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r.cues.length > 0 && (
            <section>
              <SectionTitle>Cues</SectionTitle>
              <ul className="flex flex-wrap gap-2" data-testid="report-cues">
                {r.cues.map((c, i) => (
                  <li key={i} className="rounded-2xl border border-neon/40 bg-neon/10 px-4 py-3 text-xl font-bold leading-tight text-neon">
                    “{c}”
                  </li>
                ))}
              </ul>
            </section>
          )}

          {r.nextFocus && (
            <section className="rounded-2xl border border-neon/30 bg-neon/5 p-4">
              <SectionTitle>Next focus</SectionTitle>
              <p className="text-base font-semibold leading-snug" data-testid="report-next-focus">
                {r.nextFocus}
              </p>
            </section>
          )}

          <section>
            <SectionTitle>Drill videos</SectionTitle>
            {analysis.drillVideos.length > 0 && <DrillVideos videos={analysis.drillVideos} />}
            {r.issues.length > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={findVideos}
                  disabled={!drillsGate.enabled || finding}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-elevated font-semibold disabled:text-muted"
                  data-testid="find-drills"
                >
                  {finding && <span className="h-4 w-4 animate-spin rounded-full border-2 border-neon border-t-transparent" aria-hidden />}
                  {finding ? "Finding videos…" : analysis.drillVideos.length ? "Find different videos" : "Find drill videos"}
                </button>
                {!drillsGate.enabled && <p className="mt-1.5 text-center text-xs text-muted">{drillsGate.reason}</p>}
                {drillError && (
                  <p className="mt-1.5 text-center text-xs text-red-300" role="alert">
                    {drillError}
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}

      {(analysis.coachNotes || analysis.transcript) && (
        <details className="rounded-2xl border border-line bg-surface p-3 text-sm">
          <summary className="flex min-h-11 cursor-pointer items-center font-semibold">Your notes</summary>
          {analysis.coachNotes && <p className="mt-1 whitespace-pre-line text-white/80">{analysis.coachNotes}</p>}
          {analysis.transcript && <p className="mt-2 whitespace-pre-line text-white/60">Voice note: {analysis.transcript}</p>}
        </details>
      )}

      <div className="flex gap-2">
        <button type="button" onClick={share} disabled={!r} className="h-12 flex-1 rounded-full bg-elevated font-semibold disabled:text-muted" data-testid="report-share">
          {shareNote ?? "Share"}
        </button>
        <button type="button" onClick={remove} className="h-12 rounded-full px-5 font-semibold text-red-400" data-testid="report-delete">
          Delete
        </button>
      </div>
    </article>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">{children}</h3>;
}
