import type { Metadata } from "next";
import { AnalysesList } from "@/components/ai/AnalysesList";

export const metadata: Metadata = { title: "Analyses · SwingLab" };

export default function AnalysesPage() {
  return <AnalysesList />;
}
