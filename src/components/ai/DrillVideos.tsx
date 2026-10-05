"use client";

// Drill video list. Tapping a YouTube video plays it inline through the
// privacy-enhanced (youtube-nocookie) embed; anything else opens as a link.

import { useState } from "react";
import { youtubeEmbedUrl, youtubeId } from "@/lib/ai/client";
import type { DrillVideo } from "@/lib/types";

export function DrillVideos({ videos }: { videos: DrillVideo[] }) {
  const [openUrl, setOpenUrl] = useState<string | null>(null);
  return (
    <ul className="flex flex-col gap-2" data-testid="drill-videos">
      {videos.map((v) => {
        const id = youtubeId(v.url);
        const open = openUrl === v.url && id;
        return (
          <li key={v.url} className="overflow-hidden rounded-2xl border border-line bg-elevated" data-testid="drill-video">
            {open ? (
              <div className="relative aspect-video w-full bg-black">
                <iframe
                  src={youtubeEmbedUrl(id)}
                  title={v.title}
                  className="absolute inset-0 h-full w-full"
                  allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                  data-testid="drill-video-embed"
                />
              </div>
            ) : null}
            <div className="flex items-stretch">
              {id ? (
                <button
                  type="button"
                  onClick={() => setOpenUrl(open ? null : v.url)}
                  className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2 text-left"
                  aria-expanded={!!open}
                  data-testid="drill-video-play"
                >
                  <VideoGlyph playing={!!open} />
                  <VideoText v={v} />
                </button>
              ) : (
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="flex min-h-14 min-w-0 flex-1 items-center gap-3 px-3 py-2">
                  <VideoGlyph playing={false} />
                  <VideoText v={v} />
                </a>
              )}
              <a
                href={v.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex w-14 shrink-0 items-center justify-center border-l border-line text-muted"
                aria-label={`Open ${v.title} on YouTube`}
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M14 4h6v6M20 4l-9 9M18 14v6H4V6h6" />
                </svg>
              </a>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function VideoGlyph({ playing }: { playing: boolean }) {
  return (
    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${playing ? "bg-white/10 text-white" : "bg-red-600 text-white"}`} aria-hidden>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
        <path d={playing ? "M6 6h12v12H6z" : "M8 5v14l11-7z"} />
      </svg>
    </span>
  );
}

function VideoText({ v }: { v: DrillVideo }) {
  return (
    <span className="min-w-0">
      <span className="line-clamp-2 block text-sm font-semibold">{v.title}</span>
      {v.channel && <span className="block truncate text-xs text-muted">{v.channel}</span>}
      {v.why && <span className="mt-0.5 line-clamp-2 block text-xs text-white/70">{v.why}</span>}
    </span>
  );
}
