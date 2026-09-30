"use client";

// Snapshot thumbnails for AI screens, with a tap-to-enlarge lightbox.

import { useEffect, useState } from "react";
import { getSnapshotImage } from "@/lib/store/local-db";

export function useSnapshotImageUrl(id: string | null): string | null {
  const [entry, setEntry] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    let url: string | null = null;
    getSnapshotImage(id).then((b) => {
      if (cancelled || !b) return;
      url = URL.createObjectURL(b);
      setEntry({ id, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [id]);
  return entry && entry.id === id ? entry.url : null;
}

interface ThumbProps {
  id: string;
  className?: string;
  /** Opens the full-size view on tap. */
  zoomable?: boolean;
  label?: string;
}

export function SnapshotThumb({ id, className = "h-16 w-12", zoomable = false, label = "Snapshot" }: ThumbProps) {
  const url = useSnapshotImageUrl(id);
  const [open, setOpen] = useState(false);
  const img = (
    <span className={`block overflow-hidden rounded-lg border border-line bg-black ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={url} alt={label} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[10px] text-muted">…</span>
      )}
    </span>
  );
  if (!zoomable) return img;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={`View ${label} full size`} className="block min-h-11 shrink-0" data-testid="snapshot-thumb">
        {img}
      </button>
      {open && url && <ImageLightbox url={url} label={label} onClose={() => setOpen(false)} />}
    </>
  );
}

export function ImageLightbox({ url, label, onClose }: { url: string; label: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[70] flex flex-col bg-black/95 safe-top safe-bottom"
      role="dialog"
      aria-label={label}
      data-testid="image-lightbox"
      onClick={onClose}
    >
      <div className="flex h-14 shrink-0 items-center justify-end px-2">
        <button type="button" onClick={onClose} aria-label="Close" className="flex h-11 w-11 items-center justify-center rounded-full text-white">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden>
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>
      <div className="relative min-h-0 flex-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={label} className="absolute inset-0 h-full w-full object-contain" />
      </div>
    </div>
  );
}
