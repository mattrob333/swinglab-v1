"use client";

// On-device storage (IndexedDB) for clips, their video/thumbnail blobs, and
// snapshots. The app works fully offline from this store; the sync layer
// mirrors it to Supabase when signed in and online.

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { Clip, ClipBlobVariant, ClipKind, Snapshot } from "@/lib/types";

interface SwingLabDB extends DBSchema {
  clips: { key: string; value: Clip; indexes: { byKind: ClipKind; byUpdated: string } };
  blobs: { key: string; value: Blob };
  snapshots: { key: string; value: Snapshot; indexes: { byCreated: string } };
  snapshotImages: { key: string; value: Blob };
}

const DB_NAME = "swinglab-2026";
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<SwingLabDB>> | null = null;

function db() {
  if (!dbPromise) {
    dbPromise = openDB<SwingLabDB>(DB_NAME, DB_VERSION, {
      upgrade(database) {
        const clips = database.createObjectStore("clips", { keyPath: "id" });
        clips.createIndex("byKind", "kind");
        clips.createIndex("byUpdated", "updatedAt");
        database.createObjectStore("blobs");
        const snaps = database.createObjectStore("snapshots", { keyPath: "id" });
        snaps.createIndex("byCreated", "createdAt");
        database.createObjectStore("snapshotImages");
      },
    });
  }
  return dbPromise;
}

const blobKey = (clipId: string, variant: ClipBlobVariant) => `${clipId}:${variant}`;

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to any change in the local store. Returns an unsubscribe function. */
export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit() {
  for (const l of listeners) l();
}

export function newId(): string {
  return crypto.randomUUID();
}

export async function listClips(kind?: ClipKind): Promise<Clip[]> {
  const d = await db();
  const clips = kind ? await d.getAllFromIndex("clips", "byKind", kind) : await d.getAll("clips");
  return clips.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getClip(id: string): Promise<Clip | undefined> {
  return (await db()).get("clips", id);
}

export async function getClipBlob(id: string, variant: ClipBlobVariant): Promise<Blob | undefined> {
  return (await db()).get("blobs", blobKey(id, variant));
}

/** Playable file if processed, otherwise the original. */
export async function getPlayableBlob(id: string): Promise<Blob | undefined> {
  return (await getClipBlob(id, "playable")) ?? (await getClipBlob(id, "original"));
}

export async function putClip(
  clip: Clip,
  blobs: Partial<Record<ClipBlobVariant, Blob>> = {},
): Promise<void> {
  const d = await db();
  const tx = d.transaction(["clips", "blobs"], "readwrite");
  await tx.objectStore("clips").put(clip);
  for (const [variant, blob] of Object.entries(blobs) as [ClipBlobVariant, Blob][]) {
    await tx.objectStore("blobs").put(blob, blobKey(clip.id, variant));
  }
  await tx.done;
  emit();
}

export async function updateClip(id: string, patch: Partial<Clip>): Promise<Clip | undefined> {
  const d = await db();
  const current = await d.get("clips", id);
  if (!current) return undefined;
  const next: Clip = { ...current, ...patch, id, updatedAt: new Date().toISOString() };
  await d.put("clips", next);
  emit();
  return next;
}

export async function putClipBlob(id: string, variant: ClipBlobVariant, blob: Blob): Promise<void> {
  await (await db()).put("blobs", blob, blobKey(id, variant));
  emit();
}

export async function deleteClip(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["clips", "blobs"], "readwrite");
  await tx.objectStore("clips").delete(id);
  for (const v of ["original", "playable", "thumb"] as ClipBlobVariant[]) {
    await tx.objectStore("blobs").delete(blobKey(id, v));
  }
  await tx.done;
  emit();
}

export async function listSnapshots(): Promise<Snapshot[]> {
  const snaps = await (await db()).getAll("snapshots");
  return snaps.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getSnapshot(id: string): Promise<Snapshot | undefined> {
  return (await db()).get("snapshots", id);
}

export async function getSnapshotImage(id: string): Promise<Blob | undefined> {
  return (await db()).get("snapshotImages", id);
}

export async function putSnapshot(snapshot: Snapshot, image?: Blob): Promise<void> {
  const d = await db();
  const tx = d.transaction(["snapshots", "snapshotImages"], "readwrite");
  await tx.objectStore("snapshots").put(snapshot);
  if (image) await tx.objectStore("snapshotImages").put(image, snapshot.id);
  await tx.done;
  emit();
}

export async function updateSnapshot(id: string, patch: Partial<Snapshot>): Promise<void> {
  const d = await db();
  const current = await d.get("snapshots", id);
  if (!current) return;
  await d.put("snapshots", { ...current, ...patch, id });
  emit();
}

export async function deleteSnapshot(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(["snapshots", "snapshotImages"], "readwrite");
  await tx.objectStore("snapshots").delete(id);
  await tx.objectStore("snapshotImages").delete(id);
  await tx.done;
  emit();
}
