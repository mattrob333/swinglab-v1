import { test } from "node:test";
import assert from "node:assert/strict";
import { fineScrubLevel, nextFineDrag } from "../src/lib/player/fine-scrub.ts";

test("speed drops as the finger moves away from the track", () => {
  assert.equal(fineScrubLevel(0).speed, 1);
  assert.equal(fineScrubLevel(-49).speed, 1);
  assert.equal(fineScrubLevel(60).speed, 0.5);
  assert.equal(fineScrubLevel(-120).speed, 0.25);
  assert.equal(fineScrubLevel(300).speed, 0.1);
});

test("full speed keeps the thumb under the finger", () => {
  const s = nextFineDrag({ frac: 0, lastX: 0, relative: false }, 150, 0, 100, 200);
  assert.equal(s.frac, 0.25);
  assert.equal(s.relative, false);
});

test("fine mode applies a scaled delta and stays relative afterwards", () => {
  let s = { frac: 0.5, lastX: 200, relative: false };
  s = nextFineDrag(s, 240, 200, 100, 200); // 40px at 0.1x -> +0.02
  assert.ok(Math.abs(s.frac - 0.52) < 1e-9);
  assert.equal(s.relative, true);
  s = nextFineDrag(s, 260, 0, 100, 200); // back on the track: full speed delta, no jump
  assert.ok(Math.abs(s.frac - 0.62) < 1e-9);
});

test("clamps to the track", () => {
  const s = nextFineDrag({ frac: 0.99, lastX: 0, relative: true }, 500, 0, 0, 100);
  assert.equal(s.frac, 1);
});
