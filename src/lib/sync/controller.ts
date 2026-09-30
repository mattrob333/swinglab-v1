"use client";

// Decides WHEN to sync: on load, sign-in, `online`, returning to the tab, local
// store changes (debounced), every few minutes, and on "Sync now". Failed runs
// retry with exponential backoff. Never throws into the UI.

import { listClips, listSnapshots, subscribe } from "@/lib/store/local-db";
import { getSupabaseBrowserClient, type SwingLabClient } from "@/lib/supabase/client";
import { SyncRun, loadLedger } from "./engine";
import { backoffMs, countPending } from "./plan";

export type SyncPhase = "disabled" | "starting" | "signed-out" | "offline" | "idle" | "syncing" | "error";

export interface SyncStatus {
  phase: SyncPhase;
  user: { id: string; email: string | null } | null;
  /** Own clips/snapshots with changes not yet on the server. */
  pending: number;
  /** Pro clips recorded by a non-admin: they stay on this device. */
  blocked: number;
  lastSyncAt: string | null;
  errors: string[];
  nextRetryAt: string | null;
}

const INTERVAL_MS = 3 * 60_000;
const LOCAL_CHANGE_DEBOUNCE_MS = 4_000;

export const INITIAL_STATUS: SyncStatus = {
  phase: "starting",
  user: null,
  pending: 0,
  blocked: 0,
  lastSyncAt: null,
  errors: [],
  nextRetryAt: null,
};

export class SyncController {
  private status: SyncStatus = INITIAL_STATUS;
  private listeners = new Set<() => void>();
  private supabase: SwingLabClient | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private countTimer: ReturnType<typeof setTimeout> | null = null;
  private running = false;
  private rerun = false;
  private attempt = 0;
  private isAdmin = false;
  private stopped = false;
  private cleanups: (() => void)[] = [];

  getStatus = () => this.status;

  onChange = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private set(patch: Partial<SyncStatus>) {
    this.status = { ...this.status, ...patch };
    for (const l of this.listeners) l();
  }

  start(): () => void {
    this.stopped = false;
    this.supabase = getSupabaseBrowserClient();
    if (!this.supabase) {
      this.set({ phase: "disabled" });
      return () => {};
    }
    const supabase = this.supabase;

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      // Never await Supabase calls inside this callback; defer instead.
      const user = session?.user ? { id: session.user.id, email: session.user.email ?? null } : null;
      setTimeout(() => this.setUser(user), 0);
    });
    this.cleanups.push(() => sub.subscription.unsubscribe());

    void supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      this.setUser(u ? { id: u.id, email: u.email ?? null } : null);
    });

    const onOnline = () => this.schedule(0);
    const onOffline = () => this.set({ phase: "offline" });
    const onVisible = () => {
      if (document.visibilityState === "visible") this.schedule(1_000);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(() => this.schedule(0), INTERVAL_MS);
    const unsubscribeStore = subscribe(() => {
      if (this.running) {
        this.rerun = true;
        return;
      }
      this.refreshCounts();
      this.schedule(LOCAL_CHANGE_DEBOUNCE_MS, true);
    });
    this.cleanups.push(
      () => window.removeEventListener("online", onOnline),
      () => window.removeEventListener("offline", onOffline),
      () => document.removeEventListener("visibilitychange", onVisible),
      () => clearInterval(interval),
      unsubscribeStore,
    );

    return () => {
      this.stopped = true;
      if (this.timer) clearTimeout(this.timer);
      if (this.countTimer) clearTimeout(this.countTimer);
      for (const c of this.cleanups.splice(0)) c();
    };
  }

  /** Manual "Sync now": resets backoff and runs immediately. */
  syncNow = () => {
    this.attempt = 0;
    this.schedule(0);
  };

  async signOut() {
    if (!this.supabase) return;
    await this.supabase.auth.signOut();
  }

  private setUser(user: SyncStatus["user"]) {
    const changed = user?.id !== this.status.user?.id;
    if (!user) {
      this.set({ user: null, phase: "signed-out", pending: 0, blocked: 0, lastSyncAt: null, errors: [] });
      return;
    }
    if (changed) {
      this.set({ user, lastSyncAt: loadLedger(user.id).lastSyncAt, errors: [] });
      this.refreshCounts();
      this.attempt = 0;
      this.schedule(500);
    }
  }

  private schedule(delayMs: number, onlyIfSooner = false) {
    if (this.stopped || !this.status.user) return;
    if (this.running) {
      this.rerun = true;
      return;
    }
    if (onlyIfSooner && this.timer && this.status.nextRetryAt) {
      if (Date.parse(this.status.nextRetryAt) - Date.now() < delayMs) return;
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), delayMs);
  }

  private refreshCounts() {
    if (this.countTimer) clearTimeout(this.countTimer);
    this.countTimer = setTimeout(async () => {
      const user = this.status.user;
      if (!user) return;
      try {
        const [clips, snaps] = await Promise.all([listClips(), listSnapshots()]);
        const { pending, blocked } = countPending(clips, snaps, loadLedger(user.id), user.id, this.isAdmin);
        this.set({ pending, blocked });
      } catch {
        // store unavailable (private mode): leave counts as they are
      }
    }, 300);
  }

  private async run() {
    this.timer = null;
    const user = this.status.user;
    const supabase = this.supabase;
    if (!user || !supabase || this.stopped) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      this.set({ phase: "offline" });
      return;
    }
    this.running = true;
    this.rerun = false;
    this.set({ phase: "syncing", nextRetryAt: null });
    const shouldStop = () => this.stopped || this.status.user?.id !== user.id || navigator.onLine === false;
    try {
      const job = new SyncRun(supabase, user.id, shouldStop, (r) =>
        this.set({ pending: r.pending, blocked: r.blocked }),
      );
      const report = await job.run();
      this.isAdmin = job.admin;
      const failed = report.errors.length > 0;
      this.attempt = failed ? this.attempt + 1 : 0;
      this.set({
        phase: failed ? "error" : navigator.onLine === false ? "offline" : "idle",
        pending: report.pending,
        blocked: report.blocked,
        errors: report.errors.slice(0, 5),
        lastSyncAt: job.lastSyncAt,
      });
    } catch (e) {
      this.attempt++;
      this.set({ phase: navigator.onLine === false ? "offline" : "error", errors: [e instanceof Error ? e.message : String(e)] });
    } finally {
      this.running = false;
    }
    if (this.stopped) return;
    if (this.status.phase === "error") {
      const delay = backoffMs(this.attempt - 1);
      this.set({ nextRetryAt: new Date(Date.now() + delay).toISOString() });
      if (this.timer) clearTimeout(this.timer);
      this.timer = setTimeout(() => void this.run(), delay);
    } else if (this.rerun) {
      this.schedule(LOCAL_CHANGE_DEBOUNCE_MS);
    }
  }
}
