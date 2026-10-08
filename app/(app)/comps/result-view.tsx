// Shared comps readout — the ONE renderer for a RecordCompsResult, used by
// the per-deal panel (deals/[id]/public-comps-panel.tsx) and the standalone
// Pull Comps tool (/comps). Readout first (count, radius, window, medians,
// subject vs median when both parse), then the table with exact distances and
// per-row source links, then provenance. Every failure mode is a sentence,
// not a blank.

import { compactUsd } from "@/lib/money";
import { fmtMiles } from "@/lib/geo";
import {
  COVERAGE_DISCOVERY,
  COVERAGE_SUMMARY,
  compEvidence,
  compsCutNote,
  compsScope,
  evidenceNote,
  medianLabel,
  salesPhrase,
  type RecordCompsResult,
} from "@/lib/public-comps/core";
import { compsTableText, perSqftOf, priceTrack, salesByQuarter } from "@/lib/public-comps/picture";
import { CopySalesButton, RecordSalesMap, type MapSale } from "./record-sales-map";

const fmtMoney = (n: number) => compactUsd(n, { millions: 2, thousandsFrom: Infinity });

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
  showMap = false,
}: {
  result: RecordCompsResult;
  /** parsed asking/purchase price of the subject, when known */
  subjectPrice: number | null;
  /** draw the sales on a map (the comps page; the deal page has its own) */
  showMap?: boolean;
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

  // What the sales cover — less than the search asked where the source
  // stopped at its limit (lib/public-comps/core `compsScope`) — and what the
  // result left out, said under the readout (`compsCutNote`).
  const scope = compsScope(result);
  const cutNote = compsCutNote(result);

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
  const inBand = ratio !== null && ratio >= 0.25 && ratio <= 4;
  // …and it is a CALL, not a figure. A call needs a middle to be measured
  // against, so below the floor it is withheld even when the arithmetic
  // would happily produce a percentage: "43% above the recorded median" off
  // a single sale is the most confident-sounding and least supported
  // sentence this page can print.
  const enough = compEvidence(s.count) !== "individual";
  const vsMedian = inBand && enough ? Math.round((ratio - 1) * 100) : null;
  const scaleMismatch = ratio !== null && !inBand;
  const note = evidenceNote(s.count);

  return (
    <>
      <p className="mt-2 text-sm leading-relaxed">
        <span className="font-semibold">{salesPhrase(s.count)}</span>{" "}
        <span className="text-muted">{scope}</span> — {medianLabel(s.count)}{" "}
        <span className="font-mono font-semibold tabular-nums">{fmtMoney(s.medianPrice)}</span>
        {s.medianPerSqft && (
          <>
            {" · "}
            <span className="font-mono tabular-nums">${s.medianPerSqft}/SF</span>
          </>
        )}
        {s.count > 1 && (
          <>
            {" · range "}
            <span className="font-mono tabular-nums">
              {fmtMoney(s.low)}–{fmtMoney(s.high)}
            </span>
          </>
        )}
        {vsMedian !== null && (
          <>
            {". "}
            <span
              className={vsMedian > 10 ? "text-kill" : vsMedian < -10 ? "text-pass" : "text-muted"}
            >
              This deal is {Math.abs(vsMedian)}% {vsMedian >= 0 ? "above" : "below"} the
              recorded {medianLabel(s.count)}
              {compEvidence(s.count) === "thin" ? `, on ${s.count} sales` : ""}.
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

      {cutNote && (
        <p className="mt-1.5 text-xs leading-relaxed text-caution" data-qa="comps-cut">
          {cutNote}
        </p>
      )}

      {note && (
        <p className="mt-1.5 text-xs leading-relaxed text-caution">{note}</p>
      )}

      <CompsPictures result={result} subjectPrice={subjectPrice} />

      {showMap && result.subject && (
        <RecordSalesMap
          subject={result.subject}
          radiusKm={result.params?.radiusKm ?? null}
          sales={result.comps.map(
            (c, i): MapSale => ({
              n: i + 1,
              lat: c.lat,
              lng: c.lng,
              address: c.address,
              priceText: fmtMoney(c.price),
              soldText: fmtDate(c.saleDate),
              distanceKm: c.distanceKm,
              sourceUrl: c.sourceUrl,
            }),
          )}
        />
      )}

      <div className="mt-4 flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted">
          {result.comps.length > SHOWN ? `The ${SHOWN} nearest` : "The sales, nearest first"}
        </h3>
        <CopySalesButton text={compsTableText(result)} />
      </div>
      <SalesTable comps={result.comps.slice(0, SHOWN)} start={1} />
      {result.comps.length > SHOWN && (
        <details className="group mt-1.5">
          <summary className="cursor-pointer text-xs font-medium text-brand hover:text-brand-strong">
            Show all {result.comps.length}
          </summary>
          <SalesTable comps={result.comps.slice(SHOWN)} start={SHOWN + 1} />
        </details>
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

/** The table shows this many nearest sales; the rest fold behind "Show all". */
const SHOWN = 12;

function SalesTable({ comps, start }: { comps: RecordCompsResult["comps"]; start: number }) {
  return (
    <div className="mt-1.5 overflow-x-auto">
      <table className="w-full min-w-[600px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
            <th className="w-8 py-1.5 pr-2 font-medium">
              <span className="sr-only">Pin</span>
            </th>
            <th className="py-1.5 pr-3 font-medium">Sold</th>
            <th className="py-1.5 pr-3 font-medium">Address</th>
            <th className="py-1.5 pr-3 text-right font-medium">Price</th>
            <th className="py-1.5 pr-3 text-right font-medium">$/SF</th>
            <th className="py-1.5 pr-3 font-medium">Type</th>
            <th className="py-1.5 text-right font-medium">Dist.</th>
          </tr>
        </thead>
        <tbody>
          {comps.map((c, i) => {
            const psf = perSqftOf(c);
            return (
              <tr key={`${c.address}|${c.saleDate}`} className="border-b border-line/60">
                <td className="py-1.5 pr-2">
                  <span
                    aria-hidden
                    className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[10px] font-bold text-white"
                  >
                    {start + i}
                  </span>
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-muted">{fmtDate(c.saleDate)}</td>
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
                <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{fmtMoney(c.price)}</td>
                <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{psf ? `$${psf}` : "—"}</td>
                <td className="py-1.5 pr-3 text-xs text-muted">{c.propertyType.toLowerCase()}</td>
                <td className="py-1.5 text-right font-mono text-xs tabular-nums text-muted">{fmtMiles(c.distanceKm)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The set as two pictures: every sale on one price track (the middle and the
 * subject ticked where the readout would name them), and the sales by
 * quarter across the window. Each is left out where it has nothing to draw.
 */
function CompsPictures({ result, subjectPrice }: { result: RecordCompsResult; subjectPrice: number | null }) {
  const track = priceTrack(result.comps, result.stats?.medianPrice ?? null, subjectPrice);
  const quarters = salesByQuarter(result.comps);
  if (!track && quarters.length === 0) return null;
  const peak = Math.max(1, ...quarters.map((q) => q.count));
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      {track && (
        <figure className="min-w-0">
          <figcaption className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Each sale&apos;s price{track.log ? " · log scale" : ""}
          </figcaption>
          <div className="relative mt-3 h-8" data-bar="comps-price">
            <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-faint" />
            {track.dots.map((d) => (
              <span
                key={d.n}
                title={`${d.n}. ${fmtMoney(d.price)}`}
                className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white bg-brand/70"
                style={{ left: `${d.pct}%` }}
                data-bar="comps-sale"
              />
            ))}
            {track.medianPct !== null && (
              <span
                className="absolute top-0 h-8 w-0.5 -translate-x-1/2 rounded bg-ink"
                style={{ left: `${track.medianPct}%` }}
                data-bar="comps-median"
                title={`${medianLabel(result.stats?.count ?? 0)} ${fmtMoney(result.stats?.medianPrice ?? 0)}`}
              />
            )}
            {track.subjectPct !== null && (
              <span
                className="absolute -top-1 h-10 w-0.5 -translate-x-1/2 rounded bg-caution"
                style={{ left: `${track.subjectPct}%` }}
                data-bar="comps-subject"
                title="This deal's price"
              />
            )}
          </div>
          <div className="mt-1 flex justify-between font-mono text-[11px] tabular-nums text-muted">
            <span>{track.lowLabel}</span>
            <span>{track.highLabel}</span>
          </div>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
            <span className="inline-flex items-center gap-1">
              <span aria-hidden className="h-2.5 w-2.5 rounded-full bg-brand/70" />a sale
            </span>
            {track.medianPct !== null && (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="h-3 w-0.5 rounded bg-ink" />
                {medianLabel(result.stats?.count ?? 0)}
              </span>
            )}
            {track.subjectPct !== null && (
              <span className="inline-flex items-center gap-1">
                <span aria-hidden className="h-3 w-0.5 rounded bg-caution" />
                this deal
              </span>
            )}
          </p>
        </figure>
      )}
      {quarters.length > 0 && (
        <figure className="min-w-0">
          <figcaption className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Sales by quarter
          </figcaption>
          <div className="mt-3 flex h-16 items-end gap-1" data-bar="comps-quarters">
            {quarters.map((q) => (
              <div key={q.label} className="flex h-full min-w-0 flex-1 flex-col justify-end" title={`${q.label}: ${q.count}`}>
                <div
                  className={`w-full rounded-t ${q.count ? "bg-brand/60" : "bg-faint"}`}
                  style={{ height: `${q.count ? Math.max(8, (q.count / peak) * 100) : 4}%` }}
                  data-bar="comps-quarter"
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>{quarters[0].label}</span>
            <span>{quarters[quarters.length - 1].label}</span>
          </div>
        </figure>
      )}
    </div>
  );
}
