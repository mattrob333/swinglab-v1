"use client";

// Snapshot gallery: grid, full-screen viewer with note, share, delete and
// "Open in compare" (restores both clips, times and flips).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { deleteSnapshot, getSnapshotImage, listAnalyses, listClips, listSnapshots, updateSnapshot } from "@/lib/store/local-db";
import { useLocalQuery } from "@/lib/store/hooks";
import type { Analysis, Snapshot } from "@/lib/types";
import { compareHrefForSnapshot, downloadBlob, shareImage } from "@/lib/player/snapshot";
import { MAX_SNAPSHOTS_PER_ANALYSIS } from "@/lib/ai/contract";
import { MODEL_LABEL, appendText } from "@/lib/ai/client";
import { AnalyzeSheet } from "@/components/ai/AnalyzeSheet";
import { VoiceNoteButton } from "@/components/ai/VoiceNoteButton";
import { useAiStatus } from "@/components/ai/useAiStatus";
import { Icon, ICONS } from "./icons";

function useSnapshotImage(id: string | null): { url: string | null; blob: Blob | null } {
  const [state, setState] = useState<{ url: string | null; blob: Blob | null }>({ url: null, blob: null });
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let url: string | null = null;
    getSnapshotImage(id).then((b) => {
      if (cancelled || !b) return;
      url = URL.createObjectURL(b);
      setState({ url, blob: b });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return state;
}

export function SnapsGallery() {
  const snaps = useLocalQuery(() => listSnapshots(), []);
  const clips = useLocalQuery(() => listClips(), []);
  const analyses = useLocalQuery(() => listAnalyses(), []);
  const [openId, setOpenId] = useState<string | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [sheetIds, setSheetIds] = useState<string[] | null>(null);
  const [limitHint, setLimitHint] = useState(false);
  const { gate } = useAiStatus();
  const analyzeGate = gate("analyze");
  const titles = new Map((clips ?? []).map((c) => [c.id, c.title]));
  const open = snaps?.find((s) => s.id === openId) ?? null;
  const analysesBySnap = new Map<string, Analysis[]>();
  for (const a of analyses ?? []) {
    for (const id of a.snapshotIds) analysesBySnap.set(id, [...(analysesBySnap.get(id) ?? []), a]);
  }
  // Drop selections whose snapshot was deleted.
  const live = selected.filter((id) => snaps?.some((s) => s.id === id) ?? true);

  const toggle = (id: string) => {
    if (live.includes(id)) {
      setSelected(live.filter((x) => x !== id));
      setLimitHint(false);
    } else if (live.length >= MAX_SNAPSHOTS_PER_ANALYSIS) {
      setLimitHint(true);
    } else {
      setSelected([...live, id]);
    }
  };

  const exitSelect = () => {
    setSelecting(false);
    setSelected([]);
    setLimitHint(false);
  };

  return (
    <div className="absolute inset-0 flex flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto safe-top">
        <header className="flex items-center gap-2 px-4 pb-3 pt-4">
          <h1 className="text-2xl font-bold">Snaps</h1>
          <span className="text-sm text-muted">{snaps ? `${snaps.length}` : ""}</span>
          <div className="flex-1" />
          <Link href="/analysis" className="flex h-11 items-center gap-1.5 rounded-full bg-elevated px-4 text-sm font-semibold" data-testid="snaps-analyses-link">
            Analyses
            {analyses && analyses.length > 0 && <span className="text-neon">{analyses.length}</span>}
          </Link>
          {snaps && snaps.length > 0 && (
            <button
              type="button"
              onClick={() => (selecting ? exitSelect() : setSelecting(true))}
              className={`h-11 rounded-full px-4 text-sm font-semibold ${selecting ? "bg-neon text-black" : "bg-elevated"}`}
              data-testid="snaps-select"
            >
              {selecting ? "Done" : "Select"}
            </button>
          )}
        </header>
        {selecting && (
          <p className="px-4 pb-2 text-sm text-muted">Pick 1–{MAX_SNAPSHOTS_PER_ANALYSIS} snapshots of the same swing or moments to analyze.</p>
        )}
        {snaps && snaps.length === 0 && (
          <div className="flex flex-col items-center gap-4 px-6 pt-16 text-center">
            <p className="text-sm text-muted">No snapshots yet. On the compare screen, line up both swings and tap the camera.</p>
            <Link href="/compare" className="flex h-12 items-center rounded-full bg-neon px-6 font-semibold text-black">
              Go to compare
            </Link>
          </div>
        )}
        <ul className="grid grid-cols-2 gap-2 px-2 pb-6 sm:grid-cols-3 lg:grid-cols-4" data-testid="snaps-grid">
          {snaps?.map((s) => (
            <li key={s.id}>
              <SnapTile
                snap={s}
                caption={[titles.get(s.topClipId ?? ""), titles.get(s.bottomClipId ?? "")].filter(Boolean).join(" vs ")}
                analysisCount={analysesBySnap.get(s.id)?.length ?? 0}
                selectIndex={selecting ? live.indexOf(s.id) : null}
                onOpen={() => (selecting ? toggle(s.id) : setOpenId(s.id))}
              />
            </li>
          ))}
        </ul>
      </div>
      {selecting && (
        <div className="shrink-0 border-t border-line bg-surface/95 px-3 pb-3 pt-2 backdrop-blur" data-testid="select-bar">
          {(limitHint || !analyzeGate.enabled) && (
            <p className="pb-2 text-center text-xs text-muted" data-testid="select-reason">
              {limitHint ? `Up to ${MAX_SNAPSHOTS_PER_ANALYSIS} snapshots per analysis.` : analyzeGate.reason}
            </p>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={exitSelect} className="h-12 rounded-full px-4 font-semibold text-muted">
              Cancel
            </button>
            <span className="flex-1 text-center text-sm text-muted" data-testid="select-count">
              {live.length} selected
            </span>
            <button
              type="button"
              onClick={() => setSheetIds(live)}
              disabled={live.length === 0 || !analyzeGate.enabled}
              className="h-12 rounded-full bg-neon px-6 font-semibold text-black disabled:bg-elevated disabled:text-muted"
              data-testid="snaps-analyze"
            >
              Analyze
            </button>
          </div>
        </div>
      )}
      {open && (
        <SnapViewer
          key={open.id}
          snap={open}
          analyses={analysesBySnap.get(open.id) ?? []}
          // A clip this snapshot shows was deleted: compare would open something else.
          clipMissing={clips !== undefined && [open.topClipId, open.bottomClipId].some((id) => id && !titles.has(id))}
          onClose={() => setOpenId(null)}
        />
      )}
      {sheetIds && <AnalyzeSheet snapshotIds={sheetIds} onClose={() => setSheetIds(null)} />}
    </div>
  );
}

function SnapTile({
  snap,
  caption,
  analysisCount,
  selectIndex,
  onOpen,
}: {
  snap: Snapshot;
  caption: string;
  analysisCount: number;
  /** null when not selecting; -1 when selectable but not selected. */
  selectIndex: number | null;
  onOpen: () => void;
}) {
  const { url } = useSnapshotImage(snap.id);
  const selected = selectIndex !== null && selectIndex >= 0;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-pressed={selectIndex !== null ? selected : undefined}
      className={`relative block w-full overflow-hidden rounded-xl border bg-surface text-left ${selected ? "border-neon ring-2 ring-neon" : "border-line"}`}
      data-testid="snap-tile"
    >
      <div className="aspect-[3/4] w-full bg-black">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={snap.note || "Snapshot"} className="h-full w-full object-contain" draggable={false} />
        )}
      </div>
      {selectIndex !== null && (
        <span
          className={`absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full border-2 text-sm font-bold ${
            selected ? "border-neon bg-neon text-black" : "border-white/80 bg-black/40"
          }`}
          aria-hidden
        >
          {selected ? selectIndex + 1 : ""}
        </span>
      )}
      {analysisCount > 0 && selectIndex === null && (
        <span className="absolute left-2 top-2 rounded-full bg-black/70 px-2 py-0.5 text-[11px] font-semibold text-neon" data-testid="snap-tile-analyses">
          AI {analysisCount}
        </span>
      )}
      <div className="px-2 py-1.5">
        <div className="truncate text-xs font-semibold">{caption || "Snapshot"}</div>
        <div className="truncate text-[11px] text-muted">{snap.note || new Date(snap.createdAt).toLocaleString()}</div>
      </div>
    </button>
  );
}

function SnapViewer({
  snap,
  analyses,
  clipMissing,
  onClose,
}: {
  snap: Snapshot;
  analyses: Analysis[];
  clipMissing: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { url, blob } = useSnapshotImage(snap.id);
  const [note, setNote] = useState(snap.note);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveNote = (v: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void updateSnapshot(snap.id, { note: v }), 300);
  };

  const share = async () => {
    if (!blob) return;
    const name = `swinglab-${snap.id.slice(0, 8)}.jpg`;
    if (!(await shareImage(blob, name, note || undefined))) downloadBlob(blob, name);
  };

  const remove = async () => {
    if (!window.confirm("Delete this snapshot?")) return;
    await deleteSnapshot(snap.id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black safe-top safe-bottom" role="dialog" aria-label="Snapshot" data-testid="snap-viewer">
      <div className="flex h-14 shrink-0 items-center justify-between px-2">
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-white">
          <Icon d={ICONS.close} />
        </button>
        <span className="text-xs text-muted">{new Date(snap.createdAt).toLocaleString()}</span>
        <button type="button" onClick={remove} aria-label="Delete" className="flex h-11 w-11 items-center justify-center rounded-full text-red-400" data-testid="snap-delete">
          <Icon d={ICONS.trash} />
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={note || "Snapshot"} className="absolute inset-0 h-full w-full object-contain" />
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 p-3">
        {analyses.length > 0 && (
          <div className="-mx-3 flex gap-2 overflow-x-auto px-3 scrollbar-none" data-testid="snap-analyses">
            {analyses.map((a) => (
              <Link
                key={a.id}
                href={`/analysis/${a.id}`}
                className="flex h-11 shrink-0 items-center gap-1.5 rounded-full border border-neon/40 bg-neon/10 px-4 text-sm font-semibold text-neon"
                data-testid="snap-analysis-chip"
              >
                {MODEL_LABEL[a.model]} · {new Date(a.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </Link>
            ))}
          </div>
        )}
        <div className="flex items-start gap-2">
          <textarea
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              saveNote(e.target.value);
            }}
            rows={2}
            placeholder="Note"
            className="min-w-0 flex-1 resize-none rounded-xl border border-line bg-surface px-3 py-2 text-base outline-none focus:border-neon/60"
            data-testid="snap-note"
          />
          <VoiceNoteButton
            testId="snap-voice"
            onText={(t) => {
              const next = appendText(note, t);
              setNote(next);
              if (timer.current) clearTimeout(timer.current);
              void updateSnapshot(snap.id, { note: next });
            }}
          />
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={share} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-elevated font-semibold">
            <Icon d={ICONS.share} className="h-5 w-5" /> Share
          </button>
          <button
            type="button"
            onClick={() => router.push(compareHrefForSnapshot(snap))}
            disabled={clipMissing}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-neon font-semibold text-black disabled:bg-elevated disabled:text-muted"
            data-testid="snap-open-compare"
          >
            <Icon d={ICONS.compare} className="h-5 w-5" /> {clipMissing ? "Clip was deleted" : "Open in compare"}
          </button>
        </div>
      </div>
    </div>
  );
}
