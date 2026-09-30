"use client";

// Reads the frame rate from the container (packet timestamps) with Mediabunny,
// without decoding. Used when a clip's fps is unknown so frame stepping is exact
// before the clip has ever played.

const cache = new Map<string, Promise<number | null>>();

export function probeFps(clipId: string, blob: Blob): Promise<number | null> {
  let p = cache.get(clipId);
  if (!p) {
    p = (async () => {
      try {
        const { Input, BlobSource, ALL_FORMATS } = await import("mediabunny");
        const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
        const track = await input.getPrimaryVideoTrack();
        if (!track) return null;
        const stats = await track.computePacketStats(120);
        const { snapFps } = await import("./fps.ts");
        const rate = stats.averagePacketRate;
        return rate > 1 && rate < 1000 ? snapFps(rate) : null;
      } catch {
        return null;
      }
    })();
    cache.set(clipId, p);
  }
  return p;
}
