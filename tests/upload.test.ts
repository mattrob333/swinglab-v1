import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";

import UploadPage from "../src/app/upload/page.ts";
import { uploadSwingVideo } from "../src/lib/upload.ts";

test("upload form renders for baseball swing videos", () => {
  const html = renderToStaticMarkup(UploadPage());

  assert.match(html, /Upload swing video/);
  assert.match(html, /name="swingVideo"/);
  assert.match(html, /accept="video\/mp4,video\/quicktime,video\/webm"/);
  assert.match(html, /name="hitterName"/);
  assert.match(html, /Submit for analysis/);
});

test("upload mock succeeds without network access", async () => {
  const file = new File(["video-bytes"], "front-toss.mp4", {
    type: "video/mp4",
  });
  const formData = new FormData();
  formData.set("swingVideo", file);
  formData.set("hitterName", "Maya Torres");

  const calls: Array<{ pathname: string; file: File }> = [];

  const result = await uploadSwingVideo(formData, {
    userId: "user_test_123",
    put: async (pathname, blob) => {
      calls.push({ pathname, file: blob as File });

      return {
        url: `https://blob.test/${pathname}`,
        pathname,
        contentType: blob.type,
        contentDisposition: `attachment; filename="${blob.name}"`,
      };
    },
  });

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.file.name, "front-toss.mp4");
  assert.equal(result.blobUrl, "https://blob.test/user_test_123/front-toss.mp4");
  assert.equal(result.hitterName, "Maya Torres");
});
