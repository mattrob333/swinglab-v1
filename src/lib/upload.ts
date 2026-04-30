export type BlobPutResult = {
  url: string;
  pathname: string;
  contentType?: string;
  contentDisposition?: string;
};

export type BlobPut = (
  pathname: string,
  file: File,
  options: {
    access: "public";
    addRandomSuffix: false;
  },
) => Promise<BlobPutResult>;

export type UploadSwingVideoResult =
  | {
      ok: true;
      blobUrl: string;
      pathname: string;
      hitterName: string;
    }
  | {
      ok: false;
      error: string;
    };

const allowedVideoTypes = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

function sanitizeFilename(name: string) {
  return name
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

async function putWithVercelBlob(
  pathname: string,
  file: File,
  options: Parameters<BlobPut>[2],
) {
  const importBlob = Function("return import('@vercel/blob')") as () => Promise<{
    put: BlobPut;
  }>;
  const { put } = await importBlob();

  return put(pathname, file, options);
}

export async function uploadSwingVideo(
  formData: FormData,
  dependencies: {
    userId: string;
    put?: BlobPut;
  },
): Promise<UploadSwingVideoResult> {
  const file = formData.get("swingVideo");

  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose a baseball swing video to upload." };
  }

  if (!allowedVideoTypes.has(file.type)) {
    return { ok: false, error: "Upload an MP4, MOV, or WebM video." };
  }

  const filename = sanitizeFilename(file.name);

  if (!filename) {
    return { ok: false, error: "The video filename is invalid." };
  }

  const hitterName = String(formData.get("hitterName") ?? "").trim();
  const pathname = `${dependencies.userId}/${filename}`;
  const put = dependencies.put ?? putWithVercelBlob;
  const blob = await put(pathname, file, {
    access: "public",
    addRandomSuffix: false,
  });

  return {
    ok: true,
    blobUrl: blob.url,
    pathname: blob.pathname,
    hitterName,
  };
}
