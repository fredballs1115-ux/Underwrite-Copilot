"use client";

import { useRef } from "react";
import { setOffersDue } from "./actions";

// "Today" is the server page's, read once per request and handed in
// (`today`), never read here: a module-level capture was read once per
// server process, so every server render counted days from the day the
// process started — four days in, a deal due in three read "Offers due in
// 7d" in grey — and the browser kept the server's text. One prop means the
// server's markup and the browser's first render are the same day. The
// day is UTC's, as the table's dates, the tasks and the digest are: from
// 8 pm Eastern a deal due tomorrow (UTC) reads "today" on every surface
// alike, never one way on the badge and another on the page.

function fmtDue(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Days from `today` (a UTC day, yyyy-mm-dd) to the call-for-offers date:
 *  negative = overdue. */
export function daysUntil(isoDate: string, today: string): number {
  return Math.round(
    (Date.parse(isoDate + "T00:00:00Z") - Date.parse(today + "T00:00:00Z")) / 86_400_000,
  );
}

/** Colored "Offers due …" fragment — urgency at a glance, counted from the
 *  page's `today` (a UTC day, yyyy-mm-dd). */
export function OffersDueBit({ iso, today }: { iso: string; today: string }) {
  const d = daysUntil(iso, today);
  const cls = d < 0 ? "text-kill" : d <= 5 ? "text-caution" : "text-muted";
  const text =
    d < 0
      ? `Offers were due ${fmtDue(iso)}`
      : d === 0
        ? "Offers due today"
        : d === 1
          ? "Offers due tomorrow"
          : d <= 14
            ? `Offers due in ${d}d`
            : `Offers due ${fmtDue(iso)}`;
  return <span className={`font-medium ${cls}`}>{text}</span>;
}

/** The broker's call-for-offers date — a small date control that saves on
 *  change (clearing the date clears the deadline). Lives in the deal header.
 *  Where the date is the memorandum's own (#467) it says so, with its page,
 *  and any date on it can go to a calendar as one file. */
export function OffersDueControl({
  dealId,
  value,
  today,
  fromMemorandum = null,
  calendarHref = null,
}: {
  dealId: string;
  value: string | null;
  /** the page's day (UTC, yyyy-mm-dd), read once per request */
  today: string;
  /** where the date is the memorandum's own: its page, or "" where the
   *  page is not one the memorandum has; null where the date is not */
  fromMemorandum?: string | null;
  /** the deal's .ics route, where the deal carries a deadline */
  calendarHref?: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const d = value ? daysUntil(value, today) : null;
  const tone =
    d == null
      ? "border-line text-muted"
      : d < 0
        ? "border-kill/40 text-kill"
        : d <= 5
          ? "border-caution/40 text-caution"
          : "border-line text-ink";
  return (
    <form
      ref={formRef}
      action={setOffersDue}
      className={`flex items-center gap-1.5 rounded-lg border bg-surface py-1 pl-2.5 pr-1.5 text-xs font-medium shadow-sm transition-colors ${tone}`}
      title={
        fromMemorandum != null
          ? `The broker's call-for-offers date, from the memorandum${fromMemorandum ? ` (${fromMemorandum})` : ""} — colors the pipeline as it approaches`
          : "The broker's call-for-offers date — colors the pipeline as it approaches"
      }
    >
      <input type="hidden" name="dealId" value={dealId} />
      <span className="whitespace-nowrap">
        {value
          ? d != null && d < 0
            ? "Offers were due"
            : "Offers due"
          : "Offers due"}
      </span>
      <input
        type="date"
        name="offersDue"
        defaultValue={value ?? ""}
        aria-label="Call-for-offers date"
        onChange={() => {
          const f = formRef.current;
          if (!f) return;
          if (typeof f.requestSubmit === "function") f.requestSubmit();
          else f.submit();
        }}
        className="rounded border-0 bg-transparent p-0.5 font-mono text-xs tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
      />
      {fromMemorandum != null && (
        <span className="rounded bg-faint px-1 py-px text-[10px] font-semibold uppercase tracking-wide text-muted" data-qa="offers-due-om">
          <span aria-hidden>OM</span>
          <span className="sr-only">{fromMemorandum ? `the memorandum's date, ${fromMemorandum}` : "the memorandum's date"}</span>
        </span>
      )}
      {calendarHref && value && (
        <a
          href={calendarHref}
          download
          aria-label="Add the offers-due date to your calendar"
          title="Add to calendar (.ics)"
          className="grid h-6 w-6 place-items-center rounded text-muted transition-colors hover:bg-faint hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          data-qa="offers-due-ics"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 10h18M12 14v4M10 16h4" />
          </svg>
        </a>
      )}
    </form>
  );
}
