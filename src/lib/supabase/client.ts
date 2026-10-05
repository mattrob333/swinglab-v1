"use client";

// Browser Supabase client. The session lives in cookies (via @supabase/ssr) so
// src/proxy.ts can read and refresh it on navigation.

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";
import type { Database } from "./database.types";

export { isSupabaseConfigured } from "./config";

export type SwingLabClient = SupabaseClient<Database>;

let client: SwingLabClient | null = null;

/** Shared browser client, or null in local-only mode. */
export function getSupabaseBrowserClient(): SwingLabClient | null {
  if (!isSupabaseConfigured()) return null;
  if (!client) client = createBrowserClient<Database>(SUPABASE_URL, SUPABASE_KEY);
  return client;
}
