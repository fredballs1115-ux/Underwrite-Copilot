import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/app/logo";
import { changelogEntries } from "@/lib/changelog";

// ISR, five-minute window — same freshness cap as the homepage, so a new
// changelog entry shows here within minutes of deploying.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "What's new",
  description:
    "Every product improvement to Underwrite Copilot, newest first — the same log the homepage and the app draw from.",
  alternates: { canonical: "/whats-new" },
};

/** PUBLIC changelog — no login needed. The homepage's shipped block and the
 *  pipeline's What's-new card both link here; one checked-in source feeds
 *  all three, so no surface can outrun another. */
export default function WhatsNewPage() {
  const entries = changelogEntries(12);
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="flex items-center gap-2.5">
            <LogoMark className="h-8 w-8" />
            <span className="font-semibold tracking-tight">
              Underwrite Copilot
            </span>
          </Link>
          <Link
            href="/login?mode=signup"
            className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Get started
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
        <h1 className="text-3xl font-semibold tracking-tight">
          What&apos;s new
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
          Every product improvement, newest first — built in the open, shipping
          daily. The homepage and the app draw from this same list, and the
          site&apos;s footer names the exact build it&apos;s running.
        </p>
        {entries.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-line p-5 text-sm text-muted">
            Nothing logged yet.
          </p>
        ) : (
          <ul className="mt-8 space-y-3">
            {entries.map((e) => (
              <li
                key={`${e.date}|${e.title}`}
                className="rounded-xl border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold">{e.title}</p>
                  <span className="text-[11px] text-muted">{fmt(e.date)}</span>
                </div>
                <p className="mt-1 text-sm leading-relaxed text-muted">
                  {e.blurb}
                </p>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-10 text-sm text-muted">
          Want these features on your own deals?{" "}
          <Link
            href="/login?mode=signup"
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            Start free — no card
          </Link>
          .
        </p>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted">
          <span>Underwrite Copilot</span>
          <span className="flex gap-4">
            <Link href="/why" className="transition-colors hover:text-ink">
              Why
            </Link>
            <Link href="/security" className="transition-colors hover:text-ink">
              Security
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
