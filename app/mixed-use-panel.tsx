import { compactUsd } from "@/lib/money";
import type { MixedUseRead } from "@/lib/mixed-use";

/**
 * A mixed-use building's two incomes — the pure panel for `lib/mixed-use`,
 * drawn by the deal page and the shared screen. Nothing on anything else.
 *
 * Two pictures, each with its words beside it so nothing rides on colour:
 *
 *   - THE INCOME: the residential and the commercial income as stated, on
 *     one bar (`mu-income`, a segment each) — only where both halves are
 *     stated, since a share is never read off one.
 *   - THE AREA: the commercial space's share of the building's area
 *     (`mu-area`), only where both areas are stated and can be one
 *     building's.
 *
 * Then a tile each for what is stated beside them — a half with no other
 * half to set it against, the commercial occupancy, the shops' roll; the
 * read's first sentence, the rest folded; and the model's read
 * (`mixedUseModelLine`, `meta.mixedUse.read`), so the page, the workbook and
 * the report say the same thing.
 */

/** "$1.52M", "$610k" — the reader's own money. */
const money = (n: number): string => compactUsd(n, { millions: "auto" });
const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;
const sfText = (n: number) => `${Math.round(n).toLocaleString("en-US")} SF`;
const clamp = (n: number) => Math.max(0, Math.min(100, n));

export function MixedUsePanel({ mixedUse, modelLine = "" }: { mixedUse: MixedUseRead | null; modelLine?: string }) {
  if (!mixedUse) return null;
  const r = mixedUse;
  const headline =
    r.commercialIncomeSharePct != null
      ? `${pct1(r.commercialIncomeSharePct)} of the income is commercial`
      : r.commercialAreaSharePct != null
        ? `${pct1(r.commercialAreaSharePct)} of the area is commercial`
        : r.commercialIncome != null
          ? `${money(r.commercialIncome)} of commercial income`
          : "Commercial space";

  const income =
    r.residentialIncome != null && r.commercialIncome != null && r.commercialIncomeSharePct != null
      ? { residential: r.residentialIncome, commercial: r.commercialIncome, share: r.commercialIncomeSharePct }
      : null;
  const area =
    r.commercialSf != null && r.buildingSf != null && r.commercialAreaSharePct != null
      ? { commercial: r.commercialSf, building: r.buildingSf, share: r.commercialAreaSharePct }
      : null;

  const tiles: { key: string; label: string; value: string; sub: string }[] = [];
  if (!income && r.commercialIncome != null) tiles.push({ key: "commercial-income", label: "Commercial income", value: money(r.commercialIncome), sub: "A year's, as stated" });
  if (!income && r.residentialIncome != null) tiles.push({ key: "residential-income", label: "Residential income", value: money(r.residentialIncome), sub: "A year's, as stated" });
  if (!area && r.commercialSf != null) tiles.push({ key: "commercial-sf", label: "Commercial space", value: sfText(r.commercialSf), sub: "As stated" });
  if (r.commercialOccupancyPct != null) tiles.push({ key: "occupancy", label: "Commercial occupancy", value: pct1(r.commercialOccupancyPct), sub: "As stated" });
  if (r.roll) tiles.push({ key: "roll", label: "The commercial leases", value: r.roll, sub: "From the tenant list" });

  return (
    <section aria-label="Mixed-use income" data-qa="mixed-use-panel" className="mt-4 rounded-xl border border-l-4 border-line border-l-brand bg-surface px-4 py-3">
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-brand">Mixed-use</span>
        <span className="text-sm font-semibold">{headline}</span>
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </p>

      {income && (
        <div className="mt-3 text-[11px]" data-qa="mixed-use-income">
          <div className="flex h-3 overflow-hidden rounded-full bg-faint" aria-hidden>
            <div className="h-full bg-brand/60" data-bar="mu-income" style={{ width: `${clamp(100 - income.share)}%` }} />
            <div className="h-full bg-caution/60" data-bar="mu-income" style={{ width: `${clamp(income.share)}%` }} />
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-brand/60" />
              {`Residential ${money(income.residential)}`}
            </li>
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 shrink-0 rounded-sm bg-caution/60" />
              {`Commercial ${money(income.commercial)}, ${pct1(income.share)} of the income`}
            </li>
          </ul>
        </div>
      )}

      {area && (
        <div className="mt-3 text-[11px]" data-qa="mixed-use-area">
          <div className="relative h-2.5 rounded-full bg-faint" aria-hidden>
            <div className="h-full rounded-full bg-caution/60" data-bar="mu-area" style={{ width: `${clamp(area.share)}%` }} />
          </div>
          <p className="mt-1.5 text-muted">{`Commercial ${sfText(area.commercial)} of the building's ${sfText(area.building)}, ${pct1(area.share)} of its area`}</p>
        </div>
      )}

      {tiles.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" data-qa="mixed-use-tiles">
          {tiles.map((t) => (
            <li key={t.key} className="rounded-lg border border-line bg-surface px-2.5 py-2 text-ink" data-mu={t.key}>
              <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-80">{t.label}</span>
              <span className="block text-sm font-semibold leading-tight">{t.value}</span>
              <span className="block text-[11px] leading-snug text-muted">{t.sub}</span>
            </li>
          ))}
        </ul>
      )}

      {r.sentences.length > 0 && <p className="mt-2 text-sm leading-relaxed">{r.sentences[0]}</p>}
      {r.sentences.length > 1 && (
        <details className="group mt-1 text-sm leading-relaxed">
          <summary className="cursor-pointer text-xs font-semibold text-brand hover:underline">
            <span className="group-open:hidden">{`Read the rest (${r.sentences.length - 1} more)`}</span>
            <span className="hidden group-open:inline">Less</span>
          </summary>
          <p className="mt-1">{r.sentences.slice(1).join(" ")}</p>
        </details>
      )}
      {modelLine && <p className="mt-2 text-xs leading-relaxed text-muted">{modelLine}</p>}
    </section>
  );
}
