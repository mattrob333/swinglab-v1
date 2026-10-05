// Server Supabase client for Server Components, Server Functions and Route
// Handlers (Next 16: `cookies()` is async). Server Components cannot set
// cookies; the proxy (src/proxy.ts) refreshes the session before render, so
// the failed write there is safe to ignore.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "./config";
import type { Database } from "./database.types";

export { isSupabaseConfigured } from "./config";

/** Request-scoped server client, or null in local-only mode. Never cache it globally. */
export async function createSupabaseServerClient() {
  if (!isSupabaseConfigured()) return null;
  const cookieStore = await cookies();
  return createServerClient<Database>(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component: cookies are read-only there.
        }
      },
    },
  });
}

/**
 * Verified identity of the caller (JWT checked via getClaims), or null when
 * signed out or in local-only mode. Use this for authorization on the server;
 * never trust getSession() alone.
 */
export async function getServerUser(): Promise<{ id: string; email: string | null } | null> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims?.sub) return null;
  return { id: data.claims.sub, email: (data.claims.email as string | undefined) ?? null };
}
