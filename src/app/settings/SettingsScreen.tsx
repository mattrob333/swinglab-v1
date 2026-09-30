"use client";

import Link from "next/link";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { Handedness } from "@/lib/types";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { useSync } from "@/lib/sync/SyncProvider";
import type { SyncStatus } from "@/lib/sync/controller";

/** Read by the capture flow as the default batter side. */
const HANDEDNESS_KEY = "swinglab.defaultHandedness";
const handednessListeners = new Set<() => void>();

function readHandedness(): Handedness {
  try {
    return localStorage.getItem(HANDEDNESS_KEY) === "L" ? "L" : "R";
  } catch {
    return "R";
  }
}

function subscribeHandedness(listener: () => void) {
  handednessListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    handednessListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function writeHandedness(h: Handedness) {
  try {
    localStorage.setItem(HANDEDNESS_KEY, h);
  } catch {
    // storage blocked
  }
  for (const l of handednessListeners) l();
}

async function readStorage(): Promise<{ usage: number; quota: number; persisted: boolean | null } | null> {
  if (typeof navigator === "undefined" || !navigator.storage?.estimate) return null;
  try {
    const [est, persisted] = await Promise.all([
      navigator.storage.estimate(),
      navigator.storage.persisted ? navigator.storage.persisted() : Promise.resolve(null),
    ]);
    return { usage: est.usage ?? 0, quota: est.quota ?? 0, persisted };
  } catch {
    return null;
  }
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatWhen(iso: string | null): string {
  if (!iso) return "Never";
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins} min ago`;
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

const PHASE_LABEL: Record<SyncStatus["phase"], string> = {
  disabled: "Off (local-only mode)",
  starting: "Starting…",
  "signed-out": "Signed out",
  offline: "Offline — will sync when back online",
  idle: "Up to date",
  syncing: "Syncing…",
  error: "Problem syncing",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  );
}

const buttonClass =
  "flex min-h-12 items-center justify-center rounded-xl px-4 font-semibold transition active:scale-[0.98] disabled:opacity-50";

export function SettingsScreen() {
  const configured = isSupabaseConfigured();
  const { status, syncNow, signOut } = useSync();
  const handedness = useSyncExternalStore(subscribeHandedness, readHandedness, () => "R" as Handedness);
  const [storage, setStorage] = useState<{ usage: number; quota: number; persisted: boolean | null } | null>(null);
  const [persistMessage, setPersistMessage] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const [storageVersion, setStorageVersion] = useState(0);
  const refreshStorage = () => setStorageVersion((v) => v + 1);

  useEffect(() => {
    let cancelled = false;
    readStorage().then((info) => {
      if (!cancelled && info) setStorage(info);
    });
    return () => {
      cancelled = true;
    };
  }, [status.lastSyncAt, storageVersion]);

  function chooseHandedness(h: Handedness) {
    writeHandedness(h);
    // Best effort: remember it on the account too, so a new device can pick it up.
    const supabase = getSupabaseBrowserClient();
    if (supabase && status.user) {
      void supabase.from("profiles").update({ default_handedness: h }).eq("id", status.user.id);
    }
  }

  async function requestPersist() {
    if (!navigator.storage?.persist) {
      setPersistMessage("This browser doesn't support keeping storage. Add SwingLab to your Home Screen instead.");
      return;
    }
    const granted = await navigator.storage.persist();
    setPersistMessage(
      granted
        ? "Done. Your swings won't be cleared to free up space."
        : "The browser said no. On iPhone/iPad, add SwingLab to the Home Screen and try again.",
    );
    refreshStorage();
  }

  async function onSignOut() {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      window.location.replace("/login");
    }
  }

  return (
    <div className="safe-top h-full overflow-y-auto">
      <div className="mx-auto max-w-xl space-y-4 px-4 pb-10 pt-4">
        <header className="flex items-center gap-2">
          <Link href="/" aria-label="Back" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold">Settings</h1>
        </header>

        <Section title="Account">
          {!configured ? (
            <p className="text-sm text-muted">
              <span className="font-semibold text-white">Local-only mode.</span> Sync isn&apos;t set up for this build,
              so swings and snapshots stay on this device only. Nothing is uploaded.
            </p>
          ) : status.user ? (
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-muted">Signed in as</div>
                <div className="truncate font-semibold">{status.user.email ?? status.user.id}</div>
              </div>
              <button
                type="button"
                onClick={onSignOut}
                disabled={signingOut}
                className={`${buttonClass} shrink-0 border border-line bg-elevated text-white`}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
            </div>
          ) : (
            <Link href="/login?next=/settings" className={`${buttonClass} bg-neon text-black`}>
              Sign in
            </Link>
          )}
        </Section>

        <Section title="Default batter">
          <p className="mb-3 text-sm text-muted">New recordings start with this side. You can change it per swing.</p>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Default batter handedness">
            {(["R", "L"] as Handedness[]).map((h) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={handedness === h}
                onClick={() => chooseHandedness(h)}
                className={`${buttonClass} min-h-14 text-lg ${
                  handedness === h ? "bg-neon text-black" : "border border-line bg-elevated text-white"
                }`}
              >
                {h === "R" ? "Right-handed" : "Left-handed"}
              </button>
            ))}
          </div>
        </Section>

        {configured && (
          <Section title="Sync">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted">Status</dt>
              <dd className={status.phase === "error" ? "text-red-300" : "text-white"}>{PHASE_LABEL[status.phase]}</dd>
              <dt className="text-muted">Waiting to upload</dt>
              <dd>{status.pending}</dd>
              {status.blocked > 0 && (
                <>
                  <dt className="text-muted">Device only</dt>
                  <dd>{status.blocked} pro clip(s) — only an admin account can share pros</dd>
                </>
              )}
              <dt className="text-muted">Last sync</dt>
              <dd>{formatWhen(status.lastSyncAt)}</dd>
            </dl>
            {status.errors.length > 0 && (
              <ul className="mt-3 space-y-1 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
                {status.errors.map((e, i) => (
                  <li key={i}>{e}</li>
                ))}
                {status.nextRetryAt && <li className="text-muted">Retrying {formatWhen(status.nextRetryAt) === "Just now" ? "shortly" : "automatically"}.</li>}
              </ul>
            )}
            <button
              type="button"
              onClick={syncNow}
              disabled={!status.user || status.phase === "syncing"}
              className={`${buttonClass} mt-4 w-full bg-neon text-black`}
            >
              {status.phase === "syncing" ? "Syncing…" : "Sync now"}
            </button>
          </Section>
        )}

        <Section title="Storage on this device">
          {storage ? (
            <>
              <div className="flex items-baseline justify-between text-sm">
                <span>{formatBytes(storage.usage)} used</span>
                {storage.quota > 0 && <span className="text-muted">of {formatBytes(storage.quota)} available</span>}
              </div>
              {storage.quota > 0 && (
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-elevated">
                  <div
                    className="h-full rounded-full bg-neon"
                    style={{ width: `${Math.min(100, Math.max(1, (storage.usage / storage.quota) * 100))}%` }}
                  />
                </div>
              )}
              <p className="mt-3 text-sm text-muted">
                {storage.persisted
                  ? "Protected: the browser won't clear your swings to save space."
                  : "Not protected yet: the browser may clear saved swings when the device is low on space."}
              </p>
            </>
          ) : (
            <p className="text-sm text-muted">Storage info isn&apos;t available in this browser.</p>
          )}
          {!storage?.persisted && (
            <button
              type="button"
              onClick={requestPersist}
              className={`${buttonClass} mt-3 w-full border border-line bg-elevated text-white`}
            >
              Keep my swings on this device
            </button>
          )}
          {persistMessage && <p className="mt-2 text-sm text-muted">{persistMessage}</p>}
        </Section>
      </div>
    </div>
  );
}
