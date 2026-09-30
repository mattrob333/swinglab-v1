"use client";

// The compare screen: pro on top (left in side layout), athlete below (right).
// Each pane has its own picker, video, scrubber and frame step; a Link toggle
// makes either scrubber move both in real (slo-mo corrected) time.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { listClips } from "@/lib/store/local-db";
import { useLocalQuery } from "@/lib/store/hooks";
import { loadSampleClips } from "@/lib/dev/samples";
import type { Clip, CompareState } from "@/lib/types";
import { ComparePlayers } from "@/lib/player/compare-controller";
import { loadCompareState, saveCompareState } from "@/lib/player/compare-state";
import type { PaneId } from "@/lib/player/link";
import type { PlaybackRate } from "@/lib/player/engine";
import { composeSnapshot, saveSnapshot, type SnapshotPane } from "@/lib/player/snapshot";
import { VideoPane, type PaneHandle } from "./VideoPane";
import { Scrubber } from "./Scrubber";
import { PickerStrip } from "./PickerStrip";
import { SnapshotToast } from "./SnapshotToast";
import { Icon, ICONS } from "./icons";

type Layout = CompareState["layout"];

function autoFlip(pro: Clip | undefined | null, athlete: Clip | undefined | null): boolean {
  return !!pro && !!athlete && pro.handedness !== athlete.handedness;
}

function num(v: string | null): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

