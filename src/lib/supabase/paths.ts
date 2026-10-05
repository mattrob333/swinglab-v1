// Pure routing rules for the auth gate (src/proxy.ts) and the login page.
// Framework-free so tests/data-*.test.ts can cover them.

/** Paths reachable without signing in. */
export function isPublicPath(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/login/")) return true;
  if (pathname === "/auth" || pathname.startsWith("/auth/")) return true;
  if (pathname.startsWith("/_next/")) return true;
  if (pathname.startsWith("/videos/")) return true;
  if (
    pathname === "/manifest.webmanifest" ||
    pathname === "/icon.svg" ||
    pathname === "/sw.js" ||
    pathname === "/favicon.ico" ||
    pathname === "/robots.txt"
  ) {
    return true;
  }
  // Any other static file served from /public (has a file extension).
  return /\.(?:svg|png|jpe?g|gif|webp|ico|mp4|mov|webm|woff2?|txt|xml|json)$/i.test(pathname);
}

/**
 * Sanitize a post-login redirect target. Only same-origin absolute paths are
 * allowed ("/compare?x=1"); anything else (full URLs, "//evil.com",
 * "/\\evil.com", "/login" loops) falls back to "/".
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f]/.test(next)) return "/";
  if (next === "/login" || next.startsWith("/login?") || next.startsWith("/login/")) return "/";
  return next;
}
