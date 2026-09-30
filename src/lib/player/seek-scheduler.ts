// The seek scheduling decision logic, free of the DOM so it runs under node:test.
//
// Rules:
// - At most one seek in flight.
// - request(t) only records the latest target; if nothing is in flight it seeks.
// - When the in-flight seek completes (seeked, then the frame is presented when
//   requestVideoFrameCallback is available), seek again to the latest target if
//   it moved to a different frame. Intermediate targets are dropped (coalesced).

import { sameFrame } from "./time.ts";

/** What the scheduler needs from a video element. */
export interface SeekableMedia {
  /** Start a seek (video.currentTime = t). */
  seekTo(t: number): void;
  /** True once metadata is loaded and seeking is possible. */
  canSeek(): boolean;
}

export type SeekPhase = "idle" | "seeking" | "presenting";

export interface SeekStats {
  /** setTarget calls. */
  requests: number;
  /** Seeks actually started. */
  issued: number;
  /** Seek-to-presented latencies in ms (most recent 500). */
  latencies: number[];
  maxLatency: number;
  lastLatency: number;
  /** Seeks that completed without a presented frame (same frame, or rVFC missed). */
  presentTimeouts: number;
  /** Seeks that landed on the frame already on screen. */
  sameFrameSeeks: number;
}

export interface SchedulerOptions {
  now: () => number;
  /** Wait for the seeked frame to be presented before the next seek (rVFC available). */
  waitForPresent: boolean;
  fps: () => number;
}

export class SeekScheduler {
  target: number | null = null;
  lastIssued: number | null = null;
  phase: SeekPhase = "idle";
  issuedAt = 0;
  stats: SeekStats = { requests: 0, issued: 0, latencies: [], maxLatency: 0, lastLatency: 0, presentTimeouts: 0, sameFrameSeeks: 0 };

  private media: SeekableMedia;
  private opts: SchedulerOptions;

  constructor(media: SeekableMedia, opts: SchedulerOptions) {
    this.media = media;
    this.opts = opts;
  }

  /** True when the latest target has not been shown yet. */
  get pending(): boolean {
    return this.phase !== "idle" || this.needsIssue();
  }

  private needsIssue(): boolean {
    if (this.target == null) return false;
    if (this.lastIssued == null) return true;
    return !sameFrame(this.target, this.lastIssued, this.opts.fps());
  }

  /** Record the latest target; seeks now if nothing is in flight. Returns true if a seek started. */
  request(t: number): boolean {
    this.stats.requests++;
    this.target = t;
    return this.pump();
  }

  /** Seek to the latest target if idle and it moved. Returns true if a seek started. */
  pump(): boolean {
    if (this.phase !== "idle" || !this.needsIssue() || !this.media.canSeek()) return false;
    const t = this.target as number;
    this.phase = "seeking";
    this.lastIssued = t;
    this.issuedAt = this.opts.now();
    this.stats.issued++;
    this.media.seekTo(t);
    return true;
  }

  /**
   * The media element fired `seeked`. `seekedTime` is currentTime after the
   * seek and `presented` the media time of the frame already on screen: when
   * the seek landed inside that frame no new frame will be presented (rVFC
   * stays silent), so finish now instead of waiting for the fallback timeout.
   */
  onSeeked(seekedTime?: number, presented?: number | null): void {
    if (this.phase !== "seeking") return;
    if (!this.opts.waitForPresent) {
      this.finish();
      return;
    }
    if (seekedTime != null && presented != null && seekedTime >= presented - 1e-4 && seekedTime < presented + 0.98 / this.opts.fps()) {
      this.stats.sameFrameSeeks++;
      this.finish();
      return;
    }
    this.phase = "presenting";
  }

  /** A frame was presented (requestVideoFrameCallback). */
  onPresented(): void {
    if (this.phase === "presenting") this.finish();
  }

  /** No frame was presented soon after `seeked` (e.g. same frame): carry on anyway. */
  onPresentTimeout(): void {
    if (this.phase !== "presenting") return;
    this.stats.presentTimeouts++;
    this.finish();
  }

  /** The in-flight seek never completed; forget it and try again. */
  onStall(): void {
    if (this.phase === "idle") return;
    this.phase = "idle";
    this.lastIssued = null;
    this.pump();
  }

  /** Playback or a new source moved the media; the given time is now on screen. */
  sync(currentTime: number | null): void {
    this.phase = "idle";
    this.lastIssued = currentTime;
    this.target = currentTime;
  }

  /** The media was reset (new source) or moved by playback; keep the target, re-seek when possible. */
  invalidate(): void {
    this.phase = "idle";
    this.lastIssued = null;
  }

  private finish(): void {
    const latency = this.opts.now() - this.issuedAt;
    const s = this.stats;
    s.lastLatency = latency;
    if (latency > s.maxLatency) s.maxLatency = latency;
    s.latencies.push(latency);
    if (s.latencies.length > 500) s.latencies.shift();
    this.phase = "idle";
    this.pump();
  }

  resetStats(): void {
    this.stats = { requests: 0, issued: 0, latencies: [], maxLatency: 0, lastLatency: 0, presentTimeouts: 0, sameFrameSeeks: 0 };
  }
}
