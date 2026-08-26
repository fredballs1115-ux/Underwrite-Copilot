// Bridges the research seed JSONs to the app. The DB tables (0023) are the
// live source once seeded; these JSON imports are the base layer so the
// feature works before any ops step — and the merge NEVER hides a DB row.
// (Universal: JSON + pure helpers only; DB access stays in server components.)

import rulesSeed from "@/data/research/regulatory_rules.json";
import multifamilySeed from "@/data/research/multifamily.json";
import capitalSeed from "@/data/research/capital_markets.json";
import metrosSeed from "@/data/research/metros.json";
import sfrSeed from "@/data/research/sfr_btr.json";
import officeSeed from "@/data/research/office.json";
import industrialSeed from "@/data/research/industrial.json";
import retailSeed from "@/data/research/retail.json";
import hospitalitySeed from "@/data/research/hospitality_str.json";
import storageSeed from "@/data/research/self_storage.json";
import seniorSeed from "@/data/research/senior_housing.json";
import mhcSeed from "@/data/research/manufactured_housing.json";
import specialtySeed from "@/data/research/specialty.json";
import type { Benchmark, RegulatoryRule, RuleSubject } from "@/lib/research";

export function seedRules(): RegulatoryRule[] {
  return (rulesSeed.rules as unknown as RegulatoryRule[]).filter(
    (r) => r && r.id && r.jurisdiction_state && r.effect
  );
}

/** Benchmarks derived from the sector JSONs. Kept in code (not hand-copied
 *  rows) so a JSON update flows through on the next deploy. */
