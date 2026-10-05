import Link from "next/link";
import type { SampleLegal } from "@/lib/sample-legal";
import { DatedNotes } from "@/app/dated-notes";

/** The deal page's Regulation & benchmarks panel for the sample deal —
 *  derived by lib/sample-legal through the real rules engine. Full-width
 *  presentation with provenance (source link, verified chip, as-of — and,
 *  past the research rule's limit, the date's age and the stale mark, the
 *  deal page's own), the covered-market chip, and the dormancy explainer
 *  for event-keyed rules. Pure: the page reads the sample's legal for the
 *  day and hands it in, so the render test draws it on any day. */
export function LegalPanel({ legal }: { legal: SampleLegal }) {
  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Regulation &amp; benchmarks
        </h2>
        <span className="text-[11px] text-muted">
          assumes a natural-person buyer with no other units here
        </span>
      </div>
      {legal.metroName && (
        <Link
          href={legal.metroId ? `/market?metro=${legal.metroId}` : "/market"}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 text-[11px] font-medium text-brand outline-none transition-colors hover:bg-brand/10 focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
          Covered market: {legal.metroName} — open the market brief →
        </Link>
      )}
      <p className="mt-3 text-sm text-muted">
        {legal.screenedCount} rule{legal.screenedCount === 1 ? "" : "s"} on file for {legal.jurisdiction} ·{" "}
        {legal.triggeredCount === 0
          ? "none triggered by this deal's facts"
          : `${legal.triggeredCount} triggered by this deal's facts`}
      </p>
      <ul className="mt-3 space-y-3">
        {legal.rules.map((r) => (
          <li key={r.typeLabel} className="rounded-lg border border-line/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-line/60 px-1.5 py-px text-[11px] font-semibold text-muted">
                {r.outcomeLabel}
              </span>
              <span className="text-[11px] uppercase tracking-wide text-muted">
                {r.typeLabel}
              </span>
              <span className="ml-auto inline-flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                <span className="rounded bg-emerald-500/10 px-1.5 py-px font-medium text-emerald-600">
                  {r.status}
                </span>
                {r.stale ? (
                  <span className="rounded bg-amber-500/10 px-1.5 py-px font-medium text-amber-600" data-qa="research-stale">
                    {`as of ${r.asOf} · ${r.stale}`}
                  </span>
                ) : (
                  <span>{`as of ${r.asOf}`}</span>
                )}
                {r.source && (
                  <a
                    href={r.source}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-ink"
                  >
                    source
                  </a>
                )}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed">{r.effect}</p>
            {/* A window the rule states its figure for, ended, or a date it
                gives, come — under the text, which stays (lib/dated-window). */}
            <DatedNotes notes={r.dated} className="mt-1" />
            {r.dormantNote && (
              <p className="mt-1 text-[12px] font-medium text-caution">
                {r.dormantNote}
              </p>
            )}
          </li>
        ))}
      </ul>
      {legal.stateFact && (
        <p className="mt-3 text-[12px] text-muted">
          Plain-state fact carried in the verified rule text: {legal.stateFact}
        </p>
      )}
    </section>
  );
}
