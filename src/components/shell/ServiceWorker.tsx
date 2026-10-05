"use client";

import { useEffect } from "react";

/**
 * Registers the offline app-shell service worker (public/sw.js) in production
 * builds only; in development it would cache hot-reloaded assets.
 */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Not fatal: the app still works online and data lives in IndexedDB.
        });
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
  }, []);
  return null;
}
