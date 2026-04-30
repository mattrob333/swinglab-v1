const clerkSessionCookieNames = [
  "__session",
  "__clerk_db_jwt",
  "__clerk_client_jwt",
];

type CookieValue = string | { value?: string } | undefined;

type RequestLike = {
  cookies?: {
    get(name: string): CookieValue;
  };
  headers?: Headers;
};

function readCookieHeader(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return undefined;
  }

  const prefix = `${name}=`;
  const cookie = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : undefined;
}

function readCookie(request: RequestLike, name: string) {
  const cookie = request.cookies?.get(name);

  if (typeof cookie === "string") {
    return cookie;
  }

  if (cookie?.value) {
    return cookie.value;
  }

  return readCookieHeader(request.headers?.get("cookie") ?? null, name);
}

export function hasClerkSession(request: RequestLike) {
  return clerkSessionCookieNames.some((name) => Boolean(readCookie(request, name)));
}

export function getUploadUserId(request: RequestLike) {
  const explicitUserId = request.headers?.get("x-clerk-user-id");

  if (explicitUserId) {
    return explicitUserId;
  }

  const session = readCookie(request, "__session");

  if (!session) {
    return undefined;
  }

  return "clerk-session";
}
