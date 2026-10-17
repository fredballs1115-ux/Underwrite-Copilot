import { compactUsd } from "@/lib/money";
import { LeaseTermBar } from "@/app/lease-term-bar";
import { Key, KeyItem, PanelHead, PanelNote, PanelRead, tileSpan } from "@/app/panel-parts";
import { endIsAhead, endsByYear, termEndLabel } from "@/lib/ground-lease-term";
import type { SandwichRead } from "@/lib/sandwich-lease";

/**
 * A sandwich position — the pure panel for `lib/sandwich-lease`, drawn by
 * the deal page (with the model's hold and its read) and the shared screen
 * (without). Nothing on anything but a master lease of the building, sublet
 * to its tenants, whose memorandum states one of its rents or the master
 * lease's end.
 *
 * Two pictures, each with its words beside it so nothing rides on colour:
 *
 *   - THE SPREAD: the sublease income as the track, the master rent its
 *     first part (`sandwich-master`) and the spread — the position's income
 *     before its own costs — filled after it (`sandwich-spread`). Where the
 *     subleases bring in less than the master rent, the master rent is the
 *     track, the subleases fill it (`sandwich-sublease`) and the shortfall
 *     the position pays is in the warning tone (`sandwich-shortfall`). Only
 *     where both rents are stated.
 *   - THE TERM: the master lease's years left through `LeaseTermBar`, its
 *     options dashed after them and, where the page has the model, the
 *     model's hold — the position ends with the lease, and no building and
 *     no land come back to the buyer.
 *
 * Then a tile for the cover (`data-sandwich`), the read's first sentence,
 * the rest folded, and the model's read (`sandwichModelLine`,
 * `meta.sandwich.read`), so the page, the workbook and the report say the
 * same thing.
 */

/** "$1.82M", "$720k" — the reader's own money. */
const money = (n: number): string => compactUsd(n, { millions: "auto" });
const times = (n: number) => `${(Math.round(n * 100) / 100).toFixed(2)}×`;
const pctOf = (part: number, whole: number) => `${Math.max(0, Math.min(100, (part / whole) * 100))}%`;

