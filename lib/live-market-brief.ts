import {
  isSectorJobsMetric,
  periodLabel,
  permitsTrailingYear,
  type LiveRate,
  type MetroMetric,
  type SectorJobsMetric,
  type SeriesSource,
} from "@/lib/live-rates";
import { monthOf, zillowFresh, type ZoriRead } from "@/lib/zori";
import { metroSupply, type MetroSupply } from "@/lib/metro-supply";
import { HOTNESS_METROS, realtorFresh, type RealtorRead } from "@/lib/realtor";
import { assetClassKey, assetWords } from "@/lib/asset-words";
import { isDataMetro, isStateMarket } from "@/lib/market-match";
import { placedByClause, type CountyPlacedBy } from "@/lib/placed-by";
import { NO_MULTI_UNIT_SERIES } from "@/lib/permit-split";

export type { CountyPlacedBy } from "@/lib/placed-by";

/**
 * The metro's published figures, written out for the market check — the
 * same figures the market brief draws for a visitor, as dated sentences a
 * model can cite. Pure: the pipeline reads the rows and hands them in.
 *
 * The market check used to reason from typical ranges alone, and said so;
 * it still has no comps feed, but for a deal inside a covered market the
 * site already holds this month's asking rent, the rent sitting tenants
 * are paying, the metro's rental vacancy with its margin, a year of
 * permits, payrolls, house prices and the for-sale market — each pulled
 * on a schedule from its publisher, dated. A check that ignores them while
 * the page beside it shows them is the site being wrong on purpose.
 *
 * Three rules. EVERY LINE CARRIES ITS DATE AND ITS PUBLISHER, so the model
 * cites a figure as the figure it is and never as "the market". ONLY A
 * FRESH FIGURE IS SAID — a stale series is left out rather than offered as
 * current, the same freshness the strip uses. And THE FIGURE IS THE
 * METRO'S: each line names the area it is for (a suburb's lines wear the
 * MSA's name, as its tiles do), the header says so once more, and the
 * prompt tells the model never to pass a metro figure off as the
 * submarket's or the building's. A blank is absent — a metro FRED does not
 * publish a series for has no line for it, never a zero.
 */
export interface LiveMarketInput {
  /** the market; `placedBy` where the deal's county alone placed it there
   *  (lib/market-county, #447), so the header says how */
  metro: { id: string; name: string; placedBy?: CountyPlacedBy | null };
  /** `readMetroRates(metro.id, rows, now)` */
  rates: readonly LiveRate[];
  zori: ZoriRead | null;
  realtor: RealtorRead | null;
  /** the day the figures were read, for the header */
  now: Date;
  /** the national series the debt-market lines read (`DEBT_MARKET_IDS`,
   *  through `readRates`); absent or empty, no debt-market lines */
  national?: readonly LiveRate[];
  /** the deal's asset class, which picks the lending-standards series a
   *  bank reports for its kind of loan */
  assetClass?: string | null;
  /** a plan deal (development, conversion) also reads the construction
   *  lenders' standards */
  plan?: boolean;
  /** the deal builds something (lib/deal-strategy `buildsSomething`: a
   *  development, a conversion, or a value-add with a stated budget), so it
   *  also reads what building costs; a lease-up's building is built */
  builds?: boolean;
  /** a portfolio OM spanning more than one market (lib/portfolio): how
   *  many properties, how many of them sit in THIS market, and the markets
   *  phrase — so the header says whose figures these are. `role` is
   *  "other" for a block read for one of the portfolio's other markets
   *  (after the first, which carries the national lines); on the first
   *  block `othersRead` names the markets whose blocks follow and
   *  `notRead` counts the rest — past the cap, or read with nothing fresh */
  portfolio?: {
    properties: number;
    here: number;
    markets: string;
    role?: "primary" | "other";
    othersRead?: readonly string[];
    notRead?: number;
  } | null;
}

/**
 * The debt market, national, for every deal — the four figures a lender
 * would name first: the 10-year Treasury (what the exit cap and the
 * permanent quote key off), what banks say about their own standards for
 * this KIND of loan (the Fed's quarterly SLOOS: a net share tightening,
 * negative when they are easing), CRE delinquency at commercial banks, and
 * bank CRE lending against a year ago. The metro's figures are the
 * income side; these are the capital side, and a check that reads one
 * without the other reads half the deal.
 */
/**
 * What commercial property is selling for, nationally — the Fed's
 * Financial Accounts price index for commercial real estate, against a
 * year ago (Z.1's Financial Soundness Indicators, quarterly, published
 * about ten weeks after the quarter). The one free, current figure for
 * the value side: the BIS's national series on FRED stopped at 2025 Q2,
 * and the private indexes (Green Street, RCA, CoStar's own) are licensed.
 * Printed by the runner with its notes (rates run 35945851126: no
 * copyright or permission named, where the same flag caught
 * Case-Shiller's) before it was trusted. A trailing year of prices, said
 * as the nation's — never this market's, never a forecast, and never a
 * cap rate.
 *
 * It EXCLUDES apartments. The Fed's series analyzer says the Financial
 * Accounts index is built, since 1996, from "the Costar U.S. Composite Index
 * Excluding Multifamily: Value Weighted" (zori probe run 36814538224), and
 * this series is that index's own change from a year ago, figure for figure
 * (rates run 36814949981: 8.80683, 7.54922, 1.59015 against 8.8068348464,
 * 7.5492240848, 1.5901502087). So it is said as excluding apartments, with
 * the index it is built on, and a rental-housing deal is not handed it: it
 * says nothing about what apartments sell for.
 */
