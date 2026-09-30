import { test } from "node:test";
import assert from "node:assert/strict";
import type { Clip, Snapshot } from "../src/lib/types.ts";
import {
  advanceCursor,
  backoffMs,
  blobSignature,
  clipFingerprint,
  clipToRow,
  countPending,
  emptyLedger,
  extForMime,
  objectPath,
  orderDownloads,
  parseLedger,
  planClipDownload,
  planClipPull,
  planClipPush,
  planLocalDeletes,
  planSnapshotPull,
  planSnapshotPush,
  pullSince,
  rowToClip,
  rowToSnapshot,
  snapshotFingerprint,
  snapshotToRow,
  type ClipRow,
  type LedgerEntry,
} from "../src/lib/sync/plan.ts";

const ME = "aaaaaaaa-0000-4000-8000-000000000001";
const KID = "bbbbbbbb-0000-4000-8000-000000000002";

function clip(over: Partial<Clip> = {}): Clip {
  return {
    id: "11111111-0000-4000-8000-000000000001",
    kind: "athlete",
    title: "Swing",
    handedness: "R",
    cameraView: "open",
    durationSec: 3,
    fps: 240,
    width: 1080,
    height: 1920,
    sloMoFactor: 8,
    trimStart: 0.5,
    trimEnd: 2.5,
    crop: { scale: 1.5, x: 0.1, y: -0.1 },
    processed: false,
    createdAt: "2026-09-30T10:00:00.000Z",
    updatedAt: "2026-09-30T10:00:00.000Z",
    ownerId: null,
    remotePath: null,
    remoteThumbPath: null,
    syncState: "local",
    notes: "",
    ...over,
  };
}

function snap(over: Partial<Snapshot> = {}): Snapshot {
  return {
    id: "33333333-0000-4000-8000-000000000003",
    createdAt: "2026-09-30T10:00:00.000Z",
    imageType: "image/jpeg",
    topClipId: null,
    bottomClipId: null,
    topTime: 1,
    bottomTime: 2,
    topFlipped: false,
    bottomFlipped: true,
    note: "",
    ownerId: null,
    remotePath: null,
    syncState: "local",
    ...over,
  };
}

function entry(c: Clip, over: Partial<LedgerEntry> = {}): LedgerEntry {
  return { owner: ME, fp: clipFingerprint(c), rv: "t1", media: "100:video/mp4", path: `${ME}/${c.id}.mp4`, thumb: null, thumbPath: null, ...over };
}

function row(c: Clip, over: Partial<ClipRow> = {}): ClipRow {
  const r = clipToRow(c, c.ownerId ?? ME, `${c.ownerId ?? ME}/${c.id}.mp4`, null);
  return { ...r, server_updated_at: "t2", ...over };
}

// ---------------------------------------------------------------- mapping

test("clip round-trips through a row", () => {
  const c = clip({ ownerId: ME, notes: "good hip turn" });
  const back = rowToClip(row(c));
  assert.equal(clipFingerprint(back), clipFingerprint(c));
  assert.equal(back.syncState, "synced");
  assert.equal(back.remotePath, `${ME}/${c.id}.mp4`);
  assert.equal(back.ownerId, ME);
});

test("clipToRow sanitizes non-finite numbers", () => {
  const r = clipToRow(clip({ durationSec: NaN, fps: 0, sloMoFactor: 0, width: 10.6 }), ME, null, null);
  assert.equal(r.duration_sec, 0);
  assert.equal(r.fps, null);
  assert.equal(r.slo_mo_factor, 1);
  assert.equal(r.width, 11);
});

test("snapshot round-trips", () => {
  const s = snap({ ownerId: ME, note: "top of swing" });
  const r = { ...snapshotToRow(s, ME, `${ME}/${s.id}.jpg`, "now"), server_updated_at: "t" };
  assert.equal(snapshotFingerprint(rowToSnapshot(r)), snapshotFingerprint(s));
});

test("object paths and mime types", () => {
  assert.equal(extForMime("video/quicktime"), "mov");
  assert.equal(extForMime("video/webm;codecs=vp9"), "webm");
  assert.equal(extForMime("text/html"), null);
  assert.equal(objectPath(ME, "x", "image/jpeg"), `${ME}/x.jpg`);
  assert.equal(objectPath(ME, "x", "application/octet-stream"), null);
  assert.equal(blobSignature({ size: 5, type: "Video/MP4; codecs=avc1" }), "5:video/mp4");
  assert.equal(blobSignature(undefined), null);
});

// ---------------------------------------------------------------- push

test("new local clip with media is pushed and claimed", () => {
  const d = planClipPush({ clip: clip(), entry: undefined, userId: ME, isAdmin: false, mediaSig: "100:video/mp4", thumbSig: "5:image/jpeg" });
  assert.deepEqual(d, { action: "push", owner: ME, claim: true, uploadMedia: true, uploadThumb: true });
});

