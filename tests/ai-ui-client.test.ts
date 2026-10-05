import { test } from "node:test";
import assert from "node:assert/strict";
import type { AnalyzeEvent } from "../src/lib/ai/contract.ts";
import {
  AiError,
  NdjsonParser,
  aiGate,
  analysisShareText,
  appendText,
  blobToBase64,
  buildAnalyzeRequest,
  drillsRequestFor,
  extForAudioMime,
  fetchAiStatus,
  findDrillVideos,
  formatClock,
  groupIssuesBySeverity,
  layoutForSize,
  normalizeResult,
  parseAge,
  parseEventLine,
  pickAudioMime,
  readAnalyzeStream,
  runAnalysis,
  youtubeEmbedUrl,
  youtubeId,
  type AnalyzeMeta,
  type SnapshotSource,
} from "../src/lib/ai/client.ts";
import type { SwingAnalysisResult } from "../src/lib/types.ts";

const RESULT: SwingAnalysisResult = {
  summary: "Good rhythm, early hands.",
  strengths: ["Balanced stance"],
  issues: [
    { title: "Hands drift", detail: "Hands push forward at launch", phase: "launch", severity: "low", snapshotIds: ["a"] },
    { title: "Early open", detail: "Front shoulder opens early", phase: "stride", severity: "high", snapshotIds: ["a", "b"] },
  ],
  drills: [{ name: "Tee work", why: "Stay closed", howTo: "Front toss on a tee", reps: "3x10" }],
  cues: ["Stay tall", "Knob to ball"],
  nextFocus: "Keep the front shoulder closed.",
};

const META: AnalyzeMeta = {
  model: "opus",
  athlete: { handedness: "L", age: 12, level: " Travel " },
  coachNotes: "  watch the hands  ",
  transcript: "",
};

function src(id: string, bytes: number): SnapshotSource {
  return { id, blob: new Blob([new Uint8Array(bytes).fill(7)], { type: "image/jpeg" }), topTitle: "Pro", bottomTitle: "Kid", layout: "stacked", note: "load" };
}

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

test("blobToBase64 matches Buffer encoding, including large blobs", async () => {
  const bytes = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
  assert.equal(await blobToBase64(new Blob([bytes])), Buffer.from(bytes).toString("base64"));
  assert.equal(await blobToBase64(new Blob([])), "");
});

test("buildAnalyzeRequest converts blobs, trims text and dedupes", async () => {
  const req = await buildAnalyzeRequest([src("a", 10), src("b", 5), src("a", 10)], META);
  assert.equal(req.snapshots.length, 2);
  assert.equal(req.snapshots[0].imageBase64, Buffer.from(new Uint8Array(10).fill(7)).toString("base64"));
  assert.equal(req.snapshots[0].imageBase64.startsWith("data:"), false);
  assert.equal(req.coachNotes, "watch the hands");
  assert.equal(req.athlete.level, "Travel");
  assert.equal(req.athlete.handedness, "L");
  assert.equal(req.model, "opus");
});

test("buildAnalyzeRequest enforces 1..6 snapshots", async () => {
  await assert.rejects(buildAnalyzeRequest([], META), AiError);
  const seven = Array.from({ length: 7 }, (_, i) => src(`s${i}`, 4));
  await assert.rejects(buildAnalyzeRequest(seven, META), /at most 6/);
  const six = seven.slice(0, 6);
  assert.equal((await buildAnalyzeRequest(six, META)).snapshots.length, 6);
});

test("buildAnalyzeRequest shrinks images until the body fits, then gives up", async () => {
  const dims: number[] = [];
  const encode = async (_b: Blob, dim: number) => {
    dims.push(dim);
    return new Blob([new Uint8Array(dim)]);
  };
  const req = await buildAnalyzeRequest([src("a", 50_000)], META, encode, 1700);
  // 1600 and 1200 bytes base64 are too big with the JSON overhead; 900 fits.
  assert.deepEqual([...new Set(dims)], [1600, 1200, 900]);
  assert.equal(req.snapshots[0].imageBase64.length, Math.ceil(900 / 3) * 4);
  await assert.rejects(buildAnalyzeRequest([src("a", 50_000)], META, encode, 100), /too large/);
});

