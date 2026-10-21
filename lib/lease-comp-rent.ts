// One reader for the rent a lease comp's one-line detail states (2026-10-21,
// the owner's market-rent row), in the style of lib/comp-detail: pure and
// LLM-free, and it reads only what the text says. A rent a month a unit —
// "$2,520/mo", "$2,520 per month", "$2,520/unit/mo", "$2,520 a unit a month",
// "$2,520 monthly" — or a rent a square foot a year — "$38.00/SF/yr", "$38
// per SF per year", "$38.00 PSF annual", "$38.00/SF NNN" — or a month a foot,
// "$3.10/SF/mo", carried to the year (×12) and said so. A bare "$38.00/SF"
// with no period is a year's rent only where the caller's class quotes its
// rent a foot a year (`bareSfIsYear`): an apartment's "$2.75/SF" is a month's.
// A bare dollar figure, a rent a unit a year, a nightly rate, a range, or a
// price ("$252k/unit") reads as nothing.

export interface StatedRent {
  /** dollars a month a unit (a door, a key, a bed, a pad, a home) — null
   *  where the line states none */
  perUnitMonthly: number | null;
  /** dollars a square foot a year — null where the line states none */
  perSfYear: number | null;
  /** the per-foot figure was stated a month and carried to the year */
  sfFromMonth: boolean;
}

const MONEY = String.raw`\$\s?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(?![\d,]*\s*[kKmM]\b)`;
const UNIT_WORD = String.raw`(?:unit|door|key|bed|room|pad|site|lot|apartment|apt\.?|home|space|suite)s?`;
const SF_WORD = String.raw`(?:(?:n?r|g|n)?sf|s\.f\.|sq\.?\s*ft\.?|square\s+f(?:oo|ee)t|f(?:oo|ee)t|ft)`;
const PER = String.raw`\s*(?:/|per|an?|each)\s*`;
const MONTH = String.raw`(?:mo(?:nth)?s?|mth)\b`;
const YEAR = String.raw`(?:yr|year|annum|annual(?:ly)?)\b`;

// "$2,520/mo", "$2,520 per month", "$2,520/unit/mo", "$2,520 a unit a month",
// "$2,520 monthly".
const UNIT_MONTH = new RegExp(String.raw`${MONEY}(?:${PER}${UNIT_WORD})?(?:${PER}${MONTH}|\s+monthly\b)`, "i");
// "$38.00/SF/yr", "$38 per SF per year", "$38.00 PSF annual".
const SF_YEAR = new RegExp(String.raw`${MONEY}\s*(?:(?:/|per|an?)\s*${SF_WORD}|p\.?s\.?f\.?)(?:${PER}|\s+)${YEAR}`, "i");
// "$3.10/SF/mo", "$3.10 per SF per month", "$3.10 PSF monthly".
const SF_MONTH = new RegExp(String.raw`${MONEY}\s*(?:(?:/|per|an?)\s*${SF_WORD}|p\.?s\.?f\.?)(?:${PER}${MONTH}|\s+monthly\b)`, "i");
// "$38.00/SF", "$38.00 PSF" with no period after it.
const SF_BARE = new RegExp(String.raw`${MONEY}\s*(?:(?:/|per|an?)\s*${SF_WORD}|p\.?s\.?f\.?)\b(?!${PER}(?:${MONTH}|${YEAR}|day|night|week))(?!\s+(?:monthly|annual))`, "i");
// A range is no one rent: "$2,400–$2,600/mo", "$2,400 to 2,600".
const RANGE = /\$\s?[\d,]+(?:\.\d+)?\s*(?:-|–|—|to)\s*\$?\s?[\d,]+(?:\.\d+)?/i;

/**
 * The least a month's rent a unit is read at, by what the class counts: a
 * dwelling's (a unit's, an apartment's, a home's) under $100 is a fee or a
 * foot's, never a unit's month; a parking space, a pad or a bed is rented by
 * its own count, and a month's rent for one is read as stated, held only to
 * the row's own yardstick ("$85/space/mo" is a space's rent).
 */
export function monthlyRentFloor(nounOne: string | null | undefined): number {
  return nounOne === "space" || nounOne === "pad" || nounOne === "bed" ? 0 : 100;
}

function money(m: RegExpMatchArray): number | null {
  const n = Number(`${m[1].replace(/,/g, "")}${m[2] ? `.${m[2]}` : ""}`);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** What one lease comp's detail line states as its rent. Nothing is inferred.
 *  `unitFloor` is the least a month's rent a unit is read at
 *  (`monthlyRentFloor`, a dwelling's $100 by default). */
export function statedRent(detail: string | null | undefined, opts: { bareSfIsYear?: boolean; unitFloor?: number } = {}): StatedRent {
  const text = (detail ?? "").trim();
  const none: StatedRent = { perUnitMonthly: null, perSfYear: null, sfFromMonth: false };
  if (!text || RANGE.test(text)) return none;
  const sfYear = text.match(SF_YEAR);
  const sfMonth = sfYear ? null : text.match(SF_MONTH);
  const sfBare = sfYear || sfMonth || !opts.bareSfIsYear ? null : text.match(SF_BARE);
  // A per-foot figure is never also read as a unit's month.
  const perSfMatch = sfYear ?? sfMonth ?? sfBare;
  const rest = perSfMatch ? text.replace(perSfMatch[0], " ") : text;
  const unitMonth = rest.match(UNIT_MONTH);
  const perSf = perSfMatch ? money(perSfMatch) : null;
  const perUnit = unitMonth ? money(unitMonth) : null;
  return {
    // A dwelling's month under $100 is a fee or a foot's, never a unit's
    // (`monthlyRentFloor`); a space's, a pad's or a bed's is read as stated.
    perUnitMonthly: perUnit != null && perUnit >= (opts.unitFloor ?? 100) ? perUnit : null,
    perSfYear: perSf != null ? (sfMonth ? Math.round(perSf * 12 * 100) / 100 : perSf) : null,
    sfFromMonth: sfMonth != null && perSf != null,
  };
}

/** The lease basis a rent a foot is quoted on, as a comp's line states it. */
export type LeaseBasis = "net" | "full service" | "modified gross" | "gross";

/**
 * The lease basis a comp's line states for its rent a foot: "net" (NNN, triple
 * net, NN, absolute net, a bare "net" that is no "net effective" rent), "full
 * service" (FS, FSG), "modified gross" (MG, industrial gross) or a bare
 * "gross". Null where the line states none — never inferred from the class
 * or the figure. A rent on one basis is not the same rent on another (a
 * gross rent carries the operating expenses a net one passes through), so a
 * median is struck only over comps on one stated basis.
 */
export function statedLeaseBasis(detail: string | null | undefined): LeaseBasis | null {
  const text = (detail ?? "").trim();
  if (!text) return null;
  if (/\bfull[- ]service\b|\bFSG?\b/.test(text) || /\bfull[- ]service\b/i.test(text)) return "full service";
  if (/\bmodified[- ]gross\b|\bindustrial[- ]gross\b/i.test(text) || /\bMG\b/.test(text)) return "modified gross";
  if (/\bN{2,3}\b/.test(text) || /\btriple[- ]net\b|\bdouble[- ]net\b|\babsolute[- ]net\b|\bnet\s+lease\b|\bnet\b(?![- ](?:effective|operating|income|rentable|of|cash|worth|present))/i.test(text)) return "net";
  if (/\bgross\b(?![- ](?:potential|income|revenue|leasable|area|rent\s+roll|sf|square))/i.test(text)) return "gross";
  return null;
}
