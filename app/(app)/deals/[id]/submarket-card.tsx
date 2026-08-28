import Link from "next/link";
import type { AssumptionWarning } from "@/lib/market/checks";
import type { SubmarketView } from "@/lib/market/store";
import type { Submarket } from "@/lib/market/types";
import { dismissSubmarketWarning, linkSubmarket, restoreSubmarketWarning } from "./submarket-actions";

/**
 * The compact submarket card on the deal page — the payoff of Phase 4.
 *
 * A dismissed warning stays VISIBLE, struck through, with the reason and who
 * gave it. Hiding it would defeat the point: the record of the override is the
 * feature.
 */

const sfFmt = (n: number) => `${Math.round(n).toLocaleString("en-US")} SF`;

export function SubmarketCard({
  dealId,
  view,
  warnings,
  submarkets,
}: {
  dealId: string;
  view: SubmarketView | null;
  warnings: AssumptionWarning[];
  submarkets: Submarket[];
}) {
  if (!submarkets.length && !view) return null;

  const picker = (
    <form action={linkSubmarket} className="flex flex-wrap items-center gap-2">
      <input type="hidden" name="dealId" value={dealId} />
      <select
        name="submarketId"
        defaultValue={view?.submarket.id ?? ""}
        className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
      >
        <option value="">— no submarket —</option>
        {submarkets.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.metro ? ` · ${s.metro}` : ""}
          </option>
        ))}
      </select>
      <button type="submit" className="text-sm text-brand underline-offset-2 hover:underline">
        {view ? "Change" : "Link"}
      </button>
    </form>
  );

  if (!view) {
    return (
      <section className="shadow-card rounded-2xl border border-line bg-surface px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-ink">Submarket supply</h2>
            <p className="text-xs text-muted">
              Link a submarket and your rent growth, exit cap and vacancy get checked against what
              it has actually done.
            </p>
          </div>
          {picker}
        </div>
      </section>
    );
  }

  const { metrics, submarket, applied } = view;
  const supply =
    metrics.supply.status === "ok"
      ? `${metrics.supply.months.toFixed(0)} months`
      : metrics.supply.status === "supply_exceeds_demand"
        ? "supply > demand"
        : "—";

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">
            <Link href={`/submarkets/${submarket.id}`} className="underline-offset-2 hover:underline">
              {submarket.name}
            </Link>
          </h2>
          <p className="text-xs text-muted">
            {submarket.metro ? `${submarket.metro} · ` : ""}
            {metrics.periodsCovered} period{metrics.periodsCovered === 1 ? "" : "s"} ·{" "}
            {applied.includedCount} of {applied.total} pipeline buildings included
          </p>
        </div>
        {picker}
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        {(
          [
            ["Months of supply", supply],
            [
              "UC % of inventory",
              metrics.ucShare == null ? "—" : `${(metrics.ucShare * 100).toFixed(1)}%`,
            ],
            [
              "T12 absorption",
              metrics.absorption.sf == null ? "—" : sfFmt(metrics.absorption.sf),
            ],
            [
              "Rent CAGR",
              metrics.rent.cagr == null ? "—" : `${(metrics.rent.cagr * 100).toFixed(2)}%`,
            ],
          ] as const
        ).map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
            <dd className="font-mono text-sm text-ink">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-[11px] text-muted">
        Source: {metrics.latest?.source ?? "—"}
        {metrics.latest ? `, as of ${metrics.latest.period}` : ""}
        {metrics.latest?.unverified ? " (unverified)" : ""}
      </p>

      {warnings.length ? (
        <ul className="mt-4 flex flex-col gap-3">
          {warnings.map((w) => (
            <li
              key={w.code}
              className={`rounded-lg border px-4 py-3 ${
                w.dismissed
                  ? "border-line bg-faint"
                  : w.severity === "warning"
                    ? "border-caution/30 bg-caution/5"
                    : "border-line bg-faint"
              }`}
            >
              <p
                className={`text-sm font-medium ${
                  w.dismissed ? "text-muted line-through" : w.severity === "warning" ? "text-caution" : "text-ink"
                }`}
              >
                {w.title}
              </p>
              <p className={`mt-0.5 text-sm ${w.dismissed ? "text-muted" : "text-ink"}`}>
                {w.message}
              </p>
              <p className="mt-1 text-[11px] text-muted">Basis: {w.basis}</p>

              {w.dismissed ? (
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <p className="text-xs text-muted">
                    Overridden by {w.dismissed.by || "the analyst"}: &ldquo;{w.dismissed.reason}
                    &rdquo; — this line goes into the deal memo.
                  </p>
                  <form action={restoreSubmarketWarning}>
                    <input type="hidden" name="dealId" value={dealId} />
                    <input type="hidden" name="code" value={w.code} />
                    <button
                      type="submit"
                      className="text-xs text-brand underline-offset-2 hover:underline"
                    >
                      Undo
                    </button>
                  </form>
                </div>
              ) : (
                <form action={dismissSubmarketWarning} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="hidden" name="dealId" value={dealId} />
                  <input type="hidden" name="code" value={w.code} />
                  <label className="flex flex-1 flex-col gap-1 text-[11px] text-muted">
                    Why you&apos;re overriding this (required — it goes in the memo)
                    <input
                      name="reason"
                      required
                      maxLength={300}
                      placeholder="Signed LOI at $11.00 with the anchor; the trend lags the last two deals."
                      className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-muted transition hover:border-brand hover:text-brand"
                  >
                    Dismiss
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">
          Nothing in this deal&apos;s assumptions runs ahead of what {submarket.name} has done.
        </p>
      )}
    </section>
  );
}