export function seedBenchmarks(): Benchmark[] {
  const out: Benchmark[] = [];
  const md = multifamilySeed.supply_demand?.on_market_depth_may_2026;
  if (md?.value) {
    const metros: Record<string, { median_sale_price?: number; active_listings?: number; yoy?: string }> =
      md.value as never;
    const label: Record<string, string> = {
      providence_ri: "Providence, RI",
      philadelphia_pa: "Philadelphia, PA",
      scranton_pa: "Scranton, PA",
      albany_ny: "Albany, NY",
      reading_pa: "Reading, PA",
      hartford_ct: "Hartford, CT",
      new_haven_ct: "New Haven, CT",
      bridgeport_ct: "Bridgeport, CT",
    };
    const rangeOf = (v: unknown): [number, number] | null => {
      if (typeof v === "number") return [v, v];
      if (typeof v === "string") {
        const m = v.match(/(\d[\d,]*)\s*[-–]\s*(\d[\d,]*)/);
        if (m) return [Number(m[1].replace(/,/g, "")), Number(m[2].replace(/,/g, ""))];
        const single = v.match(/^\s*(\d[\d,]*)/);
        if (single) return [Number(single[1].replace(/,/g, "")), Number(single[1].replace(/,/g, ""))];
      }
      return null;
    };
    for (const [key, row] of Object.entries(metros)) {
      const base = {
        sector: "multifamily",
        metro: label[key] ?? key,
        source: md.sources?.[0] ?? "",
        as_of: "2026-05-31",
        status: (md.status as Benchmark["status"]) ?? "sourced",
      };
      if (typeof row.median_sale_price === "number") {
        out.push({
          ...base,
          metric: "median_sale_price_2_4_unit",
          low: row.median_sale_price,
          high: row.median_sale_price,
          unit: "usd",
          note: row.yoy ? `YoY ${row.yoy}; single-month median, not a band` : "single-month median, not a band",
        });
      }
      const sales = rangeOf((row as { monthly_sales?: unknown }).monthly_sales);
      if (sales) {
        out.push({
          ...base,
          metric: "monthly_sales_2_4_unit",
          low: sales[0],
          high: sales[1],
          unit: "count",
          note: "closed sales per month, 2-4 unit product",
        });
      }
      if (typeof row.active_listings === "number") {
        out.push({
          ...base,
          metric: "active_listings_2_4_unit",
          low: row.active_listings,
          high: row.active_listings,
          unit: "count",
          note: "active listings at month end",
        });
      }
    }
  }
  const fmr = multifamilySeed.supply_demand?.rents_fy2026_hud_fmr_dc_area;
  if (fmr?.value) {
    for (const [br, v] of Object.entries(fmr.value)) {
      if (typeof v === "number") {
        out.push({
          sector: "multifamily",
          metro: "Washington DC area",
          metric: `hud_fmr_fy2026_${br}`,
          low: v,
          high: v,
          unit: "usd_month",
          source: fmr.sources?.[0] ?? "",
          // as_of = when WE verified it. The FY effective window lives in the
          // note — stamping the effective date made current-law FY2026 rents
          // wear a stale badge.
          as_of: "2026-08-24",
          status: (fmr.status as Benchmark["status"]) ?? "sourced",
          note: ["FY2026, effective 2025-10-01 through 2026-09-30", fmr.note].filter(Boolean).join(". "),
        });
      }
    }
  }
  // Metro-level FY2026 FMRs from metros.json (DC-area rows already come from
  // multifamily.json above — skip its metro to avoid near-duplicate rows).
  for (const m of metrosSeed.metros ?? []) {
    if (m.id === "dc") continue;
    const fmr = m.fmr_fy2026 as { "2br"?: number | null; status?: string; sources?: string[]; note?: string } | undefined;
    if (typeof fmr?.["2br"] === "number") {
      out.push({
        sector: "multifamily",
        metro: m.name,
        metric: "hud_fmr_fy2026_2br",
        low: fmr["2br"],
        high: fmr["2br"],
        unit: "usd_month",
        source: fmr.sources?.[0] ?? "",
        as_of: "2026-08-24",
        status: (fmr.status as Benchmark["status"]) ?? "sourced",
        note: ["FY2026, effective 2025-10-01 through 2026-09-30", fmr.note].filter(Boolean).join(". "),
      });
    }
  }

  // Per-metro sector snapshots (office / industrial / multifamily
  // fundamentals from brokerage research, two-source bar) — one benchmark
  // row per figure actually carried, flowing to deal pages and Compare via
  // benchmarksForDeal. Divergent trackers encode as the observed low–high
  // spread, never averaged; a null figure emits no row (a gap is a gap).
  type SnapshotBlock = {
    vacancy_pct?: number | null;
    vacancy_pct_low?: number | null;
    vacancy_pct_high?: number | null;
    asking_rent_psf?: number | null;
    cap_rate_low_pct?: number | null;
    cap_rate_high_pct?: number | null;
    status?: string;
    sources?: string[];
    note?: string;
  };
  for (const m of metrosSeed.metros ?? []) {
    const snap = (
      m as { sector_snapshot?: Record<string, SnapshotBlock | string> | null }
    ).sector_snapshot;
    if (!snap) continue;
    const snapAsOf = typeof snap.as_of === "string" ? snap.as_of : "2026-08-25";
    for (const [sector, blk] of Object.entries(snap)) {
      if (sector === "as_of" || typeof blk === "string" || !blk) continue;
      const base = {
        sector,
        metro: m.name,
        as_of: snapAsOf,
        status: (blk.status as Benchmark["status"]) ?? "sourced",
        source: blk.sources?.[0] ?? "",
        note: blk.note ?? null,
      };
      const vLow = blk.vacancy_pct ?? blk.vacancy_pct_low;
      const vHigh = blk.vacancy_pct ?? blk.vacancy_pct_high ?? vLow;
      if (typeof vLow === "number") {
        out.push({
          ...base,
          metric: `${sector}_vacancy_pct`,
          low: vLow,
          high: typeof vHigh === "number" ? vHigh : vLow,
          unit: "pct",
        });
      }
      if (typeof blk.asking_rent_psf === "number") {
        out.push({
          ...base,
          metric: `${sector}_asking_rent_psf`,
          low: blk.asking_rent_psf,
          high: blk.asking_rent_psf,
          unit: "usd_sf_yr",
        });
      }
      if (
        typeof blk.cap_rate_low_pct === "number" &&
        typeof blk.cap_rate_high_pct === "number"
      ) {
        out.push({
          ...base,
          metric: `${sector}_cap_rate_pct`,
          low: blk.cap_rate_low_pct,
          high: blk.cap_rate_high_pct,
          unit: "pct",
        });
      }
    }
  }

  // Sector cap-rate bands from the sector research files — national tiers
  // (metro ""), one row per tier that actually carries a number. Unverified
  // tiers (low/high null) are deliberately NOT rows: a gap is a gap.
  const SECTOR_FILES: { sector: string; doc: { as_of?: string; cap_rate_ranges?: unknown } }[] = [
    { sector: "sfr_btr", doc: sfrSeed },
    { sector: "office", doc: officeSeed },
    { sector: "industrial", doc: industrialSeed },
    { sector: "retail", doc: retailSeed },
    { sector: "hospitality_str", doc: hospitalitySeed },
    { sector: "self_storage", doc: storageSeed },
    { sector: "senior_housing", doc: seniorSeed },
    { sector: "manufactured_housing", doc: mhcSeed },
    { sector: "specialty", doc: specialtySeed },
  ];
  for (const { sector, doc } of SECTOR_FILES) {
    const ranges = (doc.cap_rate_ranges ?? []) as {
      tier?: string;
      low?: number | null;
      high?: number | null;
      status?: string;
      sources?: string[];
      note?: string;
    }[];
    for (const r of ranges) {
      if (typeof r.low !== "number" || typeof r.high !== "number" || !r.tier) continue;
      out.push({
        sector,
        metro: "",
        metric: `cap_rate__${r.tier.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`,
        low: Math.round(r.low * 10000) / 100, // store as percent
        high: Math.round(r.high * 10000) / 100,
        unit: "pct",
        source: r.sources?.[0] ?? "",
        as_of: doc.as_of ?? "2026-08-21",
        status: (r.status as Benchmark["status"]) ?? "sourced",
        note: [r.tier, r.note].filter(Boolean).join(" — "),
      });
    }
  }

  const pmms = capitalSeed.snapshot?.mortgage_30y_pmms;
  if (typeof pmms?.value === "number") {
    out.push({
      sector: "capital_markets",
      metro: "",
      metric: "pmms_30y_fixed",
      low: pmms.value,
      high: pmms.value,
      unit: "pct",
      source: pmms.sources?.[0] ?? "",
      as_of: pmms.as_of ?? "2026-08-20",
      status: (pmms.status as Benchmark["status"]) ?? "sourced",
      note: pmms.note ?? null,
    });
  }
  return out;
}

