import metrosSeed from "@/data/research/metros.json";
import {
  areaLabel,
  blockCitations,
  figureRead,
  isUndated,
  olderThanAYear,
  rentOf,
  type CitedFigure,
  type RentBand,
} from "@/lib/tracker-read";

/** One sector block inside a metro's `sector_snapshot` — the research layer's
 *  per-asset-class read: vacancy (a band when trackers diverge — the
 *  divergence is carried, never averaged), asking rent with its declared
 *  basis, cap-rate band, plus status/sources/note provenance, and each
 *  figure's own read (`vacancy_read`, `rent_read`, `cap_read` — the house,
 *  area, period and links lib/tracker-read credits it by). */
export type SnapBlock = {
  vacancy_pct?: number | null;
  vacancy_pct_low?: number | null;
  vacancy_pct_high?: number | null;
  asking_rent_psf?: number | null;
  /** an asking rent the file states as a band — never carried as its midpoint */
  asking_rent_psf_low?: number | null;
  asking_rent_psf_high?: number | null;
  rent_basis?: string | null;
  cap_rate_low_pct?: number | null;
  cap_rate_high_pct?: number | null;
  status?: string;
  sources?: string[];
  note?: string;
  vacancy_read?: unknown;
  rent_read?: unknown;
  cap_read?: unknown;
};

/** A market a row stands for. */
export interface LeaderMarket {
  id: string;
  name: string;
}

export type LeaderRow = {
  /** the first market the row stands for — its link and its key */
  id: string;
  name: string;
  /** every market whose block carries this one figure, in the file's order:
   *  the Washington DC region's multifamily read is one row naming the
   *  District, the two Maryland counties and Northern Virginia, never four
   *  rows ranked #8 to #11 on one figure */
  markets: LeaderMarket[];
  /** where the row stands for more than one market, the area the figure's
   *  own read names ("Suburban Maryland", "Washington DC region") — whose
   *  figure it is; null for a market's own */
  sharedArea: string | null;
  vLow: number | null;
  vHigh: number | null;
  /** the asking rent a foot as the file states it, a point or a band */
  rent: RentBand | null;
  rentBasis: string | null;
  capLow: number | null;
  capHigh: number | null;
  /** each figure the row carries, credited to its own house, area, period
   *  and link (lib/tracker-read `blockCitations`) — never the block's first
   *  link, which is another figure's as often as not */
  figures: CitedFigure[];
  /** the row's place, tightest first, among the ranked rows; null where the
   *  figure is not ranked or there is no vacancy figure */
  rank: number | null;
  /** why a vacancy figure is not ranked, in a few words ("undated",
   *  "2024, over a year old", "a spread of two reads"); null where ranked
   *  or where the row carries no vacancy figure */
  reason: string | null;
  /** a band its publisher prints as one read, ranked by its loosest end */
  printedBand: boolean;
};

/** Today as an ISO day — a caller that reads the clock outside its render
 *  hands its own in. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Why a vacancy figure is not ranked, or null where it is: a figure must be
 * dated, no more than a year old at the reader's date, for the whole stock
 * of its class, and one read — a point, or a band its publisher prints as
 * one range. A band of two houses, two inventories or two periods (DC's
 * Colliers 21.3% beside CBRE's 22.2%, Baltimore's all-inventory 10.0% beside
 * a competitive set's 20.9%) is two figures, and there is no one figure to
 * place: its midpoint is a number no source states.
 */
export function unrankedReason(
  read: ReturnType<typeof figureRead>,
  vLow: number,
  vHigh: number | null,
  today: string,
): string | null {
  const reasons: string[] = [];
  if (isUndated(read)) reasons.push("undated");
  else if (olderThanAYear(read, today)) reasons.push(`${read.period}, over a year old`);
  if (read.slice) reasons.push(`${read.slice} only`);
  const band = vHigh !== null && Math.abs(vHigh - vLow) >= 0.005;
  if (band && !read.printedBand) reasons.push("a spread of two reads");
  return reasons.length > 0 ? reasons.join("; ") : null;
}

/**
 * Cross-metro view of one asset class: every covered market's figure for
 * it, one row per distinct figure, ranked tightest to loosest where the
 * figure can be ranked at all (the research pass of 2026-10-01).
 *
 * ONE ROW PER FIGURE. Several markets read one figure where the research
 * has no finer one — the Washington DC region's year-end multifamily
 * vacancy is every DMV jurisdiction's, Colliers' Suburban Maryland office
 * vacancy both Maryland counties' — and a row a market ranked one figure
 * four times. A row now stands for every market whose block carries the
 * same figures under the same reads, and names them, with the area the
 * read names.
 *
 * RANKED ONLY WHERE THE SOURCES STATE A PLACE. A figure that is undated,
 * more than a year old at `today`, or for a narrower stock than the class
 * (NoVA's small-bay industrial) is listed after the ranked rows, unranked,
 * with the reason. A band is never ordered by its midpoint: a band of two
 * reads is listed unranked, as a band; a band its publisher prints as one
 * range (Hampton Roads retail, "4.4–4.6%") is one read and is ranked by
 * its LOOSEST end — the end that does not flatter the market, as a price
 * range is read at its top — with a point at that same figure placed
 * ahead of it. A band is always printed as a band.
 *
 * Metros whose block carries only a sourced note (direction on file, level
 * held open) are returned by name in `heldOpen`, never silently dropped;
 * rows with no vacancy figure (rent or cap alone) come last.
 */
