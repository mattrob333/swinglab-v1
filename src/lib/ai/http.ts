// Small request helpers for the AI route handlers (Web APIs only).

export class BodyTooLargeError extends Error {}

/** Read a request body as text, refusing more than `maxBytes` (streams, so a huge body is never buffered). */
export async function readTextLimited(request: Request, maxBytes: number): Promise<string> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }
  const all = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    all.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(all);
}

/** Parse a JSON body within a size limit. */
export async function readJsonLimited(request: Request, maxBytes: number): Promise<{ ok: true; body: unknown } | { ok: false; status: 400 | 413; error: string }> {
  let text: string;
  try {
    text = await readTextLimited(request, maxBytes);
  } catch (e) {
    if (e instanceof BodyTooLargeError) return { ok: false, status: 413, error: "The request is too large. Use fewer or smaller snapshots." };
    return { ok: false, status: 400, error: "Could not read the request." };
  }
  try {
    return { ok: true, body: JSON.parse(text) };
  } catch {
    return { ok: false, status: 400, error: "The request body must be JSON." };
  }
}
