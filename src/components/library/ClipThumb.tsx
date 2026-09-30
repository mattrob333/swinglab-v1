"use client";

import { useEffect, useState } from "react";
import { getClipBlob } from "@/lib/store/local-db";

// Object URLs for thumbnails, cached by clip id + version so cards don't flicker
// when unrelated store changes re-render them.
const cache = new Map<string, { version: string; url: string | null }>();

function useThumbUrl(clipId: string, version: string): string | null {
  const key = `${clipId}@${version}`;
  const [loaded, setLoaded] = useState<{ key: string; url: string | null } | null>(null);
  useEffect(() => {
    const cached = cache.get(clipId);
    if (cached && cached.version === version) return;
    let cancelled = false;
    getClipBlob(clipId, "thumb").then((blob) => {
      const prev = cache.get(clipId);
      if (prev?.url && prev.version !== version) URL.revokeObjectURL(prev.url);
      const url = blob ? URL.createObjectURL(blob) : null;
      cache.set(clipId, { version, url });
      if (!cancelled) setLoaded({ key, url });
    });
    return () => {
      cancelled = true;
    };
  }, [clipId, version, key]);
  const cached = cache.get(clipId);
  if (cached && cached.version === version) return cached.url;
  return loaded?.key === key ? loaded.url : null;
}

export function ClipThumb({
  clipId,
  version,
  alt,
  className = "",
}: {
  clipId: string;
  version: string;
  alt: string;
  className?: string;
}) {
  const url = useThumbUrl(clipId, version);
  return (
    <div className={`relative overflow-hidden bg-elevated ${className}`}>
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob URL
        <img src={url} alt={alt} className="h-full w-full object-cover" draggable={false} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-muted" aria-hidden>
          <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.6}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" />
          </svg>
        </div>
      )}
    </div>
  );
}
