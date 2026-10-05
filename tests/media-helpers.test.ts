import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clampTrim,
  filmstripTimes,
  formatClock,
  moveHandle,
  nudgeHandle,
  shiftWindow,
  MIN_TRIM_SEC,
} from "../src/lib/media/trim.ts";
import { cleanPlayerName, parseProFilename } from "../src/lib/media/filename.ts";
import { baseMime, extensionForMime, looksLikeVideoFile, pickRecorderMimeType } from "../src/lib/media/mime.ts";
import { SerialQueue } from "../src/lib/media/queue.ts";
import { captureRateFromTags, snapSloMo, suggestSloMoFactor } from "../src/lib/media/slomo.ts";
import { clampCrop, cropTransform, zoomAt } from "../src/lib/media/crop.ts";
import { fitWithin1080p, keyFrameIntervalFor, pickBitrate, planEncode } from "../src/lib/media/encode-plan.ts";

const close = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

// ---------- trim ----------

test("clampTrim keeps the window inside the clip", () => {
  assert.deepEqual(clampTrim({ start: -1, end: 12 }, 10), { start: 0, end: 10 });
  assert.deepEqual(clampTrim({ start: 4, end: 2 }, 10), { start: 2, end: 4 });
  assert.deepEqual(clampTrim({ start: NaN, end: NaN }, 5), { start: 0, end: 5 });
});

test("clampTrim enforces the minimum length, shifting back inside at the edges", () => {
  const t = clampTrim({ start: 9.99, end: 10 }, 10);
  close(t.end, 10);
  close(t.end - t.start, MIN_TRIM_SEC);
  const s = clampTrim({ start: 0, end: 0 }, 10);
  close(s.start, 0);
  close(s.end, MIN_TRIM_SEC);
});

test("clampTrim returns the whole clip when it is shorter than the minimum", () => {
  assert.deepEqual(clampTrim({ start: 0.05, end: 0.1 }, 0.2), { start: 0, end: 0.2 });
});

test("moveHandle never lets handles cross", () => {
  const w = { start: 2, end: 5 };
  close(moveHandle(w, "start", 6, 10).start, 5 - MIN_TRIM_SEC);
  close(moveHandle(w, "end", 1, 10).end, 2 + MIN_TRIM_SEC);
  assert.deepEqual(moveHandle(w, "start", -3, 10), { start: 0, end: 5 });
  assert.deepEqual(moveHandle(w, "end", 99, 10), { start: 2, end: 10 });
});

test("nudgeHandle moves by whole frames and defaults to 30fps", () => {
  close(nudgeHandle({ start: 1, end: 3 }, "start", 1, 60, 10).start, 1 + 1 / 60);
  close(nudgeHandle({ start: 1, end: 3 }, "end", -3, null, 10).end, 3 - 3 / 30);
  assert.equal(nudgeHandle({ start: 0, end: 3 }, "start", -1, 30, 10).start, 0);
});

test("shiftWindow keeps length and stays inside", () => {
  assert.deepEqual(shiftWindow({ start: 2, end: 4 }, 10, 5), { start: 3, end: 5 });
  assert.deepEqual(shiftWindow({ start: 2, end: 4 }, -10, 5), { start: 0, end: 2 });
});

test("filmstripTimes samples cell centers", () => {
  assert.deepEqual(filmstripTimes(10, 5), [1, 3, 5, 7, 9]);
  assert.deepEqual(filmstripTimes(0, 5), []);
});

test("formatClock", () => {
  assert.equal(formatClock(7.9), "0:07");
  assert.equal(formatClock(65), "1:05");
});

// ---------- filenames ----------

