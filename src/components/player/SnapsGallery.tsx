"use client";

// Snapshot gallery: grid, full-screen viewer with note, share, delete and
// "Open in compare" (restores both clips, times and flips).

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { deleteSnapshot, getSnapshotImage, listClips, listSnapshots, updateSnapshot } from "@/lib/store/local-db";
import { useLocalQuery } from "@/lib/store/hooks";
import type { Snapshot } from "@/lib/types";
import { compareHrefForSnapshot, downloadBlob, shareImage } from "@/lib/player/snapshot";
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
  const [openId, setOpenId] = useState<string | null>(null);
  const titles = new Map((clips ?? []).map((c) => [c.id, c.title]));
  const open = snaps?.find((s) => s.id === openId) ?? null;

  return (
    <div className="absolute inset-0 overflow-y-auto safe-top">
      <header className="flex items-end justify-between px-4 pb-3 pt-4">
        <h1 className="text-2xl font-bold">Snaps</h1>
        <span className="text-sm text-muted">{snaps ? `${snaps.length}` : ""}</span>
      </header>
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
            <SnapTile snap={s} caption={[titles.get(s.topClipId ?? ""), titles.get(s.bottomClipId ?? "")].filter(Boolean).join(" vs ")} onOpen={() => setOpenId(s.id)} />
          </li>
        ))}
      </ul>
      {open && <SnapViewer key={open.id} snap={open} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function SnapTile({ snap, caption, onOpen }: { snap: Snapshot; caption: string; onOpen: () => void }) {
  const { url } = useSnapshotImage(snap.id);
  return (
    <button type="button" onClick={onOpen} className="block w-full overflow-hidden rounded-xl border border-line bg-surface text-left" data-testid="snap-tile">
      <div className="aspect-[3/4] w-full bg-black">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={snap.note || "Snapshot"} className="h-full w-full object-contain" draggable={false} />
        )}
      </div>
      <div className="px-2 py-1.5">
        <div className="truncate text-xs font-semibold">{caption || "Snapshot"}</div>
        <div className="truncate text-[11px] text-muted">{snap.note || new Date(snap.createdAt).toLocaleString()}</div>
      </div>
    </button>
  );
}

function SnapViewer({ snap, onClose }: { snap: Snapshot; onClose: () => void }) {
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
        <textarea
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            saveNote(e.target.value);
          }}
          rows={2}
          placeholder="Note"
          className="w-full resize-none rounded-xl border border-line bg-surface px-3 py-2 text-base outline-none focus:border-neon/60"
          data-testid="snap-note"
        />
        <div className="flex gap-2">
          <button type="button" onClick={share} className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-elevated font-semibold">
            <Icon d={ICONS.share} className="h-5 w-5" /> Share
          </button>
          <button
            type="button"
            onClick={() => router.push(compareHrefForSnapshot(snap))}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-neon font-semibold text-black"
            data-testid="snap-open-compare"
          >
            <Icon d={ICONS.compare} className="h-5 w-5" /> Open in compare
          </button>
        </div>
      </div>
    </div>
  );
}