/** Merge DB benchmark rows over the checked-in seeds (DB wins per key) —
 *  shared by the deal panel and the market page so both tell the same story. */
export function mergeBenchmarks(dbRows: Benchmark[] | null | undefined): Benchmark[] {
  const key = (b: Benchmark) => `${b.sector}|${b.metro}|${b.metric}`;
  const byKey = new Map(seedBenchmarks().map((b) => [key(b), b]));
  for (const b of dbRows ?? []) byKey.set(key(b), b);
  return [...byKey.values()];
}

/** Benchmarks relevant to one deal. Matched by covered-market NAME first —
 *  a Brooklyn deal must find the "New York City" FMR row — with the raw city
 *  string as the fallback for labels the market matcher doesn't know. Prefix
 *  match on purpose: seed labels carry suffixes ("Baltimore MD",
 *  "Washington DC area"). DMV suburbs get their OWN rows (each entry in
 *  metros.json carries the DC-HMFA FY2026 FMR, DCHA-confirmed metro-wide),
 *  so they no longer need to borrow the "Washington DC area" rows. */
export function benchmarksForDeal(
  benchmarks: Benchmark[],
  city?: string | null,
  metroName?: string | null
): Benchmark[] {
  const c = (city ?? "").trim().toLowerCase();
  const m = (metroName ?? "").trim().toLowerCase();
  return benchmarks.filter((b) => {
    if (!b.metro) return false;
    const label = b.metro.toLowerCase();
    return (!!c && label.startsWith(c)) || (!!m && label.startsWith(m));
  });
}

/** The buyer profile the rules evaluate against until a real setting exists.
 *  These mirror the operator's stated profile; anything NOT safely assumable
 *  (RAD registration, permit year) stays undefined so the tri-state engine
 *  surfaces it as an open question instead of a silent pass. */
export const BUYER_DEFAULTS: Partial<RuleSubject> = {
  owner_is_natural_person: true,
  owner_natural_persons: 1,
  owner_form: "natural_person",
  owner_other_rental_units_in_dc: 0,
  owner_total_rental_units_in_county: 0,
  owner_total_rental_units_in_state: 0,
  property_type: "rental_housing",
};

