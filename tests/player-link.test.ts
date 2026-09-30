import { test } from "node:test";
import assert from "node:assert/strict";
import { createLink, followerRate, linkedTargets } from "../src/lib/player/link.ts";
import { fileToReal, realDuration, realToFile, stepTarget, frameIndex, sameFrame } from "../src/lib/player/time.ts";

const near = (a: number, b: number, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

const pro = { trimStart: 2, trimEnd: 6, sloMoFactor: 4 }; // 1s real
const kid = { trimStart: 10, trimEnd: 12, sloMoFactor: 1 }; // 2s real

test("file <-> real time round trips with sloMoFactor", () => {
  near(fileToReal(pro, 4), 0.5);
  near(realToFile(pro, 0.5), 4);
  near(fileToReal(kid, 11.25), 1.25);
  near(realDuration(pro), 1);
  for (const t of [2, 2.37, 5.99]) near(realToFile(pro, fileToReal(pro, t)), t);
});

test("bad sloMoFactor is treated as 1", () => {
  const w = { trimStart: 1, trimEnd: 3, sloMoFactor: 0 };
  near(fileToReal(w, 2), 1);
});

test("linked delta moves both panes in real time", () => {
  const anchor = createLink(pro, kid, 3, 10.5); // pro real .25, kid real .5
  near(anchor.topReal, 0.25);
  near(anchor.bottomReal, 0.5);
  const w = { top: pro, bottom: kid };
  // Move top forward by 0.25 real (1 file second on the 4x clip).
  const a = linkedTargets(anchor, w, "top", 4);
  near(a.top, 4);
  near(a.bottom, 10.75);
  // Move bottom back 0.1 real.
  const b = linkedTargets(anchor, w, "bottom", 10.4);
  near(b.bottom, 10.4);
  near(b.top, 2.6);
});

test("each pane clamps to its own trim window without drifting the anchor", () => {
  const anchor = createLink(pro, kid, 5.5, 10.5); // pro .875 real, kid .5
  const w = { top: pro, bottom: kid };
  const far = linkedTargets(anchor, w, "bottom", 11.5); // +1 real -> pro would be 9.5
  near(far.bottom, 11.5);
  near(far.top, 6);
  const back = linkedTargets(anchor, w, "bottom", 10.5);
  near(back.top, 5.5);
  // Source itself is clamped too.
  const over = linkedTargets(anchor, w, "top", 100);
  near(over.top, 6);
  near(over.bottom, 10.5 + 0.125);
});

test("follower playback rate matches real speed", () => {
  near(followerRate(1, pro, kid), 0.25);
  near(followerRate(0.5, kid, pro), 2);
});

test("frame helpers", () => {
  assert.equal(frameIndex({ trimStart: 1 }, 1 + 10 / 30, 30), 10);
  assert.ok(sameFrame(1, 1 + 0.01, 30));
  assert.ok(!sameFrame(1, 1 + 0.02, 30));
});

test("stepTarget steps from the presented frame and accumulates while pending", () => {
  const window = { trimStart: 0, trimEnd: 10 };
  const fps = 30;
  // Presented frame 3 (t=0.1): next is frame 4, aimed mid-frame.
  const n = stepTarget({ presented: 0.1, target: 0.1, pending: false, fps, dir: 1, window });
  assert.equal(Math.floor(n * fps + 1e-6), 4);
  const p = stepTarget({ presented: 0.1, target: 0.1, pending: false, fps, dir: -1, window });
  assert.equal(Math.floor(p * fps + 1e-6), 2);
  // Pending target frame 7 => step from 7 to 8 regardless of presented.
  const q = stepTarget({ presented: 0.1, target: 7.2 / 30, pending: true, fps, dir: 1, window });
  assert.equal(Math.floor(q * fps + 1e-6), 8);
  // Clamped at the edges.
  assert.equal(stepTarget({ presented: 0, target: 0, pending: false, fps, dir: -1, window }), 0);
  assert.equal(stepTarget({ presented: 10, target: 10, pending: false, fps, dir: 1, window }), 10);
});

test("stepTarget tolerates a wrong fps estimate (actual 24, assumed 30)", () => {
  const window = { trimStart: 0, trimEnd: 10 };
  // Actual frames at k/24. Presented frame 5 = 0.2083.
  const next = stepTarget({ presented: 5 / 24, target: 5 / 24, pending: false, fps: 30, dir: 1, window });
  assert.equal(Math.floor(next * 24 + 1e-6), 6);
});