test("cleanPlayerName turns filenames into player names", () => {
  assert.equal(cleanPlayerName("jackson-holliday.mp4"), "Jackson Holliday");
  assert.equal(cleanPlayerName("MOOKIE_BETTS_2024_(1).MOV"), "Mookie Betts");
  assert.equal(cleanPlayerName("Andrew McCutchen swing FINAL copy.mov"), "Andrew McCutchen");
  assert.equal(cleanPlayerName("ken griffey jr.mp4"), "Ken Griffey Jr.");
  assert.equal(cleanPlayerName("C:\\clips\\juan_soto-60fps-1080p.mp4"), "Juan Soto");
  assert.equal(cleanPlayerName("CodyBellinger.mp4"), "Cody Bellinger");
});

test("cleanPlayerName falls back when only ids remain", () => {
  assert.equal(
    cleanPlayerName("optimized_79cd08c2-f901-47b4-9e80-fc8296fc601b_optimized.mp4"),
    "Pro swing",
  );
  assert.equal(cleanPlayerName("IMG_4411.MOV", "Swing"), "Swing");
  assert.equal(cleanPlayerName("20240721_101054.mp4"), "Pro swing");
});

test("parseProFilename detects camera view and handedness hints", () => {
  assert.deepEqual(parseProFilename("Juan Soto open side LHH.mp4"), {
    name: "Juan Soto",
    cameraView: "open",
    handedness: "L",
  });
  assert.deepEqual(parseProFilename("aaron-judge-behind-righty.mov"), {
    name: "Aaron Judge",
    cameraView: "behind",
    handedness: "R",
  });
  assert.deepEqual(parseProFilename("freddie_freeman_closed.mp4").cameraView, "closed");
  assert.equal(parseProFilename("front view - shohei.mp4").cameraView, "front");
  assert.equal(parseProFilename("constructor.mp4").name, "Constructor");
});

// ---------- mime ----------

test("pickRecorderMimeType prefers H.264 MP4, then WebM", () => {
  const safari = new Set(["video/mp4;codecs=avc1", "video/mp4"]);
  assert.equal(pickRecorderMimeType((t) => safari.has(t)), "video/mp4;codecs=avc1");
  const oldChrome = new Set(["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"]);
  assert.equal(pickRecorderMimeType((t) => oldChrome.has(t)), "video/webm;codecs=vp9");
  const oldSafari = new Set(["video/mp4"]);
  assert.equal(pickRecorderMimeType((t) => oldSafari.has(t)), "video/mp4");
  assert.equal(pickRecorderMimeType(() => false), null);
  assert.equal(
    pickRecorderMimeType((t) => {
      if (t.includes("codecs")) throw new Error("bad");
      return t === "video/webm";
    }),
    "video/webm",
  );
});

test("mime helpers", () => {
  assert.equal(extensionForMime("video/webm;codecs=vp9"), "webm");
  assert.equal(extensionForMime("video/mp4;codecs=avc1"), "mp4");
  assert.equal(extensionForMime(undefined), "mp4");
  assert.equal(baseMime("video/webm;codecs=vp9"), "video/webm");
  assert.ok(looksLikeVideoFile("a.MOV", ""));
  assert.ok(!looksLikeVideoFile("a.jpg", "image/jpeg"));
});

// ---------- job queue ----------

test("SerialQueue runs one at a time in FIFO order", () => {
  const q = new SerialQueue();
  q.enqueue("a");
  q.enqueue("b");
  q.enqueue("c");
  assert.equal(q.start(), "a");
  assert.equal(q.start(), null, "busy while a runs");
  q.finish("a");
  assert.equal(q.start(), "b");
  q.finish("b");
  assert.equal(q.start(), "c");
  q.finish("c");
  assert.equal(q.start(), null);
});

test("SerialQueue dedupes and lets priority jobs jump background ones", () => {
  const q = new SerialQueue();
  q.enqueue("bg1");
  q.enqueue("bg2");
  assert.equal(q.enqueue("bg1"), false);
  q.enqueue("user1", true);
  q.enqueue("user2", true);
  q.enqueue("bg2", true); // promoted
  assert.deepEqual(q.pending, ["user1", "user2", "bg2", "bg1"]);
});

