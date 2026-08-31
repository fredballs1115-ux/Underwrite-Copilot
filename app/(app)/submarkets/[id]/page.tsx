import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { loadSubmarketView } from "@/lib/market/store";
import { exclusionSummary } from "@/lib/market/exclusions";
import { RENT_BASIS_LABEL, RENT_BASES } from "@/lib/market/types";
import { DualAxisTrend } from "./trend-chart";
import {
  deleteSubmarket,
  deleteSubmarketPeriod,
  deleteSubmarketPipeline,
  importSubmarketFile,
  saveExclusionRules,
  saveSubmarketPeriod,
} from "../actions";

export const metadata: Metadata = { title: "Submarket" };

const ERRORS: Record<string, string> = {
  file: "Pick a file to import.",
  size: "That file is over 32MB.",
  format: "That file's contents don't match its extension.",
  parse: "Couldn't read that file. CSV and XLSX are supported.",
  empty: "That file has no rows.",
  norows: "No rows in that file mapped to the expected columns.",
  period: "A period needs a full date (yyyy-mm-dd), usually the quarter end.",
};

const sfFmt = (n: number) => `${Math.round(n).toLocaleString("en-US")} SF`;
const pct1 = (n: number | null | undefined) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
const money2 = (n: number) => `$${n.toFixed(2)}`;

