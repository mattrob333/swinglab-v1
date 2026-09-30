import type { Metadata } from "next";
import { SettingsScreen } from "./SettingsScreen";

export const metadata: Metadata = { title: "Settings · SwingLab" };

export default function SettingsPage() {
  return <SettingsScreen />;
}
