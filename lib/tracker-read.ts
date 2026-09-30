import metrosSeed from "@/data/research/metros.json";
import { assetClassKey } from "@/lib/asset-words";

/**
 * The research tracker's read for a deal's kind of building in its metro —
 * the sector snapshot each covered market carries (`data/research/metros.json`,
 * the blocks the market brief's "By asset type" panel and the vacancy board
 * draw): the sector's vacancy as a band, the cap range where the tracker
 * has one, the day the snapshot was taken and the house it was read from.
 *
 * Pure. This is dated, sourced research — a tracker's quarterly print, not
 * a feed that moves every weekday — so it is said with its date and its
 * source, never as "the market": a band is a band (a spread is never
 * averaged into a printed number), a figure the tracker does not carry is
 * null, and a sector no tracker covers (a hotel, a clinic, storage, land)
 * reads none rather than the nearest neighbour's.
 */
export type TrackerSector = "office" | "industrial" | "retail" | "multifamily";

export interface TrackerRead {
  sector: TrackerSector;
  /** "office", "industrial", "retail", "apartment" — the sector as a sentence names it */
  sectorLabel: string;
  vacancyLow: number | null;
  vacancyHigh: number | null;
  capLow: number | null;
  capHigh: number | null;
  /** ISO day the metro's snapshot was taken, or null where the entry states none */
  asOf: string | null;
  /** the first source's host ("colliers.com"), or null */
  source: string | null;
  sourceUrl: string | null;
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
};

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
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
  const asOf = typeof snap?.as_of === "string" ? snap.as_of : null;
  const sourceUrl = block.sources?.[0] ?? null;
  return {
    sector,
    sectorLabel: SECTOR_LABEL[sector],
    vacancyLow,
    vacancyHigh,
    capLow,
    capHigh,
    asOf,
    source: hostOf(sourceUrl ?? undefined),
    sourceUrl,
  };
}

/** "21.3–22.2%" or "7.4%" — a band printed as a band. */
export function bandText(low: number, high: number | null, dp = 1): string {
  return high === null || Math.abs(high - low) < 0.005 ? `${low.toFixed(dp)}%` : `${low.toFixed(dp)}–${high.toFixed(dp)}%`;
}
