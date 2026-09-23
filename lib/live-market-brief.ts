import { permitsTrailingYear, type LiveRate, type SeriesSource } from "@/lib/live-rates";
import { monthOf, type ZoriRead } from "@/lib/zori";
import { HOTNESS_METROS, type RealtorRead } from "@/lib/realtor";

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
}

export interface LiveMarketBrief {
  /** the covered metro's name */
  metro: string;
  /** ISO date the figures were read */
  readOn: string;
  /** one figure a line, dated and sourced */
  lines: string[];
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

function rateLine(r: LiveRate): string | null {
  if (!r.fresh || !Number.isFinite(r.value)) return null;
  const meta = r.meta as LiveRate["meta"] & { metric?: string; area?: string; source?: SeriesSource };
  const when = periodLabel(r.obsDate, meta.cadence);
  const where = meta.area ? `, ${meta.area}` : "";
  const via = publisher(meta.source);
  switch (meta.metric) {
    case "unemployment":
      return `Unemployment ${r.value.toFixed(1)}% (${when}${where}; ${via})${
        r.move !== null ? `, ${signed(r.move)} pt on the month before` : ""
      }`;
    case "jobs_yoy":
      return `Nonfarm payrolls ${signed(r.value)}% from a year ago (${when}${where}; ${via})`;
    case "permits": {
      // A month of permits is mostly the season; a year of them is the pipeline.
      const year = permitsTrailingYear(r);
      if (!year) return null;
      return `Housing units permitted, twelve months to ${monthOf(year.to)}${where}: ${whole(year.units)}${
        year.changePct !== null ? ` (${signed(year.changePct)}% against the twelve months before)` : ""
      }; ${via}`;
    }
    case "hpi_yoy":
      return `House prices (FHFA index) ${signed(r.value)}% from a year ago (${when}${where}; ${via})`;
    case "rent_cpi_yoy":
      return `Rent paid by sitting tenants (CPI rent of primary residence) ${signed(r.value)}% from a year ago (${when}${where}; ${via})`;
    case "rental_vacancy_msa":
      return `Rental vacancy, metro area${where}: ${r.value.toFixed(1)}%${
        r.moe !== null ? ` with a ±${r.moe} pt margin of error (a sample — a move inside the margin is noise)` : ""
      } (${when}; ${via})`;
    case "rental_vacancy":
      return `Rental vacancy${where}: ${r.value.toFixed(1)}% (${when}; ${via})`;
    default:
      return null;
  }
}

function zoriLine(z: ZoriRead | null): string | null {
  if (!z) return null;
  const parts = [
    `Asking rent, all home types: $${whole(z.rent)}/mo${z.yoyPct !== null ? `, ${signed(z.yoyPct)}% from a year ago` : ""}`,
  ];
  if (z.mfrRent !== null) {
    parts.push(`apartments alone $${whole(z.mfrRent)}/mo${z.mfrYoyPct !== null ? ` (${signed(z.mfrYoyPct)}%)` : ""}`);
  }
  if (z.homeValue !== null) {
    parts.push(
      `typical home value $${whole(z.homeValue)}${z.homeValueYoyPct !== null ? ` (${signed(z.homeValueYoyPct)}%)` : ""}${
        z.priceToRentYears !== null ? `, ${z.priceToRentYears} years of asking rent` : ""
      }`,
    );
  }
  return `${parts.join("; ")} (${monthOf(z.asOf)}; Zillow Research — listings, before concessions)`;
}

function realtorLine(m: RealtorRead | null): string | null {
  if (!m) return null;
  const parts = [
    `median list price $${whole(m.medianListPrice)}${m.medianListPriceYoyPct !== null ? ` (${signed(m.medianListPriceYoyPct)}% from a year ago)` : ""}`,
  ];
  if (m.activeListings !== null) {
    parts.push(`${whole(m.activeListings)} active listings${m.activeListingsYoyPct !== null ? ` (${signed(m.activeListingsYoyPct)}%)` : ""}`);
  }
  if (m.daysOnMarket !== null) {
    parts.push(`median ${whole(m.daysOnMarket)} days on market${m.daysOnMarketYoyPct !== null ? ` (${signed(m.daysOnMarketYoyPct)}%)` : ""}`);
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
  }
  return `For-sale market: ${parts.join(", ")} (${monthOf(m.asOf)}; Realtor.com — list prices are asks, not sales)`;
}

export function liveMarketBrief(input: LiveMarketInput): LiveMarketBrief | null {
  const lines: string[] = [];
  for (const r of input.rates) {
    const line = rateLine(r);
    if (line) lines.push(line);
  }
  const z = zoriLine(input.zori);
  if (z) lines.push(z);
  const m = realtorLine(input.realtor);
  if (m) lines.push(m);
  if (lines.length === 0) return null;
  const readOn = input.now.toISOString().slice(0, 10);
  const text = [
    `Published figures for the ${input.metro.name} market the deal sits in, read on ${readOn} from FRED, the BLS, the Census Bureau, Zillow Research and Realtor.com. Each is dated, and each is the metro area's — not the submarket's and not the building's.`,
    ...lines.map((l) => `- ${l}`),
  ].join("\n");
  return { metro: input.metro.name, readOn, lines, text };
}