test("parseEventLine validates events and normalises results", () => {
  assert.deepEqual(parseEventLine('{"type":"status","message":"Looking"}'), { type: "status", message: "Looking" });
  assert.equal(parseEventLine(""), null);
  assert.equal(parseEventLine("not json"), null);
  assert.equal(parseEventLine('{"type":"ping"}'), null);
  assert.deepEqual(parseEventLine('{"type":"error"}'), { type: "error", message: "The analysis failed." });
  const e = parseEventLine(JSON.stringify({ type: "result", modelId: "m", result: { summary: "x", issues: [{ title: "t", phase: "bogus", severity: "?" }] } }));
  assert.ok(e && e.type === "result");
  assert.deepEqual(e.result.issues[0], { title: "t", detail: "", phase: "other", severity: "medium", snapshotIds: [] });
  assert.deepEqual(e.result.cues, []);
  assert.equal(normalizeResult("nope"), null);
});

test("NdjsonParser handles lines split across chunks", () => {
  const p = new NdjsonParser();
  const line = JSON.stringify({ type: "result", modelId: "claude-opus-5-5", result: RESULT });
  const all = `{"type":"status","message":"A"}\n{"type":"sta` + `tus","message":"B"}\n` + line;
  const events: AnalyzeEvent[] = [];
  for (let i = 0; i < all.length; i += 7) events.push(...p.push(all.slice(i, i + 7)));
  assert.deepEqual(events.map((e) => e.type), ["status", "status"]);
  const rest = p.flush();
  assert.equal(rest.length, 1);
  assert.equal(rest[0].type, "result");
});

test("readAnalyzeStream reports status then returns the result", async () => {
  const seen: string[] = [];
  const line = JSON.stringify({ type: "result", modelId: "claude-opus-5-5", result: RESULT });
  const out = await readAnalyzeStream(streamOf(['{"type":"status","message":"Reading"}\n', line.slice(0, 20), line.slice(20) + "\n"]), (e) =>
    seen.push(e.type),
  );
  assert.deepEqual(seen, ["status", "result"]);
  assert.equal(out.modelId, "claude-opus-5-5");
  assert.equal(out.result.issues.length, 2);
});

test("readAnalyzeStream throws the stream's error, or a generic one when cut off", async () => {
  await assert.rejects(readAnalyzeStream(streamOf(['{"type":"error","message":"Model overloaded"}\n'])), /Model overloaded/);
  await assert.rejects(readAnalyzeStream(streamOf(['{"type":"status","message":"x"}\n'])), /ended before/);
});

test("runAnalysis sends x-analysis-id and maps HTTP errors", async () => {
  let headers: Record<string, string> = {};
  const ok: typeof fetch = async (_url, init) => {
    headers = init?.headers as Record<string, string>;
    return new Response(streamOf([JSON.stringify({ type: "result", modelId: "gpt-6.1-sol", result: RESULT }) + "\n"]));
  };
  const req = await buildAnalyzeRequest([src("a", 3)], META);
  const out = await runAnalysis({ request: req, analysisId: "id-1", fetchImpl: ok });
  assert.equal(headers["x-analysis-id"], "id-1");
  assert.equal(out.modelId, "gpt-6.1-sol");

  const unauthorized: typeof fetch = async () => new Response("", { status: 401 });
  await assert.rejects(runAnalysis({ request: req, analysisId: "x", fetchImpl: unauthorized }), /Sign in/);
  const withBody: typeof fetch = async () => Response.json({ error: "Key missing" }, { status: 500 });
  await assert.rejects(runAnalysis({ request: req, analysisId: "x", fetchImpl: withBody }), /Key missing/);
  const offline: typeof fetch = async () => {
    throw new TypeError("Failed to fetch");
  };
  await assert.rejects(runAnalysis({ request: req, analysisId: "x", fetchImpl: offline }), /connection/);
});

test("fetchAiStatus treats 404 and network errors as unavailable", async () => {
  const s404 = await fetchAiStatus(async () => new Response("Not found", { status: 404 }));
  assert.equal(s404.available, false);
  assert.match(s404.reason ?? "", /set up/);
  const net = await fetchAiStatus(async () => {
    throw new TypeError("x");
  });
  assert.equal(net.available, false);
  const ok = await fetchAiStatus(async () =>
    Response.json({ available: true, models: ["opus", "sol", "bogus"], transcribe: true, drills: true, reason: null, remainingToday: 5 }),
  );
  assert.deepEqual(ok.models, ["opus", "sol"]);
  assert.equal(ok.remainingToday, 5);
  const off = await fetchAiStatus(async () => Response.json({ available: false, models: [], reason: "Sign in to use AI analysis" }));
  assert.equal(off.reason, "Sign in to use AI analysis");
});

