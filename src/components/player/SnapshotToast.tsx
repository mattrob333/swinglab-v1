"use client";

// Quick confirmation after a snapshot: thumbnail, note field, Share, View.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useObjectUrl } from "@/lib/store/hooks";
import { updateSnapshot } from "@/lib/store/local-db";
import { downloadBlob, shareImage } from "@/lib/player/snapshot";
import { Icon, ICONS } from "./icons";

interface Props {
  snapshotId: string;
  blob: Blob;
  onClose: () => void;
}

export function SnapshotToast({ snapshotId, blob, onClose }: Props) {
  const url = useObjectUrl(blob);
  const [note, setNote] = useState("");
  const [engaged, setEngaged] = useState(false);
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-dismiss unless the user starts interacting.
  useEffect(() => {
    if (engaged) return;
    const t = setTimeout(onClose, 7000);
    return () => clearTimeout(t);
  }, [engaged, onClose, snapshotId]);

  const saveNote = (v: string) => {
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => void updateSnapshot(snapshotId, { note: v }), 300);
  };

  const share = async () => {
    setEngaged(true);
    const name = `swinglab-${snapshotId.slice(0, 8)}.jpg`;
    const ok = await shareImage(blob, name, note || undefined);
    if (!ok) downloadBlob(blob, name);
  };

  return (
    <div
      className="absolute inset-x-2 bottom-2 z-30 mx-auto flex max-w-md flex-col gap-2 rounded-2xl border border-line bg-elevated/95 p-3 shadow-2xl backdrop-blur"
      role="status"
      data-testid="snapshot-toast"
      onPointerDown={() => setEngaged(true)}
    >
      <div className="flex items-center gap-3">
        {url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Snapshot" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">Snapshot saved</div>
          <div className="text-xs text-muted">Ready for AI analysis later</div>
        </div>
        <button type="button" onClick={share} className="h-11 rounded-full bg-neon px-4 text-sm font-semibold text-black" data-testid="toast-share">
          Share
        </button>
        <button type="button" aria-label="Close" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-full text-muted">
          <Icon d={ICONS.close} className="h-5 w-5" />
        </button>
      </div>
      <div className="flex gap-2">
        <input
          value={note}
          onChange={(e) => {
            setNote(e.target.value);
            saveNote(e.target.value);
          }}
          onFocus={() => setEngaged(true)}
          placeholder="Add a note (e.g. hands at load)"
          className="h-11 min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 text-base outline-none focus:border-neon/60"
          data-testid="toast-note"
        />
        <Link href="/snaps" className="flex h-11 items-center rounded-xl bg-surface px-3 text-sm font-semibold">
          View
        </Link>
      </div>
    </div>
  );
}
