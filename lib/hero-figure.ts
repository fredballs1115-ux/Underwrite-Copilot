import { occupancyPctFromMetrics, occupancyRow, priceRange, priceRangeShort, yearBuiltRow } from "@/lib/criteria";

/**
 * One of the deal header's figure tiles (app/(app)/deals/[id]/deal-hero.tsx
 * `DealHero`). Pure and import-light, so a surface that draws the header
 * away from the deal page — the homepage's and /demo's sample
 * (lib/sample-header) — builds its figures through the same reader.
 */
export interface HeroFigure {
  label: string;
  value: string | null;
  /** a figure, set in the mono face; a word like the deal type is not */
  figure?: boolean;
  /** hover text — the deal type's one-line summary, or a price range as
   *  the memorandum states it */
  title?: string;
}

/**
 * The price slot's figure. A price the memorandum states as a range (#466)
 * is drawn the way the pipeline draws it — "$9–9.5M", `priceRangeShort` —
 * with the range as stated in its title: a tile holds one figure on one
 * line, and "$9,000,000 – $9,500,000" ran 192px in a phone's 121px tile,
 * cut to "$9,000,000 – $9". A single figure, or words, stay as stated. The
 * header and the bar that keeps the deal in view both draw this one figure,
 * so the two say the price word for word.
 */
export function priceFigureOf(label: string, stated: string | null): HeroFigure {
  const range = stated ? priceRange(stated) : null;
  return range && stated
    ? { label, value: priceRangeShort(range), title: `As stated: ${stated.trim()}`, figure: true }
    : { label, value: stated, figure: true };
}

/** What the header's facts line needs to know of the deal beyond its rows:
 *  the year the screen read the memorandum (lib/criteria `screenYearOf`),
 *  and whether the building is yet to be delivered (lib/deal-strategy
 *  `notYetDelivered`: a development, or a conversion whose new use comes
 *  with the works) — such a building has no year built. */
const LEASED = /\bleased\b/i;
const OCCUPIED = /occupan|occupied/i;

export interface BuildingFactsOf {
  screenYear: number;
  notYetDelivered: boolean;
}

/**
 * The building's own facts the header states under its tiles, each only
 * where the memorandum states it: the year built (lib/criteria
 * `yearBuiltRow`, the rent rules' reader; none on a building yet to be
 * delivered) and today's occupancy
 * (`occupancyPctFromMetrics`, the reader the workbook's in-place occupancy
 * and the retrade diff take — never a stabilized or pro forma figure), each
 * with the row as stated in its title. A deal that states neither has none.
 *
 * The header calls its figure today's occupancy, so it reads it off fewer
 * rows than the shared reader: never a row the extraction tagged the
 * sponsor's (`basis: "pro_forma"`), whatever its label says, and never a
 * "Leased" row — a lease signed is not a tenant in occupancy ("100% leased,
 * incl. 3 not yet in occupancy"). Whether the workbook's in-place cell
 * should read the same way is the owner's call; the shared reader is
 * unchanged.
 */
export function buildingFacts(
  metrics: readonly { label: string; value: string; basis?: string }[] | null | undefined,
  of: BuildingFactsOf,
): HeroFigure[] {
  const rows = (metrics ?? []).filter((m) => !!m && typeof m.label === "string" && typeof m.value === "string");
  const out: HeroFigure[] = [];
  const built = of.notYetDelivered ? null : yearBuiltRow(rows, of.screenYear);
  if (built) out.push({ label: "Year built", value: String(built.year), figure: true, title: `As stated: ${built.row.value.trim()}` });
  const today = rows.filter((m) => m.basis !== "pro_forma" && !(LEASED.test(m.label) && !OCCUPIED.test(m.label)));
  const occ = occupancyPctFromMetrics(today);
  const occRow = occupancyRow(today);
  if (occ != null && occRow) {
    out.push({ label: "Occupancy", value: `${Number(occ.toFixed(1))}%`, figure: true, title: `As stated: ${occRow.label.trim()}, ${occRow.value.trim()}` });
  }
  return out;
}