export function sectorLeaderboard(
  sector: string,
  today: string = todayIso(),
): {
  /** the ranked rows in rank order, then the unranked vacancy rows, then
   *  the rows with no vacancy figure */
  rows: LeaderRow[];
  /** how many rows are ranked — the "of N" every rank is said against */
  ranked: number;
  heldOpen: string[];
} {
  const byKey = new Map<string, LeaderRow>();
  const order: LeaderRow[] = [];
  const heldOpen: string[] = [];
  for (const m of metrosSeed.metros ?? []) {
    const snap = (m as { sector_snapshot?: Record<string, unknown> | null })
      .sector_snapshot;
    const blk = snap?.[sector] as SnapBlock | undefined;
    if (!blk || typeof blk !== "object") continue;
    const vLow = blk.vacancy_pct ?? blk.vacancy_pct_low ?? null;
    const vHighRaw = blk.vacancy_pct ?? blk.vacancy_pct_high ?? vLow;
    const vHigh = typeof vHighRaw === "number" ? vHighRaw : null;
    const rent = rentOf(blk);
    const capLow = typeof blk.cap_rate_low_pct === "number" ? blk.cap_rate_low_pct : null;
    const capHigh = typeof blk.cap_rate_high_pct === "number" ? blk.cap_rate_high_pct : null;
    if (vLow === null && rent === null && capLow === null) {
      heldOpen.push(m.name);
      continue;
    }
    const figures = blockCitations(blk);
    // One figure is the same values under the same reads: the same house,
    // area, period and links for each figure the block carries.
    const key = JSON.stringify([vLow, vHigh, rent, capLow, capHigh, blk.rent_basis ?? null, figures.map((f) => [f.label, f.read])]);
    const existing = byKey.get(key);
    if (existing) {
      existing.markets.push({ id: m.id, name: m.name });
      continue;
    }
    const vacancyRead = figureRead(blk.vacancy_read, blk.sources);
    const row: LeaderRow = {
      id: m.id,
      name: m.name,
      markets: [{ id: m.id, name: m.name }],
      sharedArea: null,
      vLow,
      vHigh,
      rent,
      rentBasis: blk.rent_basis ?? null,
      capLow,
      capHigh,
      figures,
      rank: null,
      reason: vLow === null ? null : unrankedReason(vacancyRead, vLow, vHigh, today),
      printedBand: vacancyRead.printedBand,
    };
    byKey.set(key, row);
    order.push(row);
  }
  for (const row of order) {
    if (row.markets.length < 2) continue;
    // The area the figure's own read names, for a row that stands for more
    // than one market: the vacancy's where there is one, else the first
    // figure's that names an area.
    const area = row.figures.find((f) => f.label === "Vacancy")?.read.area ?? row.figures.find((f) => f.read.area)?.read.area ?? null;
    row.sharedArea = area ? areaLabel(area) : null;
  }
  const loosest = (r: LeaderRow) => r.vHigh ?? r.vLow!;
  const isPoint = (r: LeaderRow) => r.vHigh === null || Math.abs(r.vHigh - r.vLow!) < 0.005;
  const ranked = order
    .filter((r) => r.vLow !== null && r.reason === null)
    .sort((a, b) => loosest(a) - loosest(b) || Number(isPoint(b)) - Number(isPoint(a)) || a.name.localeCompare(b.name));
  ranked.forEach((r, i) => {
    r.rank = i + 1;
  });
  const unranked = order
    .filter((r) => r.vLow !== null && r.reason !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
  const noVacancy = order.filter((r) => r.vLow === null).sort((a, b) => a.name.localeCompare(b.name));
  return { rows: [...ranked, ...unranked, ...noVacancy], ranked: ranked.length, heldOpen };
}

/** Where one market's figure stands in its sector: its row, and the rank of
 *  the ranked rows' count, or the reason it is not ranked. Null where the
 *  market carries no vacancy figure for the sector. */
export interface Standing {
  row: LeaderRow;
  rank: number | null;
  total: number;
  reason: string | null;
}

/** Every market's standing in each tracked sector, keyed sector → market id —
 *  the one builder behind the brief's rank chips, the coverage board, the
 *  deal page's research rows and the sample screen. */
export function sectorStandings(
  sectors: readonly string[],
  today: string = todayIso(),
): Record<string, Record<string, Standing>> {
  return Object.fromEntries(
    sectors.map((sec) => {
      const board = sectorLeaderboard(sec, today);
      const out: Record<string, Standing> = {};
      for (const row of board.rows) {
        if (row.vLow === null) continue;
        for (const m of row.markets) out[m.id] = { row, rank: row.rank, total: board.ranked, reason: row.reason };
      }
      return [sec, out];
    }),
  );
}

/**
 * Whose figure a market's tile shows, where the market reads a figure it
 * shares: the area the figure's read names ("Suburban Maryland",
 * "Washington DC region"), so a county's tile never passes a two-county or
 * a regional figure off as the county's (the homepage's gallery said
 * "Montgomery County MD · Office 19.2% vac" for Colliers' Suburban Maryland
 * figure). Null where the figure is the market's own, or the market has
 * none for the sector.
 */
export function sharedAreaFor(sector: string, metroId: string | null | undefined): string | null {
  if (!metroId) return null;
  const row = sectorLeaderboard(sector).rows.find((r) => r.markets.some((m) => m.id === metroId));
  if (!row || row.markets.length < 2) return null;
  return row.sharedArea ?? row.markets.map((m) => m.name).join(", ");
}

/** "Suburban Maryland — Prince George's County MD, Montgomery County MD":
 *  whose figure a shared row is and every market that reads it. */
export function sharedFigureWords(row: Pick<LeaderRow, "markets" | "sharedArea">): string | null {
  if (row.markets.length < 2) return null;
  const names = row.markets.map((m) => m.name).join(", ");
  return row.sharedArea ? `${row.sharedArea} — ${names}` : names;
}
