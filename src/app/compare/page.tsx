import type { Metadata } from "next";
import { Suspense } from "react";
import { CompareScreen } from "@/components/player/CompareScreen";

export const metadata: Metadata = { title: "Compare · SwingLab" };

export default function ComparePage() {
  return (
    <Suspense fallback={<div className="absolute inset-0 bg-bg" />}>
      <CompareScreen />
    </Suspense>
  );
}
