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
import { US_STATE_ABBREV } from "@/lib/address";
import { fmrBenchmarkRows, fmrOf, newestFmrOnly, type Fmr } from "@/lib/fmr";
import { figureNote, figureRead } from "@/lib/tracker-read";

export function seedRules(): RegulatoryRule[] {
  return (rulesSeed.rules as unknown as RegulatoryRule[]).filter(
    (r) => r && r.id && r.jurisdiction_state && r.effect
  );
}

/** The rules on file, said as they are: how many, and how many link their
 *  source — a rule filed without one (New Jersey's municipal rent control,
 *  a patchwork of local ordinances the file points at rather than cites) is
 *  counted, never called source-linked. */
export function ruleCounts(): { all: number; sourced: number } {
  const rules = seedRules();
  return {
    all: rules.length,
    sourced: rules.filter((r) => typeof r.source === "string" && r.source.trim() !== "").length,
  };
}

/** A state's name for a page, from the address table ("Virginia", "New
 *  Jersey", "District of Columbia"), by its code. */
const STATE_NAME: Record<string, string> = Object.fromEntries(
  Object.entries(US_STATE_ABBREV).map(([name, code]) => [
    code,
    name
      .split(" ")
      .map((w) => (w === "of" ? w : w.charAt(0).toUpperCase() + w.slice(1)))
      .join(" "),
  ]),
);

/** A rule's type in words: the file's own type with its underscores spaces,
 *  but an acronym in capitals and two types that read badly as words said
 *  plainly. */
const RULE_TYPE_WORDS: Record<string, string> = {
  topa: "TOPA",
  topa_exemption: "TOPA exemption",
  rent_control_absence: "no local rent control",
  licensing: "rental licensing",
};

/**
 * A rule's name for a sentence, from the research file's own fields: what
 * kind of rule it is and where it holds — "rent control (Montgomery County,
 * MD)", "TOPA (Washington, DC)", "no local rent control (Virginia)". The
 * file gives no rule a title of its own; the deal page's rules panel names
 * one by the same two fields. Null for an id the file does not hold (an
 * alert's rule id is whatever the intel sweep matched), so a page never
 * shows a reader a raw id.
 */
export function ruleName(id: string | null | undefined): string | null {
  if (!id) return null;
  const rule = seedRules().find((r) => r.id === id);
  if (!rule) return null;
  const words = RULE_TYPE_WORDS[rule.rule_type] ?? rule.rule_type.replace(/_/g, " ");
  const state = rule.jurisdiction_state.trim().toUpperCase();
  const place = rule.jurisdiction_local ? `${rule.jurisdiction_local}, ${state}` : (STATE_NAME[state] ?? state);
  return `${words} (${place})`;
}

/** A value's JSON with every object's keys sorted, so a rule's conditions
 *  compare equal whatever order they come back in — Postgres's jsonb stores
 *  keys by length before byte order, never as the file wrote them. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** What a rule says: everything but the dates and the status its source was
 *  last checked under. */
function ruleText(r: RegulatoryRule): string {
  return canonicalJson({
    jurisdiction_state: r.jurisdiction_state,
    jurisdiction_local: r.jurisdiction_local ?? null,
    rule_type: r.rule_type,
    applies_if: r.applies_if ?? null,
    exempt_if: r.exempt_if ?? null,
    effect: r.effect,
    quote: r.quote ?? null,
    source: r.source ?? null,
  });
}

/**
 * The rules a deal is read against: the checked-in file's, with the
 * database's copy consulted only for what the database alone writes.
 * Nothing writes a rule's TEXT to the database but scripts/seed-research.mjs
 * — the steward stamps `as_of` when it re-verifies a rule against its source
 * and never edits legal text, the daily intel job only reads the ids — so a
 * row there is the file as it stood when last seeded, and taking it over the
 * file kept a rule the file had since corrected (California's and
 * Washington's new-building exemptions, read as rolling ages) until someone
 * reseeded. So a rule in the file takes the file's words, and the
 * database's later `as_of` only where its words are the file's own, since a
 * re-verification dates the words it checked. A rule only the database
 * holds is kept as it is.
 */
export function mergeRules(dbRows: RegulatoryRule[] | null | undefined): RegulatoryRule[] {
  const seeds = seedRules();
  const byId = new Map(seeds.map((r) => [r.id, r]));
  for (const row of dbRows ?? []) {
    if (!row?.id) continue;
    const seed = byId.get(row.id);
    if (!seed) {
      byId.set(row.id, row);
      continue;
    }
    if (ruleText(row) === ruleText(seed) && typeof row.as_of === "string" && row.as_of > seed.as_of) {
      byId.set(row.id, { ...seed, as_of: row.as_of });
    }
  }
  return [...byId.values()];
}

