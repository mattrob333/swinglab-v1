// Supabase configuration. DOM-free and framework-free so the proxy, server
// code, client code and unit tests can all import it.
//
// When the public URL or key is missing the whole app runs in LOCAL-ONLY mode:
// no sign-in gate, no sync, no errors. Keep the `process.env.NEXT_PUBLIC_*`
// references literal so Next.js can inline them into the client bundle.

export const SUPABASE_URL: string = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

/** Publishable key (new style) or legacy anon key; both are safe in the browser. */
export const SUPABASE_KEY: string =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

export function isSupabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_KEY.length > 0;
}

/** Storage bucket names (both private). */
export const CLIPS_BUCKET = "clips";
export const SNAPSHOTS_BUCKET = "snapshots";
