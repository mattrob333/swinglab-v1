import assert from "node:assert/strict";
import test from "node:test";
import { NextRequest } from "next/server.js";

import { proxy } from "../src/proxy.ts";

test("auth guard redirects unauthenticated upload requests to sign in", () => {
  const request = new NextRequest("https://swinglab.test/upload?from=home");

  const response = proxy(request);

  assert.equal(response.status, 307);
  assert.equal(
    response.headers.get("location"),
    "https://swinglab.test/sign-in?redirect_url=%2Fupload%3Ffrom%3Dhome",
  );
});

test("auth guard allows upload requests with a Clerk session cookie", () => {
  const request = new NextRequest("https://swinglab.test/upload", {
    headers: {
      cookie: "__session=test-session",
    },
  });

  const response = proxy(request);

  assert.equal(response.headers.get("location"), null);
});
