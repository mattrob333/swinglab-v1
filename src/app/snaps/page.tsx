import type { Metadata } from "next";
import { SnapsGallery } from "@/components/player/SnapsGallery";

export const metadata: Metadata = { title: "Snaps · SwingLab" };

export default function SnapsPage() {
  return <SnapsGallery />;
}
