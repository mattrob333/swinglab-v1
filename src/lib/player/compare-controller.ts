// Owns the two pane engines on the compare screen and the link between them.
// Framework-free: React components call into it and subscribe for DOM updates.

import { PlayerEngine, type PlaybackRate } from "./engine.ts";
import { createLink, followerRate, linkedTargets, otherPane, type LinkAnchor, type PaneId } from "./link.ts";
import type { TimeWindow } from "./time.ts";

type Listener = () => void;

export class ComparePlayers {
  readonly engines: Record<PaneId, PlayerEngine> = {
    top: new PlayerEngine("top"),
    bottom: new PlayerEngine("bottom"),
  };
  linked = false;
  private anchor: LinkAnchor | null = null;
  private listeners = new Set<Listener>();
  private linkedPlay: { master: PaneId; unsub: () => void } | null = null;

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  private windows(): Record<PaneId, TimeWindow> | null {
    const t = this.engines.top;
    const b = this.engines.bottom;
    if (!t.clip || !b.clip) return null;
    return {
      top: { trimStart: t.trimStart, trimEnd: t.trimEnd, sloMoFactor: t.clip.sloMoFactor },
      bottom: { trimStart: b.trimStart, trimEnd: b.trimEnd, sloMoFactor: b.clip.sloMoFactor },
    };
  }

  setLinked(on: boolean): void {
    this.stopLinkedPlay();
    const w = this.windows();
    if (on && w) {
      this.linked = true;
      this.anchor = createLink(w.top, w.bottom, this.engines.top.time, this.engines.bottom.time);
    } else {
      // Unlinking keeps both panes where they are.
      this.linked = false;
      this.anchor = null;
    }
    this.emit();
  }

  /** Re-anchor after a clip or trim change while linked. */
  relink(): void {
    if (this.linked) this.setLinked(true);
  }

  /** Move `pane` to file time `t`; when linked, the other pane follows in real time. */
  scrub(pane: PaneId, t: number): void {
    this.stopLinkedPlay();
    const w = this.windows();
    if (this.linked && this.anchor && w) {
      const targets = linkedTargets(this.anchor, w, pane, t);
      this.engines[pane].setTarget(targets[pane]);
      const other = otherPane(pane);
      this.engines[other].setTarget(targets[other]);
    } else {
      this.engines[pane].setTarget(t);
    }
  }

  step(pane: PaneId, dir: 1 | -1): void {
    this.scrub(pane, this.engines[pane].stepTargetFor(dir));
  }

  isPlaying(pane: PaneId): boolean {
    return this.engines[pane].playing || (this.linkedPlay != null && this.engines[otherPane(pane)].playing);
  }

  togglePlay(pane: PaneId, rate?: PlaybackRate): void {
    if (this.isPlaying(pane)) {
      this.pauseAll();
      return;
    }
    const master = this.engines[pane];
    const r = rate ?? master.rate;
    if (!this.linked || !this.anchor || !this.windows()) {
      master.loop = true;
      master.play(r);
      return;
    }
    this.startLinkedPlay(pane, r);
  }

  setRate(pane: PaneId, rate: PlaybackRate): void {
    this.engines[pane].setRate(rate);
    if (this.linkedPlay?.master === pane) {
      const w = this.windows();
      const other = otherPane(pane);
      if (w) this.engines[other].setRawRate(followerRate(rate, w[pane], w[other]));
    }
  }

  pauseAll(): void {
    const lp = this.linkedPlay;
    this.stopLinkedPlay();
    this.engines.top.pause();
    this.engines.bottom.pause();
    if (lp) {
      // Settle the follower exactly on the linked position of the master.
      const w = this.windows();
      if (w && this.anchor) {
        const targets = linkedTargets(this.anchor, w, lp.master, this.engines[lp.master].time);
        this.engines[otherPane(lp.master)].setTarget(targets[otherPane(lp.master)]);
      }
    }
    this.emit();
  }

  private startLinkedPlay(pane: PaneId, rate: PlaybackRate): void {
    const master = this.engines[pane];
    const other = otherPane(pane);
    const follower = this.engines[other];
    const w = this.windows();
    if (!w || !this.anchor) return;
    master.loop = true;
    follower.loop = false;
    master.play(rate);
    const syncFollower = () => {
      const lw = this.windows();
      if (!lw || !this.anchor || !this.linkedPlay) return;
      if (!master.playing) {
        this.pauseAll();
        return;
      }
      const expected = linkedTargets(this.anchor, lw, pane, master.time)[other];
      const fv = follower.video;
      if (!fv) return;
      const tol = 2 / follower.fps;
      const atEnd = expected >= follower.trimEnd - 0.5 / follower.fps;
      if (follower.playing) {
        if (Math.abs(fv.currentTime - expected) > tol) fv.currentTime = expected;
      } else if (!atEnd) {
        follower.setTarget(expected);
        follower.play(rate);
        follower.setRawRate(followerRate(master.rate, lw[pane], lw[other]));
      }
    };
    const unsub = master.subscribe(syncFollower);
    this.linkedPlay = { master: pane, unsub };
    follower.setTarget(linkedTargets(this.anchor, w, pane, master.time)[other]);
    follower.play(rate);
    follower.setRawRate(followerRate(rate, w[pane], w[other]));
    this.emit();
  }

  private stopLinkedPlay(): void {
    const lp = this.linkedPlay;
    if (!lp) return;
    this.linkedPlay = null;
    lp.unsub();
    this.engines.top.loop = true;
    this.engines.bottom.loop = true;
  }

  destroy(): void {
    this.stopLinkedPlay();
    this.engines.top.detach();
    this.engines.bottom.detach();
    this.listeners.clear();
  }
}
