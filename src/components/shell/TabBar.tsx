"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "Home", icon: "M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" },
  { href: "/capture", label: "Record", icon: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z" },
  { href: "/compare", label: "Compare", icon: "M4 4h16v7H4zM4 13h16v7H4z" },
  { href: "/library", label: "Library", icon: "M4 5h6v14H4zM14 5h6v14h-6z" },
  { href: "/snaps", label: "Snaps", icon: "M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" },
];

/** Bottom tab bar. Hidden on full-screen flows (recording, login). */
export function TabBar() {
  const pathname = usePathname();
  if (pathname.startsWith("/capture") || pathname.startsWith("/login") || pathname.endsWith("/edit")) {
    return null;
  }
  return (
    <nav className="safe-bottom border-t border-line bg-surface/95 backdrop-blur" aria-label="Main">
      <ul className="mx-auto flex max-w-2xl">
        {TABS.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/"
              : pathname.startsWith(tab.href) || (tab.href === "/snaps" && pathname.startsWith("/analysis"));
          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium ${
                  active ? "text-neon" : "text-muted"
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden>
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