export function SandwichPanel({
  sandwich,
  holdYears = null,
  modelLine = "",
}: {
  sandwich: SandwichRead | null;
  /** the model's hold in years, where the page has the model: drawn on the
   *  master lease's term */
  holdYears?: number | null;
  modelLine?: string;
}) {
  if (!sandwich) return null;
  const r = sandwich;
  const bothRents = r.masterRent != null && r.subleaseIncome != null && r.spread != null;
  const under = bothRents && r.spread! <= 0;
  // Subleases that do not cover the master rent, or a master lease that
  // ends inside the model's hold, warn: the position pays the difference,
  // or the sale the model prices cannot happen.
  const endsInHold = !!r.term && holdYears != null && holdYears > 0 && endIsAhead(r.term) && endsByYear(r.term, holdYears);
  const flagged = under || endsInHold;
  const headline = bothRents
    ? r.spread! > 0
      ? `Spread ${money(r.spread!)} a year${r.coverage != null ? `, ${times(r.coverage)} cover` : ""}`
      : r.spread === 0
        ? "The subleases bring in exactly the master rent"
        : `The subleases bring in ${money(-r.spread!)} a year less than the master rent`
    : r.masterRent != null
      ? `Master rent ${money(r.masterRent)} a year`
      : r.subleaseIncome != null
        ? `Subleases ${money(r.subleaseIncome)} a year`
        : "A master lease of the building, sublet";

  const tiles: { key: string; label: string; value: string; sub: string }[] = [];
  if (r.coverage != null) tiles.push({ key: "cover", label: "Cover", value: times(r.coverage), sub: "The sublease income over the master rent" });
  // The reader's own words for the cushion ("under 1%" below one, never a
  // rounded "0%"), the sentence's and the tile's alike.
  if (r.cushionText != null)
    tiles.push({ key: "cushion", label: "Cushion", value: r.cushionText.charAt(0).toUpperCase() + r.cushionText.slice(1), sub: "Of the sublease income lost before the spread is gone" });
  // A rent stated a month at a time is a year of twelve, said so as the
  // sentence beside it says (the pre-merge audit).
  const yearOf = (fromMonth: boolean | undefined) => (fromMonth ? "A year's: twelve times the month stated" : "A year's, as stated");
  if (!bothRents && r.masterRent != null) tiles.push({ key: "master-rent", label: "Master rent", value: money(r.masterRent), sub: yearOf(r.masterRentFromMonth) });
  if (!bothRents && r.subleaseIncome != null)
    tiles.push({ key: "sublease-income", label: "Sublease income", value: money(r.subleaseIncome), sub: yearOf(r.subleaseIncomeFromMonth) });

  const term = r.term && endIsAhead(r.term) ? r.term : null;

  return (
    <section
      aria-label="Sandwich position"
      data-qa="sandwich-panel"
      className={`mt-4 rounded-xl border border-l-4 px-4 py-3 ${flagged ? "border-caution/30 border-l-caution bg-caution/5" : "border-line border-l-brand bg-surface"}`}
    >
      <PanelHead title="Sandwich position" tone={flagged ? "text-caution" : "text-brand"}>
        <span className="text-sm font-semibold">{headline}</span>
      </PanelHead>

      {bothRents && r.masterRent! > 0 && r.subleaseIncome! > 0 && (
        <div className="mt-3 text-[11px]" data-qa="sandwich-spread">
          {under ? (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-faint" aria-hidden>
                <div className="h-full bg-brand/60" data-bar="sandwich-sublease" style={{ width: pctOf(r.subleaseIncome!, r.masterRent!) }} />
                {r.spread! < 0 && <div className="h-full bg-kill/60" data-bar="sandwich-shortfall" style={{ width: pctOf(-r.spread!, r.masterRent!) }} />}
              </div>
              <Key>
                <KeyItem mark="swatch" tone="bg-brand/60">{`Sublease income ${money(r.subleaseIncome!)} a year`}</KeyItem>
                {r.spread! < 0 && <KeyItem mark="swatch" tone="bg-kill/60">{`Shortfall ${money(-r.spread!)} a year, which the position pays`}</KeyItem>}
                <KeyItem>{`The whole bar: the ${money(r.masterRent!)} master rent, owed whatever the subtenants pay`}</KeyItem>
              </Key>
            </>
          ) : (
            <>
              <div className="flex h-3 overflow-hidden rounded-full bg-faint" aria-hidden>
                <div className="h-full bg-ink/25" data-bar="sandwich-master" style={{ width: pctOf(r.masterRent!, r.subleaseIncome!) }} />
                <div className="h-full bg-brand/60" data-bar="sandwich-spread" style={{ width: pctOf(r.spread!, r.subleaseIncome!) }} />
              </div>
              <Key>
                <KeyItem mark="swatch" tone="bg-ink/25">{`Master rent ${money(r.masterRent!)}, owed whatever the subtenants pay`}</KeyItem>
                <KeyItem mark="swatch" tone="bg-brand/60">{`Spread ${money(r.spread!)}, the position's income before its own costs`}</KeyItem>
                <KeyItem>{`The whole bar: the subleases' ${money(r.subleaseIncome!)} a year`}</KeyItem>
              </Key>
            </>
          )}
        </div>
      )}

      {/* The master lease's term against the model's hold, where the page has
          the model. Without it the bar would be the interest panel's own,
          drawn just above — the shared screen drew the same bar twice. */}
      {term && holdYears != null && holdYears > 0 && (
        <div className="mt-3" data-qa="sandwich-term">
          <LeaseTermBar
            yearsLeft={term.yearsLeft}
            endLabel={termEndLabel(term)}
            optionYears={term.options?.years ?? null}
            holdYears={holdYears}
            ceiling={term.includesOptions}
          />
        </div>
      )}

      {tiles.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" data-qa="sandwich-tiles">
          {tiles.map((t) => (
            <li key={t.key} className={`rounded-lg border border-line bg-surface px-2.5 py-2 text-ink ${tileSpan(t.value)}`} data-sandwich={t.key}>
              <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-80">{t.label}</span>
              <span className="block text-sm font-semibold leading-tight">{t.value}</span>
              <span className="block text-[11px] leading-snug text-muted">{t.sub}</span>
            </li>
          ))}
        </ul>
      )}

      <PanelRead sentences={r.sentences} className="mt-2" />
      {modelLine && <PanelNote>{modelLine}</PanelNote>}
    </section>
  );
}
