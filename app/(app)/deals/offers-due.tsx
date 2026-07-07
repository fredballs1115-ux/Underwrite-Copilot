"use client";

import { useRef } from "react";
import { setOffersDue } from "./actions";

// "Today" for deadline math, captured once at module load (render must stay
// pure). Pinned to UTC like the table dates; a page load refreshes it.
const TODAY_UTC = (() => {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
})();

function fmtDue(iso: string): string {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** Days from today (UTC) to the call-for-offers date: negative = overdue. */
export function daysUntil(isoDate: string): number {
  return Math.round(
    (Date.parse(isoDate + "T00:00:00Z") - TODAY_UTC) / 86_400_000,
  );
}

/** Colored "Offers due …" fragment — urgency at a glance. */
export function OffersDueBit({ iso }: { iso: string }) {
  const d = daysUntil(iso);
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
  // suppressHydrationWarning: server and client render across a midnight
  // boundary can disagree by a day — cosmetic, never worth a hydration error.
  return (
    <span suppressHydrationWarning className={`font-medium ${cls}`}>
      {text}
    </span>
  );
}

/** The broker's call-for-offers date — a small date control that saves on
 *  change (clearing the date clears the deadline). Lives in the deal header. */
export function OffersDueControl({
  dealId,
  value,
}: {
  dealId: string;
  value: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const d = value ? daysUntil(value) : null;
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
      title="The broker's call-for-offers date — colors the pipeline as it approaches"
    >
      <input type="hidden" name="dealId" value={dealId} />
      <span suppressHydrationWarning className="whitespace-nowrap">
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
    </form>
  );
}
