import fs from "node:fs";
import { expect, type Page } from "@playwright/test";
import { fixturePath } from "./fixture-paths";

export type Pane = "top" | "bottom";

/** Serve WebM fixtures in place of the H.264 sample videos (no H.264 in Playwright Chromium). */
export async function routeSampleVideos(page: Page): Promise<void> {
  const pro = fs.readFileSync(fixturePath("pro-60fps.webm"));
  const youth = fs.readFileSync(fixturePath("youth-30fps.webm"));
  await page.route("**/videos/**", (route) => {
    const url = route.request().url();
    const body = url.includes("/videos/pro/") ? pro : youth;
    return route.fulfill({ status: 200, contentType: "video/webm", body });
  });
}

/** Fresh store, load samples through the real UI, land on the compare screen with both panes ready. */
export async function openCompareWithSamples(page: Page): Promise<void> {
  await routeSampleVideos(page);
  await page.goto("/compare");
  await page.getByTestId("load-samples").click();
  await expect(page.getByTestId("compare-screen")).toBeVisible();
  await waitReady(page, "top");
  await waitReady(page, "bottom");
}

export async function waitReady(page: Page, pane: Pane): Promise<void> {
  await expect
    .poll(() => page.evaluate((p) => {
      const v = document.querySelector<HTMLVideoElement>(`[data-testid=pane-${p}-video]`);
      return !!v && v.readyState >= 2 && !!(v as unknown as { __engine?: unknown }).__engine;
    }, pane))
    .toBe(true);
  await waitSettled(page, pane);
}

export interface EngineInfo {
  currentTime: number;
  presented: number | null;
  target: number | null;
  pending: boolean;
  playing: boolean;
  fps: number;
  trimStart: number;
  trimEnd: number;
  stats: {
    requests: number;
    issued: number;
    maxLatency: number;
    latencies: number[];
    framesPresented: number;
    presentTimeouts: number;
    sameFrameSeeks: number;
  };
}

export function engineInfo(page: Page, pane: Pane): Promise<EngineInfo> {
  return page.evaluate((p) => {
    const v = document.querySelector<HTMLVideoElement>(`[data-testid=pane-${p}-video]`)!;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const e = (v as any).__engine;
    return {
      currentTime: v.currentTime,
      presented: e.presented,
      target: e.target,
      pending: e.pending,
      playing: e.playing,
      fps: e.fps,
      trimStart: e.trimStart,
      trimEnd: e.trimEnd,
      stats: e.stats,
    };
  }, pane);
}

export async function waitSettled(page: Page, pane: Pane): Promise<void> {
  await expect.poll(async () => (await engineInfo(page, pane)).pending, { timeout: 10_000 }).toBe(false);
}

/** Reads the frame index encoded in the top blocks of the frame currently in the video element. */
export function displayedFrame(page: Page, pane: Pane): Promise<number> {
  return page.evaluate((p) => {
    const v = document.querySelector<HTMLVideoElement>(`[data-testid=pane-${p}-video]`)!;
    const c = document.createElement("canvas");
    c.width = v.videoWidth;
    c.height = v.videoHeight;
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.drawImage(v, 0, 0);
    const bw = c.width / 10;
    let n = 0;
    for (let b = 0; b < 10; b++) {
      const d = ctx.getImageData(Math.floor(b * bw + bw / 2), 24, 1, 1).data;
      n = (n << 1) | (d[0] + d[1] + d[2] > 384 ? 1 : 0);
    }
    return n;
  }, pane);
}

export async function trackBox(page: Page, pane: Pane) {
  const box = await page.getByTestId(`scrubber-${pane}-track`).boundingBox();
  if (!box) throw new Error("track not visible");
  return box;
}

/** Centre x of the scrubber thumb knob, in page px. */
export async function thumbX(page: Page, pane: Pane): Promise<number> {
  return page.evaluate((p) => {
    const knob = document.querySelector(`[data-testid=scrubber-${p}-thumb] > div`)!;
    const r = knob.getBoundingClientRect();
    return r.left + r.width / 2;
  }, pane);
}

/** Wait until the page is quiet after the picker settles (it selects on scroll end). */
export async function settle(page: Page, ms = 400): Promise<void> {
  await page.waitForTimeout(ms);
}
