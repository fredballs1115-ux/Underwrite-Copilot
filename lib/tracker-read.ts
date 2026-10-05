import metrosSeed from "@/data/research/metros.json";
import { assetClassKey } from "@/lib/asset-words";
import { researchAge, type ResearchAge } from "@/lib/research-age";

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
 *
 * The snapshot ages by the research rule (lib/research-age, `snapshotAge`,
 * `trackerAge`): past its limit from the day it was read, every surface
 * still shows its figures, with that day, its age and the stale mark, and
 * the model's read against the market holds nothing to them.
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
  /** a band that is ONE read — one house, one area, one period — which its
   *  publisher prints as a range (`"band": "printed"` in the file: Hampton
   *  Roads retail, "4.4–4.6%, carried as the printed band"). Any other band
   *  is two reads — two houses, two inventories or two periods — and the
   *  rankings never place it (lib/sector-leaderboard). */
  printedBand: boolean;
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
export type OwnMarketBuilding = "lab" | "yard" | "cold_storage";

const OWN_MARKET: readonly (readonly [OwnMarketBuilding, RegExp])[] = [
  ["lab", /\b(life[- ]?sciences?|labs?|laborator(?:y|ies))\b/i],
  ["yard", /\b(industrial outdoor storage|outdoor storage|ios|truck (?:terminal|yard)|storage yard)\b/i],
  ["cold_storage", /\b(cold[- ]storage|refrigerated|freezer)\b/i],
];

/**
 * Which building no tracker here describes the deal's own words name — a
 * lab, an outdoor-storage yard or a cold-storage warehouse — or null. The
 * one test every reader of a neighbour's figure asks: the tracker
 * (`trackerSectorFor`), the national lessor rent index (lib/live-market-
 * brief `rentIndexFor`, which had handed a lab the office landlords' rents
 * the tracker refuses it — research pass 23) and the challenger's traps
 * for a lab or a cold-storage building, so none reads what another refuses.
 */
export function ownMarketBuilding(...words: readonly (string | null | undefined)[]): OwnMarketBuilding | null {
  for (const [kind, re] of OWN_MARKET) {
    if (words.some((w) => typeof w === "string" && re.test(w))) return kind;
  }
  return null;
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
  if (ownMarketBuilding(assetClass, deckWords)) return null;
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
    printedBand: r.band === "printed",
  };
}

const MONTH_END = ["01-31", "02-28", "03-31", "04-30", "05-31", "06-30", "07-31", "08-31", "09-30", "10-31", "11-30", "12-31"];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** The last day a qualifier ("q2", "h1", "year-end", "mid", "march"…) covers in a year. */
function endOf(year: number, qualifier: string | null): string {
  const q = qualifier ?? "";
  const quarter = /^q([1-4])$/.exec(q);
  if (quarter) return `${year}-${["03-31", "06-30", "09-30", "12-31"][Number(quarter[1]) - 1]}`;
  if (q === "h1" || q === "mid") return `${year}-06-30`;
  if (q === "early") return `${year}-03-31`;
  const month = MONTHS.indexOf(q.slice(0, 3));
  if (month >= 0 && q !== "") return `${year}-${MONTH_END[month]}`;
  // h2, year-end, late, or a year alone: the year's last day.
  return `${year}-12-31`;
}

/**
 * The last day each dated part of a period covers, earliest first, read
 * only from what the words say: "Q2 2026" ends June 30, "year-end 2025" and
 * "2024" a December 31st, "mid-2026" June 30, "March 2026" March 31; "Q1
 * and Q2 2026" is two parts, a quarter each. A qualifier dates the next
 * year after it. Empty for a period that names no year.
 */
