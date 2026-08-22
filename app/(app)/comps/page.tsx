import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { parseStructuredAddress } from "@/lib/address";
import { COVERAGE_SUMMARY } from "@/lib/public-comps/core";
import { computeRecordComps } from "@/lib/public-comps/run";
import { AddressAutocomplete } from "../address-autocomplete";
import { CompsResultView } from "./result-view";

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
  searchParams: Promise<{ q?: string; addr?: string; cls?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/comps");

  const params = await searchParams;
  // Structured pick first (routes to the right county source); raw text is
  // the degraded fallback when the geocoder was unreachable while typing.
  const picked = parseStructuredAddress(params.addr ?? "");
  const q = picked?.label ?? (params.q ?? "").trim().slice(0, 160);
  const cls = params.cls === "multifamily" ? "multifamily" : "";
  const result = q
    ? await computeRecordComps({
        label: q,
        state: picked?.state,
        city: picked?.city,
        county: picked?.county,
        assetClass: cls,
      })
    : null;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">Pull comps</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Recorded sales around any address, straight from the public record —
          the same engine that sanity-checks every deal you screen. Coverage
          today: {COVERAGE_SUMMARY}, plus every market loaded into the
          property database.
        </p>
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
          <span className="mb-1 block text-xs font-medium text-muted">Filter</span>
          <select
            name="cls"
            defaultValue={cls}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none transition-colors focus:border-brand"
          >
            <option value="">All recorded sales</option>
            <option value="multifamily">Multifamily / mixed only</option>
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
              className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90"
            >
              Screen this address as a deal →
            </Link>
          </div>
          <CompsResultView result={result} subjectPrice={null} />
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          Start typing an address above and pick it from the suggestions —
          picking (rather than free-typing) is what tells the engine the
          county, so it can route to the right public-records source. Results
          carry a source link on every row, and an honest sentence (never a
          blank) when a jurisdiction isn&apos;t covered yet.
        </section>
      )}
    </div>
  );
}
