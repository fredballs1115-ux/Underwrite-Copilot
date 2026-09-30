import metrosSeed from "@/data/research/metros.json";
import { assetClassKey } from "@/lib/asset-words";

/**
 * The research tracker's read for a deal's kind of building in its metro —
 * the sector snapshot each covered market carries (`data/research/metros.json`,
 * the blocks the market brief's "By asset type" panel and the vacancy board
 * draw): the sector's vacancy as a band, the cap range where the tracker
 * has one, the day the research sweep read them, and each figure's own
 * provenance.
 *
 * Pure. This is research — a house's print, not a feed that moves every
 * weekday — so each figure is said with its own period, the area it covers
 * and the house that published it, as the block's note and source list
 * state them (`vacancy_read`, `rent_read` and `cap_read`, each figure's
 * apart). The snapshot's day is the day it was read, never the figures'
 * date; a figure whose period the file does not state is undated; and a
 * figure is credited only to a link the file ties to it, never to the
 * block's first link — a Chicago cap that is Essex Realty's April average
 * was once credited to JPMorgan, the vacancy's source, and dated the day it
 * was read. A band is a band (a spread is never averaged into a printed
 * number), a figure the tracker does not carry is null, and a sector no
 * tracker covers (a hotel, a clinic, storage, land) reads none rather than
 * the nearest neighbour's.
 */
export type TrackerSector = "office" | "industrial" | "retail" | "multifamily";

/**
 * One tracker figure's own provenance, as its block's note and source list
 * state it. A field the file leaves out is null — never filled with the
 * market's name, the snapshot's day or the block's first link.
 */
export interface FigureRead {
  /** the research house(s) as the note names them — "Colliers (21.3%) and
   *  CBRE (22.2%)" — or null where it names none */
  house: string | null;
  /** the area the figure covers as the note states it — "the District",
   *  "Suburban Maryland (Montgomery and Prince George's together, not a
   *  county split)" — or null where the file says no more than its market */
  area: string | null;
  /** the period the figure describes — "Q2 2026", "year-end 2025" — or null:
   *  undated */
  period: string | null;
  /** the figure's own links — only the block's sources the file ties to it;
   *  empty where it ties none */
  links: string[];
  /** what kind of figure it is where the file says — a cap's "a transaction
   *  average, not a quoted band", a rent's "average gross asking" or "NNN
   *  asking" — or null */
  construct: string | null;
  /** a stock narrower than the sector the figure is for — a cap's "Class A
   *  stabilized core", a rent's "Class A space" — or null; such a cap is
   *  shown and named, never held to an exit */
  slice: string | null;
}

export interface TrackerRead {
  sector: TrackerSector;
  /** "office", "industrial", "retail", "apartment" — the sector as a sentence names it */
  sectorLabel: string;
  vacancyLow: number | null;
  vacancyHigh: number | null;
  capLow: number | null;
  capHigh: number | null;
  /** ISO day the research sweep read the metro's snapshot, or null where the
   *  entry states none — the day read, never the figures' own date */
  asOf: string | null;
  /** the vacancy figure's own provenance, or null with no vacancy figure */
  vacancy: FigureRead | null;
  /** the cap figure's own provenance, or null with no cap figure */
  cap: FigureRead | null;
}

const SECTOR_LABEL: Record<TrackerSector, string> = {
  office: "office",
  industrial: "industrial",
  retail: "retail",
  multifamily: "apartment",
};

/**
 * Buildings a sector's tracker does not describe, though lib/asset-words
 * files them under its class: a lab or life-science building (filed as
 * office) is a market of its own, with its own vacancy and caps; an
 * outdoor-storage yard (filed as industrial) trades by the usable acre, not
 * as a warehouse — the plausibility check's yard test reads the same words
 * (lib/deal-strategy); and a cold-storage or refrigerated warehouse (filed
 * as industrial) is a specialty building the warehouse market's figures do
 * not speak to. Each reads no tracker rather than its neighbour's.
 */
const OWN_MARKET: readonly RegExp[] = [
  /\b(life[- ]?sciences?|labs?|laborator(?:y|ies))\b/i,
  /\b(industrial outdoor storage|outdoor storage|ios|truck (?:terminal|yard)|storage yard)\b/i,
  /\b(cold[- ]storage|refrigerated|freezer)\b/i,
];

/** Whether any of the deal's own words name a building no tracker here describes. */
function ownMarket(words: readonly (string | null | undefined)[]): boolean {
  return words.some((w) => typeof w === "string" && OWN_MARKET.some((re) => re.test(w)));
}

