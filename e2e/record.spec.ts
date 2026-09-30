import { expect, test } from "@playwright/test";
import { waitReady } from "./helpers";

// Record with Chromium's fake camera, then trim screen -> compare.
test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["camera"],
});

test("record -> stop -> editor -> compare", async ({ page }) => {
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
  await page.goto("/");
  await page.getByTestId("home-record").click();
  const record = page.getByTestId("record-button");
  await expect(record).toBeEnabled();
  await record.click();
  await expect(page.getByTestId("recorder")).toHaveAttribute("data-phase", "recording");
  await page.waitForTimeout(1500);
  await record.click();
  await expect(page.getByTestId("clip-editor")).toBeVisible();
  await expect(page.getByTestId("trim-length")).not.toHaveText("0.00s");
  await page.getByTestId("compare-button").click();
  await expect(page.getByTestId("compare-screen")).toBeVisible();
  await waitReady(page, "bottom");
});
