// Auth gate (Next 16 "proxy", formerly middleware).
//
// * Local-only mode (no Supabase env vars): pass everything through.
// * Otherwise: refresh the Supabase session cookies on every page request and
//   send signed-out visitors to /login?next=<path>.
// * If the auth server cannot be reached (bad signal at the field) and the
//   visitor has a session cookie, let them in: screens read the on-device store
//   and the sync layer re-checks auth itself. Data access is always enforced by
//   Postgres RLS, never by this file.

import { createServerClient } from "@supabase/ssr";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";
import { isPublicPath, safeNextPath } from "@/lib/supabase/paths";

export async function proxy(request: NextRequest) {
  if (!isSupabaseConfigured()) return NextResponse.next();

  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [key, value] of Object.entries(headers ?? {})) response.headers.set(key, value);
      },
    },
  });

  // Do not put code between createServerClient and getClaims: getClaims is what
  // refreshes an expiring session and writes the new cookies.
  const { data, error } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (signedIn) {
    if (pathname === "/login") {
      const target = safeNextPath(request.nextUrl.searchParams.get("next"));
      return withCookies(NextResponse.redirect(new URL(target, request.url)), response);
    }
    return response;
  }

  if (isPublicPath(pathname)) return response;

  const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));
  if (hasAuthCookie && error && isAuthRetryableFetchError(error)) return response;

  const login = new URL("/login", request.url);
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return withCookies(NextResponse.redirect(login), response);
}

/** Carry refreshed/cleared auth cookies over to a redirect response. */
function withCookies(target: NextResponse, source: NextResponse): NextResponse {
  for (const cookie of source.cookies.getAll()) target.cookies.set(cookie);
  target.headers.set("Cache-Control", "private, no-store");
  return target;
}

export const config = {
  matcher: [
    // Everything except build assets and public static files.
    "/((?!_next/static|_next/image|favicon\\.ico|sw\\.js|manifest\\.webmanifest|icon\\.svg|videos/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|mov|webm|woff|woff2|txt|xml)$).*)",
  ],
};