const landscapeQuery = "(orientation: landscape) and (min-width: 600px)";
function subscribeOrientation(cb: () => void) {
  const mq = window.matchMedia(landscapeQuery);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const getLandscape = () => window.matchMedia(landscapeQuery).matches;
const getLandscapeServer = () => false;

export function CompareScreen() {
  const params = useSearchParams();
  const clips = useLocalQuery(() => listClips(), []);
  const [players] = useState(() => new ComparePlayers());
  useEffect(() => () => players.destroy(), [players]);

  const [ready, setReady] = useState(false);
  const [topId, setTopId] = useState<string | null>(null);
  const [bottomId, setBottomId] = useState<string | null>(null);
  const [topFlipped, setTopFlipped] = useState(false);
  const [bottomFlipped, setBottomFlipped] = useState(false);
  const [linked, setLinkedState] = useState(false);
  const [athleteOpen, setAthleteOpen] = useState(false);
  const [toast, setToast] = useState<{ id: string; blob: Blob } | null>(null);
  const [flash, setFlash] = useState(0);
  const [busy, setBusy] = useState(false);
  const [startTimes, setStartTimes] = useState<{ top?: number; bottom?: number }>({});
  const pendingLink = useRef(false);
  const activePane = useRef<PaneId>("bottom");
  const topHandle = useRef<PaneHandle | null>(null);
  const bottomHandle = useRef<PaneHandle | null>(null);

  const landscape = useSyncExternalStore(subscribeOrientation, getLandscape, getLandscapeServer);
  const [layoutOverride, setLayoutOverride] = useState<{ landscape: boolean; layout: Layout } | null>(null);
  const layout: Layout =
    layoutOverride && layoutOverride.landscape === landscape ? layoutOverride.layout : landscape ? "side" : "stacked";

  const byId = useMemo(() => new Map((clips ?? []).map((c) => [c.id, c])), [clips]);
  const pros = useMemo(() => (clips ?? []).filter((c) => c.kind === "pro"), [clips]);
  const athletes = useMemo(
    () => (clips ?? []).filter((c) => c.kind === "athlete").sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [clips],
  );
  const topClip = (topId && byId.get(topId)) || null;
  const bottomClip = (bottomId && byId.get(bottomId)) || null;

  // ---- initial selection: query params > saved state > defaults -------------
  useEffect(() => {
    if (ready || !clips || clips.length === 0) return;
    const stored = loadCompareState();
    const valid = (id: string | null | undefined, kind: Clip["kind"]) => (id && byId.get(id)?.kind === kind ? id : null);
    const qTop = valid(params.get("top"), "pro");
    const qBottom = valid(params.get("bottom"), "athlete");
    const fromQuery = !!(qTop || qBottom);
    const top = qTop ?? valid(stored?.topClipId, "pro") ?? pros[0]?.id ?? null;
    const bottom = qBottom ?? valid(stored?.bottomClipId, "athlete") ?? athletes[0]?.id ?? null;

    const times: { top?: number; bottom?: number } = {};
    if (fromQuery) {
      times.top = num(params.get("tt"));
      times.bottom = num(params.get("bt"));
    } else if (stored) {
      if (stored.topClipId === top) times.top = stored.topTime;
      if (stored.bottomClipId === bottom) times.bottom = stored.bottomTime;
    }

    const auto = autoFlip(top ? byId.get(top) : null, bottom ? byId.get(bottom) : null);
    let tf = auto;
    let bf = false;
    if (fromQuery) {
      tf = params.get("tf") != null ? params.get("tf") === "1" : auto;
      bf = params.get("bf") === "1";
    } else if (stored && stored.topClipId === top && stored.bottomClipId === bottom) {
      tf = stored.topFlipped;
      bf = stored.bottomFlipped;
      pendingLink.current = stored.linked;
    }
    /* eslint-disable react-hooks/set-state-in-effect */
    setStartTimes(times);
    setTopId(top);
    setBottomId(bottom);
    setTopFlipped(tf);
    setBottomFlipped(bf);
    setReady(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [ready, clips, byId, pros, athletes, params]);

  // Fill an empty pane when clips appear later (e.g. after loading samples).
  useEffect(() => {
    if (!ready) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!topClip && pros[0]) {
      setTopId(pros[0].id);
      setTopFlipped(autoFlip(pros[0], bottomClip));
    }
    if (!bottomClip && athletes[0]) {
      setBottomId(athletes[0].id);
      setTopFlipped(autoFlip(topClip ?? pros[0], athletes[0]));
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [ready, topClip, bottomClip, pros, athletes]);

  // Mirror link state from the controller.
  useEffect(() => players.subscribe(() => setLinkedState(players.linked)), [players]);

  const onClipBound = useCallback(() => {
    const e = players.engines;
    if (!e.top.clip || !e.bottom.clip) return;
    if (pendingLink.current) {
      pendingLink.current = false;
      players.setLinked(true);
    } else {
      players.relink();
    }
  }, [players]);

  // ---- selection -------------------------------------------------------------
  const selectTop = useCallback(
    (id: string) => {
      setStartTimes((s) => ({ ...s, top: undefined }));
      setTopId(id);
      setTopFlipped(autoFlip(byId.get(id), bottomClip));
    },
    [byId, bottomClip],
  );
  const selectBottom = useCallback(
    (id: string) => {
      setStartTimes((s) => ({ ...s, bottom: undefined }));
      setBottomId(id);
      setTopFlipped(autoFlip(topClip, byId.get(id)));
    },
    [byId, topClip],
  );

  // ---- persistence -------------------------------------------------------------
  const stateRef = useRef({ topId, bottomId, topFlipped, bottomFlipped, layout });
  useEffect(() => {
    stateRef.current = { topId, bottomId, topFlipped, bottomFlipped, layout };
  });
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const save = () => {
      const s = stateRef.current;
      if (!s.topId && !s.bottomId) return;
      saveCompareState({
        topClipId: s.topId,
        bottomClipId: s.bottomId,
        topTime: players.engines.top.time,
        bottomTime: players.engines.bottom.time,
        topFlipped: s.topFlipped,
        bottomFlipped: s.bottomFlipped,
        linked: players.linked,
        layout: s.layout,
      });
    };
    const soon = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(save, 500);
    };
    const unsubs = [players.subscribe(soon), players.engines.top.subscribe(soon), players.engines.bottom.subscribe(soon)];
    window.addEventListener("pagehide", save);
    return () => {
      unsubs.forEach((u) => u());
      window.removeEventListener("pagehide", save);
      if (timer) clearTimeout(timer);
      save();
    };
  }, [players]);
  useEffect(() => {
    if (!ready) return;
    const s = stateRef.current;
    saveCompareState({
      topClipId: s.topId,
      bottomClipId: s.bottomId,
      topTime: players.engines.top.time,
      bottomTime: players.engines.bottom.time,
      topFlipped: s.topFlipped,
      bottomFlipped: s.bottomFlipped,
      linked: players.linked,
      layout: s.layout,
    });
  }, [ready, topId, bottomId, topFlipped, bottomFlipped, layout, players]);

  // ---- keyboard: ←/→ frame step, space play on the last-touched pane ------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        e.preventDefault();
        players.step(activePane.current, e.key === "ArrowRight" ? 1 : -1);
      } else if (e.key === " ") {
        e.preventDefault();
        players.togglePlay(activePane.current);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [players]);

  // ---- snapshot ----------------------------------------------------------------
  const takeSnapshot = async () => {
    if (busy) return;
    const panes: SnapshotPane[] = [];
    const meta = { top: { clipId: topId, time: null as number | null, flipped: topFlipped }, bottom: { clipId: bottomId, time: null as number | null, flipped: bottomFlipped } };
    for (const [pane, clip, handle, flipped] of [
      ["top", topClip, topHandle.current, topFlipped],
      ["bottom", bottomClip, bottomHandle.current, bottomFlipped],
    ] as const) {
      const engine = players.engines[pane];
      if (!clip || !handle?.el || !engine.video) continue;
      const time = engine.time;
      meta[pane].time = time;
      panes.push({ video: engine.video, paneEl: handle.el, clip, crop: handle.crop, flipped, time, fps: engine.fps });
    }
    if (!panes.length) return;
    setBusy(true);
    try {
      players.pauseAll();
      setFlash((f) => f + 1);
      const blob = await composeSnapshot(panes);
      const snap = await saveSnapshot(blob, meta.top, meta.bottom);
      setToast({ id: snap.id, blob });
    } finally {
      setBusy(false);
    }
  };

  // ---- render --------------------------------------------------------------------
  if (clips === undefined) {
    return <div className="absolute inset-0 bg-bg" />;
  }
  if (clips.length === 0) {
    return <EmptyState />;
  }

  const setRate = (pane: PaneId) => (r: PlaybackRate) => players.setRate(pane, r);
  const side = layout === "side";

  const topSection = (
    <PaneSection
      pane="top"
      players={players}
      clip={topClip}
      flipped={topFlipped}
      onFlip={() => setTopFlipped((f) => !f)}
      startTime={startTimes.top}
      linked={linked}
      handleRef={topHandle}
      onInteract={() => (activePane.current = "top")}
      onClipBound={onClipBound}
      onRate={setRate("top")}
      header={
        pros.length ? (
          <PickerStrip clips={pros} selectedId={topId} onSelect={selectTop} testId="pro-picker" label="Pro swings" />
        ) : (
          <div className="flex h-14 items-center justify-center gap-3 text-xs text-muted">
            No pro swings yet
            <Link href="/library" className="rounded-lg bg-elevated px-3 py-2 font-semibold text-white">
              Library
            </Link>
          </div>
        )
      }
      empty="Pick a pro swing"
    />
  );

  const bottomSection = (
    <PaneSection
      pane="bottom"
      players={players}
      clip={bottomClip}
      flipped={bottomFlipped}
      onFlip={() => setBottomFlipped((f) => !f)}
      startTime={startTimes.bottom}
      linked={linked}
      handleRef={bottomHandle}
      onInteract={() => (activePane.current = "bottom")}
      onClipBound={onClipBound}
      onRate={setRate("bottom")}
      header={
        <div>
          <button
            type="button"
            onClick={() => setAthleteOpen((o) => !o)}
            aria-expanded={athleteOpen}
            data-testid="athlete-picker-toggle"
            className="flex h-11 w-full items-center justify-center gap-1 px-3 text-sm font-semibold"
          >
            <span className="truncate">{bottomClip?.title ?? (athletes.length ? "Pick a swing" : "No swings yet")}</span>
            {bottomClip && <span className="text-[11px] font-bold text-muted">{bottomClip.handedness}</span>}
            <Icon d={athleteOpen ? ICONS.chevronUp : ICONS.chevronDown} className="h-4 w-4 text-muted" />
          </button>
          {athleteOpen && athletes.length > 0 && (
            <PickerStrip clips={athletes} selectedId={bottomId} onSelect={selectBottom} testId="athlete-picker" label="Your swings" />
          )}
        </div>
      }
      empty={athletes.length ? "Pick a swing" : "Record a swing to compare"}
    />
  );

  const controls = (
    <div
      className={`flex shrink-0 items-center justify-center gap-2 ${side ? "w-16 flex-col py-2" : "h-12 px-2"}`}
      data-testid="compare-controls"
    >
      <button
        type="button"
        aria-label={side ? "Stack panes" : "Side by side"}
        data-testid="layout-toggle"
        onClick={() => setLayoutOverride({ landscape, layout: side ? "stacked" : "side" })}
        className="flex h-11 w-11 items-center justify-center rounded-xl text-muted active:bg-white/10"
      >
        <Icon d={side ? ICONS.stacked : ICONS.side} />
      </button>
      <button
        type="button"
        aria-pressed={linked}
        data-testid="link-toggle"
        onClick={() => players.setLinked(!linked)}
        disabled={!topClip || !bottomClip}
        className={`flex h-11 items-center justify-center gap-1.5 rounded-full font-semibold transition-colors disabled:opacity-40 ${
          side ? "w-12 flex-col text-[10px]" : "min-w-28 px-4 text-sm"
        } ${linked ? "bg-neon text-black shadow-[0_0_16px_rgba(200,240,0,0.35)]" : "bg-elevated text-white"}`}
      >
        <Icon d={linked ? ICONS.link : ICONS.unlink} className="h-5 w-5" />
        {linked ? "Linked" : "Link"}
      </button>
      <button
        type="button"
        aria-label="Take snapshot"
        data-testid="snapshot-button"
        onClick={takeSnapshot}
        disabled={busy || (!topClip && !bottomClip)}
        className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black active:scale-95 disabled:opacity-40"
      >
        <Icon d={ICONS.camera} className="h-6 w-6" />
      </button>
    </div>
  );

  return (
    <div
      className={`absolute inset-0 flex bg-bg safe-top ${side ? "flex-row" : "flex-col"}`}
      style={{ paddingLeft: "env(safe-area-inset-left)", paddingRight: "env(safe-area-inset-right)" }}
      data-layout={layout}
      data-testid="compare-screen"
    >
      {topSection}
      {controls}
      {bottomSection}
      {flash > 0 && <div key={flash} className="pointer-events-none absolute inset-0 animate-[snapflash_300ms_ease-out_forwards] bg-white" />}
      {toast && <SnapshotToast snapshotId={toast.id} blob={toast.blob} onClose={() => setToast(null)} />}
      <style>{`@keyframes snapflash{from{opacity:.55}to{opacity:0}}`}</style>
    </div>
  );
}

