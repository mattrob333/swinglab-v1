import { NextResponse, type NextRequest } from "next/server.js";

import { hasClerkSession } from "./lib/auth.ts";

export function proxy(request: NextRequest) {
  if (hasClerkSession(request)) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set(
    "redirect_url",
    `${request.nextUrl.pathname}${request.nextUrl.search}`,
  );

  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/upload/:path*"],
};
