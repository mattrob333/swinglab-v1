"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { createClipFromBlob } from "@/lib/media/create-clip";

/**
 * "Import from Photos": a file picker (no `capture` attribute, so iOS offers the
 * photo library) that stores the video as an athlete clip and opens the editor.
 */
export function ImportVideoButton({
  className,
  children,
  onError,
  testId = "import-video",
}: {
  className?: string;
  children: ReactNode;
  onError?: (message: string) => void;
  testId?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    try {
      const { clip } = await createClipFromBlob(file, {
        kind: "athlete",
        recordedAt: file.lastModified ? new Date(file.lastModified) : undefined,
      });
      router.push(`/clips/${clip.id}/edit`);
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Couldn't import that video.";
      if (onError) onError(msg);
      else alert(msg);
      setBusy(false);
    } finally {
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <>
      <button type="button" className={className} onClick={() => inputRef.current?.click()} disabled={busy} data-testid={testId}>
        {busy ? (
          <span className="inline-flex items-center gap-2">
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            Importing…
          </span>
        ) : (
          children
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
        data-testid={`${testId}-input`}
      />
    </>
  );
}
