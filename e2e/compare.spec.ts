import { expect, test } from "@playwright/test";
import {
  displayedFrame,
  engineInfo,
  openCompareWithSamples,
  settle,
  thumbX,
  trackBox,
  waitReady,
  waitSettled,
} from "./helpers";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await openCompareWithSamples(page);
});

test("layout follows the device orientation", async ({ page }, info) => {
  const layout = await page.getByTestId("compare-screen").getAttribute("data-layout");
  expect(layout).toBe(info.project.name.startsWith("ipad") ? "side" : "stacked");
  await page.getByTestId("layout-toggle").click();
  await expect(page.getByTestId("compare-screen")).toHaveAttribute("data-layout", layout === "side" ? "stacked" : "side");
});

test("scrubber: video follows the finger and the thumb tracks the pointer", async ({ page }) => {
  const box = await trackBox(page, "bottom");
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.1, y);
  await page.mouse.down();
  for (const frac of [0.25, 0.5, 0.8, 0.4]) {
    const x = box.x + box.width * frac;
    await page.mouse.move(x, y, { steps: 6 });
    // Thumb is under the finger immediately, before the video catches up.
    expect(Math.abs((await thumbX(page, "bottom")) - x)).toBeLessThan(3);
    await waitSettled(page, "bottom");
    const e = await engineInfo(page, "bottom");
    const expected = e.trimStart + frac * (e.trimEnd - e.trimStart);
    expect(Math.abs(e.currentTime - expected)).toBeLessThan(1.5 / e.fps);
  }
  await page.mouse.up();
});

test("frame step moves exactly one frame (~1/fps)", async ({ page }) => {
  const box = await trackBox(page, "bottom");
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height / 2);
  await waitSettled(page, "bottom");
  // fps is learned from the container for unknown clips; the fixture is 30 fps.
  await expect.poll(async () => (await engineInfo(page, "bottom")).fps).toBe(30);
  const f0 = await displayedFrame(page, "bottom");
  const t0 = (await engineInfo(page, "bottom")).presented!;
  await page.getByTestId("scrubber-bottom-next").click();
  await waitSettled(page, "bottom");
  const f1 = await displayedFrame(page, "bottom");
  const t1 = (await engineInfo(page, "bottom")).presented!;
  expect(f1).toBe(f0 + 1);
  expect(Math.abs(t1 - t0 - 1 / 30)).toBeLessThan(0.01);
  await page.getByTestId("scrubber-bottom-next").click();
  await page.getByTestId("scrubber-bottom-next").click();
  await waitSettled(page, "bottom");
  expect(await displayedFrame(page, "bottom")).toBe(f0 + 3);
  await page.getByTestId("scrubber-bottom-prev").click();
  await waitSettled(page, "bottom");
  expect(await displayedFrame(page, "bottom")).toBe(f0 + 2);
});

test("keyboard arrows step the last touched pane", async ({ page }) => {
  const box = await trackBox(page, "top");
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height / 2);
  await waitSettled(page, "top");
  await expect.poll(async () => (await engineInfo(page, "top")).fps).toBe(60);
  const f0 = await displayedFrame(page, "top");
  await page.keyboard.press("ArrowRight");
  await waitSettled(page, "top");
  expect(await displayedFrame(page, "top")).toBe(f0 + 1);
});

