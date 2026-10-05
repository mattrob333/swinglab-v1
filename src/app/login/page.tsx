import type { Metadata } from "next";
import Link from "next/link";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { safeNextPath } from "@/lib/supabase/paths";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · SwingLab" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const raw = (await searchParams).next;
  const next = safeNextPath(Array.isArray(raw) ? raw[0] : raw);
  const configured = isSupabaseConfigured();

  return (
    <div className="safe-top flex h-full flex-col items-center justify-center overflow-y-auto px-6 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="text-4xl font-black tracking-tight">
            Swing<span className="text-neon">Lab</span>
          </div>
          <p className="mt-2 text-muted">Sign in to sync your swings between devices.</p>
        </div>
        {configured ? (
          <LoginForm next={next} />
        ) : (
          <div className="rounded-2xl border border-line bg-surface p-5 text-center">
            <p className="font-semibold">Sync is not set up on this build.</p>
            <p className="mt-1 text-sm text-muted">
              SwingLab is running in local-only mode: everything stays on this device and no sign-in is needed.
            </p>
            <Link
              href="/"
              className="mt-4 flex min-h-14 items-center justify-center rounded-xl bg-neon text-lg font-bold text-black"
            >
              Open SwingLab
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
