// SwingLab offline app shell.
//
// - Navigations: network first; offline falls back to the cached page, then to
//   the cached home page ("/"), so the app opens at the field with no signal.
// - Build assets (/_next/static, hashed and immutable): cache first.
// - Other same-origin static files (icon, manifest): stale-while-revalidate.
// - Never cached: other origins (Supabase API, auth, signed storage URLs),
//   non-GET requests, Range requests / media (videos play from IndexedDB blobs
//   or /videos samples), /api and /auth routes, and RSC data requests.
//
// Bump VERSION to drop old caches after a breaking change.

const VERSION = "v1";
const SHELL_CACHE = `swinglab-shell-${VERSION}`;
const STATIC_CACHE = `swinglab-static-${VERSION}`;
// Main screens, so they open offline even if not visited since install.
const PRECACHE = ["/", "/capture", "/compare", "/library", "/snaps", "/analysis", "/settings", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) =>
        Promise.all(
          PRECACHE.map((url) =>
            fetch(url, { credentials: "same-origin" })
              // Skip redirects (e.g. to /login when signed out) so they never become the offline shell.
              .then((res) => (isCacheableResponse(res) ? cache.put(url, res) : undefined))
              .catch(() => undefined),
          ),
        ),
      )
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("swinglab-") && k !== SHELL_CACHE && k !== STATIC_CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

function isCacheableResponse(res) {
  return res && res.ok && res.status === 200 && res.type === "basic" && !res.redirected;
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const res = await fetch(request);
    // Do not cache the login page or redirects to it as the offline shell.
    const url = new URL(request.url);
    if (isCacheableResponse(res) && !url.pathname.startsWith("/login")) {
      cache.put(url.pathname, res.clone());
    }
    return res;
  } catch {
    const url = new URL(request.url);
    return (
      (await cache.match(url.pathname)) ||
      (await cache.match("/")) ||
      new Response(
        "<!doctype html><meta name=viewport content='width=device-width'><body style='background:#08090a;color:#f7f8f8;font-family:-apple-system,sans-serif;padding:2rem'><h1>Offline</h1><p>Open SwingLab once with a connection so it can work offline.</p>",
        { status: 503, headers: { "Content-Type": "text/html; charset=utf-8" } },
      )
    );
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (isCacheableResponse(res)) cache.put(request, res.clone()).then(() => trim(cache));
  return res;
}

// Old hashed build assets pile up across deploys; keep the cache bounded.
async function trim(cache, max = 400) {
  const keys = await cache.keys();
  if (keys.length > max) await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((res) => {
      if (isCacheableResponse(res)) cache.put(request, res.clone());
      return res;
    })
    .catch(() => undefined);
  return hit || (await network) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  if (request.headers.has("range")) return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // Supabase and every other origin: untouched
  if (request.destination === "video" || request.destination === "audio") return;
  const path = url.pathname;
  if (path.startsWith("/videos/") || path.startsWith("/api/") || path.startsWith("/auth/")) return;
  if (path === "/sw.js") return;
  if (request.headers.has("rsc") || url.searchParams.has("_rsc")) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  if (path.startsWith("/_next/static/")) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (path === "/manifest.webmanifest" || path === "/icon.svg" || path === "/favicon.ico") {
    event.respondWith(staleWhileRevalidate(request));
  }
});
