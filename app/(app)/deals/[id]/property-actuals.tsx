import type { RentRollSummary, T12Summary, NoiComparison } from "@/lib/actuals/types";

const SEV: Record<NoiComparison["severity"], { label: string; cls: string }> = {
  in_line: { label: "In line", cls: "bg-pass/10 text-pass" },
  material: { label: "Material", cls: "bg-caution/10 text-caution" },
  red_flag: { label: "Red flag", cls: "bg-kill/10 text-kill" },
};

const usd = (n: number | null | undefined): string => {
  if (n == null || !Number.isFinite(n)) return "—";
  const a = Math.abs(n);
  if (a >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (a >= 1e3) return `$${Math.round(n / 1e3)}k`;
  return `$${Math.round(n)}`;
};
const pct = (dec: number | null | undefined): string =>
  dec == null || !Number.isFinite(dec) ? "—" : `${(dec * 100).toFixed(1)}%`;
const num = (n: number | null | undefined, digits = 1): string =>
  n == null || !Number.isFinite(n) ? "—" : n.toFixed(digits);

export interface ActualsData {
  rentRoll: { asOf: string | null; summary: RentRollSummary } | null;
  t12: { periodEnd: string | null; summary: T12Summary } | null;
  noiComparison: NoiComparison | null;
}

/**
 * PROPERTY ACTUALS (Feature 1): what the rent roll and T-12 actually say —
 * consolidated deterministically from the uploaded documents. The rent-roll
 * block shows occupancy, WALT, weighted rent and the lease-expiry ladder; the
 * T-12 block shows the actual operating statement against the OM's assumed NOI.
 * Absent entirely when neither document was provided.
 */
export function PropertyActuals({ data }: { data: ActualsData }) {
  const { rentRoll, t12, noiComparison } = data;
  if (!rentRoll && !t12) return null;
  const rr = rentRoll?.summary;
  const st = t12?.summary;

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Property actuals</h2>
        <p className="text-xs text-muted">From the rent roll and T-12 you uploaded</p>
      </div>

      {/* Headline: OM assumed NOI vs T-12 actual. */}
      {noiComparison && (
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border border-line bg-faint/60 p-3">
          <span className="text-xs text-muted">
            OM assumed NOI{" "}
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

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {/* Rent roll */}
        {rr && (
          <div className="rounded-xl border border-line/70 p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                Rent roll
              </h3>
              {rentRoll?.asOf && (
                <span className="text-[11px] text-muted">as of {rentRoll.asOf}</span>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Stat k="Occupancy" v={pct(rr.sfWeightedOccupancy)} />
              <Stat k="WALT" v={rr.waltYears != null ? `${num(rr.waltYears)} yr` : "—"} />
              <Stat k="Avg rent" v={rr.weightedAvgRentPsf != null ? `$${num(rr.weightedAvgRentPsf, 2)}/SF` : "—"} />
              <Stat k="Units" v={`${rr.occupiedUnits} / ${rr.unitCount}`} />
            </dl>
            {rr.expiryBuckets && (
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
                <span className="text-[11px] text-muted">TTM to {t12.periodEnd}</span>
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

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="text-[11px] text-muted">{k}</dt>
      <dd className="font-mono text-sm font-semibold tabular-nums">{v}</dd>
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
