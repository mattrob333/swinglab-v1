"use client";

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function friendlyError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "That email or password isn't right. Try again.";
  if (m.includes("email not confirmed")) return "This account isn't confirmed yet. Ask the account owner to confirm it.";
  if (m.includes("fetch") || m.includes("network") || m.includes("failed to")) {
    return "Can't reach the server. Check your Wi-Fi or signal and try again.";
  }
  if (m.includes("rate limit") || m.includes("too many")) return "Too many tries. Wait a minute and try again.";
  return message;
}

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      setError("You're offline. Connect to Wi-Fi to sign in.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setError(friendlyError(signInError.message));
        setBusy(false);
        return;
      }
      // Full navigation so the proxy sees the new session cookies.
      window.location.replace(next);
    } catch (err) {
      setError(friendlyError(err instanceof Error ? err.message : String(err)));
      setBusy(false);
    }
  }

  const inputClass =
    "mt-1 block min-h-14 w-full rounded-xl border border-line bg-elevated px-4 text-lg text-white outline-none placeholder:text-muted focus:border-neon";

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <label className="block">
        <span className="text-sm font-medium text-muted">Email</span>
        <input
          type="email"
          name="email"
          inputMode="email"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={inputClass}
          placeholder="you@example.com"
        />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-muted">Password</span>
        <div className="relative">
          <input
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${inputClass} pr-20`}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-1 my-1 min-w-16 rounded-lg px-3 text-sm font-semibold text-muted"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      {error && (
        <p role="alert" className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={busy || !email || !password}
        className="flex min-h-14 w-full items-center justify-center rounded-xl bg-neon text-lg font-bold text-black transition active:scale-[0.98] disabled:opacity-50"
      >
        {busy ? "Signing in…" : "Sign in"}
      </button>
      <p className="text-center text-xs text-muted">
        No account? Ask the account owner. New sign-ups are turned off.
      </p>
    </form>
  );
}
