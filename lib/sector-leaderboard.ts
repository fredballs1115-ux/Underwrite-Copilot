import metrosSeed from "@/data/research/metros.json";
import { blockCitations, type CitedFigure } from "@/lib/tracker-read";

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

export type LeaderRow = {
  id: string;
  name: string;
  vLow: number | null;
  vHigh: number | null;
  rent: number | null;
  rentBasis: string | null;
  capLow: number | null;
  capHigh: number | null;
  /** each figure the row carries, credited to its own house, area, period
   *  and link (lib/tracker-read `blockCitations`) — never the block's first
   *  link, which is another figure's as often as not */
  figures: CitedFigure[];
};

// Cross-metro view of one asset class: every covered market with a numeric
// read, ranked tightest to loosest. Bands are sorted by midpoint but must be
// DISPLAYED as bands — a spread is never averaged into a printed number.
// Metros whose block carries only a sourced note (direction on file, level
// held open) are returned by name in `heldOpen`, never silently dropped.
// Rows without a vacancy read (rent/cap only) sort after every ranked row.
export function sectorLeaderboard(sector: string): {
  rows: LeaderRow[];
  heldOpen: string[];
} {
  const rows: LeaderRow[] = [];
  const heldOpen: string[] = [];
  for (const m of metrosSeed.metros ?? []) {
    const snap = (m as { sector_snapshot?: Record<string, unknown> | null })
      .sector_snapshot;
    const blk = snap?.[sector] as SnapBlock | undefined;
    if (!blk || typeof blk !== "object") continue;
    const vLow = blk.vacancy_pct ?? blk.vacancy_pct_low ?? null;
    const vHighRaw = blk.vacancy_pct ?? blk.vacancy_pct_high ?? vLow;
    const rent = typeof blk.asking_rent_psf === "number" ? blk.asking_rent_psf : null;
    const capLow = typeof blk.cap_rate_low_pct === "number" ? blk.cap_rate_low_pct : null;
    const capHigh = typeof blk.cap_rate_high_pct === "number" ? blk.cap_rate_high_pct : null;
    if (vLow === null && rent === null && capLow === null) {
      heldOpen.push(m.name);
      continue;
    }
    rows.push({
      id: m.id,
      name: m.name,
      vLow,
      vHigh: typeof vHighRaw === "number" ? vHighRaw : null,
      rent,
      rentBasis: blk.rent_basis ?? null,
      capLow,
      capHigh,
      figures: blockCitations(blk),
    });
  }
  rows.sort((a, b) => {
    if (a.vLow === null && b.vLow === null) return a.name.localeCompare(b.name);
    if (a.vLow === null) return 1;
    if (b.vLow === null) return -1;
    return (
      (a.vLow + (a.vHigh ?? a.vLow)) / 2 - (b.vLow + (b.vHigh ?? b.vLow)) / 2
    );
  });
  return { rows, heldOpen };
}
