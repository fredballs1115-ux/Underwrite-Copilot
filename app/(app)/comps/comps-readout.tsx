"use client";

// The readout of a pull that found sales (./result-view hands it over): the
// count, the medians and the range, the call against the deal, the two
// pictures, the map and the list. A client component because the reader may
// leave sales out of it, the way an appraiser's grid does
// (lib/public-comps/kept): every figure here is then recomputed through the
// SAME functions on the kept set — core `compStats`, picture `priceTrack`,
// `salesByQuarter` and `perSfBars`, vs-median's call — so the floors
// (MEDIAN_FLOOR, CONFIDENT_FLOOR) apply to the kept count, and the line under
// the readout says "N of M sales kept". A sale left out stays in the list and
// the CSV, marked. On /comps the set is kept in the page's address (`?out=`),
// so a shared link shows the same set; on a deal's panel for the visit only.

import { useState, type ReactNode } from "react";
import { compactUsd } from "@/lib/money";
import {
  compStats,
  compsScope,
  evidenceNote,
  medianLabel,
  dayText,
  perSqftPhrase,
  salesPhrase,
  sharedDeedPhrase,
  type RecordCompsResult,
  type RecordCompsStats,
} from "@/lib/public-comps/core";
import { vsMedianRead, vsMedianSentence, type SubjectForCall } from "@/lib/public-comps/vs-median";
import {
  compGridHref,
  compsTableText,
  evidenceThrough,
  perSqftOf,
  priceTrack,
  salesByQuarter,
  sharedDeedCounts,
} from "@/lib/public-comps/picture";
import {
  SALES_OUT_PARAM,
  keptLine,
  keptSales,
  leftOutPhrase,
  readSalesOut,
  trackOnList,
  withSaleOut,
  writeSalesOut,
  type LeaveOutReason,
} from "@/lib/public-comps/kept";
import { MAX_COMPS } from "@/lib/tools/comp-grid";
import { RecordSalesMap, type MapSale } from "./record-sales-map";
import { SalesList } from "./sales-list";
import { addressParam, useAddressParam } from "./address-param";

const fmtMoney = (n: number) => compactUsd(n, { millions: 2, thousandsFrom: Infinity });

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T00:00:00Z");
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });
};

/** The sales left out, in /comps' address. */
const OUT_IN_ADDRESS = addressParam(SALES_OUT_PARAM);

