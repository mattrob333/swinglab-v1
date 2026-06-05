import assert from "node:assert/strict";
import test from "node:test";

import {
  currentPhase,
  frameForProgress,
  frameTimeSeconds,
  videoFrameCacheKey,
} from "../src/components/video-frame-engine-utils.ts";

test("frame time uses seconds, not milliseconds divided twice", () => {
  assert.equal(frameTimeSeconds(30, 30), 1);
  assert.equal(frameTimeSeconds(12, 24), 0.5);
});

test("frame cache keys isolate videos and mirror state", () => {
  assert.notEqual(
    videoFrameCacheKey("/videos/pro/a.mp4", false, 42),
    videoFrameCacheKey("/videos/youth/b.mp4", false, 42)
  );
  assert.notEqual(
    videoFrameCacheKey("/videos/pro/a.mp4", false, 42),
    videoFrameCacheKey("/videos/pro/a.mp4", true, 42)
  );
});

const phaseNames = ["stance", "load", "contact", "finish"];
const phasePositions = {
  stance: 0,
  load: 0.25,
  contact: 0.75,
  finish: 1,
};
const phaseFrames = {
  stance: 10,
  load: 20,
  contact: 80,
  finish: 100,
};

test("frame progress clamps and interpolates across phase markers", () => {
  assert.equal(
    frameForProgress(-0.5, phaseFrames, phaseNames, phasePositions),
    10
  );
  assert.equal(
    frameForProgress(0.5, phaseFrames, phaseNames, phasePositions),
    50
  );
  assert.equal(
    frameForProgress(1.5, phaseFrames, phaseNames, phasePositions),
    100
  );
});

test("current phase chooses the nearest phase marker", () => {
  assert.equal(currentPhase(0.1, phaseNames, phasePositions), "stance");
  assert.equal(currentPhase(0.26, phaseNames, phasePositions), "load");
  assert.equal(currentPhase(0.9, phaseNames, phasePositions), "finish");
});
