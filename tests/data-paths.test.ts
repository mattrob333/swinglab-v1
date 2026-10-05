import { test } from "node:test";
import assert from "node:assert/strict";
import { isPublicPath, safeNextPath } from "../src/lib/supabase/paths.ts";

test("public paths skip the auth gate", () => {
  for (const p of ["/login", "/auth/callback", "/sw.js", "/manifest.webmanifest", "/icon.svg", "/videos/pro/a.mp4", "/_next/static/x.js"]) {
    assert.equal(isPublicPath(p), true, p);
  }
  for (const p of ["/", "/compare", "/settings", "/library", "/clips/1/edit", "/loginx"]) {
    assert.equal(isPublicPath(p), false, p);
  }
});

test("post-login redirect is same-origin only", () => {
  assert.equal(safeNextPath("/compare?a=1"), "/compare?a=1");
  assert.equal(safeNextPath(null), "/");
  assert.equal(safeNextPath("https://evil.com"), "/");
  assert.equal(safeNextPath("//evil.com"), "/");
  assert.equal(safeNextPath("/\\evil.com"), "/");
  assert.equal(safeNextPath("/login"), "/");
  assert.equal(safeNextPath("/x\n"), "/");
});