interface SectionProps {
  pane: PaneId;
  players: ComparePlayers;
  clip: Clip | null;
  flipped: boolean;
  onFlip: () => void;
  startTime?: number;
  linked: boolean;
  handleRef: React.RefObject<PaneHandle | null>;
  onInteract: () => void;
  onClipBound: () => void;
  onRate: (r: PlaybackRate) => void;
  header: React.ReactNode;
  empty: string;
}

function PaneSection({ pane, players, clip, flipped, onFlip, startTime, linked, handleRef, onInteract, onClipBound, onRate, header, empty }: SectionProps) {
  const engine = players.engines[pane];
  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col" data-testid={`section-${pane}`}>
      {header}
      <div className="relative min-h-0 flex-1">
        <VideoPane
          clip={clip}
          engine={engine}
          flipped={flipped}
          startTime={startTime}
          onScrub={(t) => players.scrub(pane, t)}
          onInteract={onInteract}
          onClipBound={onClipBound}
          handleRef={handleRef}
          testId={`pane-${pane}`}
        >
          {!clip && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted">{empty}</div>}
        </VideoPane>
        {clip && (
          <button
            type="button"
            aria-pressed={flipped}
            aria-label="Flip left/right"
            data-testid={`flip-${pane}`}
            onClick={onFlip}
            className={`absolute right-2 top-2 flex h-11 w-11 items-center justify-center rounded-full backdrop-blur ${
              flipped ? "bg-neon/90 text-black" : "bg-black/50 text-white"
            }`}
          >
            <Icon d={ICONS.flip} className="h-5 w-5" />
          </button>
        )}
        {clip && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/50 px-2 py-1 text-[11px] font-semibold text-white/90">
            {clip.title}
          </div>
        )}
      </div>
      <Scrubber
        engine={engine}
        onScrub={(t) => players.scrub(pane, t)}
        onStep={(d) => players.step(pane, d)}
        onTogglePlay={() => players.togglePlay(pane)}
        onRate={onRate}
        onInteract={onInteract}
        linked={linked}
        testId={`scrubber-${pane}`}
        label={pane === "top" ? "Pro position" : "Swing position"}
      />
    </section>
  );
}

function EmptyState() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center safe-top">
      <div className="text-lg font-semibold">Nothing to compare yet</div>
      <p className="max-w-xs text-sm text-muted">Record a swing, or load the sample pro and youth clips to try the compare screen.</p>
      <Link href="/capture" className="flex h-12 w-64 items-center justify-center rounded-full bg-neon font-semibold text-black">
        Record a swing
      </Link>
      <button
        type="button"
        data-testid="load-samples"
        disabled={loading}
        onClick={async () => {
          setLoading(true);
          setError(null);
          try {
            await loadSampleClips();
          } catch (e) {
            setError(e instanceof Error ? e.message : "Could not load samples");
          } finally {
            setLoading(false);
          }
        }}
        className="flex h-12 w-64 items-center justify-center rounded-full bg-elevated font-semibold text-white disabled:opacity-60"
      >
        {loading ? "Loading samples…" : "Load sample clips"}
      </button>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </div>
  );
}
