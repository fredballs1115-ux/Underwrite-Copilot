import type { RentRollAnalytics, MarkToMarket, RolloverCostForecast, LeaseUpCurve } from "@/lib/rentroll/analytics";
import type { ValidationIssue } from "@/lib/rentroll/validate";

/**
 * The rent roll dashboard. Server-rendered — every figure is deterministic and
 * nothing here needs client state, so the charts are plain SVG rather than a
 * charting dependency.
 */

const usd = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1000)}k`;
  return `${sign}$${Math.round(abs)}`;
};
const sf = (n: number) => `${Math.round(n).toLocaleString("en-US")} SF`;
const pct1 = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
const psf = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-lg text-ink">{value}</dd>
      {note ? <p className="mt-0.5 text-[11px] text-muted">{note}</p> : null}
    </div>
  );
}

/** Stacked bars: SF expiring per year, with the rent expiring overlaid. */
function RolloverChart({
  analytics,
  cost,
}: {
  analytics: RentRollAnalytics;
  cost: RolloverCostForecast;
}) {
  const years = analytics.rollover.years.slice(0, 12);
  if (!years.length) {
    return <p className="text-sm text-muted">No dated expiries to schedule.</p>;
  }
  const COL_W = 74;
  const BAR_W = 40;
  const PAD_T = 26;
  const PLOT_H = 170;
  const AXIS_H = 52;
  const W = 16 + years.length * COL_W;
  const H = PAD_T + PLOT_H + AXIS_H;
  const maxSf = Math.max(...years.map((y) => y.sfExpiring), 1);
  const costByYear = new Map(cost.years.map((y) => [y.year, y.totalCost]));

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: Math.min(W, 560) }} role="img"
        aria-label="SF expiring by year">
        <line x1={8} x2={W - 8} y1={PAD_T + PLOT_H} y2={PAD_T + PLOT_H} stroke="var(--color-line)" />
        {years.map((y, i) => {
          const x = 8 + i * COL_W + (COL_W - BAR_W) / 2;
          const h = Math.max(2, (y.sfExpiring / maxSf) * PLOT_H);
          const top = PAD_T + PLOT_H - h;
          const heavy = (y.pctOfNra ?? 0) > 0.3;
          return (
            <g key={y.year}>
              <title>{`${y.year}: ${sf(y.sfExpiring)}, ${usd(y.rentExpiring)} rent, ${y.leaseCount} lease${
                y.leaseCount === 1 ? "" : "s"
              }, ${usd(costByYear.get(y.year) ?? 0)} leasing capital`}</title>
              <rect
                x={x}
                y={top}
                width={BAR_W}
                height={h}
                rx={2}
                fill={heavy ? "var(--color-caution)" : "var(--color-brand)"}
                opacity={0.9}
              />
              <text x={x + BAR_W / 2} y={top - 6} textAnchor="middle" fontSize={10} fill="var(--color-ink)">
                {pct1(y.pctOfNra)}
              </text>
              <text x={x + BAR_W / 2} y={PAD_T + PLOT_H + 16} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
                {y.year}
              </text>
              <text x={x + BAR_W / 2} y={PAD_T + PLOT_H + 30} textAnchor="middle" fontSize={10} fill="var(--color-muted)">
                {Math.round(y.sfExpiring / 1000)}k SF
              </text>
              <text x={x + BAR_W / 2} y={PAD_T + PLOT_H + 44} textAnchor="middle" fontSize={10} fill="var(--color-muted)">
                {usd(y.rentExpiring)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function RentRollDashboard({
  analytics,
  mtm,
  cost,
  leaseUp,
  issues,
  filename,
}: {
  analytics: RentRollAnalytics;
  mtm: MarkToMarket;
  cost: RolloverCostForecast;
  leaseUp: LeaseUpCurve;
  issues: ValidationIssue[];
  filename: string;
}) {
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");

  return (
    <div className="flex flex-col gap-6">
      {/* ── Validation ────────────────────────────────────────────────── */}
      {issues.length > 0 ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">
            What the import found in {filename}
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {[...errors, ...warnings].map((issue) => (
              <li key={issue.code} className="flex gap-2 text-sm">
                <span
                  className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                    issue.severity === "error" ? "bg-kill" : "bg-caution"
                  }`}
                  aria-hidden
                />
                <span className="text-muted">
                  {issue.message}
                  {issue.rows.length ? (
                    <span className="ml-1 font-mono text-[11px]">
                      (row{issue.rows.length === 1 ? "" : "s"} {issue.rows.slice(0, 8).join(", ")}
                      {issue.rows.length > 8 ? "…" : ""})
                    </span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Headline ──────────────────────────────────────────────────── */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Occupancy" value={pct1(analytics.occupancyPct)} note={`${sf(analytics.occupiedSf)} of ${sf(analytics.totalSf)}`} />
        <Stat
          label="WALT (SF)"
          value={analytics.walt.bySf == null ? "—" : `${analytics.walt.bySf.toFixed(1)} yr`}
          note={
            analytics.walt.excludedSf > 0
              ? `${sf(analytics.walt.excludedSf)} excluded — no expiry date`
              : `over ${sf(analytics.walt.coveredSf)}`
          }
        />
        <Stat
          label="WALT (rent)"
          value={analytics.walt.byRent == null ? "—" : `${analytics.walt.byRent.toFixed(1)} yr`}
          note={
            analytics.walt.bySf != null && analytics.walt.byRent != null
              ? analytics.walt.byRent > analytics.walt.bySf
                ? "income rolls later than space"
                : "income rolls sooner than space"
              : undefined
          }
        />
        <Stat label="In-place rent" value={usd(analytics.inPlaceRentAnnual)} note={`${psf(analytics.weightedInPlacePsf)}/SF weighted`} />
      </dl>

      {/* ── Concentration flags ───────────────────────────────────────── */}
      {analytics.flags.length ? (
        <section className="flex flex-col gap-2">
          {analytics.flags.map((f) => (
            <p
              key={`${f.code}-${f.value.toFixed(4)}`}
              className={`rounded-lg border px-4 py-2.5 text-sm ${
                f.severity === "critical"
                  ? "border-kill/30 bg-kill/5 text-kill"
                  : "border-caution/30 bg-caution/5 text-caution"
              }`}
            >
              {f.message}
            </p>
          ))}
        </section>
      ) : null}

      {/* ── Rollover ──────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Rollover schedule</h2>
          <p className="text-xs text-muted">
            Leasing capital at {psf(cost.blendedCostPerSf)}/expiring SF under &ldquo;{cost.profileName}
            &rdquo; · {usd(cost.totalCost)} total
          </p>
        </div>
        <div className="mt-3">
          <RolloverChart analytics={analytics} cost={cost} />
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Year</th>
                <th className="py-2 pr-3 text-right font-medium">SF expiring</th>
                <th className="py-2 pr-3 text-right font-medium">% of NRA</th>
                <th className="py-2 pr-3 text-right font-medium">Rent expiring</th>
                <th className="py-2 pr-3 text-right font-medium">Leases</th>
                <th className="py-2 text-right font-medium">Leasing capital</th>
              </tr>
            </thead>
            <tbody>
              {analytics.rollover.years.map((y) => {
                const c = cost.years.find((x) => x.year === y.year);
                return (
                  <tr key={y.year} className="border-b border-line last:border-b-0">
                    <td className="py-2 pr-3 text-ink">{y.year}</td>
                    <td className="py-2 pr-3 text-right font-mono text-muted">{sf(y.sfExpiring)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-muted">{pct1(y.pctOfNra)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-muted">{usd(y.rentExpiring)}</td>
                    <td className="py-2 pr-3 text-right font-mono text-muted">{y.leaseCount}</td>
                    <td className="py-2 text-right font-mono text-muted">{c ? usd(c.totalCost) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {analytics.rollover.undatedSf > 0 ? (
          <p className="mt-2 text-xs text-muted">
            {sf(analytics.rollover.undatedSf)} of occupied space carries no expiry date and is not
            scheduled here — it is excluded, not assumed.
          </p>
        ) : null}
      </section>

      {/* ── Mark to market ────────────────────────────────────────────── */}
      <section className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-ink">Mark to market</h2>
          <p className="text-xs text-muted">
            {psf(mtm.weightedInPlacePsf)} in place vs {psf(mtm.weightedMarketPsf)} market ·{" "}
            <span className={mtm.totalGapAnnual >= 0 ? "text-pass" : "text-kill"}>
              {usd(mtm.totalGapAnnual)} / yr
            </span>
            {mtm.unpricedLeases ? ` · ${mtm.unpricedLeases} lease(s) not priced` : ""}
          </p>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Tenant</th>
                <th className="py-2 pr-3 text-right font-medium">SF</th>
                <th className="py-2 pr-3 text-right font-medium">In place</th>
                <th className="py-2 pr-3 text-right font-medium">Market</th>
                <th className="py-2 pr-3 text-right font-medium">Gap $/SF</th>
                <th className="py-2 text-right font-medium">Gap / yr</th>
              </tr>
            </thead>
            <tbody>
              {mtm.rows.slice(0, 25).map((r) => (
                <tr key={r.sourceRow} className="border-b border-line last:border-b-0">
                  <td className="py-2 pr-3 text-ink">
                    {r.tenant || "—"}
                    {r.suite ? <span className="ml-1 text-xs text-muted">{r.suite}</span> : null}
                  </td>
                  <td className="py-2 pr-3 text-right font-mono text-muted">{sf(r.sf)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-muted">{psf(r.inPlacePsf)}</td>
                  <td className="py-2 pr-3 text-right font-mono text-muted">{psf(r.marketPsf)}</td>
                  <td
                    className="py-2 pr-3 text-right font-mono"
                    style={{ color: r.gapPsf >= 0 ? "var(--color-pass)" : "var(--color-kill)" }}
                  >
                    {psf(r.gapPsf)}
                  </td>
                  <td className="py-2 text-right font-mono text-muted">{usd(r.gapAnnual)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Lease-up ──────────────────────────────────────────────────── */}
      {leaseUp.vacantSf > 0 ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Lease-up</h2>
          <p className="mt-1 text-sm text-muted">
            {sf(leaseUp.vacantSf)} vacant at {sf(leaseUp.absorptionSfPerMonth)}/month —{" "}
            {leaseUp.monthsToStabilize == null
              ? `never reaches ${pct1(leaseUp.stabilizedOccupancyPct)} occupancy at this pace.`
              : `${pct1(leaseUp.stabilizedOccupancyPct)} occupancy in month ${leaseUp.monthsToStabilize}.`}
          </p>
        </section>
      ) : null}
    </div>
  );
}