export const CRE_PRICE_ID = "BOGZ1FL010000386Q";

export const DEBT_MARKET_IDS = [
  "DGS10",
  "SUBLPDRCSC",
  "SUBLPDRCSM",
  "SUBLPDRCSN",
  "DRCRELEXFACBS",
  "CREACBW027SBOG_YOY",
  CRE_PRICE_ID,
] as const;

/** The SLOOS series a bank reports for this kind of loan: rental housing
 *  is a multifamily loan, everything else that operates is a nonfarm
 *  nonresidential loan, and a plan deal adds construction and land. */
export function lendingStandardsFor(assetClass: string | null | undefined, plan: boolean): string[] {
  const words = assetWords(assetClass ?? undefined);
  const own = !words.operating ? [] : words.residential ? ["SUBLPDRCSM"] : ["SUBLPDRCSN"];
  return plan || !words.operating ? [...own, "SUBLPDRCSC"] : own;
}

/**
 * The rents each kind of commercial lessor charges, nationally — the BLS
 * producer price indexes for lessors of nonresidential buildings, by the
 * building let: professional and office buildings, shopping centers and
 * retail stores, manufacturing and industrial buildings, miniwarehouse and
 * self-storage operators, and the aggregate for a net lease, a data center
 * or a parking structure. A residential deal has the metro's own rents
 * (Zillow's asking rents, the CPI rent) and reads none of these; lodging
 * sells nights and licensed care sells care, neither a lessor's rent; land
 * has no rent. Every id was printed by the runner (rates run 35917247236)
 * before it was trusted, and the figure is said as the nation's, never the
 * metro's — the one national figure on the income side of the brief.
 */
export const RENT_INDEX_IDS = [
  "PCU531120531120_YOY",
  "PCU5311205311202_YOY",
  "PCU5311205311201_YOY",
  "PCU5311205311203_YOY",
  "PCU531130531130_YOY",
] as const;

/**
 * What commercial property insurance costs, nationally — the BLS producer
 * price index for premiums for commercial multiple peril insurance, the
 * policy a building carries, against a year ago. The insurance line is the
 * expense that reprices hardest and gets read least: a memorandum's premium
 * is the seller's expiring policy, bound on limits the seller chose in a
 * market that may no longer exist, and this index says how far a new
 * owner's quote has moved since. Every operating class carries one; land
 * does not. Printed by the runner (rates run 35929534333) before it was
 * trusted, and said as the nation's carriers, never this building's quote.
 */
export const INSURANCE_INDEX_ID = "PCU9241269241265_YOY";

/**
 * What building costs, nationally, for a deal that builds something — a
 * development or a conversion, whose budget is the deal, or a value-add that
 * states its budget. The BLS producer price index
 * for the goods that go into construction, residential or nonresidential
 * by what is being built, and construction's average hourly earnings, each
 * against a year ago. Both already ride the rates strip (every id was
 * printed by the runner before it went into data/fred-series.json); here
 * they are the figures a budget's escalation and contingency are checked
 * against. The nation's, a trailing year — never this project's bids.
 */
export const CONSTRUCTION_COST_IDS = {
  residentialInputs: "WPUIP2311001_YOY",
  nonresidentialInputs: "WPUIP2312001_YOY",
  wages: "CES2000000003_YOY",
} as const;

/** The national series the brief reads for a deal: the debt market's, the
 *  rent index for the deal's kind of lessor, the insurance premium index
 *  and, for a plan deal, what building costs. One list, so the pipeline's
 *  read and the page's cannot differ. */
export const BRIEF_NATIONAL_IDS: readonly string[] = [
  ...DEBT_MARKET_IDS,
  ...RENT_INDEX_IDS,
  INSURANCE_INDEX_ID,
  ...Object.values(CONSTRUCTION_COST_IDS),
];

export interface RentIndex {
  id: (typeof RENT_INDEX_IDS)[number];
  /** "lessors of professional and office buildings" — how a sentence names the index */
  lessor: string;
}

