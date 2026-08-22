// Shared comps readout — the ONE renderer for a RecordCompsResult, used by
// the per-deal panel (deals/[id]/public-comps-panel.tsx) and the standalone
// Pull Comps tool (/comps). Readout first (count, radius, window, medians,
// subject vs median when both parse), then the table with exact distances and
// per-row source links, then provenance. Every failure mode is a sentence,
// not a blank.

import { fmtMiles, kmToMiles } from "@/lib/geo";
import {
  COVERAGE_DISCOVERY,
  COVERAGE_SUMMARY,
  type RecordCompsResult,
} from "@/lib/public-comps/core";

const fmtMoney = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`;

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};

/** Renders a settled (non-pending) result. The caller owns the section
 *  chrome, heading, and any refresh affordance. */
export function CompsResultView({
  result,
  subjectPrice,
}: {
  result: RecordCompsResult;
  /** parsed asking/purchase price of the subject, when known */
  subjectPrice: number | null;
}) {
  if (result.status === "no_provider") {
    return (
      <p className="mt-2 text-sm text-muted">
        No public-records source is wired for this jurisdiction yet — live
        today: {COVERAGE_SUMMARY}
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

  if (result.status === "geocode_failed" || result.status === "provider_error") {
    return (
      <p className="mt-2 text-sm text-muted">
        Couldn&apos;t pull recorded sales:{" "}
        <span className="text-caution">{result.error ?? "unknown error"}</span>
        {" — "}try again; if it persists, /api/comps/health shows what the
        data source reported.
      </p>
    );
  }

  const miles = result.params ? kmToMiles(result.params.radiusKm) : null;
  const scope = result.params
    ? `within ${miles && miles < 1.1 ? "1 mi" : `${Math.round(miles ?? 0)} mi`} · last ${result.params.monthsBack} months · ${result.params.classFilter}`
    : "";

  if (result.status === "no_sales" || !result.stats) {
    return (
      <p className="mt-2 text-sm text-muted">
        Zero recorded sales {scope} in {result.providerName}. Thin comp
        evidence is itself a finding — widen the search by retrying later or
        treat pricing here as low-confidence.
      </p>
    );
  }

  const s = result.stats;
  // The vs-median line only makes sense when the subject and the surrounding
  // recorded stock are the same kind of thing. A $68M asset against rowhouse
  // sales would read "20,000% above market" — suppress outside a plausible
  // band instead of rendering a meaningless verdict.
  const ratio = subjectPrice && s.medianPrice > 0 ? subjectPrice / s.medianPrice : null;
  const vsMedian =
    ratio !== null && ratio >= 0.25 && ratio <= 4 ? Math.round((ratio - 1) * 100) : null;
  const scaleMismatch = ratio !== null && vsMedian === null;

  return (
    <>
      <p className="mt-2 text-sm leading-relaxed">
        <span className="font-semibold">{s.count} recorded sales</span>{" "}
        <span className="text-muted">{scope}</span> — median{" "}
        <span className="font-mono font-semibold tabular-nums">{fmtMoney(s.medianPrice)}</span>
        {s.medianPerSqft && (
          <>
            {" · "}
            <span className="font-mono tabular-nums">${s.medianPerSqft}/SF</span>
          </>
        )}
        {" · range "}
        <span className="font-mono tabular-nums">
          {fmtMoney(s.low)}–{fmtMoney(s.high)}
        </span>
        {vsMedian !== null && (
          <>
            {". "}
            <span
              className={vsMedian > 10 ? "text-kill" : vsMedian < -10 ? "text-pass" : "text-muted"}
            >
              This deal is {Math.abs(vsMedian)}% {vsMedian >= 0 ? "above" : "below"} the
              recorded median.
            </span>
          </>
        )}
        {scaleMismatch && (
          <>
            {". "}
            <span className="text-muted">
              The subject&apos;s scale differs from the surrounding recorded
              stock, so a whole-price comparison isn&apos;t meaningful here.
            </span>
          </>
        )}
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3 font-medium">Sold</th>
              <th className="py-1.5 pr-3 font-medium">Address</th>
              <th className="py-1.5 pr-3 font-medium">Price</th>
              <th className="py-1.5 pr-3 font-medium">$/SF</th>
              <th className="py-1.5 pr-3 font-medium">Type</th>
              <th className="py-1.5 font-medium">Dist.</th>
            </tr>
          </thead>
          <tbody>
            {result.comps.slice(0, 12).map((c) => (
              <tr key={`${c.address}|${c.saleDate}`} className="border-b border-line/60">
                <td className="py-1.5 pr-3 whitespace-nowrap text-muted">{fmtDate(c.saleDate)}</td>
                <td className="py-1.5 pr-3">
                  <a
                    href={c.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-brand"
                  >
                    {c.address}
                  </a>
                </td>
                <td className="py-1.5 pr-3 font-mono tabular-nums">{fmtMoney(c.price)}</td>
                <td className="py-1.5 pr-3 font-mono tabular-nums">
                  {c.sqft && c.sqft > 200 ? `$${Math.round(c.price / c.sqft)}` : "—"}
                </td>
                <td className="py-1.5 pr-3 text-xs text-muted">{c.propertyType.toLowerCase()}</td>
                <td className="py-1.5 font-mono text-xs tabular-nums text-muted">
                  {fmtMiles(c.distanceKm)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {result.comps.length > 12 && (
        <p className="mt-1.5 text-[11px] text-muted">
          Showing the 12 nearest of {result.comps.length}.
        </p>
      )}

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
        {" · retrieved "}
        {new Date(result.retrievedAt).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
        {". "}
        {result.note}
      </p>
    </>
  );
}
