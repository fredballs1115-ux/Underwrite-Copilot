import metrosSeed from "@/data/research/metros.json";
import { FMR_BEDS, fmrOf } from "@/lib/fmr";
import { compsFeedState } from "@/lib/public-comps/core";
import { datedLong } from "@/lib/debt-index";
import { blockCitations, figuresTitle } from "@/lib/tracker-read";
import type { CompareMetro, CompareSector } from "./market-compare";

// The compare tool's compact per-metro facts, derived once from the research
// layer — the fair market rent, rule count, comps-feed state. Serializable:
// it crosses the server → client boundary as props. A plain module, apart
// from the page and the client card, so the render test draws the card on
// exactly what the page hands it.
export const COMPARE_METROS: CompareMetro[] = (metrosSeed.metros ?? []).map((m) => {
  // HUD's fair market rent through the one reader (lib/fmr): each bedroom
  // the block states and the fiscal year it names — the card prints the
  // year from here, never one typed on the page.
  const fmr = fmrOf(m);
  const beds: CompareMetro["fmr"] = fmr ? { fy: fmr.fy, status: fmr.status } : {};
  for (const k of FMR_BEDS) {
    const v = fmr?.rents[k] ?? null;
    if (v !== null) beds[k] = v;
  }
  // Sector fundamentals for the compare table, from the same snapshot blocks
  // the "By asset type" panel renders — nulls simply produce no entry — each
  // cell credited to its figures' own house, area and period
  // (lib/tracker-read), never the day the research was read.
  const snap = (m as { sector_snapshot?: Record<string, unknown> | null })
    .sector_snapshot;
  // The day the research sweep read the snapshot, said as that.
  const snapAsOf = typeof snap?.as_of === "string" && /^\d{4}-\d{2}-\d{2}$/.test(snap.as_of) ? snap.as_of : null;
  let sectors: CompareMetro["sectors"];
  if (snap) {
    sectors = {};
    for (const sec of ["office", "industrial", "multifamily", "retail"] as const) {
      const blk = snap[sec] as
        | {
            vacancy_pct?: number | null;
            vacancy_pct_low?: number | null;
            vacancy_pct_high?: number | null;
            asking_rent_psf?: number | null;
            cap_rate_low_pct?: number | null;
            cap_rate_high_pct?: number | null;
          }
        | undefined;
      if (!blk) continue;
      const s: CompareSector = {};
      const vLow = blk.vacancy_pct ?? blk.vacancy_pct_low;
      const vHigh = blk.vacancy_pct ?? blk.vacancy_pct_high ?? vLow;
      if (typeof vLow === "number") {
        s.vLow = vLow;
        if (typeof vHigh === "number") s.vHigh = vHigh;
      }
      if (typeof blk.asking_rent_psf === "number") s.rent = blk.asking_rent_psf;
      if (
        typeof blk.cap_rate_low_pct === "number" &&
        typeof blk.cap_rate_high_pct === "number"
      ) {
        s.capLow = blk.cap_rate_low_pct;
        s.capHigh = blk.cap_rate_high_pct;
      }
      // The cell shows its rent and cap only beside a vacancy, and so does
      // its title.
      if (typeof s.vLow === "number") s.cite = figuresTitle(blockCitations(blk));
      if (Object.keys(s).length > 0) sectors[sec] = s;
    }
  }
  return {
    id: m.id,
    name: m.name,
    region: (m as { region?: string }).region ?? "More markets",
    fmr: beds,
    sectors,
    ruleCount: ((m as { rule_ids?: string[] }).rule_ids ?? []).length,
    researchReadOn: snapAsOf ? datedLong(snapAsOf) : null,
    // Live only where the provider registry runs the feed, never merely
    // because the research file names one (Washington's is documented, not
    // wired); none where the file names no source at all.
    compsFeed: compsFeedState(m.comps_provider as string | null),
  };
});
