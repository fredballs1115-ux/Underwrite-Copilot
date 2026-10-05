import { abatementEndLabel, abatementEnded, type TaxAbatementRead } from "@/lib/tax-abatement";

/**
 * A property-tax abatement (#461) — the pure panel for `lib/tax-abatement`,
 * drawn by the deal page and the shared screen under what is being sold.
 * Nothing where the memorandum states no abatement.
 *
 * Three pictures, each with its words beside it so nothing rides on
 * colour:
 *
 *   - THE CLOCK: the years still abated from today, the years on the full
 *     bill after them, and the model's sale as a line where the page has
 *     the model.
 *   - THE BILL: the tax paid today against the full bill, on one scale.
 *   - THE NOI: the in-place NOI with the step-up's share of it marked —
 *     what goes to taxes when the abatement ends.
 *
 * The sentences are the reader's own (`sentences`) and the model's read
 * (`taxAbatementModelLine`, `meta.taxAbatement.read`), so the page, the
 * workbook and the report say the same thing.
 */

const pctOf = (part: number, whole: number) => `${Math.max(0, Math.min(100, (part / whole) * 100))}%`;
const dollars = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const years1 = (n: number) => `${(Math.round(n * 10) / 10).toFixed(1)} ${Math.round(n * 10) === 10 ? "year" : "years"}`;

export function TaxAbatementPanel({
  abatement,
  holdYears = null,
  modelLine = "",
}: {
  abatement: TaxAbatementRead | null;
  /** the model's hold in years, where the page has the model */
  holdYears?: number | null;
  /** the derived model's read of the abatement (`meta.taxAbatement.read`) */
  modelLine?: string;
}) {
  if (!abatement) return null;
  const r = abatement;
  // Ended and inside the hold by the DAY (lib/tax-abatement
  // `abatementEnded`): inside its last month the whole months count none,
  // and the chip had said "Already ended" four weeks early.
  const ended = r.end ? abatementEnded(r.end) : null;
  const left = r.end && !ended ? r.end.yearsLeft : null;
  // The panel's own years ("1.0 year"); inside the last month, where the
  // whole months count none, "under a month".
  const leftWords = r.end && !ended ? (Math.round(r.end.yearsLeft * 12) < 1 ? "under a month" : years1(r.end.yearsLeft)) : null;
  const chip = !r.end
    ? { text: "No end stated", tone: "border-caution/40 text-caution" }
    : ended
      ? { text: "Already ended", tone: "border-caution/40 text-caution" }
      : holdYears != null && r.end.yearsToTheDay < holdYears
        ? { text: "Ends inside the model's hold", tone: "border-caution/40 text-caution" }
        : holdYears != null
          ? { text: "Ends after the model's sale", tone: "border-line text-muted" }
          : null;
  // The clock runs a year past whichever comes later, the end or the sale.
  const span = left != null ? Math.max(left, holdYears ?? 0) + 1 : null;

  return (
    <section
      aria-label="Tax abatement"
      data-qa="tax-abatement-panel"
      className="mt-4 rounded-xl border border-l-4 border-caution/30 border-l-caution bg-caution/5 px-4 py-3"
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-caution">Tax abatement</span>
        {leftWords != null && <span className="text-sm font-semibold">{`${leftWords.charAt(0).toUpperCase()}${leftWords.slice(1)} left`}</span>}
        {chip && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${chip.tone}`}>{chip.text}</span>}
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </p>
      {/* When it ends leads; what it is worth is one click away and whole in
          the HTML, since the pictures below draw it. */}
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

      {left != null && span != null && r.end && (
        <div className="mt-2.5" data-qa="tax-abatement-clock">
          <div className="flex items-baseline justify-between gap-x-3 text-[11px]">
            <span className="font-medium text-ink">The clock</span>
            <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted">{`Ends ${abatementEndLabel(r.end)}`}</span>
          </div>
          <div className="relative mt-0.5 flex h-3 rounded-full bg-faint" aria-hidden>
            <div className="h-full rounded-l-full bg-brand/70" data-bar="abate-left" style={{ width: pctOf(left, span) }} />
            <div className="h-full rounded-r-full bg-caution/40" data-bar="abate-after" style={{ width: pctOf(span - left, span) }} />
            {holdYears != null && (
              <div className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" data-bar="abate-sale" style={{ left: pctOf(holdYears, span) }} />
            )}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2 w-3 shrink-0 rounded-sm bg-brand/70" />
              {`Abated, ${leftWords} from today`}
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2 w-3 shrink-0 rounded-sm bg-caution/40" />
              The full bill after
            </li>
            {holdYears != null && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-0.5 shrink-0 bg-ink" />
                {`The model's sale, year ${Math.round(holdYears)}`}
              </li>
            )}
          </ul>
        </div>
      )}

      {r.abatedTaxes != null && r.unabatedTaxes != null && r.unabatedTaxes > r.abatedTaxes && (
        <div className="mt-3 space-y-1.5 text-[11px]" data-qa="tax-abatement-bill">
          <p className="font-medium text-ink">The tax bill a year</p>
          {[
            { key: "abate-now", label: "Paid today", value: r.abatedTaxes, tone: "bg-brand/70" },
            { key: "abate-full", label: "Full bill", value: r.unabatedTaxes, tone: "bg-caution/70" },
          ].map((b) => (
            <div key={b.key} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-x-2">
              <span className="text-muted">{b.label}</span>
              <div className="h-2 rounded-full bg-faint" aria-hidden>
                <div className={`h-full rounded-full ${b.tone}`} data-bar={b.key} style={{ width: pctOf(b.value, r.unabatedTaxes!) }} />
              </div>
              <span className="whitespace-nowrap font-mono tabular-nums text-ink">{dollars(b.value)}</span>
            </div>
          ))}
        </div>
      )}

      {r.stepUp != null && r.noi != null && r.stepUp < r.noi && (
        <div className="mt-3 text-[11px]" data-qa="tax-abatement-noi">
          <div className="flex items-baseline justify-between gap-x-3">
            <span className="font-medium text-ink">The in-place NOI</span>
            <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted">{dollars(r.noi)}</span>
          </div>
          <div className="mt-0.5 flex h-3 overflow-hidden rounded-full bg-faint" aria-hidden>
            <div className="h-full bg-brand/40" data-bar="abate-noi" style={{ width: pctOf(r.noi - r.stepUp, r.noi) }} />
            <div className="h-full bg-caution/70" data-bar="abate-step" style={{ width: pctOf(r.stepUp, r.noi) }} />
          </div>
          <p className="mt-1 flex items-center gap-1.5 text-muted">
            <span aria-hidden className="inline-block h-2 w-3 shrink-0 rounded-sm bg-caution/70" />
            {`${Math.round(r.stepUpPctOfNoi!)}% goes to taxes when it ends: ${dollars(r.stepUp)} a year`}
          </p>
        </div>
      )}

      {modelLine && <p className="mt-2 text-xs leading-relaxed text-muted">{modelLine}</p>}
    </section>
  );
}
