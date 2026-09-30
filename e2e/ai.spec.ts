import { expect, test, type Page } from "@playwright/test";
import { openCompareWithSamples, settle } from "./helpers";

// AI UI flows with every /api/ai/* route mocked (the real APIs are never
// called). Voice notes use Chromium's fake microphone.
test.use({
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] },
  permissions: ["microphone"],
});

const TRANSCRIPT = "Keep the hands back";
const VIDEO_IDS = ["dQw4w9WgXcQ", "M7lc1UVf-VE"];

interface Captured {
  analyze: { model: string; analysisId: string | null; body: Record<string, unknown> }[];
  drills: number;
  transcribe: number;
}

function result(model: string, snapshotIds: string[]) {
  return {
    summary: `${model === "opus" ? "Opus" : "Sol"} says: good rhythm, but the front shoulder opens early.`,
    strengths: ["Balanced stance", "Quiet head"],
    issues: [
      { title: "Front shoulder opens early", detail: "Shoulder flies open before launch.", phase: "stride", severity: "high", snapshotIds },
      { title: "Hands drift forward", detail: "Hands push toward the pitcher at load.", phase: "load", severity: "medium", snapshotIds: [] },
      { title: "Short finish", detail: "Finish stops at the chest.", phase: "finish", severity: "low", snapshotIds: [] },
    ],
    drills: [{ name: "Closed-stance tee", why: "Stay closed longer", howTo: "Set up closed and hit to the opposite field.", reps: "3 x 10" }],
    cues: ["Stay closed", "Knob to the ball"],
    nextFocus: "Keep the front shoulder in until launch.",
  };
}

async function mockAi(page: Page, opts: { available?: boolean; statusCode?: number } = {}): Promise<Captured> {
  const captured: Captured = { analyze: [], drills: 0, transcribe: 0 };
  await page.route("**/api/ai/status", (route) => {
    if (opts.statusCode) return route.fulfill({ status: opts.statusCode, body: "Not found" });
    const available = opts.available ?? true;
    return route.fulfill({
      json: {
        available,
        models: available ? ["opus", "sol"] : [],
        transcribe: available,
        drills: available,
        reason: available ? null : "Sign in to use AI analysis",
        remainingToday: available ? 20 : null,
      },
    });
  });
  await page.route("**/api/ai/analyze", async (route) => {
    const req = route.request();
    const body = req.postDataJSON() as { model: string; snapshots: { id: string }[] };
    captured.analyze.push({ model: body.model, analysisId: req.headers()["x-analysis-id"] ?? null, body });
    const modelId = body.model === "opus" ? "claude-opus-5-5" : "gpt-6.1-sol";
    const lines = [
      { type: "status", message: "Looking at the snapshots" },
      { type: "status", message: "Writing the report" },
      { type: "result", modelId, result: result(body.model, body.snapshots.map((s) => s.id)) },
    ];
    await new Promise((r) => setTimeout(r, 300));
    return route.fulfill({ status: 200, contentType: "application/x-ndjson", body: lines.map((l) => JSON.stringify(l)).join("\n") + "\n" });
  });
  await page.route("**/api/ai/drills", (route) => {
    captured.drills++;
    return route.fulfill({
      json: {
        videos: [
          { title: "Stay closed drill", url: `https://www.youtube.com/watch?v=${VIDEO_IDS[0]}`, channel: "Hitting Lab", why: "Keeps the shoulder in" },
          { title: "Hands back load", url: `https://youtu.be/${VIDEO_IDS[1]}`, channel: "Coach Tips", why: "Fixes hand drift" },
        ],
      },
    });
  });
  await page.route("**/api/ai/transcribe", (route) => {
    captured.transcribe++;
    return route.fulfill({ json: { text: TRANSCRIPT } });
  });
  // The inline player is not under test: never load YouTube.
  await page.route(/youtube(-nocookie)?\.com/, (route) => route.fulfill({ contentType: "text/html", body: "<html><body>video</body></html>" }));
  return captured;
}

