import { compactUsd } from "@/lib/money";
import { Key, KeyItem, PanelNote, PanelRead, Tick, tileSpan } from "@/app/panel-parts";
import type { CondoRead } from "@/lib/condo";

/**
 * Condominium units bought in bulk — the pure panel for `lib/condo`, drawn
 * by the deal page and the shared screen. Nothing where the deal's own words
 * name no condominium or the memorandum states none of its figures. It
 * imports the reader's types alone: lib/condo reads the agency rules' table
 * (data/research/agency_rules.json), which no page's script may carry.
 *
 * One picture, with its words beside it so nothing rides on colour:
 *
 *   - THE SHARE: the units offered as a share of every unit the declaration
 *     governs (`condo-share`), with the lender's single-entity limit as a
 *     tick (`condo-limit`) only where the purchase is over it — said as the
 *     lender's rule, with its section, its version, the day it was read and
 *     the research's stale mark, never hidden.
 *
 * Then a tile each for a year of the block's dues (else a unit's, else the
 * row as stated), the special assessment and each row stated beside them
 * (`data-condo`); the read's first sentence, the rest folded; and the
 * model's read (`condoModelLine`, `meta.condo.read`), so the page, the
 * workbook and the report say the same thing.
 */

/** "$650", "$1,250", "$328k" — the reader's own money: a unit's dues to the
 *  dollar, a year of the block's in thousands. */
const money = (n: number): string => compactUsd(n, { millions: "auto", thousandsFrom: 1e4 });
const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const dayText = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export function CondoPanel({ condo, modelLine = "" }: { condo: CondoRead | null; modelLine?: string }) {
  if (!condo) return null;
  const r = condo;
  const limit = r.agencyLimit;
  // A purchase over the lender's limit on a single owner is the warning
  // tone: the retail exit waits on whether a buyer's lender may lend.
  const flagged = limit != null;
  const headline =
    r.unitsOffered != null && r.unitsInCondominium != null
      ? r.sharePct == null
        ? `${r.unitsOffered} units offered, ${r.unitsInCondominium} in the condominium, as stated`
        : r.unitsOffered === r.unitsInCondominium
          ? `All ${r.unitsInCondominium} units of the condominium`
          : `${r.unitsOffered} of ${r.unitsInCondominium} units, ${pct1(r.sharePct)} of the association`
      : r.unitsOffered != null
        ? `${r.unitsOffered} units in a condominium`
        : "Units in a condominium";

  const tiles: { key: string; label: string; value: string; sub: string }[] = [];
  if (r.annualDues != null && r.monthlyDues != null && r.unitsOffered != null)
    tiles.push({ key: "dues-year", label: "A year of dues", value: money(r.annualDues), sub: `${money(r.monthlyDues)} a unit a month on ${r.unitsOffered} units` });
  else if (r.monthlyDues != null) tiles.push({ key: "dues", label: "Dues", value: `${money(r.monthlyDues)} a unit a month`, sub: "As stated" });
  else if (r.duesStated) tiles.push({ key: "dues", label: "Dues", value: r.duesStated, sub: "As stated; no unit's month or year" });
  if (r.specialAssessment) tiles.push({ key: "special-assessment", label: "Special assessment", value: r.specialAssessment, sub: "A cost each unit carries" });
  for (const s of r.stated) tiles.push({ key: slug(s.label), label: s.label, value: s.value, sub: "As stated" });

  return (
    <section
      aria-label="Condominium units"
      data-qa="condo-panel"
      className={`mt-4 rounded-xl border border-l-4 px-4 py-3 ${flagged ? "border-caution/30 border-l-caution bg-caution/5" : "border-line border-l-brand bg-surface"}`}
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${flagged ? "text-caution" : "text-brand"}`}>Condominium</span>
        <span className="text-sm font-semibold">{headline}</span>
      </p>

      {r.sharePct != null && r.unitsOffered != null && r.unitsInCondominium != null && (
        <div className="mt-3 text-[11px]" data-qa="condo-share">
          <div className="relative h-3 rounded-full bg-faint" aria-hidden>
            <div className={`h-full rounded-full ${flagged ? "bg-caution/60" : "bg-brand/60"}`} data-bar="condo-share" style={{ width: `${clamp(r.sharePct)}%` }} />
            {limit && <Tick at={`${clamp(limit.pct)}%`} bar="condo-limit" />}
          </div>
          <Key stack>
            <KeyItem mark="swatch" tone={flagged ? "bg-caution/60" : "bg-brand/60"}>
              {`${r.unitsOffered} of the condominium's ${r.unitsInCondominium} units offered, ${pct1(r.sharePct)}`}
            </KeyItem>
            {limit && (
              <KeyItem mark="tick" tone="bg-ink">
                <span>
                  {`${limit.lender}'s single-entity limit, ${limit.pct}% of a project of ${limit.minUnits} or more units — the lender's rule, `}
                  <a href={limit.source} target="_blank" rel="noopener noreferrer" className="text-brand hover:underline">
                    {limit.section}
                  </a>
                  {`, its ${dayText(limit.version)} version, read ${dayText(limit.readOn)}${limit.stale ? `; ${limit.stale}` : ""}`}
                </span>
              </KeyItem>
            )}
          </Key>
        </div>
      )}

      {tiles.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" data-qa="condo-tiles">
          {tiles.map((t) => (
            <li key={t.key} className={`rounded-lg border border-line bg-surface px-2.5 py-2 text-ink ${tileSpan(t.value)}`} data-condo={t.key}>
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
