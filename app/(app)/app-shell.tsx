"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode } from "react";
import { signOut } from "@/app/login/actions";
import { ToastProvider } from "./toaster";

function Logo({ small = false }: { small?: boolean }) {
  return (
    <div
      className={`flex items-center justify-center rounded-lg bg-white/10 font-semibold text-white ring-1 ring-white/15 ${
        small ? "h-7 w-7 text-xs" : "h-8 w-8 text-sm"
      }`}
    >
      UC
    </div>
  );
}

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

/** The signed-in app chrome: a deep-teal sidebar on desktop, a top bar on mobile. */
export function AppShell({
  userEmail,
  children,
}: {
  userEmail: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const inPipeline = pathname.startsWith("/deals");
  const inBilling = pathname.startsWith("/billing");
  const inAccount = pathname.startsWith("/account");

  return (
    <ToastProvider>
    <div className="flex min-h-screen bg-canvas">
      {/* Sidebar — desktop */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col bg-sidebar text-white md:flex">
        <Link href="/deals" className="flex items-center gap-2.5 px-5 py-5">
          <Logo />
          <span className="font-semibold tracking-tight">
            Underwrite Copilot
          </span>
        </Link>

        <nav className="mt-2 flex-1 space-y-1 px-3">
          <Link
            href="/deals"
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              inPipeline
                ? "bg-white/12 text-white"
                : "text-white/65 hover:bg-white/5 hover:text-white"
            }`}
          >
            <IconLayers className="h-4 w-4" />
            Pipeline
          </Link>
          <Link
            href="/billing"
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              inBilling
                ? "bg-white/12 text-white"
                : "text-white/65 hover:bg-white/5 hover:text-white"
            }`}
          >
            <IconCard className="h-4 w-4" />
            Billing
          </Link>
          <Link
            href="/account"
            className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              inAccount
                ? "bg-white/12 text-white"
                : "text-white/65 hover:bg-white/5 hover:text-white"
            }`}
          >
            <IconUser className="h-4 w-4" />
            Account
          </Link>
        </nav>

        <div className="border-t border-sidebar-line px-3 py-4">
          <p
            title={userEmail}
            className="truncate px-2 text-xs text-white/55"
          >
            {userEmail}
          </p>
          <form action={signOut} className="mt-1.5">
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
              <Logo small />
              <span className="font-semibold tracking-tight">
                Underwrite Copilot
              </span>
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              >
                Sign out
              </button>
            </form>
          </div>
          {/* Mobile nav — the sidebar is desktop-only, so these live here. */}
          <nav className="flex gap-1 border-t border-sidebar-line px-3 py-2">
            {[
              { href: "/deals", label: "Pipeline", active: inPipeline },
              { href: "/billing", label: "Billing", active: inBilling },
              { href: "/account", label: "Account", active: inAccount },
            ].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
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

        <main className="flex-1">
          <div className="mx-auto w-full max-w-5xl px-5 py-8 sm:px-8">
            {children}
          </div>
        </main>
      </div>
    </div>
    </ToastProvider>
  );
}
