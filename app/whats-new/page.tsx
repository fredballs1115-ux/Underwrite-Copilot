import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/app/logo";
import { MarketsMarquee } from "@/app/markets-marquee";
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
 *  all three, so no surface can outrun another. Every entry names where in
 *  the app to see it, so the log doubles as a tour. */
export default function WhatsNewPage() {
  const entries = changelogEntries(100);
  const fmt = (iso: string) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  // Group by ship date, newest day first — the source is already newest-first,
  // so insertion order into the map is the display order.
  const byDay = new Map<string, typeof entries>();
  for (const e of entries) {
    const list = byDay.get(e.date);
    if (list) list.push(e);
    else byDay.set(e.date, [e]);
  }
  const oldest = entries[entries.length - 1];

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
        {entries.length > 0 && oldest && (
          <p className="mt-2 text-xs font-medium text-brand">
            {entries.length} improvements logged since {fmt(oldest.date)} —
            every one live on this build, every one linking to where it landed.
          </p>
        )}
        {entries.length === 0 ? (
          <p className="mt-8 rounded-xl border border-dashed border-line p-5 text-sm text-muted">
            Nothing logged yet.
          </p>
        ) : (
          <div className="mt-8 space-y-8">
            {[...byDay.entries()].map(([date, dayEntries]) => (
              <section key={date}>
                <div className="flex items-baseline gap-2.5">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-muted">
                    {fmt(date)}
                  </h2>
                  <span className="text-[11px] text-muted/70">
                    {dayEntries.length} improvement
                    {dayEntries.length === 1 ? "" : "s"}
                  </span>
                  <span
                    aria-hidden
                    className="h-px flex-1 translate-y-[-3px] bg-line/70"
                  />
                </div>
                <ul className="mt-3 space-y-3">
                  {dayEntries.map((e) => (
                    <li
                      key={`${e.date}|${e.title}`}
                      className="rounded-xl border border-line bg-surface p-4 transition-colors hover:border-brand/40"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm font-semibold">{e.title}</p>
                        <Link
                          href={e.href}
                          className="shrink-0 text-[11px] font-medium text-brand underline-offset-2 hover:underline"
                        >
                          See it live →
                        </Link>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted">
                        {e.blurb}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
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

      <MarketsMarquee />

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
