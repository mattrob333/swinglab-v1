import os from "node:os";
import path from "node:path";

export interface FixtureSpec {
  name: string;
  fps: number;
  frames: number;
  width: number;
  height: number;
  hue: number;
}

export const FIXTURES: FixtureSpec[] = [
  { name: "pro-60fps.webm", fps: 60, frames: 240, width: 360, height: 640, hue: 210 },
  { name: "youth-30fps.webm", fps: 30, frames: 150, width: 360, height: 640, hue: 20 },
];

export const FIXTURE_DIR = path.join(os.tmpdir(), "swinglab-e2e-fixtures-v1");

export function fixturePath(name: string): string {
  return path.join(FIXTURE_DIR, name);
}
