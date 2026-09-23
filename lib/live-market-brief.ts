import { permitsTrailingYear, type LiveRate, type SeriesSource } from "@/lib/live-rates";
import { monthOf, type ZoriRead } from "@/lib/zori";
import { HOTNESS_METROS, type RealtorRead } from "@/lib/realtor";
import { assetWords } from "@/lib/asset-words";

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
  metro: { id: string; name: string };
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
export const DEBT_MARKET_IDS = [
  "DGS10",
  "SUBLPDRCSC",
  "SUBLPDRCSM",
  "SUBLPDRCSN",
  "DRCRELEXFACBS",
  "CREACBW027SBOG_YOY",
] as const;

/** The SLOOS series a bank reports for this kind of loan: rental housing
 *  is a multifamily loan, everything else that operates is a nonfarm
 *  nonresidential loan, and a plan deal adds construction and land. */
export function lendingStandardsFor(assetClass: string | null | undefined, plan: boolean): string[] {
  const words = assetWords(assetClass ?? undefined);
  const own = !words.operating ? [] : words.residential ? ["SUBLPDRCSM"] : ["SUBLPDRCSN"];
  return plan || !words.operating ? [...own, "SUBLPDRCSC"] : own;
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
  /** the covered metro's name */
  metro: string;
  /** ISO date the figures were read */
  readOn: string;
  /** one figure a line, dated and sourced */
  lines: string[];
  /** the same figures as values, one per line at most, for a later comparison */
  figures: LiveFigure[];
  /** the block handed to the model */
  text: string;
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

/** "Jul 2026" for a monthly figure, "Q2 2026" for a quarterly one, the day for anything faster. */
export function periodLabel(obsDate: string, cadence: LiveRate["meta"]["cadence"]): string {
  const at = Date.parse(`${obsDate}T00:00:00Z`);
  if (!Number.isFinite(at)) return obsDate;
  const d = new Date(at);
  if (cadence === "quarterly") return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`;
  if (cadence === "monthly") return monthOf(obsDate);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

interface Said {
  line: string;
  figures: LiveFigure[];
}

function rateLine(r: LiveRate): Said | null {
  if (!r.fresh || !Number.isFinite(r.value)) return null;
  const meta = r.meta as LiveRate["meta"] & { metric?: string; area?: string; source?: SeriesSource };
  const when = periodLabel(r.obsDate, meta.cadence);
  const where = meta.area ? `, ${meta.area}` : "";
  const via = publisher(meta.source);
  const fig = (key: string, label: string, unit: LiveFigure["unit"], value = r.value, asOf = r.obsDate): LiveFigure[] => [
    { key, label, value, unit, asOf },
  ];
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
      return {
        line: `Housing units permitted, twelve months to ${monthOf(year.to)}${where}: ${whole(year.units)}${
          year.changePct !== null ? ` (${signed(year.changePct)}% against the twelve months before)` : ""
        }; ${via}`,
        figures: fig("permits_ttm", "Units permitted, trailing year", "count", year.units, year.to),
      };
    }
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

function zoriLine(z: ZoriRead | null): Said | null {
  if (!z) return null;
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

function realtorLine(m: RealtorRead | null): Said | null {
  if (!m) return null;
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
  if (m.hotness) {
    parts.push(
      `hotness rank ${m.hotness.rank} of ${HOTNESS_METROS} metros${
        m.hotness.move && m.hotness.move.direction !== "unchanged"
          ? ` (${m.hotness.move.places > 0 ? m.hotness.move.places : -m.hotness.move.places} places ${m.hotness.move.direction} than a year ago)`
          : ""
      }`,
    );
    figures.push({ key: "rdc_hotness_rank", label: "Hotness rank", value: m.hotness.rank, unit: "rank", asOf: m.hotness.asOf });
  }
  return { line: `For-sale market: ${parts.join(", ")} (${monthOf(m.asOf)}; Realtor.com — list prices are asks, not sales)`, figures };
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
  return out;
}

export function liveMarketBrief(input: LiveMarketInput): LiveMarketBrief | null {
  const said: Said[] = [];
  for (const r of input.rates) {
    const s = rateLine(r);
    if (s) said.push(s);
  }
  const z = zoriLine(input.zori);
  if (z) said.push(z);
  const m = realtorLine(input.realtor);
  if (m) said.push(m);
  said.push(...debtMarketLines(input.national, input.assetClass, input.plan ?? false));
  if (said.length === 0) return null;
  const lines = said.map((s) => s.line);
  const figures = said.flatMap((s) => s.figures);
  const readOn = input.now.toISOString().slice(0, 10);
  const text = [
    `Published figures for the ${input.metro.name} market the deal sits in, read on ${readOn} from FRED, the BLS, the Census Bureau, Zillow Research and Realtor.com. Each is dated, and each is the metro area's — not the submarket's and not the building's.`,
    ...lines.map((l) => `- ${l}`),
  ].join("\n");
  return { metro: input.metro.name, readOn, lines, figures, text };
}
