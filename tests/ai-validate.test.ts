import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_AUDIO_BYTES, MAX_SNAPSHOTS_PER_ANALYSIS } from "../src/lib/ai/contract.ts";
import {
  MAX_IMAGE_BYTES,
  MAX_NOTES_CHARS,
  MAX_TRANSCRIPT_CHARS,
  base64DecodedLength,
  checkAudio,
  checkImageBase64,
  isUuid,
  parseAnalyzeRequest,
  parseDrillsRequest,
  sniffImageMime,
} from "../src/lib/ai/validate.ts";

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 2, 3, 4, 5]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
const GIF = Buffer.from("GIF89a0123456789");

const ID1 = "11111111-0000-4000-8000-000000000001";

function jpegOfSize(bytes: number): string {
  const b = Buffer.alloc(bytes, 7);
  JPEG.copy(b);
  return b.toString("base64");
}

function snap(over: Record<string, unknown> = {}) {
  return {
    id: ID1,
    imageBase64: JPEG.toString("base64"),
    topTitle: "Juan Soto",
    bottomTitle: "Swing · Sep 30",
    layout: "stacked",
    note: "load",
    ...over,
  };
}

function body(over: Record<string, unknown> = {}) {
  return {
    model: "opus",
    snapshots: [snap()],
    athlete: { handedness: "L", age: 11, level: "10U travel" },
    coachNotes: "watch the front shoulder",
    transcript: "",
    ...over,
  };
}

test("magic bytes: JPEG and PNG only", () => {
  assert.equal(sniffImageMime(JPEG), "image/jpeg");
  assert.equal(sniffImageMime(PNG), "image/png");
  assert.equal(sniffImageMime(GIF), null);
  assert.equal(sniffImageMime(new Uint8Array([0xff, 0xd8])), null);
  assert.equal(sniffImageMime(Buffer.from("<svg xmlns=")), null);
});

test("base64 decoded length", () => {
  assert.equal(base64DecodedLength(Buffer.alloc(10).toString("base64")), 10);
  assert.equal(base64DecodedLength(Buffer.alloc(11).toString("base64")), 11);
  assert.equal(base64DecodedLength(Buffer.alloc(12).toString("base64")), 12);
  assert.equal(base64DecodedLength("abc$"), -1);
  assert.equal(base64DecodedLength("abcde"), -1);
});

test("image: size limit is on decoded bytes, 2 MB", () => {
  const atLimit = checkImageBase64(jpegOfSize(MAX_IMAGE_BYTES));
  assert.equal(atLimit.ok, true);
  if (atLimit.ok) {
    assert.equal(atLimit.value.bytes, MAX_IMAGE_BYTES);
    assert.equal(atLimit.value.mime, "image/jpeg");
  }
  const over = checkImageBase64(jpegOfSize(MAX_IMAGE_BYTES + 1));
  assert.equal(over.ok, false);
  assert.match(over.ok ? "" : over.error, /2 MB/);
});

test("image: rejects non-images, data URLs, garbage, empty", () => {
  assert.equal(checkImageBase64(GIF.toString("base64")).ok, false);
  assert.equal(checkImageBase64(`data:image/jpeg;base64,${JPEG.toString("base64")}`).ok, false);
  assert.equal(checkImageBase64("!!!!").ok, false);
  assert.equal(checkImageBase64("").ok, false);
  assert.equal(checkImageBase64(42).ok, false);
  assert.equal(checkImageBase64(PNG.toString("base64")).ok, true);
  // Unpadded and line-wrapped base64 is accepted.
  assert.equal(checkImageBase64(JPEG.toString("base64").replace(/=+$/, "")).ok, true);
});

test("uuid", () => {
  assert.equal(isUuid(ID1), true);
  assert.equal(isUuid(ID1.toUpperCase()), true);
  assert.equal(isUuid("not-a-uuid"), false);
  assert.equal(isUuid(`${ID1} `), false);
  assert.equal(isUuid(null), false);
});

test("analyze request: valid body is normalized", () => {
  const r = parseAnalyzeRequest(body({ snapshots: [snap({ id: ID1.toUpperCase(), note: "  load  " })] }));
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.value.snapshots[0].id, ID1);
  assert.equal(r.value.snapshots[0].note, "load");
  assert.equal(r.value.snapshots[0].image.mime, "image/jpeg");
  assert.deepEqual(r.value.athlete, { handedness: "L", age: 11, level: "10U travel" });
});

