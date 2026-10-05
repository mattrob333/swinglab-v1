"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { listClips } from "@/lib/store/local-db";
import { useLocalQuery } from "@/lib/store/hooks";
import type { Clip } from "@/lib/types";
import { resumePendingJobs } from "@/lib/media/jobs";
import { ImportVideoButton } from "@/components/capture/ImportVideoButton";
import { ClipCard } from "./ClipCard";
import { ClipActionSheet } from "./ClipActionSheet";
import { SampleClipsButton } from "./LibraryScreen";
import { SettingsLink } from "@/app/settings/SettingsLink";

const RECENT_LIMIT = 12;

export function HomeScreen() {
  const swings = useLocalQuery(() => listClips("athlete"), []);
  const pros = useLocalQuery(() => listClips("pro"), []);
  const [menuClip, setMenuClip] = useState<Clip | null>(null);

  useEffect(() => {
    void resumePendingJobs();
  }, []);

  // Newest recordings first (listClips sorts by updatedAt).
  const recent = (swings ?? []).slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, RECENT_LIMIT);
  const empty = swings !== undefined && swings.length === 0;

  return (
    <div className="scrollbar-none h-full overflow-y-auto" data-testid="home">
      <div className="safe-top mx-auto max-w-5xl px-4 pb-10">
        <header className="flex items-center justify-between pt-6">
          <div className="text-xl font-extrabold tracking-tight">
            Swing<span className="text-neon">Lab</span>
          </div>
          <div className="flex items-center gap-1">
          <Link href="/library" className="flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted">
            Library
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
          <SettingsLink />
          </div>
        </header>

        {/* Primary actions */}
        <section className="mt-5 grid gap-3 sm:grid-cols-[2fr_1fr]">
          <Link
            href="/capture"
            className="group relative flex min-h-36 items-center gap-5 overflow-hidden rounded-3xl bg-neon px-6 py-6 text-black active:bg-neon-dark"
            data-testid="home-record"
          >
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-[5px] border-black/85">
              <span className="h-14 w-14 rounded-full bg-red-600 transition-transform group-active:scale-90" />
            </span>
            <span>
              <span className="block text-3xl font-extrabold tracking-tight">Record</span>
              <span className="block text-sm font-medium text-black/70">Film a swing, trim it, compare with a pro</span>
            </span>
          </Link>
          <ImportVideoButton
            className="flex min-h-20 items-center justify-center gap-3 rounded-3xl border border-line bg-elevated px-5 text-base font-semibold text-white sm:flex-col sm:gap-2"
            testId="home-import"
          >
            <span className="flex items-center gap-3 sm:flex-col sm:gap-2">
              <svg viewBox="0 0 24 24" className="h-7 w-7 text-neon" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 16l5-5 4 4 3-3 6 6" />
              </svg>
              Import from Photos
            </span>
          </ImportVideoButton>
        </section>

        {/* Recent swings */}
        <section className="mt-8">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Recent swings</h2>
            {swings && swings.length > RECENT_LIMIT && (
              <Link href="/library" className="text-sm text-muted">
                See all {swings.length}
              </Link>
            )}
          </div>

          {swings === undefined ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-[3/4] animate-pulse rounded-2xl bg-elevated" />
              ))}
            </div>
          ) : empty ? (
            <div className="rounded-3xl border border-dashed border-white/15 px-6 py-10 text-center" data-testid="home-empty">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-elevated text-neon">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden>
                  <circle cx="12" cy="12" r="8" />
                  <circle cx="12" cy="12" r="3.5" fill="currentColor" />
                </svg>
              </div>
              <h3 className="mt-4 text-lg font-semibold">No swings yet</h3>
              <p className="mx-auto mt-1 max-w-xs text-sm text-muted">
                Hit Record at the cage or game. Trim to stance-through-finish, then line it up against a pro, frame by frame.
              </p>
              <ol className="mx-auto mt-5 flex max-w-sm justify-center gap-4 text-xs text-muted">
                <li><span className="font-bold text-white">1</span> Record</li>
                <li><span className="font-bold text-white">2</span> Trim &amp; crop</li>
                <li><span className="font-bold text-white">3</span> Compare</li>
              </ol>
              {pros !== undefined && pros.length === 0 && (
                <SampleClipsButton className="mt-6 min-h-11 rounded-full border border-line px-5 text-sm font-medium" />
              )}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">
              {recent.map((c) => (
                <ClipCard key={c.id} clip={c} href={`/compare?bottom=${encodeURIComponent(c.id)}`} onMenu={setMenuClip} />
              ))}
            </div>
          )}
        </section>

        {pros !== undefined && (
          <Link
            href="/library"
            className="mt-8 flex min-h-16 items-center justify-between rounded-2xl border border-line bg-surface px-5"
          >
            <span>
              <span className="block font-semibold">Pro library</span>
              <span className="block text-xs text-muted">
                {pros.length === 0 ? "Add pro swings to compare against" : `${pros.length} pro swing${pros.length === 1 ? "" : "s"}`}
              </span>
            </span>
            <svg viewBox="0 0 24 24" className="h-5 w-5 text-muted" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        )}
      </div>
      <ClipActionSheet clip={menuClip} onClose={() => setMenuClip(null)} />
    </div>
  );
}