test("link: one scrubber moves both panes by the same real time", async ({ page }) => {
  const top = await trackBox(page, "top");
  const bottom = await trackBox(page, "bottom");
  await page.mouse.click(top.x + top.width * 0.5, top.y + top.height / 2);
  await page.mouse.click(bottom.x + bottom.width * 0.2, bottom.y + bottom.height / 2);
  await waitSettled(page, "top");
  await waitSettled(page, "bottom");
  const t0 = (await engineInfo(page, "top")).currentTime;
  const b0 = (await engineInfo(page, "bottom")).currentTime;

  await page.getByTestId("link-toggle").click();
  await expect(page.getByTestId("link-toggle")).toHaveAttribute("aria-pressed", "true");

  await page.mouse.click(bottom.x + bottom.width * 0.4, bottom.y + bottom.height / 2);
  await waitSettled(page, "top");
  await waitSettled(page, "bottom");
  const t1 = (await engineInfo(page, "top")).currentTime;
  const b1 = (await engineInfo(page, "bottom")).currentTime;
  expect(b1 - b0).toBeGreaterThan(0.5);
  // sloMoFactor is 1 for both samples, so real delta == file delta.
  expect(Math.abs(t1 - t0 - (b1 - b0))).toBeLessThan(0.05);

  // Frame step on the top pane moves the bottom too.
  await page.getByTestId("scrubber-top-next").click();
  await waitSettled(page, "top");
  await waitSettled(page, "bottom");
  expect((await engineInfo(page, "bottom")).currentTime).toBeGreaterThan(b1);

  // Unlink keeps positions; then only one pane moves.
  await page.getByTestId("link-toggle").click();
  await expect(page.getByTestId("link-toggle")).toHaveAttribute("aria-pressed", "false");
  const t2 = (await engineInfo(page, "top")).currentTime;
  await page.mouse.click(bottom.x + bottom.width * 0.7, bottom.y + bottom.height / 2);
  await waitSettled(page, "bottom");
  expect((await engineInfo(page, "top")).currentTime).toBeCloseTo(t2, 3);
});

test("jog: horizontal drag on the video scrubs about a frame per 6px", async ({ page }) => {
  const pane = await page.getByTestId("pane-bottom").boundingBox();
  const start = (await engineInfo(page, "bottom")).currentTime;
  const y = pane!.y + pane!.height / 2;
  await page.mouse.move(pane!.x + 40, y);
  await page.mouse.down();
  await page.mouse.move(pane!.x + 40 + 60, y, { steps: 10 });
  await page.mouse.up();
  await waitSettled(page, "bottom");
  const e = await engineInfo(page, "bottom");
  const frames = (e.currentTime - start) * e.fps;
  expect(frames).toBeGreaterThan(7);
  expect(frames).toBeLessThan(13);
});

test("pro picker switches the top clip and auto-flips for handedness", async ({ page }) => {
  // Athlete samples are left-handed.
  const picker = page.getByTestId("pro-picker");
  await picker.getByRole("option", { name: /Pro sample A/ }).click();
  await settle(page, 800);
  await expect(picker.getByRole("option", { name: /Pro sample A/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("flip-top")).toHaveAttribute("aria-pressed", "true");
  await picker.getByRole("option", { name: /Jackson Holliday/ }).click();
  await settle(page, 800);
  await expect(picker.getByRole("option", { name: /Jackson Holliday/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByTestId("flip-top")).toHaveAttribute("aria-pressed", "false");
  // Manual override.
  await page.getByTestId("flip-top").click();
  await expect(page.getByTestId("flip-top")).toHaveAttribute("aria-pressed", "true");
  const transform = await page.getByTestId("pane-top-video").evaluate((v) => (v as HTMLVideoElement).style.transform);
  expect(transform).toContain("scaleX(-1)");
});

test("snapshot saves to /snaps and reopens in compare", async ({ page }) => {
  const box = await trackBox(page, "bottom");
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
  await waitSettled(page, "bottom");
  const bt = (await engineInfo(page, "bottom")).currentTime;

  await page.getByTestId("snapshot-button").click();
  await expect(page.getByTestId("snapshot-toast")).toBeVisible();
  await page.getByTestId("toast-note").fill("hands at load");
  await settle(page, 500);

  await page.goto("/snaps");
  await expect(page.getByTestId("snap-tile")).toHaveCount(1);
  await expect(page.getByTestId("snap-tile")).toContainText("hands at load");
  const size = await page.getByTestId("snap-tile").locator("img").evaluate((img) => (img as HTMLImageElement).naturalWidth);
  expect(size).toBeGreaterThan(100);

  await page.getByTestId("snap-tile").click();
  await expect(page.getByTestId("snap-viewer")).toBeVisible();
  await page.getByTestId("snap-open-compare").click();
  await expect(page).toHaveURL(/\/compare\?/);
  await waitReady(page, "bottom");
  await expect.poll(async () => (await engineInfo(page, "bottom")).currentTime).toBeCloseTo(bt, 2);
});