test("aiGate explains why a feature is disabled", () => {
  const on = { available: true, models: ["opus" as const], transcribe: true, drills: false, reason: null, remainingToday: null };
  assert.deepEqual(aiGate(on, true, "analyze"), { enabled: true, reason: null });
  assert.equal(aiGate(on, true, "analyze", "sol").enabled, false);
  assert.match(aiGate(on, true, "drills").reason!, /Drill/);
  assert.match(aiGate(on, false, "transcribe").reason!, /Voice notes need a connection/);
  assert.match(aiGate(null, true, "analyze").reason!, /Checking/);
  assert.equal(aiGate({ ...on, available: false, reason: "Sign in to use AI analysis" }, true, "analyze").reason, "Sign in to use AI analysis");
  assert.match(aiGate({ ...on, remainingToday: 0 }, true, "analyze").reason!, /limit/);
});

test("findDrillVideos keeps only well-formed http(s) videos", async () => {
  const videos = await findDrillVideos({ issues: [{ title: "t", detail: "d" }], handedness: "L" }, async () =>
    Response.json({ videos: [{ title: "A", url: "https://youtu.be/dQw4w9WgXcQ", channel: "C", why: "w" }, { title: "B", url: "javascript:alert(1)" }] }),
  );
  assert.equal(videos.length, 1);
  assert.equal(videos[0].channel, "C");
});

test("youtubeId handles the common URL shapes", () => {
  const id = "dQw4w9WgXcQ";
  for (const u of [
    `https://www.youtube.com/watch?v=${id}`,
    `https://youtube.com/watch?feature=share&v=${id}&t=30s`,
    `https://m.youtube.com/watch?v=${id}`,
    `https://youtu.be/${id}?si=abc`,
    `https://www.youtube.com/shorts/${id}`,
    `https://www.youtube.com/embed/${id}`,
    `https://www.youtube-nocookie.com/embed/${id}`,
    `https://www.youtube.com/live/${id}`,
  ]) {
    assert.equal(youtubeId(u), id, u);
  }
  for (const u of ["https://vimeo.com/123", "not a url", "https://www.youtube.com/watch?v=short", `https://evil.com/watch?v=${id}`, "https://www.youtube.com/@channel"]) {
    assert.equal(youtubeId(u), null, u);
  }
  assert.ok(youtubeEmbedUrl(id).startsWith(`https://www.youtube-nocookie.com/embed/${id}`));
});

test("audio helpers", () => {
  assert.equal(pickAudioMime((m) => m.startsWith("audio/mp4")), "audio/mp4");
  assert.equal(pickAudioMime((m) => m === "audio/webm;codecs=opus"), "audio/webm;codecs=opus");
  assert.equal(pickAudioMime(() => false), "");
  assert.equal(
    pickAudioMime(() => {
      throw new Error("x");
    }),
    "",
  );
  assert.equal(extForAudioMime("audio/webm;codecs=opus"), "webm");
  assert.equal(extForAudioMime("audio/mp4"), "m4a");
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(65_400), "1:05");
});

test("text helpers", () => {
  assert.equal(appendText("", " hands high "), "hands high");
  assert.equal(appendText("Load looks good", "hands high"), "Load looks good. hands high");
  assert.equal(appendText("Load looks good!  ", "x"), "Load looks good! x");
  assert.equal(appendText("keep", "  "), "keep");
  assert.equal(parseAge("12"), 12);
  assert.equal(parseAge(""), null);
  assert.equal(parseAge("abc"), null);
  assert.equal(parseAge("200"), null);
  assert.equal(layoutForSize(1200, 800), "side");
  assert.equal(layoutForSize(800, 1200), "stacked");
});

test("report helpers group, share and build drill requests", () => {
  const groups = groupIssuesBySeverity(RESULT.issues);
  assert.deepEqual(groups.map((g) => g.severity), ["high", "low"]);
  const text = analysisShareText({ model: "opus", createdAt: "2026-09-30T12:00:00Z", result: RESULT, drillVideos: [] });
  assert.match(text, /Claude Opus 5\.5/);
  assert.match(text, /Early open \(Stride\)/);
  assert.match(text, /"Stay tall"/);
  const req = drillsRequestFor(RESULT, "L");
  assert.equal(req.issues[0].title, "Early open");
  assert.equal(req.handedness, "L");
});
