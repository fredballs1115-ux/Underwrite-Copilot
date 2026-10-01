import type { RentRollSummary, T12Summary, NoiComparison } from "@/lib/actuals/types";
import { assetWords, rentQuotedMonthly } from "@/lib/asset-words";

const SEV: Record<NoiComparison["severity"], { label: string; cls: string }> = {
  in_line: { label: "In line", cls: "bg-pass/10 text-pass" },
  material: { label: "Material", cls: "bg-caution/10 text-caution" },
  red_flag: { label: "Red flag", cls: "bg-kill/10 text-kill" },
};

const usd = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n < 0 ? "−" : "";
  const a = Math.abs(n);
  if (a >= 1e6) return `${sign}$${(a / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `${sign}$${Math.round(a / 1e3)}k`;
  return `${sign}$${Math.round(a)}`;
};
const pct = (dec: number | null | undefined): string =>
  dec == null || !Number.isFinite(dec) ? "—" : `${(dec * 100).toFixed(1)}%`;
const num = (n: number | null | undefined, digits = 1): string =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);

/** "May 31, 2026" — the way the rest of the deal page writes a day, read in
 *  UTC so the server's render and the browser's agree. A month alone is
 *  "May 2026" and a year alone the year: read as a day, "2026-05" had
 *  printed "May 1, 2026" and "2026" "Jan 1, 2026", a day nobody stated. A
 *  day that does not exist ("2026-02-30", which the parser rolls to Mar 2)
 *  and anything else is printed as it came. */
export function statedDay(iso: string): string {
  const m = iso.trim().match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(?:T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?)?$/);
  if (!m) return iso;
  const [, y, mo, d] = m;
  if (!mo) return y;
  const year = Number(y);
  const month = Number(mo);
  if (month < 1 || month > 12) return iso;
  if (!d) {
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  }
  const t = new Date(Date.UTC(year, month - 1, Number(d)));
  if (t.getUTCFullYear() !== year || t.getUTCMonth() !== month - 1 || t.getUTCDate() !== Number(d)) return iso;
  return t.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
const day = statedDay;

export interface ActualsData {
  rentRoll: { asOf: string | null; summary: RentRollSummary } | null;
  t12: { periodEnd: string | null; summary: T12Summary } | null;
  noiComparison: NoiComparison | null;
  /** On a plan deal: which OM figure the T-12 is held against and why the
   *  stabilized pro forma is not — or, when the OM states only the finished
   *  project's NOI, why there is no comparison at all. Null otherwise. */
  noiNote?: string | null;
  /** the deal's class as the page shows it (shownAssetClass): a roll of a
   *  class whose rent is quoted a month a unit is read that way */
  assetClass?: string | null;
}

/** The OM figure's name on the card, by what it is. */
const OM_LABEL: Record<NonNullable<NoiComparison["omBasis"]>, string> = {
  in_place: "OM in-place NOI",
  year1: "OM Year-1 NOI",
  stabilized: "OM pro forma NOI",
};

/**
 * PROPERTY ACTUALS (Feature 1): what the rent roll and T-12 actually say —
 * consolidated deterministically from the uploaded documents. The rent-roll
 * block shows occupancy, WALT, weighted rent and the lease-expiry ladder; the
 * T-12 block shows the actual operating statement against the OM's assumed NOI.
 * Absent entirely when neither document was provided.
 */
export function PropertyActuals({ data }: { data: ActualsData }) {
  const { rentRoll, t12, noiComparison, noiNote } = data;
  if (!rentRoll && !t12) return null;
  const rr = rentRoll?.summary;
  const st = t12?.summary;
  // An apartment's rent is quoted a month a unit — the memorandum's
  // "$2,400/mo", the reconciler's — never per foot a year, which is how an
  // office's is. A summary stored before the monthly figure was read keeps
  // its per-foot figure, said with its period.
  const monthly = rentQuotedMonthly(data.assetClass);
  // What one is called in this class: a pad, a bed, a home, a space.
  const noun = assetWords(data.assetClass).noun ?? { one: "unit", many: "units" };
  const avgRent =
    monthly && rr?.avgRentMonthly != null
      ? `$${Math.round(rr.avgRentMonthly).toLocaleString("en-US")}/${noun.one}/mo`
      : rr?.weightedAvgRentPsf != null
        ? `$${num(rr.weightedAvgRentPsf, 2)}/SF${monthly ? "/yr" : ""}`
        : "—";
  // An average over fewer units than are occupied says so.
  const rentBasis =
    monthly && rr?.avgRentMonthly != null && rr.rentUnits != null && rr.rentUnits < rr.occupiedUnits
      ? `over ${rr.rentUnits} of ${rr.occupiedUnits} occupied ${noun.many}`
      : null;

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Property actuals</h2>
        <p className="text-xs text-muted">From the rent roll and T-12 you uploaded</p>
      </div>

      {/* Headline: OM assumed NOI vs T-12 actual. */}
      {noiComparison && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-faint/60 p-3">
          <span className="text-xs text-muted" title={noiComparison.omLabel ?? undefined}>
            {noiComparison.omBasis ? OM_LABEL[noiComparison.omBasis] : "OM assumed NOI"}{" "}
            <span className="font-mono font-semibold text-ink">{usd(noiComparison.omNoi)}</span>
          </span>
          <span className="text-xs text-muted">
            T-12 actual NOI{" "}
            <span className="font-mono font-semibold text-ink">{usd(noiComparison.t12Noi)}</span>
          </span>
          <span className="ml-auto flex items-center gap-2">
            <span className="text-xs tabular-nums text-muted">
              Δ {noiComparison.direction === "below" ? "−" : ""}
              {pct(Math.abs(noiComparison.deltaPct))}
              {noiComparison.direction === "above" ? " (OM over actual)" : noiComparison.direction === "below" ? " (OM under actual)" : ""}
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${SEV[noiComparison.severity].cls}`}
            >
              {SEV[noiComparison.severity].label}
            </span>
          </span>
        </div>
      )}
      {/* A plan deal: which figure the T-12 is held against, and why the
          stabilized pro forma is not — or why nothing is compared at all. */}
      {noiNote && <p className="mt-2 text-[11px] leading-relaxed text-muted">{noiNote}</p>}

      <div className="mt-4 grid items-start gap-4 lg:grid-cols-2">
        {/* Rent roll */}
        {rr && (
          <div className="rounded-xl border border-line/70 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Rent roll
              </h3>
              {rentRoll?.asOf ? (
                <span className="text-[11px] text-muted">as of {day(rentRoll.asOf)}</span>
              ) : rr.asOfUsed ? (
                // The roll stated no as-of date — WALT/expiry were measured
                // from the screen date, and that basis must be visible.
                <span className="text-[11px] text-muted">
                  no stated as-of — measured at screen date {day(rr.asOfUsed)}
                </span>
              ) : null}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Stat k="Occupancy" v={pct(rr.sfWeightedOccupancy)} />
              <Stat k="WALT" v={rr.waltYears != null ? `${num(rr.waltYears)} yr` : "—"} />
              <Stat k="Avg rent" v={avgRent} sub={rentBasis} />
              <Stat k="Units" v={`${rr.occupiedUnits} / ${rr.unitCount}`} />
            </dl>
            {/* The ladder weighs each lease by its SF and buckets it in years
                to five-plus — a commercial roll's shape. An apartment roll is
                counted in units on leases of a year or so, so the ladder
                does not describe it, and it is left out. */}
            {rr.expiryBuckets && !monthly && (
              <div className="mt-3">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                  Lease expiry (% of occupied SF)
                </p>
                <div className="mt-1.5 space-y-1">
                  <ExpiryRow label="Next 12 mo" v={rr.expiryBuckets.next12mo} />
                  <ExpiryRow label="1–3 yr" v={rr.expiryBuckets.y1to3} />
                  <ExpiryRow label="3–5 yr" v={rr.expiryBuckets.y3to5} />
                  <ExpiryRow label="5 yr+" v={rr.expiryBuckets.y5plus} />
                </div>
              </div>
            )}
            {rr.truncated && (
              <p className="mt-2 text-[11px] text-caution">
                Large roll — analytics are based on the first {rr.unitCount} rows read.
              </p>
            )}
          </div>
        )}

        {/* T-12 operating statement */}
        {st && (
          <div className="rounded-xl border border-line/70 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                T-12 actual operating statement
              </h3>
              {t12?.periodEnd && (
                <span className="text-[11px] text-muted">TTM to {day(t12.periodEnd)}</span>
              )}
            </div>
            <table className="mt-3 w-full text-sm">
              <tbody>
                <Line k="Collected rent" v={usd(st.collectedRent)} />
                {st.vacancyLoss != null && <Line k="Vacancy / credit loss" v={`(${usd(st.vacancyLoss)})`} />}
                {st.otherIncome != null && <Line k="Other income" v={usd(st.otherIncome)} />}
                <Line k="Effective gross income" v={usd(st.egi)} strong />
                {st.opex.map((l, i) => (
                  <Line key={`${l.key}-${i}`} k={l.label} v={`(${usd(l.amount)})`} indent />
                ))}
                <Line k="Total operating expenses" v={`(${usd(st.totalOpex)})`} strong />
                <Line
                  k={st.noiDerived ? "Net operating income (derived)" : "Net operating income"}
                  v={usd(st.noi)}
                  strong
                />
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}

function Stat({ k, v, sub = null }: { k: string; v: string; sub?: string | null }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{k}</dt>
      <dd className="font-mono text-sm font-semibold tabular-nums">{v}</dd>
      {sub && <dd className="text-[10px] text-muted">{sub}</dd>}
    </div>
  );
}

function ExpiryRow({ label, v }: { label: string; v: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[11px] text-muted">{label}</span>
      <span className="relative h-2 flex-1 overflow-hidden rounded-full bg-line">
        <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${Math.round(v * 100)}%` }} />
      </span>
      <span className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums">{pct(v)}</span>
    </div>
  );
}

function Line({ k, v, strong, indent }: { k: string; v: string; strong?: boolean; indent?: boolean }) {
  return (
    <tr className={strong ? "border-t border-line" : ""}>
      <td className={`py-1 ${indent ? "pl-3 text-muted" : ""} ${strong ? "font-semibold" : ""}`}>{k}</td>
      <td className={`py-1 text-right font-mono tabular-nums ${strong ? "font-semibold" : ""}`}>{v}</td>
    </tr>
  );
}
