"use client";

// The call-for-offers deadline as a card or a row says it, and the days to
// it, moved out of offers-due.tsx (whose date control saves through a server
// action) so the pipeline's card can be drawn where no action belongs.

// "Today" is the server page's, read once per request and handed in
// (`today`), never read here: a module-level capture was read once per
// server process, so every server render counted days from the day the
// process started — four days in, a deal due in three read "Offers due in
// 7d" in grey — and the browser kept the server's text. One prop means the
// server's markup and the browser's first render are the same day. The
// day is the reader's own (lib/reader-day: their browser's zone, from its
// cookie), so a deal due tomorrow reads "in 1d" until the reader's own
// midnight; it had been UTC's, so from 8 pm Eastern it read "today". The
// tasks count from the same day; the Monday digest keeps the UTC day.

import { shortDay } from "@/lib/short-day";

/** The deadline's day, with its year wherever it is not the reader's
 *  current year (lib/short-day): "Offers were due Mar 3, 2025". */
function fmtDue(iso: string, today: string): string {
  return shortDay(iso, today);
}

/** Days from `today` (the reader's day, yyyy-mm-dd) to the call-for-offers
 *  date: negative = overdue. */
export function daysUntil(isoDate: string, today: string): number {
  return Math.round(
    (Date.parse(isoDate + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000,
  );
}

/** Colored "Offers due …" fragment — urgency at a glance, counted from the
 *  page's `today` (the reader's day, yyyy-mm-dd). */
export function OffersDueBit({ iso, today }: { iso: string; today: string }) {
  const d = daysUntil(iso, today);
  const cls = d < 0 ? "text-kill" : d <= 5 ? "text-caution" : "text-muted";
  const text =
    d < 0
      ? `Offers were due ${fmtDue(iso, today)}`
      : d === 0
        ? "Offers due today"
        : d === 1
          ? "Offers due tomorrow"
          : d <= 14
            ? `Offers due in ${d}d`
            : `Offers due ${fmtDue(iso, today)}`;
  return <span className={`font-medium ${cls}`}>{text}</span>;
}
