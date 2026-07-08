"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { LogoMark } from "@/app/logo";
import { ToastProvider } from "./toaster";
import { CommandPalette } from "./command-palette";

function NavIcon({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}
const IconLayers = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <path d="m12 2 9 5-9 5-9-5 9-5Z" />
    <path d="m3 12 9 5 9-5" />
    <path d="m3 17 9 5 9-5" />
  </NavIcon>
);
const IconCard = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M2 10h20" />
  </NavIcon>
);
const IconUser = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <path d="M20 21a8 8 0 0 0-16 0" />
    <circle cx="12" cy="7" r="4" />
  </NavIcon>
);
const IconTarget = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.8" fill="currentColor" />
  </NavIcon>
);
const IconUsers = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </NavIcon>
);
const IconChart = (p: { className?: string }) => (
  <NavIcon className={p.className}>
    <path d="M3 3v18h18" />
    <path d="M8 17v-3" />
    <path d="M13 17V7" />
    <path d="M18 17v-6" />
  </NavIcon>
);

/** The signed-in app chrome: a dark navy sidebar on desktop, a top bar on mobile. */
export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const inPipeline = pathname.startsWith("/deals");
  const inCriteria = pathname.startsWith("/criteria");
  const inAnalytics = pathname.startsWith("/analytics");
  const inTeam = pathname.startsWith("/team");
  const inBilling = pathname.startsWith("/billing");
  const inAccount = pathname.startsWith("/account");
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <ToastProvider>
    <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-white"
    >
      Skip to content
    </a>
    <div className="flex min-h-screen bg-canvas">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-white md:flex">
        <Link href="/deals" className="flex items-center gap-2.5 px-5 py-5">
          <LogoMark className="h-8 w-8" />
          <span className="font-semibold tracking-tight">
            Underwrite Copilot
          </span>
        </Link>

        <div className="px-3 pb-1">
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            className="flex w-full items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white/55 transition-colors hover:bg-white/10 hover:text-white/80"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            Jump to…
            <kbd className="ml-auto rounded border border-white/15 px-1.5 py-0.5 text-[10px] text-white/45">
              ⌘K
            </kbd>
          </button>
        </div>

        <nav className="mt-1 flex-1 space-y-1 px-3">
          {(
            [
              ["/deals", "Pipeline", inPipeline, IconLayers],
              ["/criteria", "Buy box", inCriteria, IconTarget],
              ["/analytics", "Analytics", inAnalytics, IconChart],
              ["/team", "Team", inTeam, IconUsers],
              ["/billing", "Billing", inBilling, IconCard],
              ["/account", "Account", inAccount, IconUser],
            ] as const
          ).map(([href, label, active, Icon]) => (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-white/12 text-white"
                  : "text-white/65 hover:bg-white/5 hover:text-white"
              }`}
            >
              {active && (
                <span
                  className="absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-full bg-accent"
                  aria-hidden
                />
              )}
              <Icon className={`h-4 w-4 ${active ? "text-accent" : ""}`} />
              {label}
            </Link>
          ))}
        </nav>

        <div className="border-t border-white/10 px-3 py-4">
          <div className="flex items-center gap-2.5 px-2">
            <span
              aria-hidden
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold uppercase text-accent ring-1 ring-white/15"
            >
              {userEmail.charAt(0)}
            </span>
            <p title={userEmail} className="min-w-0 truncate text-xs text-white/60">
              {userEmail}
            </p>
          </div>
          <form action={signOut} className="mt-2">
            <button
              type="submit"
              className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar — mobile */}
        <header className="sticky top-0 z-10 bg-sidebar text-white md:hidden">
          <div className="flex items-center justify-between px-4 py-3">
            <Link href="/deals" className="flex items-center gap-2">
              <LogoMark className="h-7 w-7" />
              <span className="font-semibold tracking-tight">
                Underwrite Copilot
              </span>
            </Link>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPaletteOpen(true)}
                aria-label="Search deals and actions"
                className="rounded-lg p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4.5 w-4.5"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.3-4.3" />
                </svg>
              </button>
              <form action={signOut}>
                <button
                  type="submit"
                  className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                >
                  Sign out
                </button>
              </form>
            </div>
          </div>
          {/* Mobile nav — the sidebar is desktop-only, so these live here. */}
          <nav className="flex gap-1 overflow-x-auto border-t border-white/10 px-3 py-2">
            {[
              { href: "/deals", label: "Pipeline", active: inPipeline },
              { href: "/criteria", label: "Buy box", active: inCriteria },
              { href: "/analytics", label: "Analytics", active: inAnalytics },
              { href: "/team", label: "Team", active: inTeam },
              { href: "/billing", label: "Billing", active: inBilling },
              { href: "/account", label: "Account", active: inAccount },
            ].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={n.active ? "page" : undefined}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  n.active
                    ? "bg-white/12 text-white"
                    : "text-white/65 hover:bg-white/5 hover:text-white"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </header>

        <main id="main" className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}
