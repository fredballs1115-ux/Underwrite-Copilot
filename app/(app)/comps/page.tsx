import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { parseStructuredAddress } from "@/lib/address";
import { coveredState, metroForAddress } from "@/lib/market-match";
import { computeRecordComps } from "@/lib/public-comps/run";
import { AddressAutocomplete } from "../address-autocomplete";
import { CompsResultView } from "./result-view";
import { CoverageChips } from "./coverage-chips";
import { MarketBriefCard } from "@/app/market/market-brief-card";
import { dbMarketsWithSales } from "@/lib/public-comps/db-coverage";
import { marketNames } from "@/lib/public-comps/db-markets";
import { COMPS_CLASS_OPTIONS } from "@/lib/public-comps/classes";
import { askOf, readCompsQuery } from "@/lib/public-comps/comps-query";
import { RECORDED_SALES_MONTH_CHOICES, RECORDED_SALES_RADIUS_CHOICES } from "@/lib/public-record-asks";

export const metadata: Metadata = { title: "Pull comps" };
// Every render with an address hits the geocoder + the property DB / live
// records API — never cache a comps pull.
export const dynamic = "force-dynamic";

/**
 * Standalone Pull Comps tool: the SAME search-as-you-type address box the
 * deal forms use (Photon suggestions while typing; a pick carries the full
 * structured address), feeding the same engine the screener runs
 * automatically — ingested deed records first, live county/city records
 * APIs second. No deal required.
 */
export default async function PullCompsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; addr?: string; cls?: string; r?: string; m?: string; sort?: string | string[]; out?: string | string[] }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/comps");

  const params = await searchParams;
  // Structured pick first (routes to the right county source); raw text is
  // the degraded fallback when the geocoder was unreachable while typing.
  const picked = parseStructuredAddress(params.addr ?? "");
  const q = picked?.label ?? (params.q ?? "").trim().slice(0, 160);
  // The radius, window and class the reader set, each held to the choices
  // offered (lib/public-comps/comps-query); the query string carries them,
  // so a search is a link.
  const query = readCompsQuery(params);
  const cls = query.cls;
  const result = q
    ? await computeRecordComps({
        label: q,
        state: picked?.state,
        city: picked?.city,
        county: picked?.county,
        assetClass: cls,
        // A pick names its street or does not; typed text is read by what
        // Photon matched (a house, a street, or an area).
        hasStreet: picked ? !!picked.street?.trim() : true,
        ask: askOf(query),
      })
    : null;
  // The property database's markets that hold recorded sales today (the
  // cached count read), named on the chips and in a no-source sentence.
  const dbMarkets = await dbMarketsWithSales();
  // Same chip the deal page shows: one click from a comps pull to the
  // address's market brief (rules, rents, data coverage).
  const metro = picked ? metroForAddress(picked) : null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Pull comps</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Recorded sales around an address, from the public record — the same
          read every screened deal gets.
        </p>
        <CoverageChips dbMarkets={dbMarkets} />
      </header>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <label className="min-w-0 grow basis-72">
          <span className="mb-1 block text-xs font-medium text-muted">Address</span>
          <AddressAutocomplete
            name="addr"
            textName="q"
            defaultValue={picked}
            placeholder="Start typing — pick the address from the suggestions"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-brand"
          />
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted">Radius</span>
          <select
            name="r"
            defaultValue={query.radiusMiles ?? ""}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-brand"
          >
            <option value="">1 mi, 3 if thin</option>
            {RECORDED_SALES_RADIUS_CHOICES.map((c) => (
              <option key={c.miles} value={c.miles}>{`${c.miles} mi`}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted">Window</span>
          <select
            name="m"
            defaultValue={query.monthsBack ?? ""}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-brand"
          >
            <option value="">24 months, 36 if thin</option>
            {RECORDED_SALES_MONTH_CHOICES.map((m) => (
              <option key={m} value={m}>{`${m} months`}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-xs font-medium text-muted">Class</span>
          <select
            name="cls"
            defaultValue={cls}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-brand"
          >
            <option value="">All recorded sales</option>
            {COMPS_CLASS_OPTIONS.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
        >
          Pull comps
        </button>
      </form>

      {result ? (
        <section className="rounded-xl border border-line bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              Recorded sales near <span className="font-mono font-normal">{q}</span>
            </h2>
            {/* The hand-off: this pull becomes a screened deal in one click —
                the new-deal form opens on the manual tab, address picked. */}
            <Link
              href={`/deals?addr=${encodeURIComponent(
                JSON.stringify(
                  picked ?? {
                    label: q,
                    street: "",
                    city: "",
                    state: "",
                    zip: "",
                    county: "",
                    submarket: "",
                  }
                )
              )}`}
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              Screen this address as a deal →
            </Link>
          </div>
          {metro ? (
            <MarketBriefCard metro={metro} />
          ) : picked?.state ? (
            <p className="mt-2 text-[11px] text-muted">
              Not in a covered market — market-level coverage here is
              unscreened, not unregulated
              {coveredState(picked.state)
                ? "; recorded sales below still pull where the records reach."
                : "."}{" "}
              <Link
                href="/market"
                className="underline decoration-dotted underline-offset-2 hover:text-brand"
              >
                See covered markets
              </Link>
            </p>
          ) : null}
          {/* The list's order is kept in this page's address (`?sort=`), so
              a reload or a shared link opens on it; the list holds the value
              to the orders it offers (lib/public-comps/picture
              `readSalesSort`). So are the sales the reader left out of the
              readout (`?out=`, lib/public-comps/kept `readSalesOut`), so a
              shared link shows the same set. */}
          <CompsResultView
            result={result}
            showMap
            dbMarketsLine={marketNames(dbMarkets)}
            sortParam={(Array.isArray(params.sort) ? params.sort[0] : params.sort) ?? null}
            outParam={(Array.isArray(params.out) ? params.out[0] : params.out) ?? null}
          />
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          <ol className="grid gap-3 sm:grid-cols-3">
            {[
              ["Pick an address", "from the suggestions, so the search knows its county"],
              ["See the sales", "on a map, with each price on one track"],
              ["Screen it", "as a deal in one click, or copy the table"],
            ].map(([head, tail], i) => (
              <li key={head} className="flex items-start gap-2">
                <span
                  aria-hidden
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-bold text-brand"
                >
                  {i + 1}
                </span>
                <span>
                  <span className="font-medium text-ink">{head}</span> {tail}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
