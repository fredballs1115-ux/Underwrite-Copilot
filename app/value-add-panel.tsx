import type { ValueAddRead } from "@/lib/value-add";
import { BarRow, BarRows, Key, KeyItem, PanelNote, PanelRead, Tick } from "@/app/panel-parts";

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
// The panel's figures are a premium a month: the one priced on and the one
// achieved are the memorandum's own terms, and the break-even beside them is
// to the cent as the model's line says it ("$68.75") — never written short.
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
      <PanelRead sentences={r.sentences} />

      {r.doors != null && total != null && (
        // One program, said one way: the doors in all, the doors done and
        // the doors to go — the read above renovates the doors to go, "the
        // 192 doors still to do", where a bar headed "248 in the program"
        // had sat beside "renovates 192 doors".
        <div className="mt-2.5" data-qa="value-add-doors">
          <div className="flex items-baseline justify-between gap-x-3 text-[11px]">
            <span className="font-medium text-ink">The doors</span>
            <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted">{`${total.toLocaleString("en-US")} in all`}</span>
          </div>
          <div className="mt-0.5 flex h-3 overflow-hidden rounded-full bg-faint" aria-hidden>
            {r.renovated != null && r.renovated > 0 && (
              <div className="h-full bg-brand/80" data-bar="va-done" style={{ width: pctOf(r.renovated, total) }} />
            )}
            <div className="h-full bg-brand/30" data-bar="va-left" style={{ width: pctOf(r.doors, total) }} />
          </div>
          <Key>
            {r.renovated != null && r.renovated > 0 && (
              <KeyItem mark="swatch" tone="bg-brand/80">{`${r.renovated.toLocaleString("en-US")} done`}</KeyItem>
            )}
            <KeyItem mark="swatch" tone="bg-brand/30">{`${r.doors.toLocaleString("en-US")} to go`}</KeyItem>
          </Key>
        </div>
      )}

      {r.premium != null && (
        <BarRows className="mt-3 space-y-1.5 text-[11px]" qa="value-add-premium">
          <p className="font-medium text-ink">The premium a month</p>
          {[
            { key: "va-premium", label: "Priced on", value: r.premium, tone: "bg-brand/70" },
            ...(r.achievedPremium != null ? [{ key: "va-achieved", label: "Achieved", value: r.achievedPremium, tone: "bg-pass/70" }] : []),
          ].map((b) => (
            <BarRow key={b.key} label={b.label} figure={dollars(b.value)}>
              <div className={`h-full rounded-full ${b.tone}`} data-bar={b.key} style={{ width: pctOf(b.value, scale) }} />
              {breakEven != null && <Tick at={pctOf(breakEven, scale)} bar="va-breakeven" track="secondary" />}
            </BarRow>
          ))}
          {breakEven != null && (
            <Key className="">
              <KeyItem mark="tick" tone="bg-ink">
                {`The line is the premium that breaks even at the model's ${(exitCapPct! * 100).toFixed(2)}% exit cap, ${dollars(breakEven)}`}
              </KeyItem>
            </Key>
          )}
        </BarRows>
      )}

      {r.turnoverNeededPct != null && (
        <BarRows className="mt-3 space-y-1.5 text-[11px]" qa="value-add-pace">
          <p className="font-medium text-ink">The pace: classic units turning a year</p>
          {[
            { key: "va-needed", label: `For ${r.programMonths} months`, value: r.turnoverNeededPct, tone: "bg-caution/70" },
            ...(r.turnoverPct != null ? [{ key: "va-turnover", label: "The building", value: r.turnoverPct, tone: "bg-brand/70" }] : []),
          ].map((b) => (
            <BarRow key={b.key} label={b.label} figure={`${Math.round(b.value)}%`}>
              <div className={`h-full rounded-full ${b.tone}`} data-bar={b.key} style={{ width: pctOf(b.value, 100) }} />
            </BarRow>
          ))}
        </BarRows>
      )}

      {modelLine && <PanelNote>{modelLine}</PanelNote>}
    </section>
  );
}
