import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/supabase/server";
import { AppShell } from "@/app/(app)/app-shell";
import { RegulatoryAlertBanner } from "@/app/(app)/regulatory-alert-banner";
import { coveredMarketNav } from "@/lib/market-match";
import { LogoMark } from "@/app/logo";
import { DataNotices } from "@/app/data-notices";

/**
 * A page that opens for a prospect AND for a signed-in analyst.
 *
 * /market and /tools both sit outside the signed-in route group on purpose:
 * the homepage links them, and a visitor with no account has to be able to
 * follow that link. A signed-in visitor still gets the full app chrome, so
 * the page never feels like it threw them out of the product.
 *
 * One component rather than one layout per page, because the signed-out
 * header and footer were already copied once and a second copy is how two
 * front doors start disagreeing about what the footer says.
 */
export async function PublicShell({ children }: { children: ReactNode }) {
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
      <header className="border-b border-line print:hidden">
        {/* A phone's row is full: at 390px the name ran into "Sign in" with
            no gap, and at 360px both links broke onto two lines. The links
            never wrap; the name may, beside its mark, and on the phone's tighter gaps
            keeps one line at 390px. */}
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-6 py-4 sm:gap-3" data-qa="public-header-row">
          <Link href="/" className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="h-8 w-8 shrink-0" />
            <span className="font-semibold leading-tight tracking-tight">
              Underwrite Copilot
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            {/* The method, from sm up: a phone's row is full (above). */}
            <Link
              href="/how-we-test"
              className="hidden whitespace-nowrap py-1 text-sm font-medium text-muted transition-colors hover:text-ink sm:inline"
            >
              How we test
            </Link>
            <Link
              href="/login"
              className="whitespace-nowrap py-1 text-sm font-medium text-muted transition-colors hover:text-ink"
            >
              Sign in
            </Link>
            <Link
              href="/login?mode=signup"
              className="whitespace-nowrap rounded-lg bg-brand px-3 py-1.5 text-sm sm:px-3.5 font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>
      {/* The signed-in shell pads its content; a prospect gets the same
          measure here, so the page never runs edge to edge. */}
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
        {children}
      </main>
      <footer className="border-t border-line print:hidden">
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
            <Link href="/tools" className="transition-colors hover:text-ink">
              Deal math
            </Link>
            <Link href="/why" className="transition-colors hover:text-ink">
              Why
            </Link>
            <Link href="/how-we-test" className="transition-colors hover:text-ink">
              How we test
            </Link>
            <Link href="/whats-new" className="transition-colors hover:text-ink">
              What&apos;s new
            </Link>
            <Link href="/" className="transition-colors hover:text-ink">
              Home
            </Link>
          </span>
          {/* The data providers' notices, a row of their own in the
              footer's type: FRED's terms ask for theirs prominently on
              the application, and /tools and /market draw FRED's figures
              (app/data-notices). */}
          <DataNotices className="basis-full" />
        </div>
      </footer>
    </div>
  );
}
