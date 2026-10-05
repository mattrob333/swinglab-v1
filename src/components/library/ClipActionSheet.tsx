"use client";

import { useRouter } from "next/navigation";
import { deleteClip } from "@/lib/store/local-db";
import type { Clip } from "@/lib/types";
import { cancelProcessing } from "@/lib/media/jobs";

/** Bottom sheet with Compare / Edit / Delete for a clip. */
export function ClipActionSheet({ clip, onClose }: { clip: Clip | null; onClose: () => void }) {
  const router = useRouter();
  if (!clip) return null;
  const compareHref = `/compare?${clip.kind === "pro" ? "top" : "bottom"}=${encodeURIComponent(clip.id)}`;
  const row = "flex min-h-14 w-full items-center gap-3 px-5 text-left text-base";

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center" onClick={onClose} data-testid="clip-sheet">
      <div
        className="safe-bottom w-full max-w-md overflow-hidden rounded-t-3xl border border-line bg-elevated sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`Actions for ${clip.title}`}
      >
        <div className="border-b border-line px-5 py-4">
          <div className="truncate font-semibold">{clip.title}</div>
          <div className="text-xs text-muted">
            {clip.kind === "pro" ? "Pro" : "Swing"} · {clip.handedness === "L" ? "Lefty" : "Righty"}
          </div>
        </div>
        <button type="button" className={row} onClick={() => router.push(compareHref)}>
          Compare
        </button>
        <button type="button" className={row} onClick={() => router.push(`/clips/${clip.id}/edit`)}>
          Edit trim &amp; crop
        </button>
        <button
          type="button"
          className={`${row} text-red-400`}
          data-testid="clip-delete"
          onClick={async () => {
            if (!confirm(`Delete “${clip.title}” from this device?`)) return;
            cancelProcessing(clip.id);
            await deleteClip(clip.id);
            onClose();
          }}
        >
          Delete
        </button>
        <button type="button" className={`${row} justify-center border-t border-line font-semibold`} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