async function takeSnapshot(page: Page) {
  await openCompareWithSamples(page);
  await page.getByTestId("snapshot-button").click();
  await expect(page.getByTestId("snapshot-toast")).toBeVisible();
}

async function recordVoice(page: Page, testId: string) {
  const btn = page.getByTestId(testId);
  await expect(btn).toHaveAttribute("aria-disabled", "false");
  await btn.click();
  await expect(btn).toHaveAttribute("data-phase", "recording");
  await expect(page.getByTestId(`${testId}-timer`)).toBeVisible();
  await page.waitForTimeout(1200);
  await btn.click();
  await expect(btn).toHaveAttribute("data-phase", "idle");
}

async function selectFirstSnapAndOpenSheet(page: Page) {
  await page.goto("/snaps");
  await expect(page.getByTestId("snap-tile")).toHaveCount(1);
  await page.getByTestId("snaps-select").click();
  await page.getByTestId("snap-tile").first().click();
  await expect(page.getByTestId("select-count")).toHaveText("1 selected");
  await page.getByTestId("snaps-analyze").click();
  await expect(page.getByTestId("analyze-sheet")).toBeVisible();
}

test.beforeEach(({ page }) => {
  page.on("pageerror", (e) => console.log("[pageerror]", e.message));
});

test("voice note on a snapshot, analyze with Opus, report and drill videos", async ({ page }) => {
  const captured = await mockAi(page);
  await takeSnapshot(page);

  // Voice note from the snapshot toast appends to the note.
  await recordVoice(page, "toast-voice");
  await expect(page.getByTestId("toast-note")).toHaveValue(TRANSCRIPT);
  expect(captured.transcribe).toBe(1);
  await settle(page, 500);

  await selectFirstSnapAndOpenSheet(page);
  await expect(page.getByTestId("snap-tile")).toContainText(TRANSCRIPT);
  await expect(page.getByTestId("analyze-model-opus")).toHaveAttribute("aria-checked", "true");
  await page.getByTestId("analyze-notes").fill("Late on fastballs");
  await page.getByTestId("analyze-age").fill("12");
  await page.getByTestId("analyze-submit").click();

  await expect(page).toHaveURL(/\/analysis\/[0-9a-f-]{36}$/);
  const report = page.getByTestId("analysis-report");
  await expect(report).toBeVisible();
  await expect(page.getByTestId("report-model")).toHaveText("Claude Opus 5.5");
  await expect(page.getByTestId("report-summary")).toContainText("Opus says");
  await expect(page.getByTestId("report-issue")).toHaveCount(3);
  await expect(page.getByTestId("report-issue").first()).toHaveAttribute("data-severity", "high");
  await expect(page.getByTestId("report-cues")).toContainText("Stay closed");

  // Request shape: one snapshot as bare base64 JPEG, athlete info, analysis id header = stored id.
  expect(captured.analyze).toHaveLength(1);
  const sent = captured.analyze[0];
  expect(sent.model).toBe("opus");
  const snaps = sent.body.snapshots as { imageBase64: string; note: string }[];
  expect(snaps).toHaveLength(1);
  expect(snaps[0].imageBase64.startsWith("/9j/")).toBe(true); // JPEG magic in base64
  expect(snaps[0].note).toBe(TRANSCRIPT);
  expect(sent.body.coachNotes).toBe("Late on fastballs");
  expect((sent.body.athlete as { age: number }).age).toBe(12);
  expect(page.url()).toContain(sent.analysisId!);

  // Tap an issue's snapshot to view it full size.
  await page.getByTestId("report-issue").first().getByTestId("snapshot-thumb").click();
  await expect(page.getByTestId("image-lightbox")).toBeVisible();
  await page.getByTestId("image-lightbox").getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("image-lightbox")).toHaveCount(0);

  // Drill videos are fetched, stored on the analysis and play inline.
  await page.getByTestId("find-drills").click();
  await expect(page.getByTestId("drill-video")).toHaveCount(2);
  expect(captured.drills).toBe(1);
  await page.getByTestId("drill-video-play").first().click();
  await expect(page.getByTestId("drill-video-embed")).toHaveAttribute("src", new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${VIDEO_IDS[0]}`));

  // Persisted: survives a reload.
  await page.reload();
  await expect(page.getByTestId("drill-video")).toHaveCount(2);

  // The snapshot links back to its analysis; the list shows it.
  await page.goto("/snaps");
  await expect(page.getByTestId("snap-tile-analyses")).toHaveText("AI 1");
  await page.getByTestId("snap-tile").click();
  await page.getByTestId("snap-analysis-chip").click();
  await expect(page.getByTestId("analysis-report")).toBeVisible();
  await page.getByTestId("analysis-back").click();
  await expect(page.getByTestId("analysis-item")).toHaveCount(1);
});

test("Both runs Opus and Sol in parallel and opens the comparison", async ({ page }, info) => {
  const captured = await mockAi(page);
  await takeSnapshot(page);
  await selectFirstSnapAndOpenSheet(page);

  // Voice note for the analysis becomes the transcript.
  await recordVoice(page, "analyze-voice");
  await expect(page.getByTestId("analyze-transcript")).toHaveValue(TRANSCRIPT);

  await page.getByTestId("analyze-model-both").click();
  await page.getByTestId("analyze-submit").click();
  await expect(page).toHaveURL(/\/analysis\/[0-9a-f-]{36}\?vs=[0-9a-f-]{36}$/);
  await expect(page.getByTestId("analysis-screen")).toHaveAttribute("data-compare", "true");
  expect(captured.analyze.map((a) => a.model).sort()).toEqual(["opus", "sol"]);
  expect(new Set(captured.analyze.map((a) => a.analysisId)).size).toBe(2);
  expect(captured.analyze[0].body.transcript).toBe(TRANSCRIPT);

  const reports = page.getByTestId("analysis-report");
  await expect(reports).toHaveCount(2);
  if (info.project.name.startsWith("ipad")) {
    // Side by side.
    await expect(reports.nth(0)).toBeVisible();
    await expect(reports.nth(1)).toBeVisible();
    const [a, b] = await Promise.all([reports.nth(0).boundingBox(), reports.nth(1).boundingBox()]);
    expect(b!.x).toBeGreaterThan(a!.x + a!.width - 5);
  } else {
    // Tabs on a phone.
    await expect(page.locator("[data-testid=analysis-report][data-model=opus]")).toBeVisible();
    await expect(page.locator("[data-testid=analysis-report][data-model=sol]")).toBeHidden();
    await page.getByTestId("compare-tab-sol").click();
    await expect(page.locator("[data-testid=analysis-report][data-model=sol]")).toBeVisible();
  }
  await page.goto("/analysis");
  await expect(page.getByTestId("analysis-item")).toHaveCount(2);
});

test("AI unavailable: buttons stay visible, disabled, with the reason", async ({ page }) => {
  await mockAi(page, { available: false });
  await takeSnapshot(page);
  // aria-disabled (not disabled): a tap explains why.
  await page.getByTestId("toast-voice").click({ force: true });
  await expect(page.getByTestId("toast-voice")).toHaveAttribute("aria-disabled", "true");
  await expect(page.getByTestId("toast-voice-message")).toHaveText("Sign in to use AI analysis");

  await page.goto("/snaps");
  await page.getByTestId("snaps-select").click();
  await page.getByTestId("snap-tile").first().click();
  await expect(page.getByTestId("snaps-analyze")).toBeDisabled();
  await expect(page.getByTestId("select-reason")).toHaveText("Sign in to use AI analysis");
});

test("missing AI routes (404) read as unavailable, not broken", async ({ page }) => {
  await mockAi(page, { statusCode: 404 });
  await takeSnapshot(page);
  await page.goto("/snaps");
  await page.getByTestId("snaps-select").click();
  await page.getByTestId("snap-tile").first().click();
  await expect(page.getByTestId("snaps-analyze")).toBeDisabled();
  await expect(page.getByTestId("select-reason")).toContainText("AI isn't set up");
});