export function rentIndexFor(assetClass: string | null | undefined): RentIndex | null {
  const key = assetClassKey(assetClass);
  if (!key) return null;
  const words = assetWords(key);
  if (words.residential || !words.operating) return null;
  switch (key) {
    case "office":
    case "medical_office":
      return { id: "PCU5311205311202_YOY", lessor: "lessors of professional and office buildings" };
    case "retail":
      return { id: "PCU5311205311201_YOY", lessor: "lessors of shopping centers and retail stores" };
    case "industrial":
      return { id: "PCU5311205311203_YOY", lessor: "lessors of manufacturing and industrial buildings" };
    case "self_storage":
      return { id: "PCU531130531130_YOY", lessor: "miniwarehouse and self-storage operators" };
    case "net_lease":
    case "data_center":
    case "parking":
      return { id: "PCU531120531120_YOY", lessor: "lessors of nonresidential buildings" };
    default:
      return null;
  }
}

/**
 * The metro's payrolls in the sector that fills the deal's kind of building
 * — the BLS's supersector employment for the MSA, which the table holds
 * for every covered metro (five sectors a metro), against a year ago. Total
 * nonfarm is on every brief already and is what rental housing reads; a
 * commercial deal reads ITS sector and no other, so the check is handed
 * the payrolls that fill offices for an office and never the retail trade
 * count beside them. A class no one sector fills — a net lease, whose
 * tenant may be a store or a distribution centre; a data centre; storage;
 * parking; land — reads none, because a sector picked for it would be a
 * guess wearing a figure.
 */
export interface SectorJobs {
  metric: SectorJobsMetric;
  /** "professional and business services" — how a sentence names the sector */
  sector: string;
  /** "the sector that fills offices" — why the deal reads it */
  fills: string;
}

export function sectorJobsFor(assetClass: string | null | undefined): SectorJobs | null {
  const key = assetClassKey(assetClass);
  if (!key) return null;
  switch (key) {
    case "office":
      return { metric: "jobs_pbs_yoy", sector: "professional and business services", fills: "the sector that fills offices" };
    case "medical_office":
      return { metric: "jobs_eduhealth_yoy", sector: "education and health services", fills: "the sector that fills medical offices" };
    case "senior_housing":
      return { metric: "jobs_eduhealth_yoy", sector: "education and health services", fills: "the sector that staffs senior housing" };
    case "industrial":
      return { metric: "jobs_transport_yoy", sector: "transportation, warehousing and utilities", fills: "the sector that fills warehouses" };
    case "retail":
      return { metric: "jobs_retail_yoy", sector: "retail trade", fills: "the sector that fills stores" };
    case "hospitality_str":
      return { metric: "jobs_leisure_yoy", sector: "leisure and hospitality", fills: "the sector that runs hotels" };
    default:
      return null;
  }
}

/**
 * The payroll count a sector PAGE ranks the covered markets by: the sector
 * that fills that kind of building, and for rental housing all payrolls —
 * the same figure the apartment brief reads. Null for a sector page no
 * payroll count speaks to.
 */
export function sectorPayrollMetric(sector: string | null | undefined): MetroMetric | null {
  const own = sectorJobsFor(sector);
  if (own) return own.metric;
  const words = assetWords(sector ?? undefined);
  return words.residential && words.operating ? "jobs_yoy" : null;
}

/** One figure the check read, as a value: what a later screen compares
 *  today's read against ("since this screen: asking rent +1.2%, the metro's
 *  vacancy +0.4 pt"). The sentences are for the model and the reader; the
 *  values are for the arithmetic, and a value is never re-parsed out of a
 *  sentence. */
export interface LiveFigure {
  /** the series' metric or the benchmark's metric id — "unemployment", "permits_ttm", "zori_rent", "rdc_hotness_rank" */
  key: string;
  label: string;
  value: number;
  unit: "pct" | "pts" | "usd" | "count" | "days" | "rank" | "years";
  /** the observation's own date */
  asOf: string;
}

export interface LiveMarketBrief {
  /** the covered metro's name — or the state's, for a deal outside the covered metros */
  metro: string;
  /** whose figures these are: a covered metro's, or the state's for a deal
   *  outside the metros the site tracks — every surface that prints the
   *  brief says which, because a state figure passed off as a metro's is
   *  a figure for a market the deal is not in */
  grain: "metro" | "state";
  /** ISO date the figures were read */
  readOn: string;
  /** one figure a line, dated and sourced */
  lines: string[];
  /** the same figures as values, one per line at most, for a later comparison */
  figures: LiveFigure[];
  /** the block handed to the model */
  text: string;
  /** how many of `lines` — the last ones — are national figures (the debt
   *  market, the lessor rents, the insurance index, CRE prices), so no
   *  surface calls them the metro's */
  national: number;
  /** a portfolio across markets: how many of its properties sit in this
   *  market of how many in all — stored with the record so every surface
   *  can say whose figures these are */
  portfolio?: { here: number; of: number } | null;
  /** where the deal's county alone placed it in this market (#447): the
   *  county and the metro area the Census Bureau files it in, stored so
   *  every surface can say how a Frisco deal came to read Dallas-Fort
   *  Worth's figures; absent where the address named the market */
  placedBy?: CountyPlacedBy | null;
}