/**
 * Which tracker sector a class reads: an office building the office
 * tracker, a warehouse the industrial one, a store the retail one, an
 * apartment building the multifamily one. A medical office is its own
 * market and not the office tracker's; a net lease's tenant may be a store
 * or a depot; single-family rentals, student and senior housing, storage,
 * hotels, data centres, parking and land have no tracker here; and a lab,
 * an outdoor-storage yard or a cold-storage warehouse, named so in the
 * class or in the deck's own class words (`deckWords`, the extraction's
 * phrase, read where the analyst filed a plain class), reads none either —
 * null, so nothing is read against a neighbour's figure.
 */
export function trackerSectorFor(assetClass: string | null | undefined, deckWords?: string | null): TrackerSector | null {
  if (ownMarket([assetClass, deckWords])) return null;
  switch (assetClassKey(assetClass)) {
    case "office":
      return "office";
    case "industrial":
      return "industrial";
    case "retail":
      return "retail";
    case "multifamily":
      return "multifamily";
    default:
      return null;
  }
}

type SnapBlock = {
  vacancy_pct?: number | null;
  vacancy_pct_low?: number | null;
  vacancy_pct_high?: number | null;
  cap_rate_low_pct?: number | null;
  cap_rate_high_pct?: number | null;
  sources?: string[];
  vacancy_read?: unknown;
  rent_read?: unknown;
  cap_read?: unknown;
};

const num =(v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const words = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/**
 * A figure's provenance out of its block (`vacancy_read` / `rent_read` /
 * `cap_read`). A link counts only where it is one of the block's own
 * sources; a block that carries no read gives a figure with nothing named —
 * undated, no house, no link — rather than borrowing the block's first
 * source.
 */
export function figureRead(raw: unknown, sources: readonly string[] | undefined): FigureRead {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const own = new Set(sources ?? []);
  const links = Array.isArray(r.links) ? r.links.filter((l): l is string => typeof l === "string" && own.has(l)) : [];
  return {
    house: words(r.house),
    area: words(r.area),
    period: words(r.period),
    links,
    construct: words(r.construct),
    slice: words(r.slice),
  };
}

/**
 * "Colliers, Suburban Maryland (Montgomery and Prince George's together, not
 * a county split), Q1 2026" — who published a figure, for what area and
 * when, as the file states each, and "undated" where it states no period.
 * A field the file leaves out is left out of the words.
 */
export function figureCitation(read: Pick<FigureRead, "house" | "area" | "period">): string {
  return [read.house, read.area, read.period ?? "undated"].filter((x): x is string => !!x).join(", ");
}

/**
 * The citation with what the file says the figure is, for a line that
 * carries no sentence around it (a benchmark row): "Essex Realty, Chicago,
 * April 2026; a transaction average of 175 sales, not a quoted band; for
 * the small-building stock, mostly the Class B/C neighborhood buildings
 * that drive Chicago volume".
 */
export function figureNote(read: FigureRead): string {
  return [figureCitation(read), read.construct, read.slice ? `for ${read.slice}` : null]
    .filter((x): x is string => !!x)
    .join("; ");
}

/** The tracker's read for a metro and a class — null where either has none,
 *  or where the class or the deck's own class words (`deckWords`) name a
 *  building the tracker does not describe. */
export function trackerFor(
  metroId: string | null | undefined,
  assetClass: string | null | undefined,
  deckWords?: string | null,
): TrackerRead | null {
  const sector = trackerSectorFor(assetClass, deckWords);
  if (!sector || !metroId) return null;
  const metro = (metrosSeed.metros ?? []).find((m) => m.id === metroId) as
    | { sector_snapshot?: Record<string, unknown> | null }
    | undefined;
  const snap = metro?.sector_snapshot;
  const block = snap?.[sector] as SnapBlock | undefined;
  if (!block || typeof block !== "object") return null;
  const point = num(block.vacancy_pct);
  const vacancyLow = point ?? num(block.vacancy_pct_low);
  const vacancyHigh = point ?? num(block.vacancy_pct_high) ?? vacancyLow;
  const capLow = num(block.cap_rate_low_pct);
  const capHigh = num(block.cap_rate_high_pct) ?? capLow;
  if (vacancyLow === null && capLow === null) return null;
  const asOf = typeof snap?.as_of === "string" && snap.as_of.trim() ? snap.as_of : null;
  return {
    sector,
    sectorLabel: SECTOR_LABEL[sector],
    vacancyLow,
    vacancyHigh,
    capLow,
    capHigh,
    asOf,
    vacancy: vacancyLow === null ? null : figureRead(block.vacancy_read, block.sources),
    cap: capLow === null ? null : figureRead(block.cap_read, block.sources),
  };
}

/** "21.3–22.2%" or "7.4%" — a band printed as a band. */
export function bandText(low: number, high: number | null, dp = 1): string {
  return high === null || Math.abs(high - low) < 0.005 ? `${low.toFixed(dp)}%` : `${low.toFixed(dp)}–${high.toFixed(dp)}%`;
}
