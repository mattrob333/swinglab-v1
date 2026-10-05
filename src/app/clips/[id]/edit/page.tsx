import { ClipEditor } from "@/components/capture/ClipEditor";

export default async function EditClipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClipEditor key={id} clipId={id} />;
}
