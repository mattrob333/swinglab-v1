// Link math: when two panes are linked, a change in real (slo-mo corrected)
// time on either pane moves both by the same real delta, each clamped to its
// own trim window. Pure; tested in tests/player-link.test.ts.

import { clampToTrim, fileToReal, realToFile, type TimeWindow } from "./time.ts";

export type PaneId = "top" | "bottom";

/** Real-time anchors recorded at the moment the panes were linked. */
export interface LinkAnchor {
  topReal: number;
  bottomReal: number;
}

export function otherPane(p: PaneId): PaneId {
  return p === "top" ? "bottom" : "top";
}

export function createLink(
  top: TimeWindow,
  bottom: TimeWindow,
  topFileTime: number,
  bottomFileTime: number,
): LinkAnchor {
  return { topReal: fileToReal(top, topFileTime), bottomReal: fileToReal(bottom, bottomFileTime) };
}

/**
 * File-time targets for both panes when `source` is moved to `sourceFileTime`.
 * Anchors are not updated, so pushing one pane into its clamp and coming back
 * restores the original alignment.
 */
export function linkedTargets(
  anchor: LinkAnchor,
  windows: Record<PaneId, TimeWindow>,
  source: PaneId,
  sourceFileTime: number,
): Record<PaneId, number> {
  const src = windows[source];
  const srcTime = clampToTrim(src, sourceFileTime);
  const srcAnchor = source === "top" ? anchor.topReal : anchor.bottomReal;
  const delta = fileToReal(src, srcTime) - srcAnchor;
  const other = otherPane(source);
  const otherAnchor = other === "top" ? anchor.topReal : anchor.bottomReal;
  const otherTime = clampToTrim(windows[other], realToFile(windows[other], otherAnchor + delta));
  return source === "top" ? { top: srcTime, bottom: otherTime } : { top: otherTime, bottom: srcTime };
}

/**
 * Playback rate for the follower pane so both panes advance at the same real
 * speed while playing linked.
 */
export function followerRate(masterRate: number, master: TimeWindow, follower: TimeWindow): number {
  const mf = master.sloMoFactor > 0 ? master.sloMoFactor : 1;
  const ff = follower.sloMoFactor > 0 ? follower.sloMoFactor : 1;
  return masterRate * (ff / mf);
}
