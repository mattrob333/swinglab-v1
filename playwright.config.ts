import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

// Only Chromium is installed (PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers). The
// device descriptors default to WebKit, so force Chromium on both projects.
process.env.PLAYWRIGHT_BROWSERS_PATH ??= "/opt/pw-browsers";

export default defineConfig({
  testDir: "./e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  outputDir: path.join(os.tmpdir(), "swinglab-pw-results"),
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    { name: "iphone-15", use: { ...devices["iPhone 15"], browserName: "chromium" } },
    { name: "ipad-pro-11-landscape", use: { ...devices["iPad Pro 11 landscape"], browserName: "chromium" } },
  ],
});