/** The month the 2–4 unit on-market figures are for: the research file's
 *  block is `on_market_depth_may_2026`, Redfin's tracker "periods through
 *  2026-05-31" as its source records — single-month medians for May 2026. */
const ON_MARKET_DEPTH_AS_OF = "2026-05-31";

/**
 * A metro's 2–4 unit sale median from the research file, with its change on
 * a year earlier as the file states it and the month it is for — so a page
 * printing the figure prints its month from the same place, never a figure
 * typed on the page. Null where the file carries no median for the metro.
 */
export function twoToFourMedian(metroKey: string): { price: number; yoy: string | null; asOf: string } | null {
  const value = multifamilySeed.supply_demand?.on_market_depth_may_2026?.value as
    | Record<string, { median_sale_price?: number; yoy?: string }>
    | undefined;
  const row = value?.[metroKey];
  if (!row || typeof row.median_sale_price !== "number") return null;
  return { price: row.median_sale_price, yoy: typeof row.yoy === "string" && row.yoy.trim() ? row.yoy : null, asOf: ON_MARKET_DEPTH_AS_OF };
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
        as_of: ON_MARKET_DEPTH_AS_OF,
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
  // HUD's fair market rents, a row a bedroom: the Washington area's from
  // multifamily.json's block, every other metro's from its metros.json
  // entry — through lib/fmr's one builder, which scripts/seed-research.mjs
  // and scripts/fetch-fmr.mjs write the table with too. The fiscal year is
  // the block's own, in the metric and the note; `as_of` is the day the
  // figures were read, never the day they take effect.
  out.push(...fmrBenchmarkRows(metrosSeed, multifamilySeed));

  // Per-metro sector snapshots (office / industrial / multifamily
  // fundamentals from brokerage research, two-source bar) — one benchmark
  // row per figure actually carried, flowing to deal pages and Compare via
  // benchmarksForDeal. Divergent trackers encode as the observed low–high
  // spread, never averaged; a null figure emits no row (a gap is a gap).
  // Every row carries its OWN figure's link and citation — the house, the
  // area and the period its block's `vacancy_read` / `rent_read` /
  // `cap_read` states (lib/tracker-read) — never the block's first source,
  // which is another figure's as often as not (Chicago's cap, Essex
  // Realty's April average, had been credited to JPMorgan, the vacancy's
  // source, and its office rent, Cushman's CBD MarketBeat, to Tenantbase's
  // Q1 print); a figure the file ties to no link carries none. `as_of`
  // stays the day the research was read, and the citation says so.
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
    vacancy_read?: unknown;
    rent_read?: unknown;
    cap_read?: unknown;
  };
  for (const m of metrosSeed.metros ?? []) {
    const snap = (
      m as { sector_snapshot?: Record<string, SnapshotBlock | string> | null }
    ).sector_snapshot;
    if (!snap) continue;
    // The snapshot's own date, or none: an empty `as_of` reads "undated"
    // (lib/research `asOfLabel`), never a date the file does not state.
    const snapAsOf = typeof snap.as_of === "string" ? snap.as_of : "";
    for (const [sector, blk] of Object.entries(snap)) {
      if (sector === "as_of" || typeof blk === "string" || !blk) continue;
      const base = {
        sector,
        metro: m.name,
        as_of: snapAsOf,
        status: (blk.status as Benchmark["status"]) ?? "sourced",
        note: blk.note ?? null,
      };
      const vLow = blk.vacancy_pct ?? blk.vacancy_pct_low;
      const vHigh = blk.vacancy_pct ?? blk.vacancy_pct_high ?? vLow;
      if (typeof vLow === "number") {
        const read = figureRead(blk.vacancy_read, blk.sources);
        out.push({
          ...base,
          metric: `${sector}_vacancy_pct`,
          low: vLow,
          high: typeof vHigh === "number" ? vHigh : vLow,
          unit: "pct",
          source: read.links[0] ?? "",
          cite: figureNote(read),
        });
      }
      if (typeof blk.asking_rent_psf === "number") {
        const read = figureRead(blk.rent_read, blk.sources);
        out.push({
          ...base,
          metric: `${sector}_asking_rent_psf`,
          low: blk.asking_rent_psf,
          high: blk.asking_rent_psf,
          unit: "usd_sf_yr",
          source: read.links[0] ?? "",
          cite: figureNote(read),
        });
      }
      if (
        typeof blk.cap_rate_low_pct === "number" &&
        typeof blk.cap_rate_high_pct === "number"
      ) {
        const read = figureRead(blk.cap_read, blk.sources);
        out.push({
          ...base,
          metric: `${sector}_cap_rate_pct`,
          low: blk.cap_rate_low_pct,
          high: blk.cap_rate_high_pct,
          unit: "pct",
          source: read.links[0] ?? "",
          cite: figureNote(read),
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
        as_of: doc.as_of ?? "",
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
      as_of: pmms.as_of ?? "",
      status: (pmms.status as Benchmark["status"]) ?? "sourced",
      note: pmms.note ?? null,
    });
  }
  return out;
}

/** Merge DB benchmark rows over the checked-in seeds (DB wins per key) —
 *  shared by the deal panel and the market page so both tell the same story.
 *  A fair market rent of an older fiscal year than the newest present — a
 *  database row still keyed to last year beside the file's this year — is
 *  left out (lib/fmr `newestFmrOnly`), never shown as current. */
export function mergeBenchmarks(dbRows: Benchmark[] | null | undefined): Benchmark[] {
  const key = (b: Benchmark) => `${b.sector}|${b.metro}|${b.metric}`;
  const byKey = new Map(seedBenchmarks().map((b) => [key(b), b]));
  for (const b of dbRows ?? []) byKey.set(key(b), b);
  return newestFmrOnly([...byKey.values()]);
}

/** Benchmarks relevant to one deal. Matched by covered-market NAME first —
 *  a Brooklyn deal must find the "New York City" FMR row — with the raw city
 *  string as the fallback for labels the market matcher doesn't know. Prefix
 *  match on purpose: seed labels carry suffixes ("Baltimore MD",
 *  "Washington DC area"). DMV suburbs get their OWN rows (each entry in
 *  metros.json carries the Washington HUD area's figures, metro-wide), so
 *  they no longer need to borrow the "Washington DC area" rows. Only the
 *  newest fiscal year's fair market rents come back, whatever was passed. */
export function benchmarksForDeal(
  benchmarks: Benchmark[],
  city?: string | null,
  metroName?: string | null
): Benchmark[] {
  const c = (city ?? "").trim().toLowerCase();
  const m = (metroName ?? "").trim().toLowerCase();
  return newestFmrOnly(benchmarks).filter((b) => {
    if (!b.metro) return false;
    const label = b.metro.toLowerCase();
    return (!!c && label.startsWith(c)) || (!!m && label.startsWith(m));
  });
}

/** A covered metro's fair market rent, by its metros.json id — the one
 *  reader (lib/fmr `fmrOf`) over the research file's entry; null where the
 *  metro or its block is not on file. */
export function metroFmr(id: string): Fmr | null {
  return fmrOf((metrosSeed.metros ?? []).find((m) => m.id === id));
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
  /** what the Census geocoder read at the building (#452, the site flags):
   *  the incorporated place it sits in — null where none, absent where no
   *  lookup has answered — and its county, which stands in for the
   *  address's own county name */
  census?: { place?: { name: string } | null; county?: { name: string } | null } | null;
  sizeText?: string | null;
  yearBuilt?: number | null;
  sectorFields?: Record<string, string | number | boolean> | null;
  /** injected for deterministic tests; defaults to the wall-clock year */
  currentYear?: number;
  /** the deal is rental housing (lib/asset-words); false files it as
   *  commercial property, which the rent-control, TOPA and just-cause rules
   *  are written not to reach; undefined (nothing read yet) keeps the
   *  rental-housing default so their questions stay open */
  residential?: boolean;
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
  const census = input.census ?? null;
  return {
    ...BUYER_DEFAULTS,
    state: input.address?.state || undefined,
    locality: [input.address?.city, census?.county?.name || input.address?.county, input.address?.submarket].filter(
      (s): s is string => !!s
    ),
    ...(census && census.place !== undefined ? { place: census.place ? census.place.name : null } : {}),
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
    // "no other units" assumption the panel declares. With the deal's own
    // count unknown the total is unknown too: counted as none, a building
    // of any size had passed the ≤5 test as a small landlord's.
    owner_total_rental_units_in_county: units === undefined ? undefined : (otherUnits ?? 0) + units,
    owner_total_rental_units_in_state: units === undefined ? undefined : (otherUnits ?? 0) + units,
    ...(otherUnits !== undefined ? { owner_other_rental_units_in_dc: otherUnits } : {}),
    transaction: "sale_of_rental_housing_accommodation",
    // An office, a hotel, a storage facility: the rules conditioned on
    // rental housing evaluate to "does not apply" rather than asking a
    // buyer of a warehouse whether they will live in one unit.
    ...(input.residential === false
      ? { property_type: "commercial_property", transaction: "sale_of_commercial_property" }
      : {}),
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
