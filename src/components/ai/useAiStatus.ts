"use client";

// Whether AI features can be used right now. GET /api/ai/status is fetched once
// per page load (shared by every button) and again when the device comes back
// online. A missing route, an error or no connection all read as "unavailable"
// with a reason, so AI buttons render disabled with an explanation instead of
// failing when tapped.

import { useSyncExternalStore } from "react";
import type { AiStatusResponse } from "@/lib/ai/contract";
import type { AnalysisModel } from "@/lib/types";
import { aiGate, fetchAiStatus, type AiFeature, type AiGate } from "@/lib/ai/client";

interface Snapshot {
  status: AiStatusResponse | null;
  online: boolean;
}

let state: Snapshot = { status: null, online: true };
let inflight: Promise<void> | null = null;
let fetchedAt = 0;
let windowListeners = false;
const listeners = new Set<() => void>();
const SERVER_STATE: Snapshot = { status: null, online: true };
const STALE_MS = 5 * 60 * 1000;

function set(next: Partial<Snapshot>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function refresh(force = false) {
  if (inflight || (!force && state.status && Date.now() - fetchedAt < STALE_MS)) return;
  inflight = fetchAiStatus()
    .then((status) => {
      fetchedAt = Date.now();
      set({ status });
    })
    .finally(() => {
      inflight = null;
    });
}

function ensureWindowListeners() {
  if (windowListeners || typeof window === "undefined") return;
  windowListeners = true;
  state = { ...state, online: navigator.onLine };
  window.addEventListener("online", () => {
    set({ online: true });
    refresh(true);
  });
  window.addEventListener("offline", () => set({ online: false }));
  window.addEventListener("focus", () => refresh());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureWindowListeners();
  refresh();
  return () => {
    listeners.delete(listener);
  };
}

export interface AiStatusHook {
  status: AiStatusResponse | null;
  online: boolean;
  gate: (feature: AiFeature, model?: AnalysisModel) => AiGate;
  refresh: () => void;
}

export function useAiStatus(): AiStatusHook {
  const snap = useSyncExternalStore(
    subscribe,
    () => state,
    () => SERVER_STATE,
  );
  return {
    status: snap.status,
    online: snap.online,
    gate: (feature, model) => aiGate(snap.status, snap.online, feature, model),
    refresh: () => refresh(true),
  };
}
