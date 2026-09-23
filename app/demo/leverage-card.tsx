import { datedLong, type Benchmark30, type DebtIndex } from "@/lib/debt-index";
import { capSpreadRead, leverageRead } from "@/lib/leverage";

/**
 * The sample screen's leverage check — the same lib/leverage code path
 * every real deal page runs, on the same benchmark read (lib/debt-index):
 * the week's 30-year survey off the rates table, dated and named, the
 * research layer's snapshot only where the table has nothing and named as
 * the snapshot, and the cap's spread over today's 10-year beside it — a
 * fact with a date, no verdict. Pure, so the render test draws it on a
 * fixture and checks the phrase the live-verify marker greps against the
 * markup a curl receives.
 */
export function SampleLeverageCard({
  capPct,
  bench30,
  tenYear,
}: {
  /** the sample's going-in cap, percent */
  capPct: number | null;
  bench30: Benchmark30 | null;
  tenYear: DebtIndex | null;
}) {
  const leverage = capPct != null && bench30 ? leverageRead(capPct, bench30.value) : null;
  if (!leverage || !bench30 || capPct == null) return null;
  const capSpread = tenYear ? capSpreadRead(capPct, tenYear.pct) : null;
  return (
    <div className="mt-4 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] uppercase tracking-wide text-muted">
          Leverage check — computed, not opined
        </p>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
            leverage.tone === "negative"
              ? "bg-kill/10 text-kill"
              : leverage.tone === "thin"
                ? "bg-caution/10 text-caution"
                : "bg-pass/10 text-pass"
          }`}
        >
          {leverage.tone === "negative"
            ? "negative leverage"
            : leverage.tone === "thin"
              ? "thin spread"
              : "positive at benchmark"}
        </span>
      </div>
      <p className="mt-2 text-sm leading-relaxed">
        {leverage.label} — going-in cap {capPct}% vs{" "}
        <span className="font-mono font-semibold tabular-nums">
          {bench30.value}%
        </span>{" "}
        30-yr fixed ({bench30.source}, as of {bench30.asOf}).
      </p>
      {capSpread && tenYear && (
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {`Against today's curve: the cap is ${capSpread.label} (${tenYear.pct.toFixed(2)}% on ${datedLong(tenYear.asOf)}, FRED).`}
        </p>
      )}
    </div>
  );
}
