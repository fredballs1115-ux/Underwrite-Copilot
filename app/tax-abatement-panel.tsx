import { compactUsd } from "@/lib/money";
import { abatementEndLabel, abatementEnded, type TaxAbatementRead } from "@/lib/tax-abatement";
import { Key, KeyItem, PanelHead, PanelNote, PanelRead, Tick } from "@/app/panel-parts";

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
 *   - THE BILL: the full bill as the track, the tax paid today and the
 *     step-up filling it — or, where the memorandum's three figures do not
 *     add, the sentence that says so instead of a picture.
 *   - THE NOI: the in-place NOI with the step-up's share of it marked —
 *     what goes to taxes when the abatement ends.
 *
 * The sentences are the reader's own (`sentences`) and the model's read
 * (`taxAbatementModelLine`, `meta.taxAbatement.read`), so the page, the
 * workbook and the report say the same thing.
 */

const pctOf = (part: number, whole: number) => `${Math.max(0, Math.min(100, (part / whole) * 100))}%`;
// Every figure the panel draws — the bills on their bars, the NOI over its
// bar, the step-up in its key — in one compact writer: the NOI's bar had read
// "$3,000,000" beside the model's "$8.18M" (research pass 36). Millions as
// the model's line writes them.
const money = (n: number) => compactUsd(n, { millions: 2, trim: true });
// The two bills are the memorandum's own terms, which a reader checks
// against it, so they are drawn to the dollar, and the step-up is their
// difference to the dollar, so the three figures drawn add (audit C3a:
// "$521k" less "$70k" had been drawn as a "$450k" step-up).
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
// Within a dollar, the stated savings is the bills' difference.
const ties = (a: number, b: number) => Math.abs(a - b) <= 1;
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
  // The bill: the full bill, the part paid today and the step-up, three
  // figures that add — or, where the memorandum also states its savings
  // and they are not the bills' difference, three that do not.
  const bill =
    r.abatedTaxes != null && r.unabatedTaxes != null && r.unabatedTaxes > r.abatedTaxes
      ? {
          full: r.unabatedTaxes,
          paid: r.abatedTaxes,
          up: r.unabatedTaxes - r.abatedTaxes,
          savings: r.savings,
          adds: r.savings == null || ties(r.savings, r.unabatedTaxes - r.abatedTaxes),
        }
      : null;
  // One figure for the step-up on the panel: to the dollar where the bills
  // state it, compact where only the savings does.
  const stepUpText = (n: number) => (bill ? usd(n) : money(n));

  return (
    <section
      aria-label="Tax abatement"
      data-qa="tax-abatement-panel"
      className="mt-4 rounded-xl border border-l-4 border-caution/30 border-l-caution bg-caution/5 px-4 py-3"
    >
      <PanelHead title="Tax abatement" tone="text-caution">
        {leftWords != null && <span className="text-sm font-semibold">{`${leftWords.charAt(0).toUpperCase()}${leftWords.slice(1)} left`}</span>}
        {chip && <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${chip.tone}`}>{chip.text}</span>}
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </PanelHead>
      {/* When it ends leads; what it is worth is one click away and whole in
          the HTML, since the pictures below draw it. */}
      <PanelRead sentences={r.sentences} />

      {left != null && span != null && r.end && (
        <div className="mt-2.5" data-qa="tax-abatement-clock">
          <div className="flex items-baseline justify-between gap-x-3 text-[11px]">
            <span className="font-medium text-ink">The clock</span>
            <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted">{`Ends ${abatementEndLabel(r.end)}`}</span>
          </div>
          <div className="relative mt-0.5 flex h-3 rounded-full bg-faint" aria-hidden>
            <div className="h-full rounded-l-full bg-brand/70" data-bar="abate-left" style={{ width: pctOf(left, span) }} />
            <div className="h-full rounded-r-full bg-caution/40" data-bar="abate-after" style={{ width: pctOf(span - left, span) }} />
            {holdYears != null && <Tick at={pctOf(holdYears, span)} bar="abate-sale" />}
          </div>
          <Key>
            <KeyItem mark="swatch" tone="bg-brand/70">{`Abated, ${leftWords} from today`}</KeyItem>
            <KeyItem mark="swatch" tone="bg-caution/40">The full bill after</KeyItem>
            {holdYears != null && <KeyItem mark="tick" tone="bg-ink">{`The model's sale, year ${Math.round(holdYears)}`}</KeyItem>}
          </Key>
        </div>
      )}

      {bill && bill.adds && (
        // The full bill is the track; the bill paid today and the step-up
        // fill it, so the parts drawn add to the whole they are drawn in.
        <div className="mt-3 text-[11px]" data-qa="tax-abatement-bill">
          <div className="flex items-baseline justify-between gap-x-3">
            <span className="font-medium text-ink">The tax bill a year</span>
            <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted">{`Full bill ${usd(bill.full)}`}</span>
          </div>
          <div className="mt-0.5 flex h-3 overflow-hidden rounded-full bg-faint" data-bar="abate-full" aria-hidden>
            <div className="h-full bg-brand/70" data-bar="abate-now" style={{ width: pctOf(bill.paid, bill.full) }} />
            <div className="h-full bg-caution/70" data-bar="abate-up" style={{ width: pctOf(bill.up, bill.full) }} />
          </div>
          <Key>
            <KeyItem mark="swatch" tone="bg-brand/70">{`Paid today, ${usd(bill.paid)}`}</KeyItem>
            <KeyItem mark="swatch" tone="bg-caution/70">{`The step-up when it ends, ${usd(bill.up)}`}</KeyItem>
          </Key>
        </div>
      )}
      {bill && !bill.adds && (
        // Three stated figures that do not add are said, never drawn as if
        // they did.
        <p className="mt-3 max-w-[68ch] text-[11px] text-caution" data-qa="tax-abatement-bill">
          {`The memorandum's tax figures do not add: the ${usd(bill.full)} full bill less the ${usd(bill.paid)} paid today is ${usd(bill.up)}, against the ${usd(bill.savings!)} a year of savings it states.`}
        </p>
      )}

      {r.stepUp != null && r.noi != null && r.stepUp < r.noi && (
        <div className="mt-3 text-[11px]" data-qa="tax-abatement-noi">
          <div className="flex items-baseline justify-between gap-x-3">
            <span className="font-medium text-ink">The in-place NOI</span>
            <span className="shrink-0 whitespace-nowrap font-mono tabular-nums text-muted">{money(r.noi)}</span>
          </div>
          <div className="mt-0.5 flex h-3 overflow-hidden rounded-full bg-faint" aria-hidden>
            <div className="h-full bg-brand/40" data-bar="abate-noi" style={{ width: pctOf(r.noi - r.stepUp, r.noi) }} />
            <div className="h-full bg-caution/70" data-bar="abate-step" style={{ width: pctOf(r.stepUp, r.noi) }} />
          </div>
          <Key className="mt-1">
            <KeyItem mark="swatch" tone="bg-caution/70">{`${Math.round(r.stepUpPctOfNoi!)}% goes to taxes when it ends: ${stepUpText(r.stepUp)} a year`}</KeyItem>
          </Key>
        </div>
      )}

      {modelLine && <PanelNote>{modelLine}</PanelNote>}
    </section>
  );
}
