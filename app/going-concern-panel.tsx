import { compactUsd } from "@/lib/money";
import { Key, KeyItem, PanelHead, PanelNote, PanelRead, Tick, tileSpan } from "@/app/panel-parts";
import { goingConcernShortLine, splitSubject, type GoingConcernRead } from "@/lib/going-concern";

/**
 * An operating business on its real estate — the pure panel for
 * `lib/going-concern`, drawn by the deal page and the shared screen.
 * Nothing where the memorandum names no operating business and states no
 * EBITDA.
 *
 * Two pictures, each with its words beside it so nothing rides on colour:
 *
 *   - THE COVERAGE: the operator's EBITDAR against its rent, as a multiple
 *     of it (`gc-coverage`), with the 1.0x line where the earnings only just
 *     pay the rent (`gc-line`) — as stated, or the two stated rows divided,
 *     never from an EBITDA, which is after the rent.
 *   - THE SPLIT: the price as the memorandum allocates it between the real
 *     estate, the fixtures and the business (`gc-split`, a segment each),
 *     only as stated — the collateral's or the property's value where the
 *     price buys no property (`splitSubject`).
 *
 * Then a tile each for the market rent, the contracts, the beds, the payor
 * mix and the Phase I's finding, each as stated; the read's first sentence,
 * the rest folded; and the model's read (`goingConcernModelLine`,
 * `meta.goingConcern.read`), so the page, the workbook and the report say
 * the same thing.
 */

/** "$8.50M", "$410k" — the reader's own money. */
const money = (n: number): string => compactUsd(n, { millions: "auto" });
const times = (n: number) => `${n.toFixed(2)}x`;
const clamp = (n: number) => Math.max(0, Math.min(100, n));
const slug = (label: string) => label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const SPLIT: { key: "realEstate" | "ffe" | "business"; label: string; cls: string }[] = [
  { key: "realEstate", label: "Real estate", cls: "bg-brand/60" },
  { key: "ffe", label: "Fixtures and equipment", cls: "bg-ink/30" },
  { key: "business", label: "Business", cls: "bg-caution/60" },
];

export function GoingConcernPanel({ goingConcern, modelLine = "" }: { goingConcern: GoingConcernRead | null; modelLine?: string }) {
  if (!goingConcern) return null;
  const r = goingConcern;
  // A business sold with its real estate, or one whose sale the memorandum
  // does not settle, prices earnings as rent: the warning tone. So does a
  // lease its operator's earnings do not cover.
  const flagged = r.branch !== "operator_lease" || (r.coverage != null && r.coverage.times < 1);

  const scale = r.coverage ? Math.max(r.coverage.times, 1) * 1.25 : 0;
  const at = (n: number) => clamp((n / scale) * 100);

  const parts = r.allocation ? SPLIT.flatMap((p) => (r.allocation![p.key] != null ? [{ ...p, value: r.allocation![p.key]! }] : [])) : [];
  const whole = parts.reduce((a, p) => a + p.value, 0);

  const tiles: { key: string; label: string; value: string; sub: string }[] = [];
  if (r.marketRent) tiles.push({ key: "market-rent", label: "Market rent", value: r.marketRent, sub: "As stated" });
  for (const s of r.stated) tiles.push({ key: slug(s.label), label: s.label, value: s.value, sub: "As stated" });
  if (r.phaseI) tiles.push({ key: "phase-i", label: "The seller's Phase I", value: r.phaseI, sub: "Its finding, as the memorandum cites it" });

  return (
    <section
      aria-label="Operating business"
      data-qa="going-concern-panel"
      className={`mt-4 rounded-xl border border-l-4 px-4 py-3 ${flagged ? "border-caution/30 border-l-caution bg-caution/5" : "border-line border-l-brand bg-surface"}`}
    >
      <PanelHead title="Operating business" tone={flagged ? "text-caution" : "text-brand"}>
        <span className="text-sm font-semibold">{goingConcernShortLine(r)}</span>
      </PanelHead>

      {r.coverage && (
        <div className="mt-3 text-[11px]" data-qa="going-concern-coverage">
          <div className="relative h-3 rounded-full bg-faint" aria-hidden>
            <div
              className={`h-full rounded-full ${r.coverage.times < 1 ? "bg-kill/60" : "bg-pass/60"}`}
              data-bar="gc-coverage"
              style={{ width: `${at(r.coverage.times)}%` }}
            />
            <Tick at={`${at(1)}%`} bar="gc-line" />
          </div>
          <Key>
            <KeyItem>
              {r.coverage.from === "stated"
                ? `Rent covered ${times(r.coverage.times)}, as stated`
                : `${r.ebitda?.label ?? "EBITDAR"} over the ${r.rent != null ? `${money(r.rent)} ` : ""}rent: ${times(r.coverage.times)}`}
            </KeyItem>
            <KeyItem mark="tick" tone="bg-ink">1.00x, where the earnings only just pay the rent</KeyItem>
          </Key>
        </div>
      )}

      {parts.length > 0 && whole > 0 && (
        <div className="mt-3 text-[11px]" data-qa="going-concern-split">
          <div className="flex h-3 overflow-hidden rounded-full bg-faint" aria-hidden>
            {parts.map((p) => (
              <div key={p.key} className={`h-full ${p.cls}`} data-bar="gc-split" style={{ width: `${clamp((p.value / whole) * 100)}%` }} />
            ))}
          </div>
          <Key>
            {parts.map((p) => (
              <KeyItem key={p.key} mark="swatch" tone={p.cls}>{`${p.label} ${money(p.value)}`}</KeyItem>
            ))}
            <KeyItem>{`${splitSubject(r).replace(/^t/, "T")} as the memorandum splits it`}</KeyItem>
          </Key>
        </div>
      )}

      {tiles.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" data-qa="going-concern-tiles">
          {tiles.map((t) => (
            <li key={t.key} className={`rounded-lg border border-line bg-surface px-2.5 py-2 text-ink ${tileSpan(t.value)}`} data-gc={t.key}>
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
