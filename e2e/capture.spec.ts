import { expect, test, type Page } from "@playwright/test";
import { fixturePath } from "./fixture-paths";
import { displayedFrame, engineInfo, waitReady, waitSettled } from "./helpers";

// Capture -> edit -> compare, driven through the real UI. Imports use the WebM
// fixtures (every frame encodes its own index), recording uses Chromium's fake camera.

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
});

async function trimStart(page: Page): Promise<number> {
  return Number(await page.getByTestId("trim-handle-start").getAttribute("aria-valuenow"));
}

async function jobState(page: Page, clipId: string): Promise<string | undefined> {
  return page.evaluate((id) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const jobs = (window as any).__swinglabJobs?.getJobsSnapshot();
    return jobs?.[id]?.state;
  }, clipId);
}

test("import -> trim (survives reload) -> compare opens at the trim start and stays there after optimizing", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("home-import-input").setInputFiles(fixturePath("youth-30fps.webm"));
  await expect(page.getByTestId("clip-editor")).toBeVisible();
  const clipId = page.url().match(/clips\/([^/]+)\/edit/)![1];

  // Trim the start forward 15 frames (fixture is 30 fps).
  await expect.poll(() => page.getByTestId("edit-video").evaluate((v) => (v as HTMLVideoElement).readyState)).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < 15; i++) await page.getByTestId("nudge-start-fwd").click();
  expect(await trimStart(page)).toBeCloseTo(0.5, 2);

  // Edits are autosaved: a reload (or iOS evicting the tab) keeps them.
  await page.waitForTimeout(700);
  await page.reload();
  await expect(page.getByTestId("clip-editor")).toBeVisible();
  await expect.poll(() => trimStart(page)).toBeCloseTo(0.5, 2);

  await page.getByTestId("compare-button").click();
  await expect(page).toHaveURL(new RegExp(`/compare\\?bottom=${clipId}`));
  await waitReady(page, "bottom");
  // 15 nudges land on the frame-14/15 boundary (float), so either neighbour is the trim start.
  const f0 = await displayedFrame(page, "bottom");
  expect(Math.abs(f0 - 15)).toBeLessThanOrEqual(1);

  // The optimized file replaces the original in the background; the pane must stay on the same frame.
  await expect.poll(() => jobState(page, clipId), { timeout: 60_000 }).toMatch(/done|unsupported|error/);
  if ((await jobState(page, clipId)) === "done") {
    await expect.poll(async () => (await engineInfo(page, "bottom")).trimStart).toBe(0);
    await waitReady(page, "bottom");
    await waitSettled(page, "bottom");
    // Before the fix the pane jumped by the trim start (15 frames) when the file was swapped.
    expect(Math.abs((await displayedFrame(page, "bottom")) - f0)).toBeLessThanOrEqual(1);
  }
});

test("camera unavailable: Close still leaves the recorder", async ({ page }) => {
  // No fake camera in this browser, so getUserMedia fails.
  await page.goto("/");
  await page.getByTestId("home-record").click();
  await expect(page.getByTestId("camera-error")).toBeVisible();
  await page.getByTestId("recorder-close").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("home")).toBeVisible();
});

test("bulk pro import: Done only appears once every file is in", async ({ page }) => {
  await page.goto("/library");
  await page.getByTestId("tab-pro").click();
  await page.getByTestId("add-pros").click();
  // Record whether Done ever shows while a row is still being read.
  await page.evaluate(() => {
    const w = window as unknown as { __doneTooEarly?: boolean };
    w.__doneTooEarly = false;
    new MutationObserver(() => {
      if (!document.querySelector("[data-testid=bulk-done]")) return;
      const busy = [...document.querySelectorAll("[data-testid=bulk-status]")].some((e) => e.textContent === "Reading…");
      if (busy) w.__doneTooEarly = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.getByTestId("bulk-input").setInputFiles([fixturePath("pro-60fps.webm"), fixturePath("youth-30fps.webm")]);
  await expect(page.getByTestId("bulk-row")).toHaveCount(2);
  await page.getByTestId("bulk-import-all").click();
  await expect(page.getByTestId("bulk-done")).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __doneTooEarly?: boolean }).__doneTooEarly)).toBe(false);
  await page.getByTestId("bulk-done").click();
  await expect(page.getByTestId("clip-card")).toHaveCount(2);
});
