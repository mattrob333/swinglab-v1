import type { Metadata, Viewport } from "next";
import "./globals.css";
import { TabBar } from "@/components/shell/TabBar";

export const metadata: Metadata = {
  title: "SwingLab",
  description: "Record a swing and compare it with a pro, frame by frame",
  applicationName: "SwingLab",
  appleWebApp: { capable: true, title: "SwingLab", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#08090a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex h-full flex-col overflow-hidden bg-bg text-[#f7f8f8]">
        <main className="relative min-h-0 flex-1">{children}</main>
        <TabBar />
      </body>
    </html>
  );
}