const signed = (v: number, dp = 1): string => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(dp)}`;
const whole = (n: number): string => Math.round(n).toLocaleString("en-US");

function publisher(source: SeriesSource | undefined): string {
  switch (source) {
    case "bls":
      return "the BLS";
    case "census":
      return "the Census Bureau's Housing Vacancy Survey";
    default:
      return "FRED";
  }
}

/** "Jul 2026" for a monthly figure, "Q2 2026" for a quarterly one, the day
 *  with its year for anything faster — lib/live-rates' one formatter, which
 *  every live figure on the site is dated through. */
export { periodLabel } from "@/lib/live-rates";

interface Said {
  line: string;
  figures: LiveFigure[];
}

function rateLine(r: LiveRate, sector: SectorJobs | null, supply: MetroSupply | null = null): Said | null {
  if (!r.fresh || !Number.isFinite(r.value)) return null;
  const meta = r.meta as LiveRate["meta"] & { metric?: string; area?: string; source?: SeriesSource };
  const when = periodLabel(r.obsDate, meta.cadence);
  const where = meta.area ? `, ${meta.area}` : "";
  const via = publisher(meta.source);
  const fig = (key: string, label: string, unit: LiveFigure["unit"], value = r.value, asOf = r.obsDate): LiveFigure[] => [
    { key, label, value, unit, asOf },
  ];
  // A sector's payrolls are said for the deal that reads that sector, and
  // for no other: the office deal gets the office-using sector's line, not
  // the four beside it. One figure key, so a later screen of the same deal
  // compares the same sector.
  if (meta.metric && isSectorJobsMetric(meta.metric)) {
    if (!sector || sector.metric !== meta.metric) return null;
    return {
      line: `Payrolls in ${sector.sector}, ${sector.fills}: ${signed(r.value)}% from a year ago (${when}${where}; ${via})`,
      figures: fig("sector_jobs_yoy", `Payrolls, ${sector.sector}`, "pts"),
    };
  }
  switch (meta.metric) {
    case "unemployment":
      return {
        line: `Unemployment ${r.value.toFixed(1)}% (${when}${where}; ${via})${
          r.move !== null ? `, ${signed(r.move)} pt on the month before` : ""
        }`,
        figures: fig("unemployment", "Unemployment", "pts"),
      };
    case "jobs_yoy":
      return {
        line: `Nonfarm payrolls ${signed(r.value)}% from a year ago (${when}${where}; ${via})`,
        figures: fig("jobs_yoy", "Payrolls y/y", "pts"),
      };
    case "permits": {
      // A month of permits is mostly the season; a year of them is the pipeline.
      const year = permitsTrailingYear(r);
      if (!year) return null;
      // The multi-unit part of the same year, where the single-family series
      // is on hand: the total less it, said as such, with its own figure key
      // so a later screen compares the pipeline an apartment competes with.
      const split =
        supply && supply.fresh && supply.to === year.to
          ? `, of which ${whole(supply.multi)} in buildings of two or more units${
              supply.multiChangePct !== null ? ` (${signed(supply.multiChangePct)}%)` : ""
            } — the total less the single-family series, since ${NO_MULTI_UNIT_SERIES}`
          : "";
      return {
        line: `Housing units permitted, twelve months to ${monthOf(year.to)}${where}: ${whole(year.units)}${
          year.changePct !== null ? ` (${signed(year.changePct)}% against the twelve months before)` : ""
        }${split}; ${via}`,
        figures: [
          ...fig("permits_ttm", "Units permitted, trailing year", "count", year.units, year.to),
          ...(split ? fig("permits_multi_ttm", "Units permitted in 2+ unit buildings, trailing year", "count", supply!.multi, supply!.to) : []),
        ],
      };
    }
    case "permits_1unit":
      // Never a line of its own: it is the other half of the permits line.
      return null;
    case "rental_vacancy_state":
      // The survey's annual figure for the whole state: a year's rate, not
      // a quarter's, and the state's, not any metro's inside it.
      return {
        line: `Rental vacancy${where}, the state's annual figure: ${r.value.toFixed(1)}% (${when}; the Census Bureau's Housing Vacancy Survey via FRED — a year's rate for the whole state, not a quarter's for a metro)`,
        figures: fig("rental_vacancy_state", "Rental vacancy, state (annual)", "pts"),
      };
    case "hpi_yoy":
      return {
        line: `House prices (FHFA index) ${signed(r.value)}% from a year ago (${when}${where}; ${via})`,
        figures: fig("hpi_yoy", "House prices y/y", "pts"),
      };
    case "rent_cpi_yoy":
      return {
        line: `Rent paid by sitting tenants (CPI rent of primary residence) ${signed(r.value)}% from a year ago (${when}${where}; ${via})`,
        figures: fig("rent_cpi_yoy", "Rent CPI y/y", "pts"),
      };
    case "rental_vacancy_msa":
      return {
        line: `Rental vacancy, metro area${where}: ${r.value.toFixed(1)}%${
          r.moe !== null ? ` with a ±${r.moe} pt margin of error (a sample — a move inside the margin is noise)` : ""
        } (${when}; ${via})`,
        figures: fig("rental_vacancy_msa", "Rental vacancy, metro area", "pts"),
      };
    case "rental_vacancy":
      return {
        line: `Rental vacancy${where}: ${r.value.toFixed(1)}% (${when}; ${via})`,
        figures: fig("rental_vacancy", "Rental vacancy, Census region", "pts"),
      };
    default:
      return null;
  }
}

/** Zillow's figures, one line under the month they are all of (lib/zori
 *  reads each only where its own row is of the rent's month) — and only
 *  while that month is current on the brief's day, the same limit the read
 *  and the feeds card use, so a read made on another day cannot say one. */
function zoriLine(z: ZoriRead | null, now: Date): Said | null {
  if (!z || !zillowFresh(z.asOf, now)) return null;
  const parts = [
    `Asking rent, all home types: $${whole(z.rent)}/mo${z.yoyPct !== null ? `, ${signed(z.yoyPct)}% from a year ago` : ""}`,
  ];
  const figures: LiveFigure[] = [{ key: "zori_rent", label: "Asking rent, all home types", value: z.rent, unit: "usd", asOf: z.asOf }];
  if (z.mfrRent !== null) {
    parts.push(`apartments alone $${whole(z.mfrRent)}/mo${z.mfrYoyPct !== null ? ` (${signed(z.mfrYoyPct)}%)` : ""}`);
    figures.push({ key: "zori_mfr_rent", label: "Asking rent, apartments", value: z.mfrRent, unit: "usd", asOf: z.asOf });
  }
  if (z.homeValue !== null) {
    parts.push(
      `typical home value $${whole(z.homeValue)}${z.homeValueYoyPct !== null ? ` (${signed(z.homeValueYoyPct)}%)` : ""}${
        z.priceToRentYears !== null ? `, ${z.priceToRentYears} years of asking rent` : ""
      }`,
    );
    figures.push({ key: "zhvi", label: "Typical home value", value: z.homeValue, unit: "usd", asOf: z.asOf });
  }
  return { line: `${parts.join("; ")} (${monthOf(z.asOf)}; Zillow Research — listings, before concessions)`, figures };
}

/** Realtor.com's figures, one line under the inventory's month — the
 *  hotness rank, from a file of its own that can be a month behind, under
 *  its own month where that differs — each only while current on the
 *  brief's day. */
function realtorLine(m: RealtorRead | null, now: Date): Said | null {
  if (!m || !realtorFresh(m.asOf, now)) return null;
  const parts = [
    `median list price $${whole(m.medianListPrice)}${m.medianListPriceYoyPct !== null ? ` (${signed(m.medianListPriceYoyPct)}% from a year ago)` : ""}`,
  ];
  const figures: LiveFigure[] = [
    { key: "rdc_median_list_price", label: "Median list price", value: m.medianListPrice, unit: "usd", asOf: m.asOf },
  ];
  if (m.activeListings !== null) {
    parts.push(`${whole(m.activeListings)} active listings${m.activeListingsYoyPct !== null ? ` (${signed(m.activeListingsYoyPct)}%)` : ""}`);
    figures.push({ key: "rdc_active_listings", label: "Active listings", value: m.activeListings, unit: "count", asOf: m.asOf });
  }
  if (m.daysOnMarket !== null) {
    parts.push(`median ${whole(m.daysOnMarket)} days on market${m.daysOnMarketYoyPct !== null ? ` (${signed(m.daysOnMarketYoyPct)}%)` : ""}`);
    figures.push({ key: "rdc_days_on_market", label: "Median days on market", value: m.daysOnMarket, unit: "days", asOf: m.asOf });
  }
  if (m.direction) parts.push(`${m.direction} on both flow figures`);
  const h = m.hotness && realtorFresh(m.hotness.asOf, now) ? m.hotness : null;
  if (h) {
    // The line's month is the inventory's; a rank of another month says its own.
    const ownMonth = h.asOf !== m.asOf ? ` for ${monthOf(h.asOf)}` : "";
    parts.push(
      `hotness rank ${h.rank} of ${HOTNESS_METROS} metros${ownMonth}${
        h.move && h.move.direction !== "unchanged"
          ? ` (${h.move.places > 0 ? h.move.places : -h.move.places} places ${h.move.direction} than a year ago)`
          : ""
      }`,
    );
    figures.push({ key: "rdc_hotness_rank", label: "Hotness rank", value: h.rank, unit: "rank", asOf: h.asOf });
  }
  return { line: `For-sale market: ${parts.join(", ")} (${monthOf(m.asOf)}; Realtor.com — list prices are asks, not sales)`, figures };
}

/** The rents the deal's kind of lessor charges, nationally — one line, said as the nation's. */
function rentIndexLine(national: readonly LiveRate[] | undefined, assetClass: string | null | undefined): Said | null {
  const idx = rentIndexFor(assetClass);
  if (!idx || !national) return null;
  const r = national.find((x) => x.meta.id === idx.id && x.fresh && Number.isFinite(x.value));
  if (!r) return null;
  return {
    line: `Rents charged by ${idx.lessor}, national (BLS producer price index): ${signed(r.value)}% from a year ago (${periodLabel(r.obsDate, r.meta.cadence)}; BLS via FRED) — the nation's lessors, not the metro's`,
    figures: [
      { key: "rent_index_yoy", label: `Rents charged by ${idx.lessor}, national`, value: r.value, unit: "pts", asOf: r.obsDate },
    ],
  };
}

/** The insurance premium index, for every class that carries a policy. */
function insuranceLine(national: readonly LiveRate[] | undefined, assetClass: string | null | undefined): Said | null {
  if (!national) return null;
  const words = assetWords(assetClass ?? undefined);
  if (!words.operating) return null;
  const r = national.find((x) => x.meta.id === INSURANCE_INDEX_ID && x.fresh && Number.isFinite(x.value));
  if (!r) return null;
  return {
    line: `Commercial property insurance premiums, national (BLS producer price index, commercial multiple peril): ${signed(r.value)}% from a year ago (${periodLabel(r.obsDate, r.meta.cadence)}; BLS via FRED) — the nation's carriers, not this building's quote; a memorandum's premium is the seller's expiring policy`,
    figures: [
      { key: "insurance_index_yoy", label: "Commercial property insurance premiums, national", value: r.value, unit: "pts", asOf: r.obsDate },
    ],
  };
}

/** What building costs, for a deal that builds something: the goods that go
 *  into what is being built, and the wages of the people building it, each
 *  the nation's against a year ago. A deal that builds nothing — a stabilized
 *  building, a lease-up, a value-add that states no budget — reads neither. */
function constructionCostLines(
  national: readonly LiveRate[] | undefined,
  assetClass: string | null | undefined,
  builds: boolean,
): Said[] {
  if (!builds || !national) return [];
  const fresh = (id: string) => national.find((x) => x.meta.id === id && x.fresh && Number.isFinite(x.value)) ?? null;
  const residential = assetWords(assetClass ?? undefined).residential;
  const inputs = fresh(residential ? CONSTRUCTION_COST_IDS.residentialInputs : CONSTRUCTION_COST_IDS.nonresidentialInputs);
  const wages = fresh(CONSTRUCTION_COST_IDS.wages);
  const out: Said[] = [];
  if (inputs) {
    const kind = residential ? "residential" : "nonresidential";
    out.push({
      line: `Construction costs — the goods that go into ${kind} construction, national (BLS producer price index): ${signed(inputs.value)}% from a year ago (${periodLabel(inputs.obsDate, inputs.meta.cadence)}; BLS via FRED) — the nation's, not this project's bids`,
      figures: [
        { key: "construction_inputs_yoy", label: `Goods into ${kind} construction, national`, value: inputs.value, unit: "pts", asOf: inputs.obsDate },
      ],
    });
  }
  if (wages) {
    out.push({
      line: `Construction costs — average hourly earnings in construction, national: ${signed(wages.value)}% from a year ago (${periodLabel(wages.obsDate, wages.meta.cadence)}; BLS via FRED) — the nation's, not this project's labor`,
      figures: [{ key: "construction_wages_yoy", label: "Construction wages, national", value: wages.value, unit: "pts", asOf: wages.obsDate }],
    });
  }
  return out;
}

const SLOOS_LABEL: Record<string, { key: string; loan: string }> = {
  SUBLPDRCSM: { key: "sloos_multifamily", loan: "multifamily loans" },
  SUBLPDRCSN: { key: "sloos_nonres", loan: "nonfarm nonresidential loans" },
  SUBLPDRCSC: { key: "sloos_construction", loan: "construction and land development loans" },
};

function debtMarketLines(
  national: readonly LiveRate[] | undefined,
  assetClass: string | null | undefined,
  plan: boolean,
): Said[] {
  if (!national || national.length === 0) return [];
  const by = new Map(national.filter((r) => r.fresh && Number.isFinite(r.value)).map((r) => [r.meta.id, r]));
  const out: Said[] = [];
  const ten = by.get("DGS10");
  if (ten) {
    out.push({
      line: `Debt market — 10-year Treasury ${ten.value.toFixed(2)}% (${periodLabel(ten.obsDate, ten.meta.cadence)}; FRED)${
        ten.move !== null ? `, ${signed(ten.move, 0)} bps on the day before` : ""
      }`,
      figures: [{ key: "dgs10", label: "10-year Treasury", value: ten.value, unit: "pct", asOf: ten.obsDate }],
    });
  }
  for (const id of lendingStandardsFor(assetClass, plan)) {
    const r = by.get(id);
    const meta = SLOOS_LABEL[id];
    if (!r || !meta) continue;
    out.push({
      line: `Debt market — banks tightening standards for ${meta.loan}: a net ${signed(r.value)}% of banks (${periodLabel(r.obsDate, r.meta.cadence)}; Fed SLOOS via FRED; negative is a net share easing)`,
      figures: [{ key: meta.key, label: `Banks tightening, ${meta.loan}`, value: r.value, unit: "pts", asOf: r.obsDate }],
    });
  }
  const dq = by.get("DRCRELEXFACBS");
  if (dq) {
    out.push({
      line: `Debt market — CRE loan delinquency at commercial banks ${dq.value.toFixed(2)}% (${periodLabel(dq.obsDate, dq.meta.cadence)}; FRED)`,
      figures: [{ key: "cre_delinquency", label: "CRE loan delinquency", value: dq.value, unit: "pct", asOf: dq.obsDate }],
    });
  }
  const loans = by.get("CREACBW027SBOG_YOY");
  if (loans) {
    out.push({
      line: `Debt market — bank CRE lending ${signed(loans.value)}% from a year ago (${periodLabel(loans.obsDate, loans.meta.cadence)}; FRED, from the Fed's H.8)`,
      figures: [{ key: "cre_loans_yoy", label: "Bank CRE lending y/y", value: loans.value, unit: "pts", asOf: loans.obsDate }],
    });
  }
  // What the capital buys: commercial property prices, for a building that
  // trades on its income. Land's value is its entitlement, not this index,
  // and rental housing is outside it: the index excludes apartments.
  const prices = by.get(CRE_PRICE_ID);
  const words = assetWords(assetClass ?? undefined);
  if (prices && words.operating && !words.residential) {
    out.push({
      line: `Capital markets — commercial real estate prices excluding apartments, national: ${signed(prices.value)}% from a year ago (${periodLabel(prices.obsDate, prices.meta.cadence)}; the Fed's Financial Accounts, built on CoStar's composite index excluding multifamily, via FRED) — the nation's, a trailing year, not this market's and not a cap rate`,
      figures: [{ key: "cre_prices_yoy", label: "Commercial real estate prices excluding apartments, national", value: prices.value, unit: "pts", asOf: prices.obsDate }],
    });
  }
  return out;
}