export function periodEnds(period: string | null | undefined): string[] {
  if (!period) return [];
  const out: string[] = [];
  let pending: string[] = [];
  const token =
    /\b(q[1-4]|h[12]|year-end|mid|late|early|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b|\b((?:19|20)\d{2})\b/gi;
  for (const m of period.matchAll(token)) {
    if (m[2]) {
      const year = Number(m[2]);
      if (pending.length === 0) out.push(endOf(year, null));
      for (const q of pending) out.push(endOf(year, q));
      pending = [];
    } else {
      pending.push(m[1].toLowerCase());
    }
  }
  return out.sort();
}

/** Whether a figure is undated: no period, a period that says one of its
 *  reads is undated ("the ODU survey undated"), or one that names no year. */
export function isUndated(read: Pick<FigureRead, "period">): boolean {
  return !read.period || /\bundated\b/i.test(read.period) || periodEnds(read.period).length === 0;
}

/** Whether a dated figure's period — its earliest part — ended more than a
 *  year before `today` (an ISO day): "2024" and "Q4 2024" on 2026-10-01. */
export function olderThanAYear(read: Pick<FigureRead, "period">, today: string): boolean {
  const end = periodEnds(read.period)[0];
  if (!end || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return false;
  const cutoff = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  return end < cutoff;
}

/**
 * Why a figure's own period keeps it from being ranked or held to anything:
 * "undated", or "2024, over a year old" at `today` (an ISO day); null where
 * it is dated within the year. The one rule the sector leaderboard ranks by
 * (lib/sector-leaderboard `unrankedReason`) and the model's read holds an
 * assumption by (lib/model-vs-market), so a figure the leaderboard will not
 * place is never one a deal's vacancy or exit is held to.
 */
export function periodReason(read: Pick<FigureRead, "period">, today: string): string | null {
  if (isUndated(read)) return "undated";
  if (olderThanAYear(read, today)) return `${read.period}, over a year old`;
  return null;
}

/** "Suburban Maryland", "Washington DC region" — an area's words as a row
 *  names it: no leading "the", no parenthetical, the first letter capital. */
export function areaLabel(area: string): string {
  const bare = area.replace(/^the\s+/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

/**
 * "Colliers, Suburban Maryland (Montgomery and Prince George's together, not
 * a county split), Q1 2026" — who published a figure, for what area and
 * when, as the file states each, and "undated" where it states no period.
 * A field the file leaves out is left out of the words.
 */
export function figureCitation(read: Pick<FigureRead, "house" | "area" | "period">): string {
  // A figure the file names no house for says so, plainly: a credit that
  // read "Vacancy: Q2 2026" looked like a source a visitor could check (the
  // research pass of 2026-10-01).
  return [read.house ?? "publisher not recorded", read.area, read.period ?? "undated"].filter((x): x is string => !!x).join(", ");
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

/**
 * One of a snapshot block's figures, credited: its label, its own read, and
 * the words that credit it on a line — a vacancy or an asking rent by who,
 * where and when (a rent's basis is printed beside the figure itself), a
 * cap with what kind of figure it is and whose stock it covers.
 */
export interface CitedFigure {
  label: "Vacancy" | "Rent" | "Cap";
  read: FigureRead;
  words: string;
}

/** An asking rent a foot as the file states it: one figure, or a band. */
export interface RentBand {
  low: number;
  high: number;
}

/**
 * A block's asking rent as the file states it — a point (`asking_rent_psf`)
 * or a band (`asking_rent_psf_low` / `asking_rent_psf_high`) — and never a
 * point made of a band. Prince George's industrial rent is "~$10-15/SF NNN"
 * in its note, and the file had carried it as $12.50, the band's midpoint,
 * which the homepage gallery, the leaderboard and the compare card printed
 * as a figure (the research pass of 2026-10-01). Null where the block
 * states neither, or states a band upside down.
 */
export function rentOf(raw: unknown): RentBand | null {
  const b = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const point = num(b.asking_rent_psf);
  if (point !== null) return { low: point, high: point };
  const low = num(b.asking_rent_psf_low);
  const high = num(b.asking_rent_psf_high) ?? low;
  if (low === null || high === null || high < low) return null;
  return { low, high };
}

/** "$13.27", or a band as a band — "$10–15" where both ends are whole dollars,
 *  "$10.50–15.25" where they are not. Never a midpoint. */
export function rentText(r: RentBand): string {
  if (Math.abs(r.high - r.low) < 0.005) return `$${r.low.toFixed(2)}`;
  const whole = Number.isInteger(r.low) && Number.isInteger(r.high);
  return whole ? `$${r.low}–${r.high}` : `$${r.low.toFixed(2)}–${r.high.toFixed(2)}`;
}

type CitedBlock = {
  vacancy_pct?: unknown;
  vacancy_pct_low?: unknown;
  asking_rent_psf?: unknown;
  asking_rent_psf_low?: unknown;
  asking_rent_psf_high?: unknown;
  cap_rate_low_pct?: unknown;
  cap_rate_high_pct?: unknown;
  vacancy_read?: unknown;
  rent_read?: unknown;
  cap_read?: unknown;
  sources?: unknown;
};

/**
 * Each figure a snapshot block carries — its vacancy, its asking rent, its
 * cap, in that order — with its own read; a figure the block does not carry
 * is left out. The one reader the market brief's "By asset type" panel, the
 * sector leaderboard, the coverage board, the compare card and the
 * homepage's band and gallery credit a block's figures through, so none of
 * them dates a figure by the day the research was read or credits it to
 * the block's first link.
 */
export function blockCitations(raw: unknown): CitedFigure[] {
  const b = (raw && typeof raw === "object" ? raw : {}) as CitedBlock;
  const sources = Array.isArray(b.sources) ? b.sources.filter((s): s is string => typeof s === "string") : [];
  const out: CitedFigure[] = [];
  // A vacancy or a rent for a narrower stock than the class says whose it
  // is ("for Class A space", "for small-bay space"): Philadelphia's Class A
  // industrial rent had printed as the market's (the audit of 2026-10-01).
  const withSlice = (read: FigureRead) => [figureCitation(read), read.slice ? `for ${read.slice}` : null].filter(Boolean).join("; ");
  if (num(b.vacancy_pct) !== null || num(b.vacancy_pct_low) !== null) {
    const read = figureRead(b.vacancy_read, sources);
    out.push({ label: "Vacancy", read, words: withSlice(read) });
  }
  if (rentOf(b) !== null) {
    const read = figureRead(b.rent_read, sources);
    out.push({ label: "Rent", read, words: withSlice(read) });
  }
  if (num(b.cap_rate_low_pct) !== null && num(b.cap_rate_high_pct) !== null) {
    const read = figureRead(b.cap_read, sources);
    out.push({ label: "Cap", read, words: figureNote(read) });
  }
  return out;
}

/** Every figure's whole credit, for a title: "Vacancy: Colliers (21.3%) and
 *  CBRE (22.2%), the District, Q2 2026 · Rent: …". */
export function figuresTitle(figs: readonly CitedFigure[]): string {
  return figs.map((f) => `${f.label}: ${figureNote(f.read)}`).join(" · ");
}

/** A link for one or more of a row's figures. */
export interface FigureSource {
  href: string;
  /** "source" where one link carries every figure the row shows; otherwise
   *  the figures it carries — "vacancy", "rent & cap" */
  label: string;
  /** the whole credit of each figure it carries */
  title: string;
}

/**
 * The links a row of figures carries: one for each distinct link among the
 * figures' own first links, labelled by the figures it carries, or "source"
 * where one link carries them all. A link `ok` refuses (one the link audit
 * found dead) is left out. Empty where no figure is linked — the surface
 * says the figures are on file, never a link that is not theirs.
 */
export function figureSources(figs: readonly CitedFigure[], ok: (href: string) => boolean = () => true): FigureSource[] {
  const groups = new Map<string, CitedFigure[]>();
  for (const f of figs) {
    const href = f.read.links[0];
    if (!href || !ok(href)) continue;
    groups.set(href, [...(groups.get(href) ?? []), f]);
  }
  const one = groups.size === 1 && [...groups.values()][0].length === figs.length;
  return [...groups].map(([href, fs]) => ({
    href,
    label: one ? "source" : fs.map((f) => f.label.toLowerCase()).join(" & "),
    title: figuresTitle(fs),
  }));
}

/** The day the research sweep read a metro's sector snapshot — its `as_of`,
 *  an ISO day — or null where the snapshot states none (said "undated",
 *  never given a day). The one reader every surface takes the day from. */
export function snapshotReadOn(snapshot: unknown): string | null {
  const asOf = snapshot && typeof snapshot === "object" ? (snapshot as { as_of?: unknown }).as_of : null;
  return typeof asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(asOf.trim()) ? asOf.trim() : null;
}

/** A snapshot's age on `today` by the research rule (lib/research-age). */
export function snapshotAge(snapshot: unknown, today: string | Date): ResearchAge {
  return researchAge(snapshotReadOn(snapshot), today);
}

/** A tracker read's age on `today` by the research rule: past the limit
 *  from the day the snapshot was read, its figures are shown, named stale,
 *  and held to nothing. */
export function trackerAge(t: Pick<TrackerRead, "asOf">, today: string | Date): ResearchAge {
  return researchAge(t.asOf, today);
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
  const asOf = snapshotReadOn(snap);
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
