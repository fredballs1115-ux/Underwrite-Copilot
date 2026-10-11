// Where the records reach, as chips (the /comps page's header): each live
// source's region, then each property-database market that holds recorded
// sales today — named, and only where the count read answers with sales
// (lib/public-comps/db-coverage), never one chip claiming "markets in the
// property database" over tables that may be empty — then the sources still
// in discovery (muted). Pure: the page reads the counts and hands them in.

import { COVERAGE_DISCOVERY, COVERAGE_LIVE } from "@/lib/public-comps/core";

export function CoverageChips({ dbMarkets }: { dbMarkets: readonly { metroId: string; name: string }[] }) {
  return (
    <ul className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]" aria-label="Where recorded sales are read">
      {COVERAGE_LIVE.map((p) => (
        <li
          key={p.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 font-medium text-brand"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
          {p.regionLabel}
        </li>
      ))}
      {dbMarkets.map((m) => (
        <li
          key={m.metroId}
          data-qa="coverage-db"
          className="inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 font-medium text-brand"
          title="Recorded sales in the property database, from ingested government records"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
          {`${m.name} · property database`}
        </li>
      ))}
      {COVERAGE_DISCOVERY.map((p) => (
        <li
          key={p.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-line px-2.5 py-1 text-muted"
          title="Being wired: not read yet"
        >
          {p.regionLabel} · being wired
        </li>
      ))}
    </ul>
  );
}