const num = (s: string | null | undefined): number | undefined => {
  if (!s) return undefined;
  const m = s.replace(/[,$]/g, "").match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : undefined;
};

/** Build the evaluation subject from what the deal already knows. The
 *  sector-facts answers (permit year, RAD registration, other units) override
 *  the defaults — an explicit answer always beats an assumption. */
export function buildSubject(input: {
  address: { state?: string; city?: string; county?: string; submarket?: string } | null;
  sizeText?: string | null;
  yearBuilt?: number | null;
  sectorFields?: Record<string, string | number | boolean> | null;
  /** injected for deterministic tests; defaults to the wall-clock year */
  currentYear?: number;
}): RuleSubject {
  const units =
    input.sizeText && /\b(units?|doors)\b/i.test(input.sizeText) ? num(input.sizeText) : undefined;
  const sf = input.sectorFields ?? {};
  const numField = (k: string): number | undefined =>
    typeof sf[k] === "number" ? (sf[k] as number) : undefined;
  const boolField = (k: string): boolean | undefined =>
    typeof sf[k] === "boolean" ? (sf[k] as boolean) : undefined;
  const otherUnits = numField("owner_units_in_jurisdiction");
  const willOccupy = boolField("will_owner_occupy");
  return {
    ...BUYER_DEFAULTS,
    state: input.address?.state || undefined,
    locality: [input.address?.city, input.address?.county, input.address?.submarket].filter(
      (s): s is string => !!s
    ),
    units,
    // The deal-facts answer beats the OM/manual claim — the buyer may be
    // correcting a wrong listing figure.
    built_year: numField("year_built") ?? input.yearBuilt ?? undefined,
    current_year: input.currentYear ?? new Date().getFullYear(),
    // Post-close intent only — the occupancy STRING (current status) stays
    // unknown, so vacant-tax and rental-license questions stay honestly open.
    ...(willOccupy !== undefined ? { owner_occupied: willOccupy } : {}),
    building_permit_year: numField("building_permit_year"),
    exemption_registered_with_rad: boolField("rad_exemption_registered"),
    // Portfolio totals ALWAYS include this deal's own units — the ≤N-unit
    // small-landlord tests (PG ≤5, NY Good Cause ≤10) must fail on an
    // acquisition that alone exceeds the cap, even with the default
    // "no other units" assumption the panel declares.
    owner_total_rental_units_in_county: (otherUnits ?? 0) + (units ?? 0),
    owner_total_rental_units_in_state: (otherUnits ?? 0) + (units ?? 0),
    ...(otherUnits !== undefined ? { owner_other_rental_units_in_dc: otherUnits } : {}),
    transaction: "sale_of_rental_housing_accommodation",
  };
}

/** Parse "$1,234,567" + "12 units" into price-per-unit, when both parse. */
export function pricePerUnit(priceText?: string | null, sizeText?: string | null): number | null {
  const p = num(priceText);
  const u = sizeText && /\bunits?\b/i.test(sizeText) ? num(sizeText) : undefined;
  if (!p || !u || u < 1) return null;
  return Math.round(p / u);
}

/** Format a benchmark's low–high for display, by what the metric IS: percent
 *  figures (vacancy, cap rates, PMMS) get %, per-square-foot rents get $/SF,
 *  monthly-sales and listing counts are plain counts, and dollar figures
 *  (FMRs, sale medians) keep the $ prefix. A blanket $ prefix printed
 *  "office vacancy: $17.7" on deal pages — units follow the metric now. */
export function fmtBenchValue(
  metric: string,
  low?: number | null,
  high?: number | null,
): string {
  const range = (f: (n: number) => string): string => {
    if (typeof low !== "number") return "—";
    return typeof high !== "number" || high === low
      ? f(low)
      : `${f(low)}–${f(high)}`;
  };
  if (/_vacancy_pct$|_cap_rate_pct$/.test(metric) || metric === "pmms_30y_fixed")
    return range((n) => `${n}%`);
  if (/_asking_rent_psf$/.test(metric)) return range((n) => `$${n.toFixed(2)}/SF`);
  if (metric === "monthly_sales_2_4_unit" || metric === "active_listings_2_4_unit")
    return range((n) => n.toLocaleString());
  return range((n) => `$${n.toLocaleString()}`);
}
