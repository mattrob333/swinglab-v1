// Newline-delimited JSON streaming for /api/ai/analyze. Pure Web APIs
// (tests/ai-ndjson.test.ts).

import type { AnalyzeEvent } from "./contract.ts";

/** One NDJSON line. JSON.stringify escapes newlines inside strings, so a line never splits. */
export function encodeEvent(event: AnalyzeEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/** Parse NDJSON text back into events (used by tests; the UI has its own reader). */
export function decodeEvents(text: string): AnalyzeEvent[] {
  return text
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l) as AnalyzeEvent);
}

export const NDJSON_HEADERS: Record<string, string> = {
  "Content-Type": "application/x-ndjson; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
};

/**
 * A byte stream fed by `run(emit)`. Emitting after the client disconnected is
 * a no-op; a throw inside `run` becomes a final error event (with a generic
 * message: details stay in the server log).
 */
export function ndjsonStream(run: (emit: (e: AnalyzeEvent) => void) => Promise<void>): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let closed = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (e: AnalyzeEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(encodeEvent(e)));
        } catch {
          closed = true;
        }
      };
      try {
        await run(emit);
      } catch {
        emit({ type: "error", message: "Something went wrong while analyzing. Please try again." });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // already closed by a cancel
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
}
