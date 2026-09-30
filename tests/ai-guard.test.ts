import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DAILY_LIMIT,
  capabilities,
  decideAccess,
  decideRate,
  kindAvailable,
  parseDailyLimit,
  remainingToday,
  utcDayStart,
} from "../src/lib/ai/guard.ts";

const U = "aaaaaaaa-0000-4000-8000-000000000001";

test("access matrix: Supabase configured requires a user, in every environment", () => {
  for (const nodeEnv of ["development", "production", "test", undefined]) {
    for (const allowLocal of ["1", undefined, "0"]) {
      const signedOut = decideAccess({ supabaseConfigured: true, nodeEnv, allowLocal, userId: null });
      assert.equal(signedOut.ok, false);
      assert.equal(!signedOut.ok && signedOut.status, 401);
      assert.deepEqual(decideAccess({ supabaseConfigured: true, nodeEnv, allowLocal, userId: U }), { ok: true, mode: "user", userId: U });
    }
  }
});

test("access matrix: local-only mode only in development with AI_ALLOW_LOCAL=1", () => {
  const cases: [string | undefined, string | undefined, boolean][] = [
    ["development", "1", true],
    ["development", undefined, false],
    ["development", "0", false],
    ["development", "true", false],
    ["production", "1", false],
    ["test", "1", false],
    [undefined, "1", false],
    ["production", undefined, false],
  ];
  for (const [nodeEnv, allowLocal, allowed] of cases) {
    const d = decideAccess({ supabaseConfigured: false, nodeEnv, allowLocal, userId: null });
    assert.equal(d.ok, allowed, `${nodeEnv}/${allowLocal}`);
    if (!d.ok) {
      assert.equal(d.status, 503);
      assert.ok(d.reason.length > 0);
    } else {
      assert.equal(d.mode, "local");
    }
  }
});

test("daily limit parsing", () => {
  assert.equal(parseDailyLimit(undefined), DEFAULT_DAILY_LIMIT);
  assert.equal(parseDailyLimit(""), 30);
  assert.equal(parseDailyLimit("50"), 50);
  assert.equal(parseDailyLimit("0"), 0);
  assert.equal(parseDailyLimit("-3"), 30);
  assert.equal(parseDailyLimit("abc"), 30);
  assert.equal(parseDailyLimit("2.5"), 30);
});

test("rate decision", () => {
  assert.deepEqual(decideRate(0, 30), { ok: true, remaining: 29 });
  assert.deepEqual(decideRate(29, 30), { ok: true, remaining: 0 });
  const full = decideRate(30, 30);
  assert.equal(full.ok, false);
  assert.equal(!full.ok && full.status, 429);
  assert.equal(decideRate(31, 30).ok, false);
  const off = decideRate(0, 0);
  assert.equal(off.ok, false);
  assert.match(!off.ok ? off.reason : "", /turned off/);
  assert.equal(remainingToday(12, 30), 18);
  assert.equal(remainingToday(40, 30), 0);
});

test("UTC day window", () => {
  assert.equal(utcDayStart(new Date("2026-09-30T23:59:59.999Z")), "2026-09-30T00:00:00.000Z");
  assert.equal(utcDayStart(new Date("2026-10-01T00:00:00.000Z")), "2026-10-01T00:00:00.000Z");
});

test("capabilities follow the configured keys", () => {
  assert.deepEqual(capabilities({ anthropic: true, openai: true }), { models: ["opus", "sol"], transcribe: true, drills: true });
  assert.deepEqual(capabilities({ anthropic: true, openai: false }), { models: ["opus"], transcribe: false, drills: true });
  assert.deepEqual(capabilities({ anthropic: false, openai: true }), { models: ["sol"], transcribe: true, drills: false });
  assert.deepEqual(capabilities({ anthropic: false, openai: false }), { models: [], transcribe: false, drills: false });
  assert.equal(kindAvailable("analyze", { anthropic: true, openai: false }, "sol"), false);
  assert.equal(kindAvailable("analyze", { anthropic: true, openai: false }, "opus"), true);
  assert.equal(kindAvailable("drills", { anthropic: false, openai: true }), false);
  assert.equal(kindAvailable("transcribe", { anthropic: false, openai: true }), true);
});
