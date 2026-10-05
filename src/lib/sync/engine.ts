"use client";

// Sync engine: mirrors the on-device store (src/lib/store/local-db.ts) to
// Supabase and back. Pure decisions live in ./plan.ts; this file performs them.
//
// One run = local deletes -> push clips -> push snapshots -> push analyses ->
// pull clips -> pull snapshots -> pull analyses -> download missing media
// (pros first). Runs are single-flight;
// every step catches its own errors so one bad clip never blocks the rest.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteAnalysis,
  deleteClip,
  deleteSnapshot,
  getAnalysis,
  getClip,
  getClipBlob,
  getSnapshot,
  getSnapshotImage,
  listAnalyses,
  listClips,
  listSnapshots,
  putAnalysis,
  putClip,
  putClipBlob,
  putSnapshot,
} from "@/lib/store/local-db";
import type { Analysis, Clip, Snapshot } from "@/lib/types";
import type { SwingLabClient } from "@/lib/supabase/client";
import { CLIPS_BUCKET, SNAPSHOTS_BUCKET } from "@/lib/supabase/config";
import type { Json } from "@/lib/supabase/database.types";
import {
  advanceCursor,
  analysisFingerprint,
  analysisToRow,
  baseMime,
  blobSignature,
  clipFingerprint,
  clipToRow,
  countPending,
  objectPath,
  orderDownloads,
  parseLedger,
  planAnalysisLocalDeletes,
  planAnalysisPull,
  planAnalysisPush,
  planClipDownload,
  planClipPull,
  planClipPush,
  planLocalDeletes,
  planSnapshotPull,
  planSnapshotPush,
  pullSince,
  rowToAnalysis,
  rowToClip,
  rowToSnapshot,
  snapshotFingerprint,
  snapshotToRow,
  type AnalysisRow,
  type ClipRow,
  type Ledger,
  type SnapshotRow,
} from "./plan";

export interface SyncReport {
  pending: number;
  blocked: number;
  uploaded: number;
  downloaded: number;
  errors: string[];
}

const LEDGER_PREFIX = "swinglab.sync.ledger.";
const PAGE = 500;
const SIGNED_URL_TTL = 600;

export function loadLedger(userId: string): Ledger {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(LEDGER_PREFIX + userId);
  } catch {
    // storage blocked: start fresh
  }
  return parseLedger(raw, userId);
}

function saveLedger(ledger: Ledger) {
  try {
    localStorage.setItem(LEDGER_PREFIX + ledger.userId, JSON.stringify(ledger));
  } catch {
    // quota or blocked: the next run re-derives state from the server
  }
}