test("SerialQueue re-runs a job enqueued while running, next", () => {
  const q = new SerialQueue();
  q.enqueue("a");
  q.enqueue("b");
  assert.equal(q.start(), "a");
  assert.equal(q.enqueue("a"), true);
  assert.equal(q.finish("a"), true);
  assert.equal(q.start(), "a");
  assert.equal(q.finish("a"), false);
  assert.equal(q.start(), "b");
});

test("SerialQueue.remove drops pending work", () => {
  const q = new SerialQueue();
  q.enqueue("a");
  q.enqueue("b");
  q.remove("a");
  assert.equal(q.start(), "b");
  assert.ok(q.has("b"));
  assert.ok(!q.has("a"));
});

test("SerialQueue.start skips held keys without losing their place", () => {
  const q = new SerialQueue();
  q.enqueue("held");
  q.enqueue("b");
  const held = new Set(["held"]);
  assert.equal(q.start((k) => held.has(k)), "b");
  q.finish("b");
  assert.equal(q.start((k) => held.has(k)), null);
  held.clear();
  assert.equal(q.start((k) => held.has(k)), "held");
});

// ---------- slo-mo ----------

test("slo-mo suggestion", () => {
  assert.equal(snapSloMo(7.6), 8);
  assert.equal(snapSloMo(4.1), 4);
  assert.equal(snapSloMo(1.2), 1);
  assert.equal(captureRateFromTags({ "com.android.capture.fps": "240.0" }), 240);
  assert.equal(suggestSloMoFactor({ fps: 30, rawTags: { "com.android.capture.fps": 240 } }).factor, 8);
  assert.equal(suggestSloMoFactor({ fps: 240, rawTags: { "com.android.capture.fps": 240 } }).factor, 1);
  assert.equal(suggestSloMoFactor({ fps: 240 }).factor, 1);
  assert.equal(suggestSloMoFactor({ fps: null }).factor, 1);
});

// ---------- crop ----------

test("crop clamps scale and pan", () => {
  assert.deepEqual(clampCrop({ scale: 0.5, x: 1, y: -1 }), { scale: 1, x: 0, y: 0 });
  assert.deepEqual(clampCrop({ scale: 3, x: 5, y: -5 }), { scale: 3, x: 1, y: -1 });
  assert.equal(clampCrop({ scale: 99, x: 0, y: 0 }).scale, 6);
  assert.equal(cropTransform({ scale: 2, x: 0.25, y: 0 }), "translate(25.000%, 0.000%) scale(2.0000)");
});

test("zoomAt keeps the focus point fixed", () => {
  const c = zoomAt({ scale: 1, x: 0, y: 0 }, 2, 0.25, 0);
  // Content point under focus before: (0.25 - 0)/1 = 0.25; after: 0.25*2 + x = 0.25 → x = -0.25
  close(c.scale, 2);
  close(c.x, -0.25);
  close(c.y, 0);
});

// ---------- encode plan ----------

test("fitWithin1080p never upscales and keeps even dims in both orientations", () => {
  assert.deepEqual(fitWithin1080p(3840, 2160), { width: 1920, height: 1080 });
  assert.deepEqual(fitWithin1080p(2160, 3840), { width: 1080, height: 1920 });
  assert.deepEqual(fitWithin1080p(640, 480), { width: 640, height: 480 });
  assert.deepEqual(fitWithin1080p(1441, 1081), { width: 1440, height: 1080 });
});

test("keyframe interval and bitrate", () => {
  close(keyFrameIntervalFor(60, 2), 2 / 60);
  assert.equal(keyFrameIntervalFor(60, 1), 0);
  assert.equal(keyFrameIntervalFor(null, 2), 0);
  assert.equal(pickBitrate(1920, 1080, 30), 10_000_000);
  assert.equal(pickBitrate(1920, 1080, 60), 12_000_000);
  assert.equal(pickBitrate(640, 360, 30), 4_000_000);
  assert.equal(planEncode(1920, 1080, 30).width, 1920);
});
