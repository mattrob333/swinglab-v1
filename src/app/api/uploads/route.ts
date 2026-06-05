import { getUploadUserId } from "../../../lib/auth.ts";
import { uploadSwingVideo } from "../../../lib/upload.ts";

export async function POST(request: Request) {
  const userId = getUploadUserId(request);

  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const result = await uploadSwingVideo(formData, { userId });

  return Response.json(result, { status: result.ok ? 201 : 400 });
}
