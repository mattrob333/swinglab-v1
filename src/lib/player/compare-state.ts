// Persist the compare screen's per-device state (CompareState) in localStorage.

import type { CompareState } from "../types.ts";

const KEY = "swinglab.compare.v1";

export const DEFAULT_COMPARE_STATE: CompareState = {
  topClipId: null,
  bottomClipId: null,
  topTime: 0,
  bottomTime: 0,
  topFlipped: false,
  bottomFlipped: false,
  linked: false,
  layout: "stacked",
};

export function loadCompareState(): CompareState | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<CompareState>;
    return { ...DEFAULT_COMPARE_STATE, ...v };
  } catch {
    return null;
  }
}

export function saveCompareState(s: CompareState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Storage full or blocked: the screen still works, it just won't restore.
  }
}
