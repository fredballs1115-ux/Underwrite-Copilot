// Public-record comps panel (auto-comps v2). Renders whatever the background
// pull stored: a decisive readout first (count, radius, window, medians, and
// the subject vs the comp median when both parse), then the table with exact
// distances and per-row source links, then provenance. Every failure mode is
// a sentence, not a blank. The map stays with the OM comps view — this panel
// is the pricing read.

import { fmtMiles, kmToMiles } from "@/lib/geo";
import type { RecordCompsResult } from "@/lib/public-comps/core";
import { refreshRecordComps } from "./comps-actions";

const fmtMoney = (n: number) =>
  n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : `$${Math.round(n).toLocaleString()}`;

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};

function RefreshButton({ dealId }: { dealId: string }) {
  return (
    <form action={refreshRecordComps}>
      <input type="hidden" name="dealId" value={dealId} />
      <button
        type="submit"
        className="rounded-lg border border-line px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:border-brand hover:text-brand"
      >
        Refresh
      </button>
    </form>
  );
}

export function PublicCompsPanel({
  dealId,
  result,
  hasAddress,
  subjectPrice,
}: {
  dealId: string;
  result: RecordCompsResult | null;
  hasAddress: boolean;
  /** parsed asking/purchase price of the subject, when known */
  subjectPrice: number | null;
}) {
  if (!hasAddress) return null; // the research panel already asks for an address

  const header = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">Recorded sales nearby</h2>
      <RefreshButton dealId={dealId} />
    </div>
  );

  if (!result || result.status === "pending") {
    return (
      <section className="rounded-xl border border-line bg-surface p-4">
        {header}
        <p className="mt-2 text-sm text-muted">
          Pulling recorded sales from the public record for this address… this
          runs automatically and usually lands within a minute. Refresh the
          page to check.
        </p>
      </section>
    );
  }

  if (result.status === "no_provider") {
    return (
      <section className="rounded-xl border border-line bg-surface p-4">
        {header}
        <p className="mt-2 text-sm text-muted">
          No public-records source is wired for this jurisdiction yet — covered
          today: Washington DC, all of Maryland, and Philadelphia. That means
          no data on file, not that no sales happened.
        </p>
      </section>
    );
  }

  if (result.status === "geocode_failed" || result.status === "provider_error") {
    return (
      <section className="rounded-xl border border-line bg-surface p-4">
        {header}
        <p className="mt-2 text-sm text-muted">
          Couldn&apos;t pull recorded sales:{" "}
          <span className="text-caution">{result.error ?? "unknown error"}</span>
          {" — "}try Refresh; if it persists, /api/comps/health shows what the
          data source reported.
        </p>
      </section>
    );
  }

  const miles = result.params ? kmToMiles(result.params.radiusKm) : null;
  const scope = result.params
    ? `within ${miles && miles < 1.1 ? "1 mi" : `${Math.round(miles ?? 0)} mi`} · last ${result.params.monthsBack} months · ${result.params.classFilter}`
    : "";

  if (result.status === "no_sales" || !result.stats) {
    return (
      <section className="rounded-xl border border-line bg-surface p-4">
        {header}
        <p className="mt-2 text-sm text-muted">
          Zero recorded sales {scope} in {result.providerName}. Thin comp
          evidence is itself a finding — widen the search by refreshing later
          or treat pricing here as low-confidence.
        </p>
      </section>
    );
  }

  const s = result.stats;
  const vsMedian =
    subjectPrice && s.medianPrice > 0
      ? Math.round(((subjectPrice - s.medianPrice) / s.medianPrice) * 100)
      : null;

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      {header}

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
              className={
                vsMedian > 10 ? "text-kill" : vsMedian < -10 ? "text-pass" : "text-muted"
              }
            >
              This deal is {Math.abs(vsMedian)}% {vsMedian >= 0 ? "above" : "below"} the
              recorded median.
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
    </section>
  );
}
