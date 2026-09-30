// Route logic with fake model providers: no network, no API keys, no cost.
import { test } from "node:test";
import assert from "node:assert/strict";
import type { AnalyzeEvent } from "../src/lib/ai/contract.ts";
import { decodeEvents, encodeEvent, ndjsonStream } from "../src/lib/ai/ndjson.ts";
import { ModelError, type AnalysisProvider, type DrillFinder } from "../src/lib/ai/providers.ts";
import { runAnalyze, runDrills, type UsageRecord } from "../src/lib/ai/run.ts";
import { parseAnalyzeRequest, type CheckedAnalyzeRequest } from "../src/lib/ai/validate.ts";
import { analysisRequestText, paneDescription, snapshotLabel } from "../src/lib/ai/prompts.ts";
import { buildAnalysisContent, searchedYouTubeIds } from "../src/lib/ai/anthropic.ts";
import { buildSolInput } from "../src/lib/ai/openai.ts";

const A = "11111111-0000-4000-8000-000000000001";
const B = "22222222-0000-4000-8000-000000000002";
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 1, 2, 3, 4, 5, 6]).toString("base64");

function request(): CheckedAnalyzeRequest {
  const r = parseAnalyzeRequest({
    model: "opus",
    snapshots: [A, B].map((id, i) => ({
      id,
      imageBase64: JPEG_B64,
      topTitle: "Juan Soto",
      bottomTitle: `Swing · Sep ${i + 1}`,
      layout: i === 0 ? "stacked" : "side",
      note: i === 0 ? "load" : "",
    })),
    athlete: { handedness: "L", age: 11, level: "10U" },
    coachNotes: "front shoulder",
    transcript: "he pulls off the ball",
  });
  assert.ok(r.ok);
  return r.value;
}

const goodRaw = {
  summary: "Nice load.",
  strengths: ["Balance"],
  issues: [{ title: "Pulls off", detail: "Head moves", phase: "contact", severity: "medium", snapshotIds: [B, "bogus"] }],
  drills: [{ name: "Tee", why: "w", howTo: "h", reps: "r" }],
  cues: ["Eyes on the ball"],
  nextFocus: "Head still",
};

function fakeProvider(behavior: () => Promise<{ raw: unknown }>): AnalysisProvider {
  return {
    model: "opus",
    defaultModelId: "claude-opus-5-5",
    async analyze(_req, hooks) {
      hooks.onStatus("Writing the report…");
      const { raw } = await behavior();
      return { modelId: "claude-opus-5-5", raw, usage: { inputTokens: 100, outputTokens: 50 } };
    },
  };
}

async function collect(req: CheckedAnalyzeRequest, provider: AnalysisProvider, save?: (a: unknown) => Promise<void>) {
  const events: AnalyzeEvent[] = [];
  const usage: UsageRecord[] = [];
  await runAnalyze(req, { provider, recordUsage: async (u) => void usage.push(u), saveAnalysis: save }, (e) => events.push(e));
  return { events, usage };
}

test("NDJSON: one event per line, newlines inside strings stay escaped", () => {
  const line = encodeEvent({ type: "status", message: "a\nb" });
  assert.equal(line.split("\n").length, 2);
  assert.ok(line.endsWith("\n"));
  assert.deepEqual(decodeEvents(line + encodeEvent({ type: "error", message: "x" })), [
    { type: "status", message: "a\nb" },
    { type: "error", message: "x" },
  ]);
});

test("NDJSON stream: emits lines, turns a throw into a final error event", async () => {
  const ok = await new Response(ndjsonStream(async (emit) => emit({ type: "status", message: "hi" }))).text();
  assert.deepEqual(decodeEvents(ok), [{ type: "status", message: "hi" }]);
  const failed = await new Response(
    ndjsonStream(async (emit) => {
      emit({ type: "status", message: "hi" });
      throw new Error("secret detail");
    }),
  ).text();
  const events = decodeEvents(failed);
  assert.equal(events.at(-1)?.type, "error");
  assert.ok(!failed.includes("secret detail"));
});

test("analyze: status events, then a validated result; usage recorded; saved", async () => {
  const saved: unknown[] = [];
  const { events, usage } = await collect(request(), fakeProvider(async () => ({ raw: goodRaw })), async (a) => void saved.push(a));
  assert.deepEqual(events[0], { type: "status", message: "Looking at 2 snapshots…" });
  assert.deepEqual(events[1], { type: "status", message: "Writing the report…" });
  const last = events.at(-1)!;
  assert.equal(last.type, "result");
  if (last.type === "result") {
    assert.equal(last.modelId, "claude-opus-5-5");
    assert.deepEqual(last.result.issues[0].snapshotIds, [B]); // "bogus" filtered
  }
  assert.deepEqual(usage, [{ kind: "analyze", modelId: "claude-opus-5-5", inputTokens: 100, outputTokens: 50 }]);
  assert.equal(saved.length, 1);
  assert.equal(events.filter((e) => e.type === "result" || e.type === "error").length, 1);
});