test("new clip without media on device waits", () => {
  const d = planClipPush({ clip: clip(), entry: undefined, userId: ME, isAdmin: false, mediaSig: null, thumbSig: null });
  assert.equal(d.action, "none");
});

test("synced, unchanged clip does nothing", () => {
  const c = clip({ ownerId: ME, syncState: "synced", remotePath: `${ME}/x.mp4` });
  const d = planClipPush({ clip: c, entry: entry(c), userId: ME, isAdmin: false, mediaSig: "100:video/mp4", thumbSig: null });
  assert.equal(d.action, "none");
});

test("metadata edit without syncState change is detected by fingerprint", () => {
  const c = clip({ ownerId: ME, syncState: "synced", remotePath: `${ME}/x.mp4` });
  const edited = { ...c, trimEnd: 2.2 };
  const d = planClipPush({ clip: edited, entry: entry(c), userId: ME, isAdmin: false, mediaSig: "100:video/mp4", thumbSig: null });
  assert.equal(d.action, "push");
  assert.ok(d.action === "push" && !d.uploadMedia);
});

test("processed playable replacing the original is re-uploaded", () => {
  const c = clip({ ownerId: ME, syncState: "synced", remotePath: `${ME}/x.mov`, processed: true });
  const d = planClipPush({ clip: c, entry: entry(c, { fp: clipFingerprint({ ...c, processed: false }), media: "900:video/quicktime" }), userId: ME, isAdmin: false, mediaSig: "300:video/mp4", thumbSig: null });
  assert.ok(d.action === "push" && d.uploadMedia);
});

test("other user's clips and non-admin pro clips are never pushed", () => {
  assert.deepEqual(
    planClipPush({ clip: clip({ ownerId: KID }), entry: undefined, userId: ME, isAdmin: true, mediaSig: "1:video/mp4", thumbSig: null }),
    { action: "skip", reason: "foreign" },
  );
  assert.deepEqual(
    planClipPush({ clip: clip({ kind: "pro" }), entry: undefined, userId: KID, isAdmin: false, mediaSig: "1:video/mp4", thumbSig: null }),
    { action: "skip", reason: "pro-not-admin" },
  );
  assert.equal(
    planClipPush({ clip: clip({ kind: "pro" }), entry: undefined, userId: ME, isAdmin: true, mediaSig: "1:video/mp4", thumbSig: null }).action,
    "push",
  );
});

test("error state is retried", () => {
  const c = clip({ ownerId: ME, syncState: "error", remotePath: `${ME}/x.mp4` });
  assert.equal(planClipPush({ clip: c, entry: entry(c), userId: ME, isAdmin: false, mediaSig: "100:video/mp4", thumbSig: null }).action, "push");
});

test("snapshot push", () => {
  const s = snap();
  assert.equal(planSnapshotPush({ snapshot: s, entry: undefined, userId: ME, imageSig: "9:image/jpeg" }).action, "push");
  const synced = snap({ ownerId: ME, syncState: "synced", remotePath: "p" });
  const e: LedgerEntry = { owner: ME, fp: snapshotFingerprint(synced), rv: "t", media: "9:image/jpeg", path: "p", thumb: null, thumbPath: null };
  assert.equal(planSnapshotPush({ snapshot: synced, entry: e, userId: ME, imageSig: "9:image/jpeg" }).action, "none");
  assert.equal(planSnapshotPush({ snapshot: { ...synced, note: "new" }, entry: e, userId: ME, imageSig: "9:image/jpeg" }).action, "push");
  assert.equal(planSnapshotPush({ snapshot: snap({ ownerId: KID }), entry: undefined, userId: ME, imageSig: "9:image/jpeg" }).action, "skip");
});

// ---------------------------------------------------------------- deletes

test("locally deleted own items become remote soft-deletes; others are forgotten", () => {
  const entries: Record<string, LedgerEntry> = {
    a: { owner: ME, fp: "", rv: null, media: null, path: null, thumb: null, thumbPath: null },
    b: { owner: KID, fp: "", rv: null, media: null, path: null, thumb: null, thumbPath: null },
    c: { owner: ME, fp: "", rv: null, media: null, path: null, thumb: null, thumbPath: null },
  };
  assert.deepEqual(planLocalDeletes(entries, new Set(["c"]), ME), { remoteDelete: ["a"], forget: ["b"], resetLedger: false });
});

test("a wiped local store never deletes remote data", () => {
  const entries: Record<string, LedgerEntry> = {
    a: { owner: ME, fp: "", rv: null, media: null, path: null, thumb: null, thumbPath: null },
  };
  assert.deepEqual(planLocalDeletes(entries, new Set(), ME), { remoteDelete: [], forget: [], resetLedger: true });
});

// ---------------------------------------------------------------- pull

