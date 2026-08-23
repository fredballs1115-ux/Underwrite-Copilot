import Link from "next/link";
import { getCurrentUser } from "@/lib/supabase/server";
import { AppShell } from "@/app/(app)/app-shell";
import { RegulatoryAlertBanner } from "@/app/(app)/regulatory-alert-banner";
import { coveredMarketNav } from "@/lib/market-match";
import { LogoMark } from "@/app/logo";

/** /market sits OUTSIDE the signed-in route group on purpose: the homepage,
 *  /why, and /demo all link the covered-market briefs (marquee, coverage
 *  board), and those must open for a prospect with no account. Signed-in
 *  visitors still get the full app chrome; the page itself already renders
 *  both ways (its own-deals memory section is user-gated). */
export default async function MarketLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (user) {
    return (
      <AppShell userEmail={user.email ?? ""} markets={coveredMarketNav()}>
        <RegulatoryAlertBanner />
        {children}
      </AppShell>
    );
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <span className="font-semibold tracking-tight">
              Underwrite Copilot
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              Sign in
            </Link>
            <Link
              href="/login?mode=signup"
              className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted">
          <span>
            Underwrite Copilot — screen deals against this data.{" "}
            <Link
              href="/login?mode=signup"
              className="font-medium text-brand underline-offset-2 hover:underline"
            >
              Start free
            </Link>
          </span>
          <span className="flex gap-4">
            <Link href="/why" className="transition-colors hover:text-ink">
              Why
            </Link>
            <Link href="/whats-new" className="transition-colors hover:text-ink">
              What&apos;s new
            </Link>
            <Link href="/" className="transition-colors hover:text-ink">
              Home
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