test("analyze: invalid model output becomes an error event (usage still recorded, nothing saved)", async () => {
  const saved: unknown[] = [];
  const { events, usage } = await collect(request(), fakeProvider(async () => ({ raw: { summary: 1 } })), async (a) => void saved.push(a));
  assert.equal(events.at(-1)?.type, "error");
  assert.equal(usage.length, 1);
  assert.equal(saved.length, 0);
});

test("analyze: ModelError shows its user message and records partial usage", async () => {
  const provider: AnalysisProvider = {
    model: "opus",
    defaultModelId: "claude-opus-5-5",
    async analyze() {
      throw new ModelError("refusal (bio)", "Claude declined to write the report.", { inputTokens: 7, outputTokens: 0 });
    },
  };
  const { events, usage } = await collect(request(), provider);
  assert.deepEqual(events.at(-1), { type: "error", message: "Claude declined to write the report." });
  assert.deepEqual(usage, [{ kind: "analyze", modelId: "claude-opus-5-5", inputTokens: 7, outputTokens: 0 }]);
});

test("analyze: unexpected errors are generic; a failing save or usage write does not fail the request", async () => {
  const boom: AnalysisProvider = { model: "sol", defaultModelId: "gpt-6.1-sol", analyze: async () => { throw new Error("socket hang up key=sk-123"); } };
  const origError = console.error;
  console.error = () => {};
  try {
    const { events } = await collect(request(), boom);
    const last = events.at(-1)!;
    assert.equal(last.type, "error");
    assert.ok(last.type === "error" && !last.message.includes("sk-123"));

    const events2: AnalyzeEvent[] = [];
    await runAnalyze(
      request(),
      {
        provider: fakeProvider(async () => ({ raw: goodRaw })),
        recordUsage: async () => { throw new Error("db down"); },
        saveAnalysis: async () => { throw new Error("db down"); },
      },
      (e) => events2.push(e),
    );
    assert.equal(events2.at(-1)?.type, "result");
  } finally {
    console.error = origError;
  }
});

test("drills: filters to search-backed YouTube links", async () => {
  const finder: DrillFinder = {
    defaultModelId: "claude-opus-5-5",
    async find() {
      return {
        modelId: "claude-opus-5-5",
        raw: {
          videos: [
            { title: "Real", url: "https://youtu.be/dQw4w9WgXcQ", channel: "C", why: "w" },
            { title: "Invented", url: "https://www.youtube.com/watch?v=zzzzzzzzzzz", channel: "C", why: "w" },
          ],
        },
        seenIds: new Set(["dQw4w9WgXcQ"]),
        usage: { inputTokens: 1, outputTokens: 2 },
      };
    },
  };
  const usage: UsageRecord[] = [];
  const out = await runDrills({ issues: [{ title: "Casting", detail: "" }], handedness: "L" }, { finder, recordUsage: async (u) => void usage.push(u) });
  assert.deepEqual(out, { ok: true, videos: [{ title: "Real", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", channel: "C", why: "w" }] });
  assert.equal(usage[0].kind, "drills");
});

test("prompt text: ids, layout panes, handedness, notes", () => {
  const req = request();
  const label = snapshotLabel(req.snapshots[0], 0, 2);
  assert.match(label, new RegExp(A));
  assert.match(label, /top pane: "Juan Soto"; bottom pane: "Swing · Sep 1"/);
  assert.match(label, /load/);
  assert.match(paneDescription(req.snapshots[1]), /left pane: "Juan Soto"; right pane/);
  const tail = analysisRequestText(req);
  assert.match(tail, /bats left-handed/);
  assert.match(tail, /front shoulder/);
  assert.match(tail, /pulls off the ball/);
  assert.match(tail, new RegExp(`${A}, ${B}`));
});

test("request shapes: Claude content blocks and OpenAI input items carry every image, labeled", () => {
  const req = request();
  const claude = buildAnalysisContent(req);
  assert.deepEqual(claude.map((b) => b.type), ["text", "image", "text", "image", "text"]);
  const img = claude[1];
  assert.ok(img.type === "image" && img.source.type === "base64" && img.source.media_type === "image/jpeg");

  const sol = buildSolInput(req);
  assert.deepEqual(sol.map((b) => b.type), ["input_text", "input_image", "input_text", "input_image", "input_text"]);
  const solImg = sol[1];
  assert.ok(solImg.type === "input_image" && solImg.image_url?.startsWith("data:image/jpeg;base64,"));
});

test("searched ids come from tool results and citations, never from the answer text", () => {
  const content = [
    { type: "server_tool_use", id: "s1", name: "web_search", input: { query: "drill" } },
    {
      type: "web_search_tool_result",
      tool_use_id: "s1",
      content: [{ type: "web_search_result", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", title: "t", encrypted_content: "x", page_age: null }],
    },
    { type: "text", text: '{"videos":[{"url":"https://youtu.be/zzzzzzzzzzz"}]}', citations: null },
  ];
  const ids = searchedYouTubeIds(content as never);
  assert.deepEqual([...ids], ["dQw4w9WgXcQ"]);
});