test("analyze request: snapshot count 1..MAX", () => {
  assert.equal(parseAnalyzeRequest(body({ snapshots: [] })).ok, false);
  const ids = Array.from({ length: MAX_SNAPSHOTS_PER_ANALYSIS + 1 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  const max = ids.slice(0, MAX_SNAPSHOTS_PER_ANALYSIS).map((id) => snap({ id }));
  assert.equal(parseAnalyzeRequest(body({ snapshots: max })).ok, true);
  const tooMany = parseAnalyzeRequest(body({ snapshots: ids.map((id) => snap({ id })) }));
  assert.equal(tooMany.ok, false);
});

test("analyze request: rejects bad fields", () => {
  const bad: [string, Record<string, unknown>][] = [
    ["model", { model: "gpt" }],
    ["duplicate ids", { snapshots: [snap(), snap()] }],
    ["bad id", { snapshots: [snap({ id: "x" })] }],
    ["gif", { snapshots: [snap({ imageBase64: GIF.toString("base64") })] }],
    ["too big", { snapshots: [snap({ imageBase64: jpegOfSize(MAX_IMAGE_BYTES + 10) })] }],
    ["layout", { snapshots: [snap({ layout: "grid" })] }],
    ["snapshot note", { snapshots: [snap({ note: "x".repeat(MAX_NOTES_CHARS + 1) })] }],
    ["coach notes", { coachNotes: "x".repeat(MAX_NOTES_CHARS + 1) }],
    ["transcript", { transcript: "x".repeat(MAX_TRANSCRIPT_CHARS + 1) }],
    ["handedness", { athlete: { handedness: "S", age: null, level: "" } }],
    ["age", { athlete: { handedness: "R", age: 11.5, level: "" } }],
    ["no athlete", { athlete: null }],
    ["notes type", { coachNotes: 5 }],
  ];
  for (const [name, over] of bad) assert.equal(parseAnalyzeRequest(body(over)).ok, false, name);
  assert.equal(parseAnalyzeRequest(null).ok, false);
  assert.equal(parseAnalyzeRequest([]).ok, false);
  // Notes exactly at the limit are fine; missing notes default to "".
  assert.equal(parseAnalyzeRequest(body({ coachNotes: "x".repeat(MAX_NOTES_CHARS) })).ok, true);
  const r = parseAnalyzeRequest(body({ coachNotes: undefined, transcript: undefined }));
  assert.equal(r.ok && r.value.coachNotes === "" && r.value.transcript === "", true);
});

test("drills request", () => {
  assert.equal(parseDrillsRequest({ handedness: "L", issues: [{ title: "Early hands", detail: "casting" }] }).ok, true);
  assert.equal(parseDrillsRequest({ handedness: "L", issues: [] }).ok, false);
  assert.equal(parseDrillsRequest({ handedness: "X", issues: [{ title: "a", detail: "" }] }).ok, false);
  assert.equal(parseDrillsRequest({ handedness: "R", issues: [{ title: "", detail: "x" }] }).ok, false);
  assert.equal(parseDrillsRequest({ handedness: "R", issues: Array(9).fill({ title: "a", detail: "" }) }).ok, false);
});

test("audio: audio mime types only, size-bounded", () => {
  const ok = checkAudio({ size: 1000, type: "audio/webm;codecs=opus" });
  assert.deepEqual(ok, { ok: true, value: { mime: "audio/webm", filename: "voice-note.webm" } });
  const ios = checkAudio({ size: 1000, type: "audio/mp4" });
  assert.equal(ios.ok && ios.value.filename, "voice-note.m4a");
  assert.equal(checkAudio({ size: MAX_AUDIO_BYTES, type: "audio/mpeg" }).ok, true);
  assert.equal(checkAudio({ size: MAX_AUDIO_BYTES + 1, type: "audio/mpeg" }).ok, false);
  assert.equal(checkAudio({ size: 0, type: "audio/mpeg" }).ok, false);
  assert.equal(checkAudio({ size: 10, type: "video/mp4" }).ok, false);
  assert.equal(checkAudio({ size: 10, type: "" }).ok, false);
  assert.equal(checkAudio({ size: 10, type: "application/octet-stream" }).ok, false);
  assert.equal(checkAudio(null).ok, false);
});
