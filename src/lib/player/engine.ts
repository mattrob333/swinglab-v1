// PlayerEngine: a framework-free controller bound to one HTMLVideoElement.
//
// - setTarget(t) clamps to the trim window and hands it to the SeekScheduler,
//   which keeps at most one seek in flight and always seeks to the latest target.
// - requestVideoFrameCallback tells us when a frame is actually on screen; the
//   scheduler waits for it before the next seek (falls back to `seeked`).
// - Presented media times during playback estimate fps when the clip has none.
// - UI subscribes and writes to the DOM via refs; nothing here touches React.

import { FpsEstimator } from "./fps.ts";
import { SeekScheduler } from "./seek-scheduler.ts";
import { DEFAULT_FPS, clamp, stepTarget } from "./time.ts";

export interface EngineClip {
  id: string;
  trimStart: number;
  trimEnd: number;
  sloMoFactor: number;
  durationSec: number;
  fps: number | null;
}

export type PlaybackRate = 1 | 0.5 | 0.25;
export const RATES: PlaybackRate[] = [1, 0.5, 0.25];

export type EngineListener = (engine: PlayerEngine) => void;

interface VideoFrameMeta {
  mediaTime: number;
  presentedFrames: number;
}
type VideoWithRvfc = HTMLVideoElement & {
  requestVideoFrameCallback?: (cb: (now: number, meta: VideoFrameMeta) => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
  __engine?: PlayerEngine;
};

/** Frame rates learned this session, by clip id. */
const learnedFps = new Map<string, number>();

const PRESENT_TIMEOUT_MS = 60;
const STALL_TIMEOUT_MS = 2500;

export class PlayerEngine {
  video: VideoWithRvfc | null = null;
  clip: EngineClip | null = null;
  /** Media time of the frame on screen (rVFC), or currentTime after `seeked` without rVFC. */
  presented: number | null = null;
  playing = false;
  rate: PlaybackRate = 1;
  /** When false, playback holds at the trim end instead of looping (linked follower). */
  loop = true;
  /** Distinct frames presented since the last resetStats(). */
  framesPresented = 0;
  readonly name: string;

  private scheduler: SeekScheduler;
  private listeners = new Set<EngineListener>();
  private estimator = new FpsEstimator();
  private estimatedFps: number | null = null;
  private rvfcHandle: number | null = null;
  private rafHandle: number | null = null;
  private presentTimer: ReturnType<typeof setTimeout> | null = null;
  private stallTimer: ReturnType<typeof setTimeout> | null = null;
  private lastMediaTime = -1;
  private hasRvfc = false;

  constructor(name = "pane") {
    this.name = name;
    this.scheduler = new SeekScheduler(
      {
        seekTo: (t) => this.seekMedia(t),
        canSeek: () => !!this.video && this.video.readyState >= 1,
      },
      {
        now: () => performance.now(),
        waitForPresent: typeof HTMLVideoElement !== "undefined" && "requestVideoFrameCallback" in HTMLVideoElement.prototype,
        fps: () => this.fps,
      },
    );
  }

  // ---- binding -------------------------------------------------------------

  attach(video: HTMLVideoElement): void {
    if (this.video === video) return;
    this.detach();
    const v = video as VideoWithRvfc;
    this.video = v;
    v.__engine = this;
    this.hasRvfc = typeof v.requestVideoFrameCallback === "function";
    v.addEventListener("seeked", this.onSeeked);
    v.addEventListener("loadedmetadata", this.onLoaded);
    v.addEventListener("loadeddata", this.onLoaded);
    v.addEventListener("emptied", this.onEmptied);
    v.addEventListener("pause", this.onMediaPause);
    v.addEventListener("ended", this.onMediaPause);
    this.armFrameCallback();
    if (v.readyState >= 1) this.scheduler.pump();
  }

  detach(): void {
    const v = this.video;
    if (!v) return;
    v.removeEventListener("seeked", this.onSeeked);
    v.removeEventListener("loadedmetadata", this.onLoaded);
    v.removeEventListener("loadeddata", this.onLoaded);
    v.removeEventListener("emptied", this.onEmptied);
    v.removeEventListener("pause", this.onMediaPause);
    v.removeEventListener("ended", this.onMediaPause);
    if (this.rvfcHandle != null && v.cancelVideoFrameCallback) v.cancelVideoFrameCallback(this.rvfcHandle);
    this.rvfcHandle = null;
    this.stopRaf();
    this.clearTimers();
    if (v.__engine === this) delete v.__engine;
    this.video = null;
    this.playing = false;
    this.scheduler.invalidate();
  }

  /** Point the engine at a clip. The video src is set by the owner; seeking waits for metadata. */
  setClip(clip: EngineClip, startTime?: number): void {
    const same = this.clip?.id === clip.id;
    this.clip = clip;
    if (!same) {
      this.estimator = new FpsEstimator();
      this.estimatedFps = learnedFps.get(clip.id) ?? null;
      this.presented = null;
      this.lastMediaTime = -1;
      this.playing = false;
      this.scheduler.invalidate();
    }
    this.scheduler.target = this.clamp(startTime ?? this.scheduler.target ?? clip.trimStart);
    this.scheduler.pump();
    this.emit();
  }

  /** Supply a frame rate found elsewhere (e.g. container probe). */
  setEstimatedFps(fps: number): void {
    if (!this.clip || !(fps > 0)) return;
    learnedFps.set(this.clip.id, fps);
    this.estimatedFps = fps;
    this.emit();
  }

  // ---- state ---------------------------------------------------------------

  get fps(): number {
    return this.clip?.fps ?? this.estimatedFps ?? DEFAULT_FPS;
  }

  get fpsKnown(): boolean {
    return this.clip?.fps != null || this.estimatedFps != null;
  }

  get trimStart(): number {
    return this.clip?.trimStart ?? 0;
  }

  get trimEnd(): number {
    const c = this.clip;
    if (!c) return 0;
    const end = c.trimEnd > c.trimStart ? c.trimEnd : c.durationSec;
    const d = this.video?.duration;
    return d && Number.isFinite(d) ? Math.min(end, d) : end;
  }

  /** Latest requested time (file seconds). */
  get target(): number | null {
    return this.scheduler.target;
  }

  /** True while the latest target has not been shown yet. */
  get pending(): boolean {
    return this.scheduler.pending;
  }

  /** Time to display: the target while scrubbing, the presented frame while playing. */
  get time(): number {
    const v = this.video;
    if (this.playing) return this.presented ?? v?.currentTime ?? this.trimStart;
    return this.scheduler.target ?? this.presented ?? v?.currentTime ?? this.trimStart;
  }

  get stats() {
    return { ...this.scheduler.stats, framesPresented: this.framesPresented };
  }

  resetStats(): void {
    this.scheduler.resetStats();
    this.framesPresented = 0;
  }

  // ---- commands ------------------------------------------------------------

  clamp(t: number): number {
    return clamp(t, this.trimStart, this.trimEnd);
  }

  setTarget(t: number): void {
    if (this.playing) this.pause();
    this.scheduler.request(this.clamp(t));
    this.armStallTimer();
    this.emit();
  }

  /** Target for a ±1 frame step, without applying it. */
  stepTargetFor(dir: 1 | -1): number {
    return stepTarget({
      presented: this.presented,
      target: this.scheduler.target ?? this.presented ?? this.trimStart,
      pending: this.scheduler.pending,
      fps: this.fps,
      dir,
      window: { trimStart: this.trimStart, trimEnd: this.trimEnd },
    });
  }

  step(dir: 1 | -1): void {
    if (this.playing) this.pause();
    this.setTarget(this.stepTargetFor(dir));
  }

  play(rate: PlaybackRate = this.rate): void {
    const v = this.video;
    if (!v || !this.clip) return;
    this.rate = rate;
    const fromTime = this.scheduler.target ?? v.currentTime;
    this.scheduler.invalidate();
    this.scheduler.target = null;
    if (fromTime >= this.trimEnd - 1 / this.fps) v.currentTime = this.trimStart;
    else if (Math.abs(v.currentTime - fromTime) > 0.5 / this.fps) v.currentTime = fromTime;
    v.playbackRate = rate;
    this.playing = true;
    this.estimator.cut();
    const p = v.play();
    if (p) p.catch(() => this.onMediaPause());
    if (!this.hasRvfc) this.startRaf();
    this.emit();
  }

  pause(): void {
    const v = this.video;
    if (!this.playing) return;
    this.playing = false;
    this.stopRaf();
    if (v) {
      v.pause();
      this.scheduler.sync(this.clamp(v.currentTime));
    }
    this.estimator.cut();
    this.emit();
  }

  togglePlay(): void {
    if (this.playing) this.pause();
    else this.play();
  }

  setRate(rate: PlaybackRate): void {
    this.rate = rate;
    if (this.video) this.video.playbackRate = rate;
    this.emit();
  }

  /** Set the playback rate without changing the user-facing rate (linked follower). */
  setRawRate(rate: number): void {
    if (this.video) this.video.playbackRate = Math.min(16, Math.max(0.0625, rate));
  }

  subscribe(fn: EngineListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  // ---- internals -----------------------------------------------------------

  private emit(): void {
    for (const l of this.listeners) l(this);
  }

  private seekMedia(t: number): void {
    const v = this.video;
    if (!v) return;
    v.currentTime = t;
  }

  private armStallTimer(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    if (this.scheduler.phase === "idle") return;
    const issued = this.scheduler.stats.issued;
    this.stallTimer = setTimeout(() => {
      this.stallTimer = null;
      if (this.scheduler.phase !== "idle" && this.scheduler.stats.issued === issued) {
        this.scheduler.onStall();
        this.armStallTimer();
      }
    }, STALL_TIMEOUT_MS);
  }

  private clearTimers(): void {
    if (this.presentTimer) clearTimeout(this.presentTimer);
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.presentTimer = null;
    this.stallTimer = null;
  }

  private onSeeked = (): void => {
    const v = this.video;
    if (!v) return;
    if (!this.hasRvfc) {
      this.presented = v.currentTime;
      this.framesPresented++;
    }
    this.scheduler.onSeeked(v.currentTime, this.hasRvfc ? this.presented : null);
    if (this.scheduler.phase === "presenting") {
      if (this.presentTimer) clearTimeout(this.presentTimer);
      this.presentTimer = setTimeout(() => {
        this.presentTimer = null;
        this.scheduler.onPresentTimeout();
        this.afterSchedulerStep();
      }, PRESENT_TIMEOUT_MS);
    } else {
      this.afterSchedulerStep();
    }
  };

  private afterSchedulerStep(): void {
    this.armStallTimer();
    this.emit();
  }

  private onLoaded = (): void => {
    this.scheduler.pump();
    this.armStallTimer();
    this.emit();
  };

  private onEmptied = (): void => {
    this.presented = null;
    this.lastMediaTime = -1;
    this.playing = false;
    this.scheduler.invalidate();
    this.clearTimers();
  };

  private onMediaPause = (): void => {
    if (!this.playing) return;
    this.playing = false;
    this.stopRaf();
    if (this.video) this.scheduler.sync(this.clamp(this.video.currentTime));
    this.emit();
  };

  private armFrameCallback(): void {
    const v = this.video;
    if (!v || !v.requestVideoFrameCallback) return;
    this.rvfcHandle = v.requestVideoFrameCallback(this.onFrame);
  }

  private onFrame = (_now: number, meta: VideoFrameMeta): void => {
    this.rvfcHandle = null;
    if (!this.video) return;
    this.presented = meta.mediaTime;
    if (meta.mediaTime !== this.lastMediaTime) {
      this.framesPresented++;
      this.lastMediaTime = meta.mediaTime;
    }
    if (this.playing) {
      this.estimator.add(meta.mediaTime, meta.presentedFrames);
      if (this.clip?.fps == null && this.estimatedFps == null) {
        const est = this.estimator.estimate();
        if (est) this.setEstimatedFps(est);
      }
      this.checkTrimEnd(meta.mediaTime);
    }
    if (this.presentTimer) {
      clearTimeout(this.presentTimer);
      this.presentTimer = null;
    }
    this.scheduler.onPresented();
    this.armFrameCallback();
    this.afterSchedulerStep();
  };

  private checkTrimEnd(t: number): void {
    const v = this.video;
    if (!v || !this.playing) return;
    if (t < this.trimEnd - 0.5 / this.fps && t >= this.trimStart - 0.5 / this.fps) return;
    if (this.loop) {
      this.estimator.cut();
      v.currentTime = this.trimStart;
    } else {
      this.pause();
    }
  }

  private startRaf(): void {
    if (this.rafHandle != null) return;
    const tick = () => {
      this.rafHandle = null;
      if (!this.playing || !this.video) return;
      this.presented = this.video.currentTime;
      this.checkTrimEnd(this.presented);
      this.emit();
      this.rafHandle = requestAnimationFrame(tick);
    };
    this.rafHandle = requestAnimationFrame(tick);
  }

  private stopRaf(): void {
    if (this.rafHandle != null) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = null;
  }
}
