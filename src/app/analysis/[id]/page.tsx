import type { Metadata } from "next";
import { AnalysisScreen } from "@/components/ai/AnalysisScreen";

export const metadata: Metadata = { title: "Swing report · SwingLab" };

// Analyses live on the device (IndexedDB), so the server only passes the ids
// through; the client component reads the report from the local store.
export default async function AnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ vs?: string | string[] }>;
}) {
  const { id } = await params;
  const { vs } = await searchParams;
  const other = typeof vs === "string" && vs && vs !== id ? vs : null;
  return <AnalysisScreen key={`${id}:${other ?? ""}`} id={id} vs={other} />;
}
