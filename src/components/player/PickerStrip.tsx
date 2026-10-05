"use client";

// Horizontal scroll-snap strip of clips. Swiping the strip selects the clip
// that settles in the centre; tapping an item selects it too. Horizontal drags
// on the video never switch clips (that gesture is jog).

import { useEffect, useRef, useState } from "react";
import { getClipBlob } from "@/lib/store/local-db";
import type { Clip } from "@/lib/types";

interface Props {
  clips: Clip[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  testId: string;
  label: string;
}

const ITEM_W = 76;
const GAP = 8;

export function PickerStrip({ clips, selectedId, onSelect, testId, label }: Props) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const firstRef = useRef(true);
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedRef = useRef(selectedId);
  const clipsRef = useRef(clips);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    selectedRef.current = selectedId;
    clipsRef.current = clips;
    onSelectRef.current = onSelect;
  });

  // Centre the selected item (instantly the first time).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !selectedId) return;
    const i = clips.findIndex((c) => c.id === selectedId);
    if (i < 0) return;
    const left = i * (ITEM_W + GAP);
    if (Math.abs(el.scrollLeft - left) < 2) return;
    el.scrollTo({ left, behavior: firstRef.current ? "instant" : "smooth" });
    firstRef.current = false;
  }, [selectedId, clips]);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const settle = () => {
      const list = clipsRef.current;
      if (!list.length) return;
      const i = Math.max(0, Math.min(list.length - 1, Math.round(el.scrollLeft / (ITEM_W + GAP))));
      const id = list[i].id;
      if (id !== selectedRef.current) onSelectRef.current(id);
    };
    const onScroll = () => {
      if (endTimer.current) clearTimeout(endTimer.current);
      endTimer.current = setTimeout(settle, 160);
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (endTimer.current) clearTimeout(endTimer.current);
    };
  }, []);

  return (
    <div className="relative" data-testid={testId}>
      <div
        ref={scrollerRef}
        role="listbox"
        aria-label={label}
        className="scrollbar-none flex snap-x snap-mandatory overflow-x-auto py-1"
        style={{ gap: GAP, paddingInline: `calc(50% - ${ITEM_W / 2}px)`, touchAction: "pan-x" }}
      >
        {clips.map((c) => {
          const active = c.id === selectedId;
          return (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={active}
              data-clip-id={c.id}
              onClick={() => onSelect(c.id)}
              className={`relative flex h-12 shrink-0 snap-center snap-always flex-col justify-end overflow-hidden rounded-lg border text-left transition-colors ${
                active ? "border-neon" : "border-line"
              }`}
              style={{ width: ITEM_W }}
            >
              <ClipThumb clip={c} />
              <span className="relative z-10 truncate bg-gradient-to-t from-black/85 to-transparent px-1.5 pb-0.5 pt-2 text-[10px] font-semibold leading-tight text-white">
                {c.title}
              </span>
              <span className="absolute right-1 top-1 z-10 rounded bg-black/60 px-1 text-[9px] font-bold text-muted">{c.handedness}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Thumbnail image if the clip has one, otherwise an initials tile. */
export function ClipThumb({ clip }: { clip: Clip }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let u: string | null = null;
    let cancelled = false;
    getClipBlob(clip.id, "thumb").then((b) => {
      if (cancelled || !b) return;
      u = URL.createObjectURL(b);
      setUrl(u);
    });
    return () => {
      cancelled = true;
      if (u) URL.revokeObjectURL(u);
    };
  }, [clip.id]);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />;
  }
  const initials = clip.title
    .split(/[\s·]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <div className="absolute inset-0 flex items-center justify-center bg-elevated pb-3 text-base font-bold text-white/35">{initials}</div>
  );
}
