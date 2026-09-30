import { expect, test } from "@playwright/test";
import { engineInfo, openCompareWithSamples, trackBox, waitSettled, type Pane } from "./helpers";

// Drags a finger across a scrubber for ~2s (real touch events via CDP) and
// reports how many distinct frames were presented and seek latency. Fixture
// clips have a keyframe only every 60 frames, so seeks decode up to 59 frames.
// Thresholds are deliberately loose; the numbers are printed for tracking.

for (const pane of ["top", "bottom"] as Pane[]) {
  test(`scrub performance: ${pane} pane`, async ({ page }, info) => {
    await openCompareWithSamples(page);
    const box = await trackBox(page, pane);
    const y = box.y + box.height / 2;
    const cdp = await page.context().newCDPSession(page);
    await page.evaluate((p) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (document.querySelector(`[data-testid=pane-${p}-video]`) as any).__engine.resetStats();
    }, pane);

    const moves = 120;
    const x0 = box.x + box.width * 0.03;
    const x1 = box.x + box.width * 0.97;
    const t0 = Date.now();
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: x0, y }] });
    let thumbErrMax = 0;
    for (let i = 1; i <= moves; i++) {
      const x = x0 + ((x1 - x0) * i) / moves;
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      if (i % 20 === 0) {
        const tx = await page.evaluate((p) => {
          const r = document.querySelector(`[data-testid=scrubber-${p}-thumb] > div`)!.getBoundingClientRect();
          return r.left + r.width / 2;
        }, pane);
        thumbErrMax = Math.max(thumbErrMax, Math.abs(tx - x));
      }
      const due = t0 + (2000 * i) / moves;
      const wait = due - Date.now();
      if (wait > 0) await page.waitForTimeout(wait);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    const dragMs = Date.now() - t0;
    await waitSettled(page, pane);

    const e = await engineInfo(page, pane);
    const lat = [...e.stats.latencies].sort((a, b) => a - b);
    const avg = lat.reduce((a, b) => a + b, 0) / Math.max(1, lat.length);
    const p95 = lat[Math.min(lat.length - 1, Math.floor(lat.length * 0.95))] ?? 0;
    const report = {
      project: info.project.name,
      pane,
      fps: e.fps,
      dragMs,
      pointerMoves: moves,
      targetsRequested: e.stats.requests,
      seeksIssued: e.stats.issued,
      distinctFramesPresented: e.stats.framesPresented,
      presentedPerSecond: +(e.stats.framesPresented / (dragMs / 1000)).toFixed(1),
      seekLatencyMs: { avg: +avg.toFixed(1), p95: +p95.toFixed(1), max: +e.stats.maxLatency.toFixed(1) },
      thumbMaxErrorPx: +thumbErrMax.toFixed(2),
    };
    console.log(`SCRUB_PERF ${JSON.stringify(report)}`);
    await info.attach("scrub-perf.json", { body: JSON.stringify(report, null, 2), contentType: "application/json" });

    // Ends where the finger stopped.
    expect(Math.abs(e.currentTime - (e.trimStart + 0.97 * (e.trimEnd - e.trimStart)))).toBeLessThan(2 / e.fps);
    // Loose sanity: coalescing kept seeks <= requests, the video visibly moved, nothing hung.
    expect(e.stats.issued).toBeLessThanOrEqual(e.stats.requests);
    expect(e.stats.framesPresented).toBeGreaterThanOrEqual(8);
    expect(e.stats.maxLatency).toBeLessThan(3000);
    expect(thumbErrMax).toBeLessThan(3);
  });
}
