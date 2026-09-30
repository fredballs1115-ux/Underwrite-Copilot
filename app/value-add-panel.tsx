import type { ValueAddRead } from "@/lib/value-add";

/**
 * A value-add renovation program (#460) — the pure panel for
 * `lib/value-add`, drawn by the deal page under what is being sold and by
 * the shared screen under its own. Nothing where the memorandum states no
 * program.
 *
 * Three pictures, each with its words beside it so nothing rides on
 * colour:
 *
 *   - THE DOORS: one bar of the program, the doors already renovated
 *     filled and the doors still to do left light.
 *   - THE PREMIUM: the premium the program is priced on and the one
 *     renovated units already earn, on one scale, with the premium that
 *     breaks even at the model's exit cap as a tick where the page has the
 *     model.
 *   - THE PACE: the share of the classic units that must turn each year to
 *     finish in the stated period, against the building's own turnover.
 *
 * The sentences are the reader's own (`headline`) and the model's read
 * (`valueAddModelLine`, `meta.valueAdd.read`), so the page, the workbook
 * and the report say the same thing.
 */

const pctOf = (part: number, whole: number) => `${Math.max(0, Math.min(100, (part / whole) * 100))}%`;
const dollars = (n: number) => (Number.isInteger(Math.round(n * 100) / 100) ? `$${Math.round(n).toLocaleString("en-US")}` : `$${n.toFixed(2)}`);

export function ValueAddPanel({
  program,
  exitCapPct = null,
  modelLine = "",
}: {
  program: ValueAddRead | null;
  /** the model's exit cap (a decimal), where the page has the model */
  exitCapPct?: number | null;
  /** the derived model's read of the program (`meta.valueAdd.read`) */
  modelLine?: string;
}) {
  if (!program) return null;
  const r = program;
  const breakEven = r.costPerDoor != null && exitCapPct != null && exitCapPct > 0 ? (r.costPerDoor * exitCapPct) / 12 : null;
  const premiums = [r.premium, r.achievedPremium, breakEven].filter((n): n is number => n != null);
  const scale = premiums.length ? Math.max(...premiums) * 1.15 : 1;
  const total = r.doors != null ? r.doors + (r.renovated ?? 0) : null;

  return (
    <section
      aria-label="Value-add program"
      data-qa="value-add-panel"
      className="mt-4 rounded-xl border border-l-4 border-brand/30 border-l-brand bg-brand/5 px-4 py-3"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">Value-add program</span>
        {r.returnOnCostPct != null && <span className="text-sm font-semibold">{`${Math.round(r.returnOnCostPct)}% on cost`}</span>}
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${
            r.achievedPremium != null ? "border-pass/40 text-pass" : "border-caution/40 text-caution"
          }`}
        >
          {r.achievedPremium != null ? "Premium proven on renovated units" : "Premium not yet proven"}
        </span>
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </p>
      {/* The program and its return lead; the premium's proof and the pace
          are one click away and whole in the HTML, since the pictures below
          draw them. */}
      <p className="mt-1 text-sm leading-relaxed">{r.sentences[0]}</p>
      {r.sentences.length > 1 && (
        <details className="group mt-1 text-sm leading-relaxed">
          <summary className="cursor-pointer text-xs font-semibold text-brand hover:underline">
            <span className="group-open:hidden">{`Read the rest (${r.sentences.length - 1} more)`}</span>
            <span className="hidden group-open:inline">Less</span>
          </summary>
          <p className="mt-1">{r.sentences.slice(1).join(" ")}</p>
        </details>
      )}

      {r.doors != null && total != null && (
        <div className="mt-2.5" data-qa="value-add-doors">
          <div className="flex items-baseline justify-between gap-x-3 text-[11px]">
            <span className="font-medium text-ink">The doors</span>
            <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted">{`${total.toLocaleString("en-US")} in the program`}</span>
          </div>
          <div className="mt-0.5 flex h-3 overflow-hidden rounded-full bg-faint" aria-hidden>
            {r.renovated != null && r.renovated > 0 && (
              <div className="h-full bg-brand/80" data-bar="va-done" style={{ width: pctOf(r.renovated, total) }} />
            )}
            <div className="h-full bg-brand/30" data-bar="va-left" style={{ width: pctOf(r.doors, total) }} />
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
            {r.renovated != null && r.renovated > 0 && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2 w-3 shrink-0 rounded-sm bg-brand/80" />
                {`${r.renovated.toLocaleString("en-US")} renovated`}
              </li>
            )}
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2 w-3 shrink-0 rounded-sm bg-brand/30" />
              {`${r.doors.toLocaleString("en-US")} to renovate`}
            </li>
          </ul>
        </div>
      )}

      {r.premium != null && (
        <div className="mt-3 space-y-1.5 text-[11px]" data-qa="value-add-premium">
          <p className="font-medium text-ink">The premium a month</p>
          {[
            { key: "va-premium", label: "Priced on", value: r.premium, tone: "bg-brand/70" },
            ...(r.achievedPremium != null ? [{ key: "va-achieved", label: "Achieved", value: r.achievedPremium, tone: "bg-pass/70" }] : []),
          ].map((b) => (
            <div key={b.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-x-2">
              <span className="text-muted">{b.label}</span>
              <div className="relative h-2 rounded-full bg-faint" aria-hidden>
                <div className={`h-full rounded-full ${b.tone}`} data-bar={b.key} style={{ width: pctOf(b.value, scale) }} />
                {breakEven != null && (
                  <div className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink" data-bar="va-breakeven" style={{ left: pctOf(breakEven, scale) }} />
                )}
              </div>
              <span className="whitespace-nowrap font-mono tabular-nums text-ink">{dollars(b.value)}</span>
            </div>
          ))}
          {breakEven != null && (
            <p className="text-muted">
              <span aria-hidden className="mr-1.5 inline-block h-2 w-0.5 bg-ink align-middle" />
              {`The line is the premium that breaks even at the model's ${(exitCapPct! * 100).toFixed(2)}% exit cap, ${dollars(breakEven)}`}
            </p>
          )}
        </div>
      )}

      {r.turnoverNeededPct != null && (
        <div className="mt-3 space-y-1.5 text-[11px]" data-qa="value-add-pace">
          <p className="font-medium text-ink">The pace: classic units turning a year</p>
          {[
            { key: "va-needed", label: `For ${r.programMonths} months`, value: r.turnoverNeededPct, tone: "bg-caution/70" },
            ...(r.turnoverPct != null ? [{ key: "va-turnover", label: "The building", value: r.turnoverPct, tone: "bg-brand/70" }] : []),
          ].map((b) => (
            <div key={b.key} className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-x-2">
              <span className="text-muted">{b.label}</span>
              <div className="h-2 rounded-full bg-faint" aria-hidden>
                <div className={`h-full rounded-full ${b.tone}`} data-bar={b.key} style={{ width: pctOf(b.value, 100) }} />
              </div>
              <span className="whitespace-nowrap font-mono tabular-nums text-ink">{`${Math.round(b.value)}%`}</span>
            </div>
          ))}
        </div>
      )}

      {modelLine && <p className="mt-2 text-xs leading-relaxed text-muted">{modelLine}</p>}
    </section>
  );
}