/** Whose figures a market id's are: a state's (`state:PA`) or a metro's. */
const grainOf = (id: string): LiveMarketBrief["grain"] => (isStateMarket(id) ? "state" : "metro");

/**
 * The metro's figures about housing: the survey's rental vacancy (the metro
 * area's, the region's, the state's), the rent sitting tenants pay (CPI
 * rent), house prices and the housing units permitted. With Zillow's asking
 * rents and Realtor.com's for-sale market, they speak to rental housing and
 * to nothing else (research pass 18): an office's vacancy is not the
 * apartment survey's, its rent is not a renter's, and its supply is not the
 * housing pipeline — the model's read (lib/model-vs-market), the demand
 * card's supply line (lib/metro-demand) and now the market check all hold
 * them to a `residential` class. Unemployment and all payrolls speak to
 * every deal; a commercial deal reads its own sector's payrolls and its kind
 * of lessor's national rents instead.
 */
const HOUSING_METRICS: ReadonlySet<string> = new Set([
  "rental_vacancy_msa",
  "rental_vacancy",
  "rental_vacancy_state",
  "rent_cpi_yoy",
  "hpi_yoy",
  "permits",
  "permits_1unit",
]);

export function liveMarketBrief(input: LiveMarketInput): LiveMarketBrief | null {
  const said: Said[] = [];
  const sector = sectorJobsFor(input.assetClass);
  const supply = metroSupply(input.rates);
  // Rental housing reads the housing figures; every other class — and a
  // class nothing has resolved — reads none of them (`assetWords`).
  const housing = assetWords(input.assetClass ?? undefined).residential;
  for (const r of input.rates) {
    const metric = (r.meta as { metric?: string }).metric;
    if (!housing && metric && HOUSING_METRICS.has(metric)) continue;
    const s = rateLine(r, sector, supply);
    if (s) said.push(s);
  }
  const z = housing ? zoriLine(input.zori, input.now) : null;
  if (z) said.push(z);
  const m = housing ? realtorLine(input.realtor, input.now) : null;
  if (m) said.push(m);
  // Everything after this point is national, and every surface says how
  // many: "each the metro's" over a block that ends with the 10-year was
  // a claim the block did not bear out.
  const local = said.length;
  // A commercial deal's rents are national: the income side's one national
  // figure, ahead of the debt market's.
  const ri = rentIndexLine(input.national, input.assetClass);
  if (ri) said.push(ri);
  // And the one national figure on the expense side: what the policy a
  // building carries costs this year against last.
  const ins = insuranceLine(input.national, input.assetClass);
  if (ins) said.push(ins);
  // A plan deal's budget is the deal: what building costs this year against
  // last, the goods and the labor.
  said.push(...constructionCostLines(input.national, input.assetClass, input.builds ?? false));
  said.push(...debtMarketLines(input.national, input.assetClass, input.plan ?? false));
  if (said.length === 0) return null;
  const national = said.length - local;
  const nationalNote =
    national > 0
      ? ` ${national === 1 ? "The last line is the nation's figure, said as such" : `The last ${national} lines are the nation's figures, each said as such`}, and never this ${grainOf(input.metro.id) === "state" ? "state's" : "market's"}.`
      : "";
  const lines = said.map((s) => s.line);
  const figures = said.flatMap((s) => s.figures);
  const readOn = input.now.toISOString().slice(0, 10);
  // The grain is said first: a deal outside the metros the site tracks
  // reads its STATE's figures, and a state figure passed off as a metro's
  // flatters or damns a market the deal is not in.
  const grain: LiveMarketBrief["grain"] = grainOf(input.metro.id);
  const pf = input.portfolio && input.portfolio.properties >= 2 ? input.portfolio : null;
  // The publishers the block can carry: the Census Bureau's survey, Zillow,
  // Realtor.com and the BLS's own CPI rent series speak to rental housing
  // alone, so a commercial deal's block — its every line read through FRED
  // — never names them.
  const sources = !housing
    ? "FRED"
    : grain === "state"
      ? "FRED and the Census Bureau"
      : "FRED, the BLS, the Census Bureau, Zillow Research and Realtor.com";
  const whose = grain === "state" ? "the state's" : "the metro area's";
  // One of a portfolio's OTHER markets (#413): its own block, saying which
  // of the portfolio's properties it speaks for — never the portfolio's,
  // and never those properties' own. The national figures ride in the
  // first block alone.
  if (pf?.role === "other") {
    const sit = `${pf.here} of the portfolio's ${pf.properties} properties ${pf.here === 1 ? "sits" : "sit"}`;
    const otherHeader =
      grain === "state"
        ? `Published figures for the state of ${input.metro.name}, where ${sit} outside the metros the site tracks, read on ${readOn} from ${sources}. Each is dated, and each is the state's — not a metro's, not those properties' own and never the portfolio's.`
        : `Published figures for the ${input.metro.name} ${isDataMetro(input.metro.id) ? "metro area — a market the site reads but does not brief —" : "market,"} where ${sit}, read on ${readOn} from ${sources}. Each is dated, and each is the metro area's — not the submarket's, not those properties' own and never the portfolio's.`;
    const text = [otherHeader + nationalNote, ...lines.map((l) => `- ${l}`)].join("\n");
    return { metro: input.metro.name, grain, readOn, lines, figures, text, national, portfolio: { here: pf.here, of: pf.properties } };
  }
  // A metro area the site reads without a brief says so in the header: the
  // figures are the metro's own, and there is no brief, comps pull or
  // tracker behind them for the model to lean on. A deal its county placed
  // (#447) says that too: the address named no place the market's own list
  // knows, and the figures are the metro area's, never the county's.
  const placed = grain === "metro" ? (input.metro.placedBy ?? null) : null;
  const placedNote = placed ? `${placedByClause(placed)}, and the address names no place the site's list for this market does` : "";
  const notCounty = placed ? " — not the county's," : " —";
  const header =
    grain === "state"
      ? `Published figures for the state of ${input.metro.name} the deal sits in — the address lies outside the metros the site tracks, so these are the state's own figures — read on ${readOn} from ${sources}. Each is dated, and each is the state's — not the metro's, not the submarket's and not the building's.`
      : isDataMetro(input.metro.id)
        ? `Published figures for the ${input.metro.name} metro area the deal sits in — a market the site reads but does not brief, so these figures are all it holds for it${placedNote} — read on ${readOn} from ${sources}. Each is dated, and each is ${whose}${notCounty} not the submarket's and not the building's.`
        : `Published figures for the ${input.metro.name} market the deal sits in${placed ? `${placedNote} —` : ","} read on ${readOn} from ${sources}. Each is dated, and each is ${whose}${notCounty} not the submarket's and not the building's.`;
  // A portfolio across several markets: these are one market's figures,
  // and the header says which properties they speak for — and whether the
  // other markets' figures follow in blocks of their own.
  const others = pf?.othersRead ?? [];
  const notRead = pf?.notRead ?? 0;
  const rest =
    others.length > 0
      ? ` — the figures for ${others.length === 1 ? others[0] : `${others.slice(0, -1).join(", ")} and ${others.at(-1)}`} follow in blocks of their own${
          notRead > 0 ? `, and ${notRead} more ${notRead === 1 ? "market has" : "markets have"} no figures here` : ""
        }, and a figure is never the portfolio's.`
      : " — the other markets' properties are not read here, and a figure below is never the portfolio's.";
  const portfolioSentence = pf
    ? ` The deal is a portfolio of ${pf.properties} properties across ${pf.markets}; these figures are for ${pf.here > 0 ? `the ${pf.here} ${pf.here === 1 ? "property" : "properties"} in ${input.metro.name}` : `the address on file in ${input.metro.name}, where none of the listed properties' own addresses sits`}${rest}`
    : "";
  const text = [header + nationalNote + portfolioSentence, ...lines.map((l) => `- ${l}`)].join("\n");
  return {
    metro: input.metro.name,
    grain,
    readOn,
    lines,
    figures,
    text,
    national,
    portfolio: pf ? { here: pf.here, of: pf.properties } : null,
    ...(placed ? { placedBy: { county: placed.county, area: placed.area } } : {}),
  };
}
