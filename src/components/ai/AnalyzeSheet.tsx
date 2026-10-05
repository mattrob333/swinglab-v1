"use client";

// "Analyze" sheet: bottom sheet on a phone, side panel on a tablet. Collects
// athlete info, coach notes (typed or dictated) and the model, then streams the
// analysis, saves it on the device and opens the report. "Both" runs Opus and
// Sol in parallel and opens the side-by-side comparison.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AiError, MODEL_LABEL, appendText, buildAnalyzeRequest, parseAge, runAnalysis, type SnapshotSource } from "@/lib/ai/client";
import { MAX_SNAPSHOTS_PER_ANALYSIS } from "@/lib/ai/contract";
import { listClips, listSnapshots, putAnalysis } from "@/lib/store/local-db";
import { useLocalQuery } from "@/lib/store/hooks";
import type { Analysis, AnalysisModel, Handedness } from "@/lib/types";
import { SnapshotThumb } from "./SnapshotThumb";
import { VoiceNoteButton } from "./VoiceNoteButton";
import { encodeJpeg, inferHandedness, loadSnapshotSources } from "./snapshot-data";
import { useAiStatus } from "./useAiStatus";

type Choice = AnalysisModel | "both";
const AGE_KEY = "swinglab.ai.athleteAge";
const LEVEL_KEY = "swinglab.ai.athleteLevel";
const LEVELS = ["Youth", "Travel", "High school", "College", "Adult"];

function readPref(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writePref(key: string, value: string) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // storage blocked
  }
}

interface Run {
  model: AnalysisModel;
  state: "running" | "done" | "error";
  message: string;
  analysisId: string | null;
}

interface Props {
  snapshotIds: string[];
  onClose: () => void;
}

