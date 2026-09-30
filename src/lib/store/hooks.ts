"use client";

import { useEffect, useState } from "react";
import { subscribe } from "./local-db";

/**
 * Re-runs `query` whenever the local store changes. Returns undefined until the
 * first result arrives.
 */
export function useLocalQuery<T>(query: () => Promise<T>, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    const run = () => {
      query().then((v) => {
        if (!cancelled) setValue(v);
      });
    };
    run();
    const unsubscribe = subscribe(run);
    return () => {
      cancelled = true;
      unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

/** Object URL for a blob that is revoked when the blob changes or the component unmounts. */
export function useObjectUrl(blob: Blob | undefined | null): string | null {
  // The URL is created in an effect (not during render) so it can be revoked
  // on cleanup, including React's dev-mode double-invoke of effects.
  const [entry, setEntry] = useState<{ blob: Blob; url: string } | null>(null);
  useEffect(() => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- syncing with an external resource
    setEntry({ blob, url });
    return () => URL.revokeObjectURL(url);
  }, [blob]);
  return entry && entry.blob === blob ? entry.url : null;
}
