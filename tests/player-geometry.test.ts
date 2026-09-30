import { test } from "node:test";
import assert from "node:assert/strict";
import { applyMatrix, clampCrop, containRect, cropMatrix, pinchCrop } from "../src/lib/player/geometry.ts";
import { FpsEstimator, snapFps } from "../src/lib/player/fps.ts";

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test("containRect letterboxes", () => {
  assert.deepEqual(containRect(100, 50, 200, 200), { x: 0, y: 50, w: 200, h: 100 });
  assert.deepEqual(containRect(50, 100, 200, 100), { x: 75, y: 0, w: 50, h: 100 });
});

test("cropMatrix: identity for default crop, mirrored when flipped", () => {
  const m = cropMatrix({ scale: 1, x: 0, y: 0 }, false, 200, 100);
  assert.deepEqual(applyMatrix(m, 10, 20), [10, 20]);
  const f = cropMatrix({ scale: 1, x: 0, y: 0 }, true, 200, 100);
  assert.deepEqual(applyMatrix(f, 10, 20), [190, 20]);
});

test("cropMatrix matches CSS translate(x%,y%) scale(s) around centre", () => {
  const c = { scale: 2, x: 0.1, y: -0.2 };
  const m = cropMatrix(c, false, 200, 100);
  // Centre maps to centre + translation.
  const [cx, cy] = applyMatrix(m, 100, 50);
  near(cx, 120);
  near(cy, 30);
  const [ox, oy] = applyMatrix(m, 0, 0);
  near(ox, 100 + 20 - 200);
  near(oy, 50 - 20 - 100);
});

test("pinch keeps the content point under the fingers", () => {
  for (const flipped of [false, true]) {
    const start = { scale: 1.5, x: 0.05, y: -0.1 };
    const from = { x: 60, y: 40, dist: 100 };
    const to = { x: 90, y: 55, dist: 150 };
    const c = pinchCrop(start, from, to, 200, 100, flipped);
    near(c.scale, 2.25);
    // Content point under `from` before == content point under `to` after.
    const m0 = cropMatrix(start, flipped, 200, 100);
    const m1 = cropMatrix(c, flipped, 200, 100);
    const inv = (m: number[], x: number, y: number) => [(x - m[4]) / m[0], (y - m[5]) / m[3]];
    const p0 = inv(m0, from.x, from.y);
    const p1 = inv(m1, to.x, to.y);
    near(p0[0], p1[0]);
    near(p0[1], p1[1]);
  }
});

test("clampCrop bounds scale and pan", () => {
  assert.deepEqual(clampCrop({ scale: 10, x: 9, y: -9 }), { scale: 6, x: 3, y: -3 });
  assert.deepEqual(clampCrop({ scale: 0.2, x: 0, y: 0 }), { scale: 1, x: 0, y: 0 });
});

test("fps estimator learns 120 and 30 from presented frames", () => {
  for (const fps of [120, 30, 59.94]) {
    const e = new FpsEstimator();
    for (let i = 0; i < 20; i++) e.add(i / fps, i);
    assert.equal(e.estimate(), fps);
  }
});

test("fps estimator ignores dropped frames and seeks", () => {
  const e = new FpsEstimator();
  let pf = 0;
  for (let i = 0; i < 30; i++) {
    pf += i % 4 === 0 ? 2 : 1; // drops skip presentedFrames
    e.add(i / 30 + (i > 15 ? 3 : 0), pf);
  }
  assert.equal(e.estimate(), 30);
  assert.equal(snapFps(29.5), 29.97);
  assert.equal(snapFps(37), 37);
});
