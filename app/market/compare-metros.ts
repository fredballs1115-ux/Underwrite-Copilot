import metrosSeed from "@/data/research/metros.json";
import { FMR_BEDS, fmrOf } from "@/lib/fmr";
import { compsFeedState } from "@/lib/public-comps/core";
import { datedLong } from "@/lib/debt-index";
import { blockCitations, figuresTitle, rentOf, rentText, snapshotReadOn } from "@/lib/tracker-read";
import { sharedAreaFor } from "@/lib/sector-leaderboard";
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
  // The day the research sweep read the snapshot, said as that — and kept
  // as an ISO day for the research rule's age (lib/research-age).
  const snapAsOf = snapshotReadOn(snap);
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
            asking_rent_psf_low?: number | null;
            asking_rent_psf_high?: number | null;
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
      // A band as the file states it ("$10–15"), never a point made of one.
      const rent = rentOf(blk);
      if (rent) s.rent = rentText(rent);
      if (
        typeof blk.cap_rate_low_pct === "number" &&
        typeof blk.cap_rate_high_pct === "number"
      ) {
        s.capLow = blk.cap_rate_low_pct;
        s.capHigh = blk.cap_rate_high_pct;
      }
      // The cell shows its rent and cap only beside a vacancy, and so does
      // its title; each figure's own period is printed beside it, and the
      // shared area where several markets read the figure.
      if (typeof s.vLow === "number") {
        const figs = blockCitations(blk);
        s.cite = figuresTitle(figs);
        const period = (label: "Vacancy" | "Rent" | "Cap") => {
          const f = figs.find((x) => x.label === label);
          return f ? (f.read.period ?? "undated") : undefined;
        };
        s.vPeriod = period("Vacancy");
        s.rentPeriod = period("Rent");
        s.capPeriod = period("Cap");
        const shared = sharedAreaFor(sec, m.id);
        if (shared) s.shared = shared;
      }
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
    researchReadIso: snapAsOf,
    // Live only where the provider registry runs the feed, never merely
    // because the research file names one (Washington's is documented, not
    // wired); none where the file names no source at all.
    compsFeed: compsFeedState(m.comps_provider as string | null),
  };
});
