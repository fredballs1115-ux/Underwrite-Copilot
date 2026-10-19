// Shared comps readout — the ONE renderer for a RecordCompsResult, used by
// the per-deal panel (deals/[id]/public-comps-panel.tsx) and the standalone
// Pull Comps tool (/comps). Readout first (count, radius, window, medians,
// subject vs median when both parse), then the table with exact distances and
// per-row source links, then provenance. Every failure mode is a sentence,
// not a blank. A pull that found sales is read by ./comps-readout, a client
// component, since the reader may leave sales out of its figures.

import {
  COVERAGE_DISCOVERY,
  COVERAGE_SUMMARY,
  compsCutNote,
  dayText,
  failureSentence,
  noSalesSentence,
  type RecordCompsResult,
} from "@/lib/public-comps/core";
import type { SubjectForCall } from "@/lib/public-comps/vs-median";
import { placementNote } from "@/lib/public-comps/subject-point";
import { CompsReadout } from "./comps-readout";

/** Renders a settled (non-pending) result. The caller owns the section
 *  chrome, heading, and any refresh affordance. */
export function CompsResultView({
  result,
  subject = null,
  showMap = false,
  dbMarketsLine = "",
  onDeal = false,
  sortParam,
  outParam,
}: {
  result: RecordCompsResult;
  /** the deal the sales are read for, where there is one: its building
   *  price and price a square foot, its class and whether it is a portfolio
   *  or a plan (lib/public-comps/vs-median). The /comps page has none. */
  subject?: SubjectForCall | null;
  /** draw the sales on a map (the comps page; the deal page has its own) */
  showMap?: boolean;
  /** the property database's markets holding recorded sales today, said by
   *  name ("New York City and Boston"; lib/public-comps/db-coverage), "" for
   *  none or unread — named beside the live sources where no source reaches */
  dbMarketsLine?: string;
  /** the readout sits on a deal (its panel refreshes the pull) rather than
   *  on /comps, where the reader pulls again */
  onDeal?: boolean;
  /** the /comps page's `?sort=` as its searchParams read it (null where the
   *  link names none): given, the list keeps its order in the page's
   *  address and opens on this one (./sales-list). Left out on a deal's
   *  panel, whose order is kept for the visit only. */
  sortParam?: string | null;
  /** the /comps page's `?out=` (the sales left out of the readout, with
   *  their reasons; lib/public-comps/kept) as its searchParams read it:
   *  given, the set is kept in the page's address, each sale by its day,
   *  price and address, so a shared link leaves out the same sales where the
   *  pull, fetched again, still lists them. Left out on a deal's panel, which
   *  keeps it for the visit only. */
  outParam?: string | null;
}) {
  if (result.status === "no_provider") {
    return (
      <p className="mt-2 text-sm text-muted">
        No public-records source is wired for this jurisdiction yet — live
        today: {COVERAGE_SUMMARY}
        {dbMarketsLine ? `; in the property database: ${dbMarketsLine}` : ""}
        {COVERAGE_DISCOVERY.length > 0 && (
          <>
            {"; being wired: "}
            {COVERAGE_DISCOVERY.map((p) => p.name.replace(/ — .*$/, "")).join(", ")}
          </>
        )}
        . That means no data on file, not that no sales happened.
      </p>
    );
  }

  // One sentence, never the source's own words (they go to the server log),
  // and no pointer at the operator's health route.
  if (result.status === "geocode_failed" || result.status === "provider_error") {
    return (
      <p className="mt-2 text-sm text-caution" data-qa="comps-failed">
        {failureSentence(result.status, onDeal)}
      </p>
    );
  }

  // What the result left out, said under the readout (`compsCutNote`).
  const cutNote = compsCutNote(result);
  // Where the search was measured from, said where it is not the building
  // (lib/public-comps/subject-point): a street's centreline or an area's.
  const placement = placementNote(result.subject?.precision);

  if (result.status === "no_sales" || !result.stats) {
    return (
      <p className="mt-2 text-sm text-muted" data-qa="comps-none">
        {noSalesSentence(result)} Thin comp evidence is itself a finding —
        treat pricing here as low-confidence.
        {!onDeal && result.params?.classKey ? " Set the class to all recorded sales to see every sale here." : ""}
        {placement ? ` ${placement}` : ""}
      </p>
    );
  }

  return (
    <>
      {/* The readout, the pictures, the map and the list: every figure read
          off the sales the reader keeps (./comps-readout). */}
      <CompsReadout
        result={result}
        subject={subject}
        showMap={showMap}
        onDeal={onDeal}
        sortParam={sortParam}
        outParam={outParam}
        placement={placement}
        cutNote={cutNote}
      />

      <p className="mt-3 border-t border-line pt-2 text-[11px] leading-relaxed text-muted">
        {result.providerName}
        {" · "}
        <a
          href={result.datasetUrl}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          dataset
        </a>
        {` · retrieved ${dayText(result.retrievedAt)}`}
        {result.ingestedThrough ? ` · its records last ingested ${dayText(result.ingestedThrough)}` : ""}
        {". "}
        {result.note}
      </p>
    </>
  );
}