function msg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export class SyncRun {
  private errors: string[] = [];
  private uploaded = 0;
  private downloaded = 0;
  private isAdmin = false;
  private ledger: Ledger;

  constructor(
    private supabase: SwingLabClient,
    private userId: string,
    private shouldStop: () => boolean,
    private onProgress: (report: SyncReport) => void,
  ) {
    this.ledger = loadLedger(userId);
  }

  async run(): Promise<SyncReport> {
    const { data: profile } = await this.supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", this.userId)
      .maybeSingle();
    this.isAdmin = profile?.is_admin === true;

    await this.step("local deletes", () => this.pushLocalDeletes());
    await this.step("upload clips", () => this.pushClips());
    await this.step("upload snapshots", () => this.pushSnapshots());
    await this.step("upload analyses", () => this.pushAnalyses());
    await this.step("download clip list", () => this.pullClips());
    await this.step("download snapshot list", () => this.pullSnapshots());
    await this.step("download analyses", () => this.pullAnalyses());
    await this.step("download videos", () => this.downloadClipMedia());
    await this.step("download snapshot images", () => this.downloadSnapshotImages());

    if (this.errors.length === 0) this.ledger.lastSyncAt = new Date().toISOString();
    saveLedger(this.ledger);
    return this.report();
  }

  async report(): Promise<SyncReport> {
    const [clips, snaps, analyses] = await Promise.all([listClips(), listSnapshots(), listAnalyses()]);
    const { pending, blocked } = countPending(clips, snaps, this.ledger, this.userId, this.isAdmin, analyses);
    return { pending, blocked, uploaded: this.uploaded, downloaded: this.downloaded, errors: this.errors };
  }

  /**
   * The generated Database types (src/lib/supabase/database.types.ts) do not
   * list the analyses table yet; talk to it through an untyped client.
   */
  private get db(): SupabaseClient {
    return this.supabase as unknown as SupabaseClient;
  }

  get admin() {
    return this.isAdmin;
  }

  get lastSyncAt() {
    return this.ledger.lastSyncAt;
  }

  private async step(name: string, fn: () => Promise<void>) {
    if (this.shouldStop()) return;
    try {
      await fn();
    } catch (e) {
      this.errors.push(`${name}: ${msg(e)}`);
    }
    saveLedger(this.ledger);
    this.onProgress(await this.report());
  }

  // ------------------------------------------------------------------ deletes

  private async pushLocalDeletes() {
    const [clips, snaps, analyses] = await Promise.all([listClips(), listSnapshots(), listAnalyses()]);
    const clipIds = new Set(clips.map((c) => c.id));
    const snapIds = new Set(snaps.map((s) => s.id));
    const analysisIds = new Set(analyses.map((a) => a.id));

    const c = planLocalDeletes(this.ledger.clips, clipIds, this.userId);
    const s = planLocalDeletes(this.ledger.snapshots, snapIds, this.userId);
    const a = planAnalysisLocalDeletes(this.ledger.analyses, analysisIds, this.userId, clips.length + snaps.length > 0);
    if (c.resetLedger || s.resetLedger || a.resetLedger) {
      // Local store looks wiped: re-download everything instead of deleting remotely.
      this.ledger = {
        ...this.ledger,
        clips: {},
        snapshots: {},
        analyses: {},
        cursor: { clips: null, snapshots: null, analyses: null },
      };
      return;
    }
    const now = new Date().toISOString();
    for (const id of c.remoteDelete) {
      const entry = this.ledger.clips[id];
      const { error } = await this.supabase.from("clips").update({ deleted_at: now }).eq("id", id);
      if (error) throw error;
      const paths = [entry.path, entry.thumbPath].filter((p): p is string => Boolean(p));
      if (paths.length) await this.supabase.storage.from(CLIPS_BUCKET).remove(paths);
      delete this.ledger.clips[id];
    }
    for (const id of c.forget) delete this.ledger.clips[id];
    for (const id of s.remoteDelete) {
      const entry = this.ledger.snapshots[id];
      const { error } = await this.supabase.from("snapshots").update({ deleted_at: now }).eq("id", id);
      if (error) throw error;
      if (entry.path) await this.supabase.storage.from(SNAPSHOTS_BUCKET).remove([entry.path]);
      delete this.ledger.snapshots[id];
    }
    for (const id of s.forget) delete this.ledger.snapshots[id];
    for (const id of a.remoteDelete) {
      const { error } = await this.db.from("analyses").update({ deleted_at: now }).eq("id", id);
      if (error) throw error;
      delete this.ledger.analyses[id];
    }
    for (const id of a.forget) delete this.ledger.analyses[id];
  }

  // ------------------------------------------------------------------ push

  private async pushClips() {
    const clips = await listClips();
    for (const clip of clips) {
      if (this.shouldStop()) return;
      try {
        await this.pushClip(clip);
      } catch (e) {
        this.errors.push(`upload "${clip.title}": ${msg(e)}`);
        await this.patchClip(clip.id, { syncState: "error" });
      }
    }
  }

  private async pushClip(clip: Clip) {
    const entry = this.ledger.clips[clip.id];
    const media = (await getClipBlob(clip.id, "playable")) ?? (await getClipBlob(clip.id, "original"));
    const thumb = await getClipBlob(clip.id, "thumb");
    const decision = planClipPush({
      clip,
      entry,
      userId: this.userId,
      isAdmin: this.isAdmin,
      mediaSig: blobSignature(media),
      thumbSig: blobSignature(thumb),
    });
    if (decision.action !== "push") return;
    const owner = decision.owner;

    let storagePath = clip.remotePath ?? entry?.path ?? null;
    let thumbPath = clip.remoteThumbPath ?? entry?.thumbPath ?? null;
    if (decision.uploadMedia || decision.uploadThumb) await this.patchClip(clip.id, { syncState: "uploading" });

    if (decision.uploadMedia && media) {
      const type = baseMime(media.type) || "video/mp4";
      const path = objectPath(owner, clip.id, type);
      if (!path) throw new Error(`unsupported video type ${media.type || "(none)"}`);
      const { error } = await this.supabase.storage
        .from(CLIPS_BUCKET)
        .upload(path, media, { upsert: true, contentType: type, cacheControl: "31536000" });
      if (error) throw error;
      // Processing can change the container (.mov -> .mp4): drop the old object.
      if (storagePath && storagePath !== path) await this.supabase.storage.from(CLIPS_BUCKET).remove([storagePath]);
      storagePath = path;
      this.uploaded++;
    }
    if (decision.uploadThumb && thumb) {
      const type = baseMime(thumb.type) || "image/jpeg";
      const path = objectPath(owner, clip.id, type);
      if (path && !path.endsWith(".mp4") && !path.endsWith(".mov") && !path.endsWith(".webm")) {
        const { error } = await this.supabase.storage
          .from(CLIPS_BUCKET)
          .upload(path, thumb, { upsert: true, contentType: type, cacheControl: "31536000" });
        if (error) throw error;
        thumbPath = path;
      }
    }

    const row = clipToRow(clip, owner, storagePath, thumbPath);
    const { data, error } = await this.supabase
      .from("clips")
      .upsert({ ...row, crop: row.crop as { [key: string]: Json } })
      .select("server_updated_at")
      .single();
    if (error) throw error;

    this.ledger.clips[clip.id] = {
      owner,
      fp: clipFingerprint(clip), // fingerprint of what was pushed: later edits stay dirty
      rv: data.server_updated_at,
      media: decision.uploadMedia ? blobSignature(media) : (entry?.media ?? null),
      path: storagePath,
      thumb: decision.uploadThumb ? blobSignature(thumb) : (entry?.thumb ?? null),
      thumbPath,
    };
    await this.patchClip(clip.id, {
      ownerId: owner,
      remotePath: storagePath,
      remoteThumbPath: thumbPath,
      syncState: "synced",
    });
  }

  private async pushSnapshots() {
    const snaps = await listSnapshots();
    for (const snap of snaps) {
      if (this.shouldStop()) return;
      try {
        await this.pushSnapshot(snap);
      } catch (e) {
        this.errors.push(`upload snapshot: ${msg(e)}`);
        await this.patchSnapshot(snap.id, { syncState: "error" });
      }
    }
  }

  private async pushSnapshot(snap: Snapshot) {
    const entry = this.ledger.snapshots[snap.id];
    const image = await getSnapshotImage(snap.id);
    const decision = planSnapshotPush({ snapshot: snap, entry, userId: this.userId, imageSig: blobSignature(image) });
    if (decision.action !== "push") return;
    const owner = decision.owner;
    let storagePath = snap.remotePath ?? entry?.path ?? null;

    if (decision.uploadMedia && image) {
      const type = baseMime(image.type) || baseMime(snap.imageType) || "image/jpeg";
      const path = objectPath(owner, snap.id, type);
      if (!path) throw new Error(`unsupported image type ${image.type || "(none)"}`);
      await this.patchSnapshot(snap.id, { syncState: "uploading" });
      const { error } = await this.supabase.storage
        .from(SNAPSHOTS_BUCKET)
        .upload(path, image, { upsert: true, contentType: type, cacheControl: "31536000" });
      if (error) throw error;
      if (storagePath && storagePath !== path) await this.supabase.storage.from(SNAPSHOTS_BUCKET).remove([storagePath]);
      storagePath = path;
      this.uploaded++;
    }

    const row = snapshotToRow(snap, owner, storagePath, new Date().toISOString());
    const { data, error } = await this.supabase.from("snapshots").upsert(row).select("server_updated_at").single();
    if (error) throw error;
    this.ledger.snapshots[snap.id] = {
      owner,
      fp: snapshotFingerprint(snap),
      rv: data.server_updated_at,
      media: decision.uploadMedia ? blobSignature(image) : (entry?.media ?? null),
      path: storagePath,
      thumb: null,
      thumbPath: null,
    };
    await this.patchSnapshot(snap.id, { ownerId: owner, remotePath: storagePath, syncState: "synced" });
  }

  private async pushAnalyses() {
    const analyses = await listAnalyses();
    for (const analysis of analyses) {
      if (this.shouldStop()) return;
      try {
        await this.pushAnalysis(analysis);
      } catch (e) {
        this.errors.push(`upload analysis: ${msg(e)}`);
        await this.patchAnalysis(analysis.id, { syncState: "error" });
      }
    }
  }

  private async pushAnalysis(analysis: Analysis) {
    const entry = this.ledger.analyses[analysis.id];
    const decision = planAnalysisPush({ analysis, entry, userId: this.userId });
    if (decision.action !== "push") return;
    const owner = decision.owner;
    const { data, error } = await this.db
      .from("analyses")
      .upsert(analysisToRow(analysis, owner))
      .select("server_updated_at")
      .single();
    if (error) throw error;
    this.ledger.analyses[analysis.id] = {
      owner,
      fp: analysisFingerprint(analysis),
      rv: (data as { server_updated_at: string }).server_updated_at,
      media: null,
      path: null,
      thumb: null,
      thumbPath: null,
    };
    await this.patchAnalysis(analysis.id, { ownerId: owner, syncState: "synced" });
  }

  private async patchAnalysis(id: string, patch: Partial<Analysis>) {
    const current = await getAnalysis(id);
    if (current) await putAnalysis({ ...current, ...patch, id });
  }

  /**
   * Patch sync fields without bumping updatedAt (local-db's updateClip always
   * bumps it, which would reorder the "recent swings" list on every sync).
   * Re-reads right before writing so concurrent user edits are kept.
   */
  private async patchClip(id: string, patch: Partial<Clip>) {
    const current = await getClip(id);
    if (current) await putClip({ ...current, ...patch, id });
  }

  private async patchSnapshot(id: string, patch: Partial<Snapshot>) {
    const current = await getSnapshot(id);
    if (current) await putSnapshot({ ...current, ...patch, id });
  }

  // ------------------------------------------------------------------ pull

  private async pullClips() {
    const since = pullSince(this.ledger.cursor.clips);
    let cursor = this.ledger.cursor.clips;
    for (let offset = 0; ; offset += PAGE) {
      if (this.shouldStop()) return;
      let q = this.supabase.from("clips").select("*");
      if (since) q = q.gt("server_updated_at", since);
      const { data, error } = await q
        .order("server_updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as ClipRow[];
      for (const row of rows) await this.applyClipRow(row);
      cursor = advanceCursor(cursor, rows);
      this.ledger.cursor.clips = cursor;
      if (rows.length < PAGE) break;
    }
  }

  private async applyClipRow(row: ClipRow) {
    const local = await getClip(row.id);
    const entry = this.ledger.clips[row.id];
    const action = planClipPull(row, local, entry);
    if (action === "skip") return;
    if (action === "delete" || action === "forget") {
      if (action === "delete") await deleteClip(row.id);
      delete this.ledger.clips[row.id];
      return;
    }
    const next = rowToClip(row, local);
    await putClip(next);
    this.ledger.clips[row.id] = {
      owner: row.owner_id,
      fp: clipFingerprint(next),
      rv: row.server_updated_at,
      media: entry?.media ?? null,
      path: entry?.path ?? null, // path of the media on this device; differs => download
      thumb: entry?.thumb ?? null,
      thumbPath: entry?.thumbPath ?? null,
    };
  }

  private async pullSnapshots() {
    const since = pullSince(this.ledger.cursor.snapshots);
    let cursor = this.ledger.cursor.snapshots;
    for (let offset = 0; ; offset += PAGE) {
      if (this.shouldStop()) return;
      let q = this.supabase.from("snapshots").select("*");
      if (since) q = q.gt("server_updated_at", since);
      const { data, error } = await q
        .order("server_updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as SnapshotRow[];
      for (const row of rows) {
        const local = await getSnapshot(row.id);
        const entry = this.ledger.snapshots[row.id];
        const action = planSnapshotPull(row, local, entry);
        if (action === "skip") continue;
        if (action === "delete" || action === "forget") {
          if (action === "delete") await deleteSnapshot(row.id);
          delete this.ledger.snapshots[row.id];
          continue;
        }
        const next = rowToSnapshot(row);
        await putSnapshot(next);
        this.ledger.snapshots[row.id] = {
          owner: row.owner_id,
          fp: snapshotFingerprint(next),
          rv: row.server_updated_at,
          media: entry?.media ?? null,
          path: entry?.path ?? null,
          thumb: null,
          thumbPath: null,
        };
      }
      cursor = advanceCursor(cursor, rows);
      this.ledger.cursor.snapshots = cursor;
      if (rows.length < PAGE) break;
    }
  }

  private async pullAnalyses() {
    const since = pullSince(this.ledger.cursor.analyses);
    let cursor = this.ledger.cursor.analyses;
    for (let offset = 0; ; offset += PAGE) {
      if (this.shouldStop()) return;
      let q = this.db.from("analyses").select("*");
      if (since) q = q.gt("server_updated_at", since);
      const { data, error } = await q
        .order("server_updated_at", { ascending: true })
        .order("id", { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      const rows = (data ?? []) as AnalysisRow[];
      for (const row of rows) {
        const local = await getAnalysis(row.id);
        const entry = this.ledger.analyses[row.id];
        const action = planAnalysisPull(row, local, entry);
        if (action === "skip") continue;
        if (action === "delete" || action === "forget") {
          if (action === "delete") await deleteAnalysis(row.id);
          delete this.ledger.analyses[row.id];
          continue;
        }
        const next = rowToAnalysis(row);
        await putAnalysis(next);
        this.ledger.analyses[row.id] = {
          owner: row.owner_id,
          fp: analysisFingerprint(next),
          rv: row.server_updated_at,
          media: null,
          path: null,
          thumb: null,
          thumbPath: null,
        };
      }
      cursor = advanceCursor(cursor, rows);
      this.ledger.cursor.analyses = cursor;
      if (rows.length < PAGE) break;
    }
  }

  // ------------------------------------------------------------------ downloads

  private async downloadClipMedia() {
    const clips = await listClips();
    const needs = [];
    for (const clip of clips) {
      const have = {
        media: Boolean((await getClipBlob(clip.id, "playable")) ?? (await getClipBlob(clip.id, "original"))),
        thumb: Boolean(await getClipBlob(clip.id, "thumb")),
      };
      const need = planClipDownload(clip, have, this.ledger.clips[clip.id]);
      if (need) needs.push({ ...need, updatedAt: clip.updatedAt, clip });
    }
    for (const need of orderDownloads(needs)) {
      if (this.shouldStop()) return;
      const { clip } = need;
      try {
        const entry = this.ledger.clips[clip.id] ?? {
          owner: clip.ownerId ?? "",
          fp: clipFingerprint(clip),
          rv: null,
          media: null,
          path: null,
          thumb: null,
          thumbPath: null,
        };
        if (need.thumb && clip.remoteThumbPath) {
          const blob = await this.fetchObject(CLIPS_BUCKET, clip.remoteThumbPath);
          await putClipBlob(clip.id, "thumb", blob);
          entry.thumb = blobSignature(blob);
          entry.thumbPath = clip.remoteThumbPath;
        }
        if (need.media && clip.remotePath) {
          const blob = await this.fetchObject(CLIPS_BUCKET, clip.remotePath);
          await putClipBlob(clip.id, clip.processed ? "playable" : "original", blob);
          entry.media = blobSignature(blob);
          entry.path = clip.remotePath;
          this.downloaded++;
        }
        this.ledger.clips[clip.id] = entry;
        saveLedger(this.ledger);
      } catch (e) {
        this.errors.push(`download "${clip.title}": ${msg(e)}`);
      }
    }
  }

  private async downloadSnapshotImages() {
    const snaps = await listSnapshots();
    for (const snap of snaps) {
      if (this.shouldStop()) return;
      if (!snap.remotePath) continue;
      const entry = this.ledger.snapshots[snap.id];
      const have = Boolean(await getSnapshotImage(snap.id));
      if (have && entry?.path === snap.remotePath) continue;
      try {
        const blob = await this.fetchObject(SNAPSHOTS_BUCKET, snap.remotePath);
        await putSnapshot((await getSnapshot(snap.id)) ?? snap, blob);
        if (entry) {
          entry.media = blobSignature(blob);
          entry.path = snap.remotePath;
        }
        this.downloaded++;
      } catch (e) {
        this.errors.push(`download snapshot: ${msg(e)}`);
      }
    }
  }

  /** Private objects are fetched through short-lived signed URLs only. */
  private async fetchObject(bucket: string, path: string): Promise<Blob> {
    const { data, error } = await this.supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL);
    if (error || !data) throw error ?? new Error("could not sign URL");
    const res = await fetch(data.signedUrl, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const type = baseMime(res.headers.get("content-type")) || blob.type;
    return blob.type === type ? blob : new Blob([blob], { type });
  }
}
