import { compactUsd } from "@/lib/money";
import {
  DEFAULT_LEASE_UP_MONTHS,
  type RentRollAnalytics,
  type MarkToMarket,
  type RolloverCostForecast,
  type LeaseUpCurve,
} from "@/lib/rentroll/analytics";
import type { ValidationIssue } from "@/lib/rentroll/validate";
import { ScrollRegion } from "@/app/scroll-region";

/**
 * The rent roll dashboard. Server-rendered — every figure is deterministic and
 * nothing here needs client state, so the charts are plain SVG rather than a
 * charting dependency.
 */

const usd = (n: number): string => compactUsd(n, { millions: 2 });
const sf = (n: number) => `${Math.round(n).toLocaleString("en-US")} SF`;
const pct1 = (n: number | null) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
const psf = (n: number | null) => (n == null ? "—" : `$${n.toFixed(2)}`);
/** "Oct 1, 2026" — the day a figure is counted from. */
const day = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-4 py-3">
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 font-mono text-lg text-ink">{value}</dd>
      {note ? <p className="mt-0.5 text-[11px] text-muted">{note}</p> : null}
    </div>
  );
}

/** A lease's rent against market as a bar from a centre line: right in the
 *  pass colour when it sits below market (room to roll up), left in the kill
 *  colour when it sits above (roll-down risk), scaled to the widest gap on
 *  the page so the leases compare with each other. */
