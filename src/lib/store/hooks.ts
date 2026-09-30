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
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}
