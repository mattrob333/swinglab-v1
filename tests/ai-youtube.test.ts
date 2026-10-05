import { test } from "node:test";
import assert from "node:assert/strict";
import { extractYouTubeIds, filterDrillVideos, youTubeVideoId } from "../src/lib/ai/youtube.ts";

const ID = "dQw4w9WgXcQ";
const ID2 = "abcdefghijk";

test("accepts https watch and youtu.be links only", () => {
  assert.equal(youTubeVideoId(`https://www.youtube.com/watch?v=${ID}`), ID);
  assert.equal(youTubeVideoId(`https://www.youtube.com/watch?v=${ID}&t=42s`), ID);
  assert.equal(youTubeVideoId(`https://youtube.com/watch?v=${ID}`), ID);
  assert.equal(youTubeVideoId(`https://m.youtube.com/watch?v=${ID}`), ID);
  assert.equal(youTubeVideoId(`https://youtu.be/${ID}`), ID);
  assert.equal(youTubeVideoId(`https://youtu.be/${ID}?si=abc`), ID);
});

test("rejects everything else", () => {
  const bad = [
    `http://www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/playlist?list=PL123`,
    `https://www.youtube.com/@SomeCoach`,
    `https://www.youtube.com/watch?v=short`,
    `https://www.youtube.com/watch?v=${ID}x`,
    `https://www.youtube.com.evil.com/watch?v=${ID}`,
    `https://evilyoutube.com/watch?v=${ID}`,
    `https://user:pw@www.youtube.com/watch?v=${ID}`,
    `https://www.youtube.com:8443/watch?v=${ID}`,
    `https://vimeo.com/123`,
    `javascript:alert(1)`,
    `https://www.youtube.com/embed/${ID}`,
    "",
    null,
    42,
  ];
  for (const b of bad) assert.equal(youTubeVideoId(b), null, String(b));
});

test("extracts ids from search-result JSON", () => {
  const blob = JSON.stringify([
    { type: "web_search_result", url: `https://www.youtube.com/watch?v=${ID}`, title: "Drill" },
    { type: "web_search_result", url: `https://youtu.be/${ID2}`, title: "Another" },
    { type: "web_search_result", url: "https://www.youtube.com/shorts/zzzzzzzzzzz", title: "Short" },
  ]);
  assert.deepEqual([...extractYouTubeIds(blob)].sort(), [ID2, ID].sort());
});

test("drill videos: only valid, search-backed, canonical, deduped, max 6", () => {
  const seen = new Set([ID, ID2]);
  const raw = {
    videos: [
      { title: "Tee drill", url: `https://youtu.be/${ID}`, channel: "Coach", why: "stay inside" },
      { title: "Dup", url: `https://www.youtube.com/watch?v=${ID}`, channel: "", why: "" },
      { title: "Invented", url: "https://www.youtube.com/watch?v=zzzzzzzzzzz", channel: "", why: "" },
      { title: "Not youtube", url: "https://example.com/x", channel: "", why: "" },
      { title: "", url: `https://www.youtube.com/watch?v=${ID2}`, channel: "", why: "" },
    ],
  };
  const out = filterDrillVideos(raw, seen);
  assert.deepEqual(out, [{ title: "Tee drill", url: `https://www.youtube.com/watch?v=${ID}`, channel: "Coach", why: "stay inside" }]);

  const many = Array.from({ length: 10 }, (_, i) => ({ title: `v${i}`, url: `https://youtu.be/aaaaaaaaaa${i}`, channel: "", why: "" }));
  assert.equal(filterDrillVideos({ videos: many }, null).length, 6);
  assert.deepEqual(filterDrillVideos("nope", seen), []);
  assert.deepEqual(filterDrillVideos({ videos: many }, new Set()), []);
});