function MtmBar({ share, className }: { share: number; className?: string }) {
  const half = Math.round(Math.abs(share) * 50);
  return (
    <span aria-hidden data-mtm-bar className={`relative block h-1 rounded-full bg-faint ${className ?? ""}`}>
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-muted/40" />
      <span
        className={`absolute inset-y-0 rounded-full ${share < 0 ? "bg-kill" : "bg-pass"}`}
        style={share < 0 ? { right: "50%", width: `${half}%` } : { left: "50%", width: `${half}%` }}
      />
    </span>
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
          // A year's expiries on a roll of one-year leases is no cliff.
          const heavy = !analytics.leasesShort && (y.pctOfNra ?? 0) > 0.3;
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
  asOfFrom = "roll",
  paceIsDefault = false,
}: {
  analytics: RentRollAnalytics;
  mtm: MarkToMarket;
  cost: RolloverCostForecast;
  leaseUp: LeaseUpCurve;
  issues: ValidationIssue[];
  filename: string;
  /** where the day years-to-expiry count from came from: the roll's own
   *  as-of date, or today, where the roll states none */
  asOfFrom?: "roll" | "today";
  /** the lease-up runs at the placeholder pace (the vacancy over
   *  DEFAULT_LEASE_UP_MONTHS), not one anybody set */
  paceIsDefault?: boolean;
}) {
  // Occupancy is over the stated NRA where there is one; where it is not the
  // roll's own area, say both, so 69% is never read as 90,000 of 96,000.
  const nra = analytics.nra ?? analytics.totalSf;
  const nraDiffers =
    analytics.nraStated && Math.abs(nra - analytics.totalSf) > Math.max(1, analytics.totalSf * 0.005);
  const occupancyNote = nraDiffers
    ? `${sf(analytics.occupiedSf)} of the stated ${sf(nra)} NRA — the roll lists ${sf(analytics.totalSf)}`
    : `${sf(analytics.occupiedSf)} of ${sf(nra)}`;
  const asOfLine =
    asOfFrom === "today"
      ? `Years to expiry are counted from today, ${day(analytics.asOf)} — the roll states no as-of date; set one under Column mapping.`
      : `Years to expiry are counted from ${day(analytics.asOf)}, the roll's as-of date.`;
  const leaseUpLine = `${sf(leaseUp.vacantSf)} vacant at ${sf(leaseUp.absorptionSfPerMonth)}/month${
    paceIsDefault
      ? ` — an assumed pace, the vacancy leased over ${DEFAULT_LEASE_UP_MONTHS} months: a placeholder, not the market's absorption`
      : ""
  }. ${
    leaseUp.monthsToStabilize == null
      ? `It never reaches ${pct1(leaseUp.stabilizedOccupancyPct)} occupancy at this pace.`
      : `${pct1(leaseUp.stabilizedOccupancyPct)} occupancy${nraDiffers ? ` of the roll's ${sf(analytics.totalSf)}` : ""} in month ${leaseUp.monthsToStabilize}.`
  }`;
  const errors = issues.filter((i) => i.severity === "error");
  const warnings = issues.filter((i) => i.severity === "warning");
  // What the import did on purpose (a totals line left out) — shown, in a
  // neutral dot, after anything that needs fixing.
  const notes = issues.filter((i) => i.severity === "info");

  // Mark to market, once for both layouts: each lease's gap as a share of
  // its market rent, scaled to the widest on the page. A market rent of
  // nothing has no gap to draw.
  const mtmRows = mtm.rows.slice(0, 25);
  const widestGap = Math.max(
    0,
    ...mtmRows.map((r) => (r.marketPsf > 0 ? Math.abs(r.gapPsf) / r.marketPsf : 0)),
  );
  const mtmShare = (r: MarkToMarket["rows"][number]): number | null =>
    widestGap > 0 && r.marketPsf > 0
      ? Math.max(-1, Math.min(1, r.gapPsf / r.marketPsf / widestGap))
      : null;

  return (
    <div className="flex flex-col gap-6">
      {/* ── Validation ────────────────────────────────────────────────── */}
      {issues.length > 0 ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">
            What the import found in {filename}
          </h2>
          <ul className="mt-2 flex flex-col gap-2">
            {[...errors, ...warnings, ...notes].map((issue) => (
              <li key={issue.code} className="flex gap-2 text-sm">
                <span
                  className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
                    issue.severity === "error" ? "bg-kill" : issue.severity === "warning" ? "bg-caution" : "bg-muted/50"
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
        <Stat label="Occupancy" value={pct1(analytics.occupancyPct)} note={occupancyNote} />
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
      <p data-qa="walt-as-of" className="-mt-3 text-xs text-muted">
        {asOfLine}
      </p>

      {/* ── Concentration flags ───────────────────────────────────────── */}
      {analytics.leasesShort || analytics.flags.length ? (
        <section className="flex flex-col gap-2">
          {/* A roll of leases that run a year: the rollover and WALT flags
              describe commercial leases, so in their place it says how
              this roll is read. */}
          {analytics.leasesShort ? (
            <p data-qa="loss-to-lease-note" className="rounded-lg border border-line bg-faint px-4 py-2.5 text-sm text-muted">
              Leases here run a year or less, so this roll is read for loss to lease — the mark to market
              below — not for WALT: a short WALT and a year of expiries are routine, not a cliff.
            </p>
          ) : null}
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
        <ScrollRegion label="Rollover schedule" className="mt-3">
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
        </ScrollRegion>
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
        {/* Phone: a card per lease — tenant and gap, the bar, then the two
            rents — so a phone reads the whole lease instead of a table it
            scrolls sideways. From `sm` up the table takes over. */}
        <ul className="mt-3 grid gap-2 sm:hidden" aria-label="Leases marked to market">
          {mtmRows.map((r) => {
            const share = mtmShare(r);
            return (
              <li key={r.sourceRow} className="rounded-lg border border-line px-3 py-2">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-ink">
                    {r.tenant || "—"}
                    {r.suite ? <span className="ml-1 text-xs text-muted">{r.suite}</span> : null}
                  </span>
                  <span className={`shrink-0 font-mono text-sm ${r.gapPsf >= 0 ? "text-pass" : "text-kill"}`}>
                    {psf(r.gapPsf)}
                  </span>
                </div>
                {share != null ? <MtmBar share={share} className="mt-1.5" /> : null}
                <p className="mt-1 text-[11px] text-muted">
                  {psf(r.inPlacePsf)} in place · {psf(r.marketPsf)} market · {usd(r.gapAnnual)} / yr · {sf(r.sf)}
                </p>
              </li>
            );
          })}
        </ul>
        <div className="mt-3 hidden overflow-x-auto sm:block">
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
              {mtmRows.map((r) => {
                const share = mtmShare(r);
                return (
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
                      {share != null ? <MtmBar share={share} className="ml-auto mt-1 w-16" /> : null}
                    </td>
                    <td className="py-2 text-right font-mono text-muted">{usd(r.gapAnnual)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── Lease-up ──────────────────────────────────────────────────── */}
      {leaseUp.vacantSf > 0 ? (
        <section className="rounded-lg border border-line bg-surface p-4">
          <h2 className="text-sm font-semibold text-ink">Lease-up</h2>
          <p data-qa="lease-up-line" className="mt-1 text-sm text-muted">
            {leaseUpLine}
          </p>
        </section>
      ) : null}
    </div>
  );
}
