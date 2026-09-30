"use client";

import type { Clip } from "@/lib/types";
import { useJob } from "@/lib/media/use-jobs";

/** "Optimizing 42%" / "Queued" / "Couldn't optimize" badge for a clip. */
export function ProcessingBadge({ clip, className = "" }: { clip: Pick<Clip, "id" | "processed">; className?: string }) {
  const job = useJob(clip.id);
  if (clip.processed || !job || job.state === "done") return null;
  let label: string;
  let tone = "bg-black/70 text-white";
  if (job.state === "running") label = `Optimizing ${Math.round(job.progress * 100)}%`;
  else if (job.state === "queued") label = "Optimizing…";
  else if (job.state === "unsupported") {
    label = "Original";
    tone = "bg-black/70 text-muted";
  } else {
    label = "Couldn't optimize";
    tone = "bg-red-600/80 text-white";
  }
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold backdrop-blur ${tone} ${className}`}
      title={job.message}
      data-testid="processing-badge"
    >
      {(job.state === "running" || job.state === "queued") && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-neon" aria-hidden />
      )}
      {label}
    </span>
  );
}
