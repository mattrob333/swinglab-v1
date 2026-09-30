import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ANALYSIS_JSON_SCHEMA,
  DRILLS_JSON_SCHEMA,
  ResultValidationError,
  SEVERITIES,
  SWING_PHASES,
  parseAnalysisResult,
  parseJsonText,
} from "../src/lib/ai/schema.ts";

const A = "11111111-0000-4000-8000-000000000001";
const B = "22222222-0000-4000-8000-000000000002";

function result(over: Record<string, unknown> = {}) {
  return {
    summary: "Solid load; the front side opens early.",
    strengths: ["Balanced stance", ""],
    issues: [
      {
        title: "Front shoulder opens early",
        detail: "At launch the front shoulder has turned toward first base; the pro's is still closed.",
        phase: "launch",
        severity: "high",
        snapshotIds: [A, "made-up-id", A.toUpperCase(), "33333333-0000-4000-8000-000000000003"],
      },
    ],
    drills: [{ name: "Fence drill", why: "Keeps the barrel inside", howTo: "Stand a bat length from a fence…", reps: "3x8" }],
    cues: ["Stay closed", "Knob to the ball"],
    nextFocus: "Keep the front shoulder closed until the hands start.",
    ...over,
  };
}

/** Walk a JSON schema and assert the strict-mode rules both providers need. */
function assertStrict(schema: unknown, path = "$") {
  const s = schema as Record<string, unknown>;
  if (s.type === "object") {
    assert.equal(s.additionalProperties, false, `${path} additionalProperties`);
    const props = Object.keys(s.properties as object);
    assert.deepEqual([...(s.required as string[])].sort(), props.sort(), `${path} requires every property`);
    for (const [k, v] of Object.entries(s.properties as object)) assertStrict(v, `${path}.${k}`);
  }
  if (s.type === "array") assertStrict(s.items, `${path}[]`);
  for (const banned of ["minLength", "maxLength", "minimum", "maximum", "minItems", "maxItems"]) {
    assert.equal(banned in s, false, `${path} uses unsupported ${banned}`);
  }
}

test("schemas are strict-mode compatible and mirror the types", () => {
  assertStrict(ANALYSIS_JSON_SCHEMA);
  assertStrict(DRILLS_JSON_SCHEMA);
  const issue = ANALYSIS_JSON_SCHEMA.properties.issues.items.properties;
  assert.deepEqual(issue.phase.enum, ["stance", "load", "stride", "launch", "contact", "extension", "finish", "other"]);
  assert.deepEqual(issue.severity.enum, ["high", "medium", "low"]);
  assert.deepEqual([...ANALYSIS_JSON_SCHEMA.required], ["summary", "strengths", "issues", "drills", "cues", "nextFocus"]);
  assert.equal(SWING_PHASES.length, 8);
  assert.equal(SEVERITIES.length, 3);
});

test("valid result passes; unknown snapshot ids are filtered and de-duplicated", () => {
  const r = parseAnalysisResult(result(), [A, B]);
  assert.deepEqual(r.issues[0].snapshotIds, [A]);
  assert.deepEqual(r.strengths, ["Balanced stance"]); // empty strings dropped
  assert.equal(r.drills[0].reps, "3x8");
  assert.equal(r.nextFocus.startsWith("Keep"), true);
});

test("ids are matched case-insensitively but returned as sent", () => {
  const r = parseAnalysisResult(result(), [A.toUpperCase()]);
  assert.deepEqual(r.issues[0].snapshotIds, [A.toUpperCase()]);
});

test("invalid shapes throw ResultValidationError", () => {
  const bad = [
    null,
    [],
    "text",
    result({ summary: 5 }),
    result({ strengths: "x" }),
    result({ issues: [{ ...result().issues[0], phase: "swing" }] }),
    result({ issues: [{ ...result().issues[0], severity: "critical" }] }),
    result({ issues: [{ ...result().issues[0], snapshotIds: "x" }] }),
    result({ drills: [{ name: "a" }] }),
    result({ cues: null }),
    result({ nextFocus: undefined }),
  ];
  for (const [i, b] of bad.entries()) assert.throws(() => parseAnalysisResult(b, [A]), ResultValidationError, `case ${i}`);
});

test("output is bounded", () => {
  const many = Array.from({ length: 30 }, (_, i) => `cue ${i}`);
  const r = parseAnalysisResult(result({ cues: many, summary: "x".repeat(5000) }), [A]);
  assert.equal(r.cues.length, 8);
  assert.ok(r.summary.length <= 2000);
});

test("parseJsonText tolerates a code fence", () => {
  assert.deepEqual(parseJsonText('{"a":1}'), { a: 1 });
  assert.deepEqual(parseJsonText('```json\n{"a":1}\n```'), { a: 1 });
  assert.throws(() => parseJsonText("not json"), ResultValidationError);
});

test("parseJsonText finds the JSON object after prose (drill search answers)", async () => {
  const { parseJsonText } = await import("../src/lib/ai/schema.ts");
  const text = 'I searched YouTube and found these.\n\n{"videos": [{"title": "Tee drill", "url": "https://www.youtube.com/watch?v=abc123DEF45", "channel": "Coach", "why": "fixes {casting}"}]}';
  const value = parseJsonText(text) as { videos: { title: string }[] };
  assert.equal(value.videos[0].title, "Tee drill");
});
