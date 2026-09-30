import { test } from "node:test";
import assert from "node:assert/strict";
import { SeekScheduler, type SeekableMedia } from "../src/lib/player/seek-scheduler.ts";

class FakeVideo implements SeekableMedia {
  seeks: number[] = [];
  ready = true;
  seekTo(t: number) {
    this.seeks.push(t);
  }
  canSeek() {
    return this.ready;
  }
}

function setup(waitForPresent = false) {
  let clock = 0;
  const media = new FakeVideo();
  const s = new SeekScheduler(media, { now: () => clock, waitForPresent, fps: () => 30 });
  return { media, s, tick: (ms: number) => (clock += ms) };
}

test("first request seeks immediately", () => {
  const { media, s } = setup();
  assert.equal(s.request(1), true);
  assert.deepEqual(media.seeks, [1]);
  assert.equal(s.phase, "seeking");
});

test("at most one seek in flight; coalesces to the latest target", () => {
  const { media, s } = setup();
  s.request(1);
  s.request(1.1);
  s.request(1.2);
  s.request(1.3);
  assert.deepEqual(media.seeks, [1]);
  s.onSeeked();
  assert.deepEqual(media.seeks, [1, 1.3]);
  s.onSeeked();
  assert.deepEqual(media.seeks, [1, 1.3]);
  assert.equal(s.phase, "idle");
  assert.equal(s.pending, false);
  assert.equal(s.stats.requests, 4);
  assert.equal(s.stats.issued, 2);
});

test("does not re-seek when the target stays within the same frame", () => {
  const { media, s } = setup();
  s.request(1);
  s.request(1.005);
  s.onSeeked();
  assert.deepEqual(media.seeks, [1]);
  s.request(1.01);
  assert.deepEqual(media.seeks, [1]);
  s.request(1.05);
  assert.deepEqual(media.seeks, [1, 1.05]);
});

test("waits for the frame to be presented when rVFC is available", () => {
  const { media, s, tick } = setup(true);
  s.request(2);
  s.request(3);
  tick(40);
  s.onSeeked();
  assert.equal(s.phase, "presenting");
  assert.deepEqual(media.seeks, [2]);
  tick(10);
  s.onPresented();
  assert.deepEqual(media.seeks, [2, 3]);
  assert.equal(s.stats.lastLatency, 50);
  assert.equal(s.stats.maxLatency, 50);
  tick(20);
  s.onSeeked();
  s.onPresentTimeout();
  assert.equal(s.phase, "idle");
  assert.equal(s.stats.latencies.length, 2);
});

test("presented frames while idle (playback) do not trigger seeks", () => {
  const { media, s } = setup(true);
  s.onPresented();
  s.onSeeked();
  assert.deepEqual(media.seeks, []);
});

test("waits for metadata before seeking, then seeks the latest target", () => {
  const { media, s } = setup();
  media.ready = false;
  s.request(1);
  s.request(2);
  assert.deepEqual(media.seeks, []);
  media.ready = true;
  s.pump();
  assert.deepEqual(media.seeks, [2]);
});

test("stall recovery re-issues the latest target", () => {
  const { media, s } = setup();
  s.request(1);
  s.request(4);
  s.onStall();
  assert.deepEqual(media.seeks, [1, 4]);
});

test("sync after playback makes the paused time current", () => {
  const { media, s } = setup();
  s.sync(5);
  assert.equal(s.pending, false);
  s.request(5.001);
  assert.deepEqual(media.seeks, []);
  s.invalidate();
  s.pump();
  assert.deepEqual(media.seeks, [5.001]);
});

test("rapid drag: 120 requests over many seeks never exceed one in flight", () => {
  const { media, s, tick } = setup(true);
  let inFlight = 0;
  let maxInFlight = 0;
  const origSeek = media.seekTo.bind(media);
  media.seekTo = (t: number) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    origSeek(t);
  };
  for (let i = 0; i < 120; i++) {
    s.request(i / 60);
    tick(16);
    if (i % 5 === 4 && s.phase === "seeking") {
      s.onSeeked();
      inFlight--;
      s.onPresented();
    }
  }
  assert.equal(maxInFlight, 1);
  assert.ok(media.seeks.length < 40, `too many seeks: ${media.seeks.length}`);
});