export function CompsReadout({
  result,
  subject,
  showMap,
  onDeal,
  sortParam,
  outParam,
  placement,
  cutNote,
}: {
  /** a result whose status is ok and which carries its stats */
  result: RecordCompsResult;
  subject: SubjectForCall | null;
  showMap: boolean;
  onDeal: boolean;
  sortParam?: string | null;
  /** the /comps page's `?out=` as its searchParams read it (null where the
   *  link names none): given, the sales left out are kept in the page's
   *  address. Left out on a deal's panel, which keeps them for the visit. */
  outParam?: string | null;
  /** where the search was measured from, said where it is not the building */
  placement: string;
  /** what the result left out (the source's limit), said under the readout */
  cutNote: string;
}) {
  const keepOutInUrl = outParam !== undefined && !onDeal;
  const [localOut, setLocalOut] = useState<string>("");
  const [outInAddress] = useAddressParam(OUT_IN_ADDRESS, outParam ?? null);
  const out = readSalesOut(keepOutInUrl ? outInAddress : localOut, result.comps.length);
  const setOut = (at: number, reason: LeaveOutReason | null) => {
    const next = writeSalesOut(withSaleOut(out, at, reason));
    if (keepOutInUrl) OUT_IN_ADDRESS.set(next || null);
    else setLocalOut(next);
  };
  const keepAll = () => {
    if (keepOutInUrl) OUT_IN_ADDRESS.set(null);
    else setLocalOut("");
  };

  const kept = keptSales(result.comps, out);
  const anyOut = out.size > 0;
  // Rows of one day, buyer and price (lib/public-comps/picture
  // `sharedDeedCounts`): flagged in the list, never merged there — a fact of
  // the record, so read on every row of the FULL list — and counted once in
  // the figures. The kept rows carry the full list's flags, so leaving one
  // row of a deed out never re-admits the other's price a foot.
  const shared = sharedDeedCounts(result.comps);
  const keptShared = kept.at.map((i) => shared[i] ?? 0);
  // Read again from the rows — the kept rows — so a result stored before a
  // deed recorded once a parcel was counted once (lib/public-comps/core
  // `compStats`) is read by today's rule, and a sale left out counts nowhere.
  const s: RecordCompsStats | undefined = compStats(kept.comps, keptShared) ?? (anyOut ? undefined : result.stats);
  const keptResult = { ...result, comps: kept.comps };
  const scope = compsScope(result);
  const kLine = keptLine(kept.comps.length, result.comps.length);
  const outPhrase = leftOutPhrase(out);

  const showUnits = result.comps.some((c) => c.units != null);
  const provenance = { providerName: result.providerName, datasetUrl: result.datasetUrl, retrievedAt: result.retrievedAt, subject: result.subject };
  const copyText = compsTableText(result, out);

  // /comps' hand-off to /tools' comp grid, through that card's own link
  // (lib/public-comps/picture `compGridHref`), of the kept sales; a deal's
  // panel has its own tab of comps and offers none.
  const gridHref = onDeal || !s ? null : compGridHref(keptResult);
  const gridCount = Math.min(MAX_COMPS, kept.comps.filter((c) => perSqftOf(c) !== null).length);

  // Where the search was measured from, and what the source's limit cut —
  // said under the readout whatever was kept.
  const placeNotes = (
    <>
      {placement && (
        <p className="mt-1.5 text-xs leading-relaxed text-muted" data-qa="comps-placement">
          {placement}
        </p>
      )}
      {cutNote && (
        <p className="mt-1.5 text-xs leading-relaxed text-caution" data-qa="comps-cut">
          {cutNote}
        </p>
      )}
    </>
  );

  let readout: ReactNode = null;
  let medianPerSqft: number | null = null;
  let pictures: ReactNode = null;
  if (s) {
    const deedPhrase = sharedDeedPhrase(s);
    // The call against the middle (lib/public-comps/vs-median): made only
    // where the sales are the deal's own kind, the deal is one building and
    // its price a building's, per square foot where both state an area, and
    // said in a neutral tone — a distance from the middle, never a verdict.
    const read = vsMedianRead(s, result.params, subject);
    const call = read?.kind === "call" ? read : null;
    const callText =
      call && subject
        ? vsMedianSentence(
            call,
            call.on === "per_sf" ? `$${(subject.perSf ?? 0).toLocaleString("en-US")}/SF` : `price of ${fmtMoney(subject.price ?? 0)}`,
          )
        : null;
    const subjectPrice = call && subject ? subject.price : null;
    const note = evidenceNote(s.count);
    // The $/SF middle rests only on the sales that state an area, so it is
    // said with that count, under the same floors (lib/public-comps/core).
    const sfPhrase = perSqftPhrase(s, kept.comps.filter((c) => perSqftOf(c) !== null).length);
    medianPerSqft = sfPhrase ? s.medianPerSqft : null;
    readout = (
      <>
        <p className="mt-2 text-sm leading-relaxed">
          <span className="font-semibold">{`${salesPhrase(s.count)}${deedPhrase ? "," : ""}`}</span>
          {deedPhrase && (
            <>
              {" "}
              <span data-qa="comps-shared-deeds">{deedPhrase}</span>
            </>
          )}{" "}
          <span className="text-muted">{scope}</span> — {medianLabel(s.count)}{" "}
          <span className="font-mono font-semibold tabular-nums">{fmtMoney(s.medianPrice)}</span>
          {sfPhrase && (
            <>
              {" · "}
              <span className="tabular-nums" data-qa="comps-per-sf">
                {sfPhrase}
              </span>
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
          {"."}
          {callText && (
            <>
              {" "}
              <span className="text-ink" data-qa="comps-call">
                {callText}
              </span>
            </>
          )}
          {read?.kind === "withheld" && (
            <>
              {" "}
              <span className="text-muted" data-qa="comps-call-withheld">
                {read.reason}
              </span>
            </>
          )}
        </p>
        <KeptLine line={kLine} phrase={outPhrase} figures onKeepAll={anyOut ? keepAll : null} />
        {placeNotes}
        {note && <p className="mt-1.5 text-xs leading-relaxed text-caution">{note}</p>}
      </>
    );
    pictures = <CompsPictures result={keptResult} at={kept.at} stats={s} subjectPrice={subjectPrice} />;
  } else {
    // Every sale left out: no figures, the list stays to bring one back.
    readout = (
      <>
        <p className="mt-2 text-sm leading-relaxed">
          <span className="font-semibold">{salesPhrase(result.comps.length)}</span>{" "}
          <span className="text-muted">{scope}</span>
          {" — every one left out of the readout, so it reads no figures. Keep a sale to read the set."}
        </p>
        <KeptLine line={kLine} phrase={outPhrase} figures={false} onKeepAll={keepAll} />
        {placeNotes}
      </>
    );
  }

  return (
    <>
      {readout}
      {pictures}

      {showMap && result.subject && (
        <RecordSalesMap
          subject={result.subject}
          precision={result.subject.precision ?? null}
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

      {/* The sales, nearest first or in the order the reader picks, each
          keeping its pin number; cards on a phone, a table from `sm` up
          (./sales-list). The $/SF median's tick only where the readout
          above names one. Left-out sales stay listed, marked. */}
      <SalesList
        comps={result.comps}
        shared={shared}
        showUnits={showUnits}
        medianPerSqft={medianPerSqft}
        copyText={copyText}
        provenance={provenance}
        mapped={showMap && !!result.subject}
        keepSortInUrl={sortParam !== undefined && !onDeal}
        sortParam={sortParam ?? null}
        out={out}
        onOut={setOut}
      >
        {gridHref && (
          // A plain link, a whole page load: /tools reads its fields from the
          // address once a visit, so a client hop could keep an earlier grid.
          <p className="mt-1 text-xs text-muted" data-qa="comps-grid-link">
            <a
              href={gridHref}
              className="font-medium text-brand underline decoration-dotted underline-offset-2 hover:text-brand-strong"
            >
              {`Open the ${gridCount} nearest ${anyOut ? "kept " : ""}sales that state an area in the comp grid`}
            </a>
            {" — every adjustment, time included, starts at 0, and the subject's size and ask are left for you."}
          </p>
        )}
      </SalesList>
    </>
  );
}

/**
 * "4 of 6 sales kept" with what was left out and why, and a way to keep them
 * all again — present (and announced) whenever any sale is left out. The
 * region is always in the page, empty while every sale is kept, so a screen
 * reader hears the line when it appears.
 */
function KeptLine({
  line,
  phrase,
  figures,
  onKeepAll,
}: {
  line: string;
  phrase: string;
  /** the readout above reads figures off the kept sales (none kept, none) */
  figures: boolean;
  onKeepAll: (() => void) | null;
}) {
  return (
    <p className={line ? "mt-1.5 text-xs leading-relaxed text-ink" : "sr-only"} aria-live="polite" data-qa="comps-kept">
      {line && (
        <>
          <span className="font-semibold">{line}</span>
          {`${figures ? "; the figures above are the kept sales'" : ""}${phrase ? ` — left out: ${phrase}` : ""}.`}
          {onKeepAll && (
            <>
              {" "}
              <button
                type="button"
                onClick={onKeepAll}
                className="font-medium text-brand underline decoration-dotted underline-offset-2 hover:text-brand-strong print:hidden"
              >
                Keep all
              </button>
            </>
          )}
        </>
      )}
    </p>
  );
}

/**
 * The set as two pictures: every kept sale on one price track (the middle and
 * the subject ticked where the readout would name them), and the kept sales by
 * quarter across the window. Each is left out where it has nothing to draw.
 */
function CompsPictures({
  result,
  at,
  stats,
  subjectPrice,
}: {
  /** the result with its kept sales only */
  result: RecordCompsResult;
  /** each kept sale's place in the full nearest-first list: its pin, less one */
  at: number[];
  /** the readout's own figures, a shared deed counted once */
  stats: RecordCompsStats;
  subjectPrice: number | null;
}) {
  const track = trackOnList(priceTrack(result.comps, stats.medianPrice, subjectPrice, stats.count), at);
  // The bars run through the evidence's own day — the search's, or the
  // database's last ingest where earlier — never today; a capped newest-
  // first source's window starts at its oldest sale kept, not the months
  // asked, so it is drawn from that sale.
  const through = evidenceThrough(result);
  const newestCut = result.capped && result.sourceOrder === "newest";
  const quarters = salesByQuarter(
    result.comps,
    through ? { through, monthsBack: newestCut ? null : (result.params?.monthsBack ?? null) } : null,
  );
  if (!track && quarters.length === 0) return null;
  const peak = Math.max(1, ...quarters.map((q) => q.count));
  return (
    <div className="mt-3 grid gap-4 sm:grid-cols-2">
      {track && (
        <figure className="min-w-0">
          <figcaption className="text-[11px] font-semibold uppercase tracking-wide text-muted">
            Each sale&apos;s price{track.log ? " · log scale" : ""}
          </figcaption>
          {/* The dots speak only to a pointer (their titles); a screen
              reader gets the track in one sentence. */}
          <p className="sr-only" data-qa="comps-price-words">
            {`${track.dots.length} ${stats.sharedDeeds ? "rows" : "sales"} from ${track.lowLabel} to ${track.highLabel}${
              track.medianPct !== null ? `; ${medianLabel(stats.count)} ${fmtMoney(stats.medianPrice)}` : ""
            }${track.subjectPct !== null && subjectPrice !== null ? `; this deal's price ${fmtMoney(subjectPrice)}` : ""}.`}
          </p>
          <div className="relative mt-3 h-8" data-bar="comps-price" aria-hidden>
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
                title={`${medianLabel(stats.count)} ${fmtMoney(stats.medianPrice)}`}
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
                {medianLabel(stats.count)}
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
            Sales by quarter{through ? `, to ${dayText(through)}` : ""}
          </figcaption>
          <div className="mt-3 flex h-16 items-end gap-1" data-bar="comps-quarters">
            {quarters.map((q) => (
              <div
                key={q.label}
                className="flex h-full min-w-0 max-w-10 flex-1 flex-col items-center justify-end"
                title={`${q.label}: ${q.count}`}
              >
                <span className="font-mono text-[10px] tabular-nums text-muted">{q.count || ""}</span>
                <div
                  className={`w-full rounded-t ${q.count ? "bg-brand/60" : "bg-faint"}`}
                  style={{ height: `${q.count ? Math.max(8, (q.count / peak) * 80) : 4}%` }}
                  data-bar="comps-quarter"
                />
              </div>
            ))}
          </div>
          <div
            className="mt-1 flex justify-between text-[11px] text-muted"
            style={{ maxWidth: `${quarters.length * 2.75}rem` }}
          >
            <span>{quarters[0].label}</span>
            <span>{quarters[quarters.length - 1].label}</span>
          </div>
        </figure>
      )}
    </div>
  );
}