test("pull creates, updates, skips and deletes", () => {
  const c = clip({ ownerId: KID, syncState: "synced" });
  assert.equal(planClipPull(row(c), undefined, undefined), "create");
  assert.equal(planClipPull(row(c, { deleted_at: "x" }), c, entry(c)), "delete");
  assert.equal(planClipPull(row(c, { deleted_at: "x" }), undefined, undefined), "forget");
  assert.equal(planClipPull(row(c, { server_updated_at: "t1" }), c, entry(c)), "skip");
  assert.equal(planClipPull(row({ ...c, title: "renamed", updatedAt: "2026-09-30T11:00:00.000Z" }), c, entry(c)), "update");
});

test("newer unpushed local edit wins over an older remote row", () => {
  const base = clip({ ownerId: ME, syncState: "synced" });
  const local = { ...base, trimEnd: 1.9, updatedAt: "2026-09-30T12:00:00.000Z" };
  assert.equal(planClipPull(row(base, { updated_at: "2026-09-30T11:00:00.000Z" }), local, entry(base)), "skip");
  assert.equal(planClipPull(row(base, { updated_at: "2026-09-30T13:00:00.000Z" }), local, entry(base)), "update");
});

test("snapshot pull keeps unpushed local edits", () => {
  const s = snap({ ownerId: ME, syncState: "synced" });
  const r = { ...snapshotToRow(s, ME, null, "now"), server_updated_at: "t9" };
  const e: LedgerEntry = { owner: ME, fp: snapshotFingerprint(s), rv: "t1", media: null, path: null, thumb: null, thumbPath: null };
  assert.equal(planSnapshotPull(r, s, e), "update");
  assert.equal(planSnapshotPull(r, { ...s, note: "edited" }, e), "skip");
  assert.equal(planSnapshotPull(r, undefined, undefined), "create");
});

test("cursor advances and pulls with overlap", () => {
  assert.equal(advanceCursor(null, [{ server_updated_at: "2026-01-02" }, { server_updated_at: "2026-01-01" }]), "2026-01-02");
  assert.equal(advanceCursor("2026-02-01", [{ server_updated_at: "2026-01-02" }]), "2026-02-01");
  assert.equal(pullSince(null), null);
  assert.equal(pullSince("2026-09-30T10:01:00.000Z"), "2026-09-30T10:00:00.000Z");
});

// ---------------------------------------------------------------- downloads

test("downloads: missing media, changed remote file, pros first", () => {
  const c = clip({ ownerId: KID, remotePath: `${KID}/a.mp4`, remoteThumbPath: `${KID}/a.jpg` });
  assert.deepEqual(planClipDownload(c, { media: false, thumb: false }, undefined), { id: c.id, kind: "athlete", media: true, thumb: true });
  const e = entry(c, { path: `${KID}/a.mp4`, thumbPath: `${KID}/a.jpg` });
  assert.equal(planClipDownload(c, { media: true, thumb: true }, e), null);
  assert.deepEqual(planClipDownload({ ...c, remotePath: `${KID}/a.mov` }, { media: true, thumb: true }, e)?.media, true);
  assert.equal(planClipDownload(clip(), { media: false, thumb: false }, undefined), null);
  const ordered = orderDownloads([
    { kind: "athlete" as const, updatedAt: "3" },
    { kind: "pro" as const, updatedAt: "1" },
    { kind: "pro" as const, updatedAt: "2" },
  ]);
  assert.deepEqual(ordered.map((o) => `${o.kind}${o.updatedAt}`), ["pro2", "pro1", "athlete3"]);
});

// ---------------------------------------------------------------- ledger, status, backoff

test("ledger parsing is defensive and per user", () => {
  assert.deepEqual(parseLedger(null, ME), emptyLedger(ME));
  assert.deepEqual(parseLedger("{not json", ME), emptyLedger(ME));
  const l = emptyLedger(KID);
  assert.deepEqual(parseLedger(JSON.stringify(l), ME), emptyLedger(ME));
  l.userId = ME;
  l.cursor.clips = "c";
  assert.equal(parseLedger(JSON.stringify(l), ME).cursor.clips, "c");
});

test("pending counts own dirty items; non-admin pros are blocked", () => {
  const synced = clip({ id: "s", ownerId: ME, syncState: "synced" });
  const ledger = emptyLedger(ME);
  ledger.clips.s = entry(synced);
  const { pending, blocked } = countPending(
    [synced, clip({ id: "n" }), clip({ id: "k", ownerId: KID }), clip({ id: "p", kind: "pro" })],
    [snap()],
    ledger,
    ME,
    false,
  );
  assert.equal(pending, 2);
  assert.equal(blocked, 1);
});

test("backoff grows and caps", () => {
  const mid = () => 0.5;
  assert.equal(backoffMs(0, mid), 5_000);
  assert.equal(backoffMs(1, mid), 10_000);
  assert.equal(backoffMs(20, mid), 300_000);
  assert.ok(backoffMs(0, () => 0) >= 3_750);
});
