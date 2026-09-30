import { test } from "node:test";
import assert from "node:assert/strict";
import type { Analysis } from "../src/lib/types.ts";
import {
  analysisFingerprint,
  analysisToRow,
  countPending,
  emptyLedger,
  parseLedger,
  planAnalysisLocalDeletes,
  planAnalysisPull,
  planAnalysisPush,
  rowToAnalysis,
  type AnalysisRow,
  type LedgerEntry,
} from "../src/lib/sync/plan.ts";

const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const KID = "bbbbbbbb-0000-4000-8000-000000000002";
const ID = "a1a1a1a1-0000-4000-8000-000000000001";

function analysis(over: Partial<Analysis> = {}): Analysis {
  return {
    id: ID,
    createdAt: "2026-09-30T10:00:00.000Z",
    snapshotIds: ["33333333-0000-4000-8000-000000000003"],
    model: "opus",
    modelId: "claude-opus-5-5",
    coachNotes: "notes",
    transcript: "",
    result: { summary: "s", strengths: [], issues: [], drills: [], cues: [], nextFocus: "n" },
    drillVideos: [],
    status: "done",
    error: null,
    ownerId: ME,
    syncState: "synced",
    ...over,
  };
}

function entry(a: Analysis, over: Partial<LedgerEntry> = {}): LedgerEntry {
  return { owner: ME, fp: analysisFingerprint(a), rv: "t1", media: null, path: null, thumb: null, thumbPath: null, ...over };
}

function row(a: Analysis, over: Partial<AnalysisRow> = {}): AnalysisRow {
  return { ...analysisToRow(a, a.ownerId ?? ME), server_updated_at: "t2", ...over };
}

test("row round trip", () => {
  const a = analysis({ drillVideos: [{ title: "t", url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", channel: "", why: "" }] });
  const r = row(a);
  assert.equal(r.owner_id, ME);
  assert.equal(r.deleted_at, null);
  assert.deepEqual(rowToAnalysis(r), { ...a, syncState: "synced" });
});

test("rowToAnalysis is defensive about jsonb", () => {
  const a = rowToAnalysis(row(analysis(), { result: [1, 2], drill_videos: [{ nope: 1 }, "x"], status: "weird", model: "x" }));
  assert.equal(a.result, null);
  assert.deepEqual(a.drillVideos, []);
  assert.equal(a.status, "pending");
  assert.equal(a.model, "opus");
});

test("push: new, changed, synced, pending, foreign", () => {
  const a = analysis({ syncState: "local", ownerId: null });
  assert.deepEqual(planAnalysisPush({ analysis: a, entry: undefined, userId: ME }), {
    action: "push", owner: ME, claim: true, uploadMedia: false, uploadThumb: false,
  });
  const synced = analysis();
  assert.deepEqual(planAnalysisPush({ analysis: synced, entry: entry(synced), userId: ME }), { action: "none" });
  const withVideos = analysis({ drillVideos: [{ title: "t", url: "u", channel: "", why: "" }] });
  assert.equal(planAnalysisPush({ analysis: withVideos, entry: entry(synced), userId: ME }).action, "push");
  assert.deepEqual(planAnalysisPush({ analysis: analysis({ status: "pending", syncState: "local" }), entry: undefined, userId: ME }), { action: "none" });
  assert.deepEqual(planAnalysisPush({ analysis: analysis({ ownerId: KID }), entry: undefined, userId: ME }), { action: "skip", reason: "foreign" });
  assert.equal(planAnalysisPush({ analysis: analysis({ status: "error", error: "x", syncState: "local" }), entry: undefined, userId: ME }).action, "push");
});

test("pull: create, skip applied, local edits win, pending local takes the server result, deletes", () => {
  const a = analysis();
  assert.equal(planAnalysisPull(row(a), undefined, undefined), "create");
  assert.equal(planAnalysisPull(row(a), undefined, entry(a)), "skip");
  assert.equal(planAnalysisPull(row(a, { server_updated_at: "t1" }), a, entry(a)), "skip");
  assert.equal(planAnalysisPull(row(a), a, entry(a)), "update");
  const dirty = analysis({ syncState: "local", drillVideos: [{ title: "t", url: "u", channel: "", why: "" }] });
  assert.equal(planAnalysisPull(row(a), dirty, entry(a)), "skip");
  const pending = analysis({ status: "pending", result: null, syncState: "local" });
  assert.equal(planAnalysisPull(row(a), pending, undefined), "update");
  assert.equal(planAnalysisPull(row(a, { deleted_at: "now" }), a, entry(a)), "delete");
  assert.equal(planAnalysisPull(row(a, { deleted_at: "now" }), undefined, undefined), "forget");
});

test("local deletes: deleting the last analysis is a real delete when the store has other data", () => {
  const entries = { [ID]: entry(analysis()), other: entry(analysis(), { owner: KID }) };
  assert.deepEqual(planAnalysisLocalDeletes(entries, new Set(), ME, true), { remoteDelete: [ID], forget: ["other"], resetLedger: false });
  assert.deepEqual(planAnalysisLocalDeletes(entries, new Set(), ME, false), { remoteDelete: [], forget: [], resetLedger: true });
  assert.deepEqual(planAnalysisLocalDeletes(entries, new Set([ID]), ME, true), { remoteDelete: [], forget: ["other"], resetLedger: false });
});

test("ledger: old ledgers without analyses still parse", () => {
  const old = { version: 1, userId: ME, clips: {}, snapshots: {}, cursor: { clips: "c", snapshots: null }, lastSyncAt: null };
  const l = parseLedger(JSON.stringify(old), ME);
  assert.deepEqual(l.analyses, {});
  assert.equal(l.cursor.analyses, null);
  assert.equal(l.cursor.clips, "c");
  assert.deepEqual(emptyLedger(ME).analyses, {});
});

test("countPending includes finished, unsynced own analyses", () => {
  const ledger = emptyLedger(ME);
  const done = analysis({ syncState: "local" });
  const pending = analysis({ id: "p", status: "pending", syncState: "local" });
  const foreign = analysis({ id: "f", ownerId: KID });
  assert.deepEqual(countPending([], [], ledger, ME, false, [done, pending, foreign]), { pending: 1, blocked: 0 });
  ledger.analyses[ID] = entry(analysis());
  assert.deepEqual(countPending([], [], ledger, ME, false, [analysis()]), { pending: 0, blocked: 0 });
  assert.deepEqual(countPending([], [], ledger, ME, false), { pending: 0, blocked: 0 });
});