export function AnalyzeSheet({ snapshotIds, onClose }: Props) {
  const router = useRouter();
  const { gate, status } = useAiStatus();
  const snaps = useLocalQuery(() => listSnapshots(), []);
  const clips = useLocalQuery(() => listClips(), []);
  const selected = (snaps ?? []).filter((s) => snapshotIds.includes(s.id));
  const inferred: Handedness | null = snaps && clips ? inferHandedness(selected, clips) : null;

  const [choice, setChoice] = useState<Choice>("opus");
  const [handedness, setHandedness] = useState<Handedness | null>(null);
  const [age, setAge] = useState(() => (typeof window === "undefined" ? "" : readPref(AGE_KEY)));
  const [level, setLevel] = useState(() => (typeof window === "undefined" ? "" : readPref(LEVEL_KEY)));
  const [coachNotes, setCoachNotes] = useState("");
  const [transcript, setTranscript] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const sources = useRef<SnapshotSource[] | null>(null);

  useEffect(() => () => abort.current?.abort(), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !abort.current && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const side = handedness ?? inferred ?? "L";
  const models: AnalysisModel[] = choice === "both" ? ["opus", "sol"] : [choice];
  const blocked = models.map((m) => gate("analyze", m)).find((g) => !g.enabled);
  const running = runs.some((r) => r.state === "running");
  const tooMany = snapshotIds.length > MAX_SNAPSHOTS_PER_ANALYSIS;

  async function analyze() {
    setError(null);
    const pending = models.filter((m) => !runs.some((r) => r.model === m && r.state === "done"));
    const kept = runs.filter((r) => r.state === "done" && models.includes(r.model));
    setRuns([...kept, ...pending.map((model) => ({ model, state: "running" as const, message: "Preparing snapshots…", analysisId: null }))]);
    const ac = new AbortController();
    abort.current = ac;
    const update = (model: AnalysisModel, patch: Partial<Run>) =>
      setRuns((rs) => rs.map((r) => (r.model === model ? { ...r, ...patch } : r)));

    let base;
    try {
      if (!sources.current) {
        const loaded = await loadSnapshotSources(snapshotIds);
        if (loaded.sources.length === 0) throw new AiError("These snapshots are no longer on this device.");
        sources.current = loaded.sources;
      }
      const ageNum = parseAge(age);
      writePref(AGE_KEY, ageNum ? String(ageNum) : "");
      writePref(LEVEL_KEY, level);
      base = await buildAnalyzeRequest(
        sources.current,
        { model: "opus", athlete: { handedness: side, age: ageNum, level }, coachNotes, transcript },
        encodeJpeg,
      );
    } catch (e) {
      abort.current = null;
      setRuns(kept);
      setError(e instanceof Error ? e.message : "Couldn't prepare the snapshots.");
      return;
    }

    const results = await Promise.all(
      pending.map(async (model) => {
        const id = crypto.randomUUID();
        update(model, { message: "Sending to " + MODEL_LABEL[model] + "…" });
        try {
          const out = await runAnalysis({
            request: { ...base, model },
            analysisId: id,
            signal: ac.signal,
            onStatus: (message) => update(model, { message }),
          });
          const analysis: Analysis = {
            id,
            createdAt: new Date().toISOString(),
            snapshotIds: base.snapshots.map((s) => s.id),
            model,
            modelId: out.modelId,
            coachNotes: base.coachNotes,
            transcript: base.transcript,
            result: out.result,
            drillVideos: [],
            status: "done",
            error: null,
            ownerId: null,
            syncState: "local",
          };
          await putAnalysis(analysis);
          update(model, { state: "done", message: "Done", analysisId: id });
          return { model, id } as const;
        } catch (e) {
          const message = e instanceof Error ? e.message : "The analysis failed.";
          update(model, { state: "error", message });
          return { model, id: null, message } as const;
        }
      }),
    );
    if (ac.signal.aborted) return;
    abort.current = null;
    const done = [...kept.map((r) => ({ model: r.model, id: r.analysisId })), ...results.filter((r) => r.id)];
    const failed = results.filter((r) => !r.id);
    if (failed.length === 0) {
      const byModel = new Map(done.map((d) => [d.model, d.id]));
      const first = byModel.get(models[0])!;
      const second = models[1] ? byModel.get(models[1]) : null;
      router.push(second ? `/analysis/${first}?vs=${second}` : `/analysis/${first}`);
      return;
    }
    setError(failed.map((f) => (models.length > 1 ? `${MODEL_LABEL[f.model]}: ${f.message}` : f.message)).join("\n"));
  }

  function cancel() {
    abort.current?.abort();
    abort.current = null;
    setRuns((rs) => rs.filter((r) => r.state === "done"));
  }

  const doneRun = runs.find((r) => r.state === "done" && r.analysisId);
  const canSubmit = !running && !blocked && !tooMany && snapshotIds.length > 0;

  return (
    <div className="fixed inset-0 z-[60] flex items-end bg-black/60 md:items-stretch md:justify-end" data-testid="analyze-sheet-backdrop" onClick={() => !running && onClose()}>
      <div
        role="dialog"
        aria-label="Analyze snapshots"
        data-testid="analyze-sheet"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92dvh] w-full flex-col rounded-t-3xl border-t border-line bg-surface shadow-2xl md:h-full md:max-h-none md:w-[440px] md:rounded-none md:border-l md:border-t-0"
      >
        <div className="flex shrink-0 justify-center pt-2 md:pt-[max(env(safe-area-inset-top),1rem)]">
          <div className="mb-1 h-1 w-10 rounded-full bg-white/20 md:hidden" aria-hidden />
        </div>
        <header className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2">
          <div>
            <h2 className="text-lg font-bold">Analyze swing</h2>
            <p className="text-xs text-muted">
              {snapshotIds.length} snapshot{snapshotIds.length === 1 ? "" : "s"}
              {status?.remainingToday != null ? ` · ${status.remainingToday} left today` : ""}
            </p>
          </div>
          <button type="button" onClick={running ? cancel : onClose} className="h-11 rounded-full px-4 text-sm font-semibold text-muted" data-testid="analyze-close">
            {running ? "Cancel" : "Close"}
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-3 scrollbar-none">
            {snapshotIds.map((id) => (
              <SnapshotThumb key={id} id={id} className="h-24 w-[72px]" zoomable />
            ))}
          </div>
          {tooMany && <p className="mb-3 text-sm text-red-300">Pick at most {MAX_SNAPSHOTS_PER_ANALYSIS} snapshots.</p>}

          <fieldset className="mb-4" disabled={running}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Athlete</legend>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Bats"
                value={side}
                options={[
                  { value: "L", label: "Left" },
                  { value: "R", label: "Right" },
                ]}
                onChange={(v) => setHandedness(v as Handedness)}
                testId="analyze-handedness"
              />
              <label className="flex h-11 items-center gap-2 rounded-full bg-elevated pl-4 pr-1 text-sm">
                <span className="text-muted">Age</span>
                <input
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={age}
                  onChange={(e) => setAge(e.target.value.replace(/[^0-9]/g, "").slice(0, 2))}
                  placeholder="–"
                  className="h-9 w-12 rounded-full bg-surface text-center text-base outline-none"
                  data-testid="analyze-age"
                />
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2" role="group" aria-label="Level">
              {LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={level === l}
                  onClick={() => setLevel(level === l ? "" : l)}
                  className={`h-11 rounded-full px-4 text-sm font-medium ${level === l ? "bg-neon text-black" : "bg-elevated text-white"}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className="mb-4" disabled={running}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Coach notes</legend>
            <div className="flex items-start gap-2">
              <textarea
                value={coachNotes}
                onChange={(e) => setCoachNotes(e.target.value)}
                rows={3}
                placeholder="What should the AI look at? (e.g. he's late on fastballs)"
                className="min-h-24 w-full flex-1 resize-none rounded-xl border border-line bg-bg px-3 py-2 text-base outline-none focus:border-neon/60"
                data-testid="analyze-notes"
              />
              <VoiceNoteButton onText={(t) => setTranscript((cur) => appendText(cur, t))} bubble="below" testId="analyze-voice" />
            </div>
            {transcript && (
              <label className="mt-2 block">
                <span className="mb-1 block text-xs text-muted">Voice note</span>
                <textarea
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-line bg-bg px-3 py-2 text-base outline-none focus:border-neon/60"
                  data-testid="analyze-transcript"
                />
              </label>
            )}
          </fieldset>

          <fieldset className="mb-2" disabled={running}>
            <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Model</legend>
            <div className="grid grid-cols-1 gap-2" role="radiogroup" aria-label="Model">
              {(
                [
                  { value: "opus", title: MODEL_LABEL.opus, sub: "Default. Detailed coaching report." },
                  { value: "sol", title: MODEL_LABEL.sol, sub: "Second opinion." },
                  { value: "both", title: "Both (compare)", sub: "Runs both and shows them side by side." },
                ] as const
              ).map((o) => {
                const g = o.value === "both" ? [gate("analyze", "opus"), gate("analyze", "sol")].find((x) => !x.enabled) : gate("analyze", o.value);
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="radio"
                    aria-checked={choice === o.value}
                    onClick={() => setChoice(o.value)}
                    className={`flex min-h-14 items-center gap-3 rounded-2xl border px-4 py-2 text-left ${
                      choice === o.value ? "border-neon bg-neon/10" : "border-line bg-elevated"
                    }`}
                    data-testid={`analyze-model-${o.value}`}
                  >
                    <span className={`h-5 w-5 shrink-0 rounded-full border-2 ${choice === o.value ? "border-neon bg-neon" : "border-muted"}`} aria-hidden />
                    <span className="min-w-0">
                      <span className="block font-semibold">{o.title}</span>
                      <span className="block text-xs text-muted">{g && g.enabled === false && status?.available ? g.reason : o.sub}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        </div>

        <footer className="shrink-0 border-t border-line px-4 pb-[max(env(safe-area-inset-bottom),0.75rem)] pt-3">
          {runs.length > 0 && (
            <ul className="mb-3 flex flex-col gap-1.5" aria-live="polite" data-testid="analyze-progress">
              {runs.map((r) => (
                <li key={r.model} className="flex items-center gap-2 text-sm">
                  {r.state === "running" ? (
                    <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-neon border-t-transparent" aria-hidden />
                  ) : (
                    <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${r.state === "done" ? "bg-neon" : "bg-red-400"}`} aria-hidden />
                  )}
                  <span className="shrink-0 font-semibold">{MODEL_LABEL[r.model]}</span>
                  <span className="truncate text-muted" data-testid={`analyze-status-${r.model}`}>
                    {r.message}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p className="mb-3 whitespace-pre-line rounded-xl bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert" data-testid="analyze-error">
              {error}
            </p>
          )}
          {blocked && !running && (
            <p className="mb-2 text-center text-sm text-muted" data-testid="analyze-reason">
              {blocked.reason}
            </p>
          )}
          <div className="flex gap-2">
            {error && doneRun && (
              <button
                type="button"
                onClick={() => router.push(`/analysis/${doneRun.analysisId}`)}
                className="h-12 flex-1 rounded-full bg-elevated font-semibold"
              >
                Open {MODEL_LABEL[doneRun.model]}
              </button>
            )}
            <button
              type="button"
              onClick={analyze}
              disabled={!canSubmit}
              className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-neon font-semibold text-black disabled:bg-elevated disabled:text-muted"
              data-testid="analyze-submit"
            >
              {running ? "Analyzing…" : error ? "Retry" : choice === "both" ? "Analyze with both" : `Analyze with ${choice === "opus" ? "Opus" : "Sol"}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Segmented({
  label,
  value,
  options,
  onChange,
  testId,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  testId?: string;
}) {
  return (
    <div className="flex h-11 items-center gap-1 rounded-full bg-elevated p-1 pl-4 text-sm" role="radiogroup" aria-label={label} data-testid={testId}>
      <span className="mr-1 text-muted">{label}</span>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={`h-9 min-w-14 rounded-full px-3 font-semibold ${value === o.value ? "bg-neon text-black" : "text-white"}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
