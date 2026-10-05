// YouTube URL validation for drill videos. Pure (tests/ai-youtube.test.ts).
//
// The drill finder must never show a made-up link: a video is kept only when
// (1) its URL is a plain YouTube watch link and (2) the same video id appeared
// in the web search results the model actually received.

import type { DrillVideo } from "../types.ts";

const VIDEO_ID_RE = /^[A-Za-z0-9_-]{11}$/;
const WATCH_HOSTS = new Set(["www.youtube.com", "youtube.com", "m.youtube.com"]);

/**
 * Video id of an https YouTube watch URL (`https://www.youtube.com/watch?v=ID`,
 * `https://youtu.be/ID`), or null for anything else (shorts, playlists,
 * channels, http, other hosts, lookalike domains).
 */
export function youTubeVideoId(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > 500) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (WATCH_HOSTS.has(host) && url.pathname === "/watch") id = url.searchParams.get("v");
  else if (host === "youtu.be") id = url.pathname.slice(1);
  return id && VIDEO_ID_RE.test(id) ? id : null;
}

/** Canonical watch URL for a video id. */
export function canonicalWatchUrl(id: string): string {
  return `https://www.youtube.com/watch?v=${id}`;
}

/** Every YouTube video id mentioned anywhere in a blob of text/JSON. */
export function extractYouTubeIds(haystack: string): Set<string> {
  const ids = new Set<string>();
  const re = /https:\/\/(?:(?:www\.|m\.)?youtube\.com\/watch\?[^\s"'<>\\]*|youtu\.be\/[A-Za-z0-9_-]{11})/g;
  for (const m of haystack.matchAll(re)) {
    const id = youTubeVideoId(m[0].replace(/&amp;/g, "&"));
    if (id) ids.add(id);
  }
  return ids;
}

export const MAX_DRILL_VIDEOS = 6;

function clip(s: unknown, max: number): string {
  if (typeof s !== "string") return "";
  const t = s.trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Keep only valid, search-backed, de-duplicated videos (max 6), with canonical
 * URLs. `seenIds` = video ids present in the search results; pass null to skip
 * that check (only for tests of the URL rules).
 */
export function filterDrillVideos(raw: unknown, seenIds: ReadonlySet<string> | null): DrillVideo[] {
  const items = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as { videos?: unknown }).videos : raw;
  if (!Array.isArray(items)) return [];
  const out: DrillVideo[] = [];
  const used = new Set<string>();
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const v = item as Record<string, unknown>;
    const id = youTubeVideoId(v.url);
    if (!id || used.has(id)) continue;
    if (seenIds && !seenIds.has(id)) continue;
    const title = clip(v.title, 200);
    if (!title) continue;
    used.add(id);
    out.push({ title, url: canonicalWatchUrl(id), channel: clip(v.channel, 100), why: clip(v.why, 500) });
    if (out.length >= MAX_DRILL_VIDEOS) break;
  }
  return out;
}
