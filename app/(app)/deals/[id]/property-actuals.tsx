import type { NoiComparison, T12Summary } from "@/lib/actuals/types";
import { t12Bar } from "@/lib/actuals/t12-bar";
import { StackBar } from "./stack-bar";
import { rentQuotedMonthly } from "@/lib/asset-words";
import {
  OM_NOI_LABEL,
  SEVERITY_WORD,
  actualsUsd,
  actualsWalt,
  avgRentOf,
  rentRollDateWords,
  statedDay,
  t12DateWords,
  t12DeductionText,
  t12SignsNote,
  type ActualsRead,
} from "@/lib/actuals/actuals-read";

// The card, the report's actuals page and the memo's line read one reader
// (lib/actuals/actuals-read): its day, its dollar figure and its rent.
export { statedDay };

const SEV: Record<NoiComparison["severity"], { label: string; cls: string }> = {
  // A 5% tint, since the chip sits on the faint comparison box: at 10%
  // the 10px label read 4.37:1 (pass) and 4.39:1 (caution), at 5% 4.67:1
  // and 4.69:1. Kill reads 4.85:1 at 10% and keeps it.
  // Inside the band is what the chip measures, said neutrally, never a
  // green pass: the stress test beside it may read the same gap stretched
  // where the return moves on it (lib/actuals/actuals-read `SEVERITY_WORD`).
  in_line: { label: SEVERITY_WORD.in_line, cls: "bg-surface text-ink" },
  material: { label: "Material", cls: "bg-caution/5 text-caution" },
  red_flag: { label: "Red flag", cls: "bg-kill/10 text-kill" },
};

const usd = actualsUsd;
const pct = (dec: number | null | undefined): string =>
  dec == null || !Number.isFinite(dec) ? "—" : `${(dec * 100).toFixed(1)}%`;

/** The card's data: lib/actuals/actuals-read's `readActuals`, the note and
 *  the class optional for a caller that builds it by hand. */
export type ActualsData = Omit<ActualsRead, "noiNote" | "assetClass"> & {
  noiNote?: string | null;
  assetClass?: string | null;
};

/** Where the card's figures come from: the deal's own documents, named by
 *  which of the two it holds. */
export function actualsSourceLine(hasRentRoll: boolean, hasT12: boolean): string {
  if (hasRentRoll && hasT12) return "From the deal's rent roll and T-12";
  return hasRentRoll ? "From the deal's rent roll" : "From the deal's T-12";
}

/** The OM figure's name on the card, by what it is. */
const OM_LABEL = OM_NOI_LABEL;

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
  // An average over fewer units than are occupied says so.
  const { text: avgRent, basis: rentBasis } = rr ? avgRentOf(rr, data.assetClass) : { text: "—", basis: null };
  const walt = rr ? actualsWalt(rr, data.assetClass) : null;

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Property actuals</h2>
        {/* The deal's documents, named by what is here: never "you
            uploaded", which is untrue on the sample deal and on a teammate's
            documents, nor both documents where one was given (research pass
            32). */}
        <p className="text-xs text-muted">{actualsSourceLine(!!rentRoll, !!t12)}</p>
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
              {/* The report's and the memo's own words (lib/actuals
                  `rentRollDateWords`): a roll that stated no as-of says the
                  screen date it was measured from, or that it is undated —
                  never undated silently (audit C8, L2). */}
              <span className="text-[11px] text-muted">{rentRollDateWords(rentRoll)}</span>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Stat k="Occupancy" v={pct(rr.sfWeightedOccupancy)} />
              {/* By the rent-roll page's rule: an apartment roll is read for
                  loss to lease, never by its WALT (lib/actuals `actualsWalt`). */}
              <Stat k="WALT" v={walt?.text ?? "—"} sub={walt?.note ?? null} />
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
              {/* "period not stated" where the T-12 states none, as the
                  report says it (lib/actuals `t12DateWords`). */}
              <span className="text-[11px] text-muted">{t12DateWords(t12)}</span>
            </div>
            <T12IncomeBar st={st} />
            <table className="mt-3 w-full text-sm">
              <tbody>
                <Line k="Collected rent" v={usd(st.collectedRent)} />
                {st.vacancyLoss != null && <Line k="Vacancy / credit loss" v={t12DeductionText(st.vacancyLoss)} />}
                {st.otherIncome != null && <Line k="Other income" v={usd(st.otherIncome)} />}
                <Line k="Effective gross income" v={usd(st.egi)} strong />
                {st.opex.map((l, i) => (
                  <Line key={`${l.key}-${i}`} k={l.label} v={t12DeductionText(l.amount, { asStated: st.opexSignsMixed })} indent />
                ))}
                <Line k="Total operating expenses" v={t12DeductionText(st.totalOpex)} strong />
                <Line
                  k={st.noiDerived ? "Net operating income (derived)" : "Net operating income"}
                  v={usd(st.noi)}
                  strong
                />
              </tbody>
            </table>
            {t12SignsNote(st) && (
              <p className="mt-2 text-[11px] text-muted" data-qa="t12-signs-mixed">
                {t12SignsNote(st)}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

// The expense lines' fills, in turn: two tones of the caution colour and two
// of ink, so neighbouring lines stay apart; the key names every line.
const EXPENSE_TONES = ["bg-caution/70", "bg-ink/40", "bg-caution/40", "bg-ink/20"] as const;

/**
 * The statement as one bar, above its table: the effective gross income, each
 * operating expense line a segment, the NOI what is left (lib/actuals
 * `t12Bar`). Nothing where the statement's figures do not tie.
 */
export function T12IncomeBar({ st }: { st: T12Summary }) {
  const bar = t12Bar(st);
  if (!bar) return null;
  return (
    <StackBar
      qa="t12-bar"
      scale={bar.egi}
      parts={[
        ...bar.expenses.map((l, i) => ({
          bar: "t12-expense",
          tone: EXPENSE_TONES[i % EXPENSE_TONES.length],
          label: `${l.label} ${usd(l.amount)}`,
          value: l.amount,
        })),
        {
          bar: "t12-noi",
          tone: "bg-brand/70",
          label: `${bar.noiDerived ? "Net operating income (derived)" : "Net operating income"} ${usd(bar.noi)}`,
          value: bar.noi,
        },
      ]}
      note={`The whole bar is the ${usd(bar.egi)} effective gross income; the expenses take ${usd(bar.totalOpex)} of it.`}
    />
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
