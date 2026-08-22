import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { COVERAGE_SUMMARY } from "@/lib/public-comps/core";
import { computeRecordComps } from "@/lib/public-comps/run";
import { CompsResultView } from "./result-view";

export const metadata: Metadata = { title: "Pull comps" };
// Every render with ?q= hits the geocoder + the property DB / live records
// API — never cache a comps pull.
export const dynamic = "force-dynamic";

/**
 * Standalone Pull Comps tool: type any address, get recorded sales around it
 * from the same engine the deal screener runs automatically — ingested deed
 * records first (any market the property database covers), live county/city
 * records APIs second. No deal required.
 */
export default async function PullCompsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cls?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/comps");

  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 160);
  const cls = params.cls === "multifamily" ? "multifamily" : "";
  const result = q ? await computeRecordComps({ label: q, assetClass: cls }) : null;

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
          <input
            type="text"
            name="q"
            defaultValue={q}
            required
            maxLength={160}
            placeholder="e.g. 1300 W Girard Ave, Philadelphia, PA"
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
          <h2 className="text-sm font-semibold">
            Recorded sales near <span className="font-mono font-normal">{q}</span>
          </h2>
          <CompsResultView result={result} subjectPrice={null} />
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-line p-4 text-sm text-muted">
          Type an address above. Results come from county deed records and the
          ingested property database — with a source link on every row, and an
          honest sentence (never a blank) when a jurisdiction isn&apos;t
          covered yet.
        </section>
      )}
    </div>
  );
}
