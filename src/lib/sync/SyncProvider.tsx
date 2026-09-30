"use client";

// Mounted once in the root layout. Starts the sync controller in the browser
// (no-op in local-only mode) and exposes its status to any screen via useSync().

import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { INITIAL_STATUS, SyncController, type SyncStatus } from "./controller";

interface SyncContextValue {
  status: SyncStatus;
  syncNow: () => void;
  signOut: () => Promise<void>;
}

const noop = () => {};
const SyncContext = createContext<SyncContextValue>({
  status: INITIAL_STATUS,
  syncNow: noop,
  signOut: async () => {},
});

const initial = () => INITIAL_STATUS;

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const [controller] = useState(() => new SyncController());
  useEffect(() => controller.start(), [controller]);
  const status = useSyncExternalStore(controller.onChange, controller.getStatus, initial);
  const value: SyncContextValue = {
    status,
    syncNow: controller.syncNow,
    signOut: () => controller.signOut(),
  };
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

/** Sync status and actions. Safe anywhere under the root layout. */
export function useSync(): SyncContextValue {
  return useContext(SyncContext);
}