export default async function SubmarketPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; imported?: string }>;
}) {
  const { id } = await params;
  const { error: errorCode, imported } = await searchParams;

  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const view = await loadSubmarketView(supabase, id);
  if (!view) notFound();
  const { submarket, periods, properties, applied, metrics } = view;
  const rules = submarket.exclusionRules;

  const supplyLine =
    metrics.supply.status === "ok"
      ? `${metrics.supply.months.toFixed(1)} months`
      : metrics.supply.status === "supply_exceeds_demand"
        ? "Supply exceeds demand"
        : "—";

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <Link
          href="/submarkets"
          className="text-sm text-muted underline-offset-2 hover:text-brand hover:underline"
        >
          ← Submarkets
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">{submarket.name}</h1>
        <p className="text-sm text-muted">
          {submarket.metro ? `${submarket.metro} · ` : ""}
          <span className="capitalize">{submarket.assetClass}</span> ·{" "}
          {metrics.periodsCovered} period{metrics.periodsCovered === 1 ? "" : "s"} loaded
        </p>
      </header>

      {errorCode && ERRORS[errorCode] ? (
        <p className="rounded-lg border border-kill/30 bg-kill/5 px-4 py-3 text-sm text-kill">
          {ERRORS[errorCode]}
        </p>
      ) : null}
      {imported ? (
        <p className="rounded-lg border border-pass/30 bg-pass/5 px-4 py-3 text-sm text-pass">
          Imported {imported} row{imported === "1" ? "" : "s"}.
        </p>
      ) : null}

      {/* ── Headline metrics ──────────────────────────────────────────── */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            [
              "Months of supply",
              supplyLine,
              metrics.supply.status === "ok"
                ? `${sfFmt(metrics.supply.ucSf)} UC ÷ ${sfFmt(metrics.supply.monthlyAbsorption)}/mo`
                : metrics.supply.status === "supply_exceeds_demand"
                  ? `${sfFmt(metrics.supply.ucSf)} UC, ${sfFmt(metrics.supply.t12Absorption)} T12 absorption`
                  : metrics.supply.reason,
            ],
            [
              "UC % of inventory",
              pct1(metrics.ucShare),
              metrics.latest ? `as of ${metrics.latest.period}` : "no period",
            ],
            [
              "T12 net absorption",
              metrics.absorption.sf == null ? "—" : sfFmt(metrics.absorption.sf),
              metrics.absorption.periods.length
                ? `${metrics.absorption.quartersUsed} qtr: ${metrics.absorption.periods.join(", ")}`
                : "no absorption data",
            ],
            [
              "Rent CAGR",
              metrics.rent.cagr == null ? "—" : `${(metrics.rent.cagr * 100).toFixed(2)}%`,
              metrics.rent.cagr == null
                ? "needs two periods on one basis"
                : `${metrics.rent.cagrFrom} → ${metrics.rent.cagrTo}, ${
                    metrics.rent.cagrBasis ? RENT_BASIS_LABEL[metrics.rent.cagrBasis] : "basis not stated"
                  }`,
            ],
          ] as const
        ).map(([label, value, note]) => (
          <div key={label} className="rounded-lg border border-line bg-surface px-4 py-3">
            <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
            <dd className="mt-0.5 font-mono text-lg text-ink">{value}</dd>
            <p className="mt-0.5 text-[11px] text-muted">{note}</p>
          </div>
        ))}
      </dl>

      {/* ── Data-quality flags ────────────────────────────────────────── */}
      {metrics.rent.basisFlag ? (
        <p className="rounded-lg border border-caution/30 bg-caution/5 px-4 py-3 text-sm text-caution">
          {metrics.rent.basisFlag}
        </p>
      ) : null}
      <p
        className={`rounded-lg border px-4 py-3 text-sm ${
          metrics.reconciliation.ties
            ? "border-line bg-faint text-muted"
            : "border-caution/30 bg-caution/5 text-caution"
        }`}
      >
        {metrics.reconciliation.message}
      </p>

      {/* ── Trends ────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold text-ink">Absorption and asking rent</h2>
        <div className="mt-3">
          <DualAxisTrend
            bars={metrics.vacancy.length ? metrics.vacancy : []}
            barLabel="Vacancy"
            segments={metrics.rent.segments}
            lineLabel="Asking rent"
            formatBar={(n) => `${(n * 100).toFixed(1)}%`}
            formatLine={money2}
          />
        </div>
      </section>

      {/* ── Exclusion rules ───────────────────────────────────────────── */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Exclusion rules</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          A category that doesn&apos;t belong in this submarket distorts inventory, absorption and
          the pipeline all at once — a hyperscale data-center campus in an industrial pull is the
          classic case. These rules are persistent: set once, applied to every future import.
        </p>
        <p className="mt-3 rounded-md bg-faint px-3 py-2 font-mono text-sm text-ink">
          {exclusionSummary(applied)}
        </p>
        <form action={saveExclusionRules} className="mt-4 flex flex-col gap-3">
          <input type="hidden" name="submarketId" value={id} />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Exclude subtypes (comma separated)
              <input
                name="subtypes"
                defaultValue={rules.subtypes.join(", ")}
                placeholder="Data Center, Cold Storage"
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Exclude names / addresses containing
              <input
                name="namePatterns"
                defaultValue={rules.namePatterns.join(", ")}
                placeholder="campus, hyperscale"
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Exclude under (SF)
              <input
                name="minSf"
                defaultValue={rules.minSf ?? ""}
                inputMode="numeric"
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Exclude over (SF)
              <input
                name="maxSf"
                defaultValue={rules.maxSf ?? ""}
                inputMode="numeric"
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                name="excludeOwnerOccupied"
                defaultChecked={rules.excludeOwnerOccupied}
              />
              Exclude owner-occupied / build-to-suit
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Supply warning threshold (months)
              <input
                name="supplyWarningMonths"
                defaultValue={submarket.supplyWarningMonths}
                inputMode="numeric"
                className="w-32 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
            >
              Save rules
            </button>
          </div>
        </form>
      </section>

      {/* ── Import ────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Import a market export</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          CSV or XLSX, mapped the same way the rent roll is. Statistics rows upsert on their period;
          a re-imported pipeline file replaces the rows it wrote before, so importing twice never
          doubles the pipeline.
        </p>
        <form action={importSubmarketFile} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="submarketId" value={id} />
          <label className="flex flex-col gap-1 text-xs text-muted">
            What is this file?
            <select
              name="kind"
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            >
              <option value="periods">Statistics by period (grid)</option>
              <option value="pipeline">Property-level pipeline</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            File
            <input
              type="file"
              name="file"
              accept=".csv,.xlsx,.xlsm,text/csv"
              required
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-faint file:px-2 file:py-1 file:text-xs"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            Import
          </button>
        </form>
      </section>

      {/* ── Periods ───────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-line bg-surface">
        <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">
          Periods
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Period</th>
                <th className="px-4 py-2 text-right font-medium">Inventory</th>
                <th className="px-4 py-2 text-right font-medium">Vacancy</th>
                <th className="px-4 py-2 text-right font-medium">Net absorption</th>
                <th className="px-4 py-2 text-right font-medium">Under construction</th>
                <th className="px-4 py-2 text-right font-medium">Asking rent</th>
                <th className="px-4 py-2 font-medium">Basis</th>
                <th className="px-4 py-2 font-medium">Source</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {periods.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-b-0">
                  <td className="px-4 py-2 text-ink">{p.period}</td>
                  <td className="px-4 py-2 text-right font-mono text-muted">
                    {p.inventorySf == null ? "—" : sfFmt(p.inventorySf)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-muted">{pct1(p.vacancyPct)}</td>
                  <td className="px-4 py-2 text-right font-mono text-muted">
                    {p.netAbsorptionSf == null ? "—" : sfFmt(p.netAbsorptionSf)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-muted">
                    {p.underConstructionSf == null ? "—" : sfFmt(p.underConstructionSf)}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-muted">
                    {p.askingRent == null ? "—" : money2(p.askingRent)}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {p.rentBasis ? RENT_BASIS_LABEL[p.rentBasis] : "not stated"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">
                    {p.sourceUrl ? (
                      <a href={p.sourceUrl} target="_blank" rel="noreferrer" className="text-brand underline-offset-2 hover:underline">
                        {p.source}
                      </a>
                    ) : (
                      p.source
                    )}
                    {p.unverified ? (
                      <span className="ml-1 rounded bg-caution/15 px-1 text-[10px] font-medium text-caution">
                        unverified
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <form action={deleteSubmarketPeriod}>
                      <input type="hidden" name="submarketId" value={id} />
                      <input type="hidden" name="periodId" value={p.id} />
                      <button type="submit" className="text-xs text-muted hover:text-kill">
                        ×
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {!periods.length ? (
                <tr>
                  <td colSpan={9} className="px-4 py-4 text-sm text-muted">
                    No periods yet — import a grid or add one below.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <form action={saveSubmarketPeriod} className="flex flex-col gap-3 border-t border-line p-5">
          <input type="hidden" name="submarketId" value={id} />
          <h3 className="text-sm font-semibold text-ink">Add or correct a period</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Period end
              <input type="date" name="period" required className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Inventory (SF)
              <input name="inventorySf" inputMode="numeric" className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Vacancy (%)
              <input name="vacancyPct" inputMode="decimal" className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Net absorption (SF)
              <input name="netAbsorptionSf" inputMode="numeric" className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Under construction (SF)
              <input name="underConstructionSf" inputMode="numeric" className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Asking rent
              <input name="askingRent" inputMode="decimal" className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Rent basis
              <select name="rentBasis" className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink">
                <option value="">not stated</option>
                {RENT_BASES.map((b) => (
                  <option key={b} value={b}>
                    {RENT_BASIS_LABEL[b]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              Source
              <input name="source" placeholder="manual" className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink" />
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex items-center gap-2 text-sm text-muted">
              <input type="checkbox" name="unverified" />
              Web-sourced / unverified
            </label>
            <label className="flex flex-1 flex-col gap-1 text-xs text-muted">
              Source link (required for a web-sourced figure)
              <input name="sourceUrl" placeholder="https://…" className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink" />
            </label>
            <button
              type="submit"
              className="rounded-md border border-brand px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand hover:text-white"
            >
              Save period
            </button>
          </div>
          <p className="text-xs text-muted">
            A web-sourced figure is stored as unverified with its link and shown that way
            everywhere. It is never blended silently into an imported series.
          </p>
        </form>
      </section>

      {/* ── Pipeline ──────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-line bg-surface">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-5 py-3">
          <h2 className="text-sm font-semibold text-ink">Construction pipeline</h2>
          <p className="text-xs text-muted">
            {metrics.deliveries.length
              ? `Deliveries: ${metrics.deliveries.map((d) => `${d.quarter} ${Math.round(d.sf / 1000)}k`).join(" · ")}`
              : "No dated deliveries"}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="px-4 py-2 font-medium">Building</th>
                <th className="px-4 py-2 text-right font-medium">SF</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">Delivery</th>
                <th className="px-4 py-2 font-medium">Subtype</th>
                <th className="px-4 py-2 font-medium">Flags</th>
              </tr>
            </thead>
            <tbody>
              {properties.map((p) => (
                <tr
                  key={p.id}
                  className={`border-b border-line last:border-b-0 ${p.excluded ? "opacity-55" : ""}`}
                >
                  <td className="px-4 py-2 text-ink">
                    {p.name || "—"}
                    {p.address ? <span className="block text-[11px] text-muted">{p.address}</span> : null}
                  </td>
                  <td className="px-4 py-2 text-right font-mono text-muted">
                    {p.sf == null ? "—" : sfFmt(p.sf)}
                  </td>
                  <td className="px-4 py-2 text-xs capitalize text-muted">
                    {p.status.replace("_", " ")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-muted">
                    {p.expectedDelivery ?? "—"}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted">{p.subtype || "—"}</td>
                  <td className="px-4 py-2 text-xs">
                    {p.excluded ? (
                      <span className="mr-1 rounded bg-muted/15 px-1.5 py-px text-muted" title={p.exclusionReason ?? ""}>
                        excluded
                      </span>
                    ) : null}
                    {p.staleFlag ? (
                      <span className="rounded bg-caution/15 px-1.5 py-px text-caution" title={p.staleReason ?? ""}>
                        review
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
              {!properties.length ? (
                <tr>
                  <td colSpan={6} className="px-4 py-4 text-sm text-muted">
                    No pipeline loaded — import a property-level export above.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {properties.length ? (
          <form action={deleteSubmarketPipeline} className="border-t border-line px-5 py-3">
            <input type="hidden" name="submarketId" value={id} />
            <button type="submit" className="text-xs text-muted underline-offset-2 hover:text-kill hover:underline">
              Clear the pipeline
            </button>
          </form>
        ) : null}
      </section>

      <form action={deleteSubmarket}>
        <input type="hidden" name="submarketId" value={id} />
        <button type="submit" className="text-xs text-muted underline-offset-2 hover:text-kill hover:underline">
          Delete this submarket
        </button>
      </form>
    </div>
  );
}
