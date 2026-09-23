import type { LiveRate, SeriesSource } from "@/lib/live-rates";
import { assetWords } from "@/lib/asset-words";
import { monthOf, type ZoriRead } from "@/lib/zori";
import type { DerivedModel, InputSource } from "@/lib/underwrite/inputs";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { INSURANCE_INDEX_ID, periodLabel, rentIndexFor } from "@/lib/live-market-brief";
import { datedLong } from "@/lib/debt-index";
import { inferStrategy, isPlanDeal } from "@/lib/deal-strategy";
import { findGoingInCap, parsePct } from "@/lib/criteria";
import { shownAssetClass } from "@/lib/pipeline-slots";
import { bandText, trackerFor, type TrackerRead } from "@/lib/tracker-read";

/**
 * The model's assumptions against the published figures — pure, no model
 * call. The screening model runs on four numbers that decide its return
 * more than any others: rent growth, expense growth, stabilized vacancy
 * and the exit cap. Two of them are flat defaults on every deal (3.0%/yr,
 * "set your view"), and the market brief beside the deal shows what the
 * metro has actually done — so this sets each assumption against the
 * figure that speaks to it, dated and sourced, and says which way the
 * assumption runs. It does NOT say the assumption is wrong: a trailing
 * year is what the assumption is being asked to beat, not a forecast, and
 * the sentence says so.
 *
 * The submarket card (`lib/market/checks.ts`) does the same job against
 * the analyst's OWN submarket data — a rent series they loaded, a pipeline
 * they keyed. This runs on the feeds every deal gets for nothing, so a
 * deal with no submarket linked still has its growth read against
 * something real.
 *
 * Four rules. **Only a fresh figure is read** (the brief's rule): a stale
 * series is left out and the check is omitted rather than made against a
 * figure its publisher has stopped updating. **A figure is set against an
 * assumption of its own kind**: rental housing's asking rents and the
 * survey's rental vacancy speak to a residential deal and to nothing else,
 * so an office keeps its rent and vacancy rows blank instead of being read
 * against apartments; consumer prices and the 10-year speak to every
 * operating deal; land has no operating assumptions. **The survey's margin
 * is the tolerance**: a vacancy assumption inside ±2.2 points of a 6.2%
 * figure is inside the figure, not tighter than it. And **the exit cap is
 * read against the entry**, not against a norm: the exit's spread over
 * today's 10-year beside the going-in cap's, so the assumption is named as
 * a widening (the conservative direction) or a compression (a bet on the
 * market rather than the building), with the 10-year where it is today.
 */
export type CheckKey = "rent_growth" | "expense_growth" | "vacancy" | "exit_cap";

export type CheckTone =
  | "ahead"
  | "inside"
  | "behind"
  | "tighter"
  | "looser"
  | "widens"
  | "compresses"
  | "level"
  | "stated";

export const TONE_LABEL: Record<CheckTone, string> = {
  ahead: "ahead of the published figures",
  inside: "inside the published range",
  behind: "behind the published figures",
  tighter: "tighter than the metro",
  looser: "looser than the metro",
  widens: "spread widens at the exit",
  compresses: "assumes cap compression",
  level: "spread held at the exit",
  stated: "spread stated",
};

export interface PublishedFigure {
  /** "Asking rent, apartments" */
  label: string;
  /** "+1.1% over the year to Aug 2026" */
  text: string;
  /** the figure in its own unit — a percent change, or a level in percent */
  value: number;
  asOf: string;
  /** "Zillow Research", "BLS via FRED", "Census Bureau" */
  publisher: string;
}

export interface ModelCheck {
  key: CheckKey;
  title: string;
  /** the model's figure as a sentence fragment — "3.0%/yr", "5.0%", "6.00%" */
  model: string;
  /** where the model's figure came from — "a screening default", "from the documents" */
  modelSource: string;
  published: PublishedFigure[];
  tone: CheckTone;
  toneLabel: string;
  /** whether the published figures are the metro's or the nation's — a
   *  commercial deal's rent index and every deal's prices and 10-year are
   *  national, and the card's scope sentence says which it read */
  scope: "metro" | "national";
  /** the one sentence */
  read: string;
}

export interface ModelVsMarket {
  /** ISO date the figures were read */
  readOn: string;
  /** the covered metro's name, where the metro figures were read */
  metro: string | null;
  checks: ModelCheck[];
}

type AssumptionKey = "rentGrowthPct" | "expenseGrowthPct" | "vacancyPct" | "exitCapPct";

export interface ModelVsMarketInput {
  inputs: Pick<UnderwriteInputs, AssumptionKey>;
  /** provenance of each assumption (deriveUnderwriteInputs' sources) — a default is named as one */
  sources?: Partial<Record<AssumptionKey, InputSource>>;
  assetClass?: string | null;
  plan?: boolean;
  /** the going-in cap, percent, as the page shows it — null on a plan deal */
  goingInCapPct?: number | null;
  metro?: { id: string; name: string } | null;
  /** the metro's own series (`readMetroRates`) */
  rates?: readonly LiveRate[];
  zori?: ZoriRead | null;
  /** the national table (`readRates`) — consumer prices and the 10-year read off it */
  national?: readonly LiveRate[];
  /**
   * The research tracker's read for the deal's kind of building in its
   * metro (`trackerFor`): the sector's vacancy band and, where the tracker
   * has one, its cap range — dated research, said with its date and its
   * source. A commercial deal's vacancy is read against it (the survey
   * reaches rental housing only); an apartment deal's survey check carries
   * it beside the survey; and the exit cap is set against the range as
   * well as against the 10-year.
   */
  tracker?: TrackerRead | null;
  now: Date;
}

/** "as of Aug 25, 2026; colliers.com" — how a tracker figure is dated and sourced in a sentence. */
function trackerWhen(t: TrackerRead): string {
  const parts = [t.asOf ? `as of ${datedLong(t.asOf)}` : "undated", t.source ?? "the research tracker"];
  return parts.join("; ");
}

function trackerPublisher(t: TrackerRead): string {
  return `research tracker${t.source ? ` (${t.source})` : ""}`;
}

/** The tracker's vacancy band as published figures — one for a point, the low and the high for a band. */
function trackerVacancyFigures(t: TrackerRead): PublishedFigure[] {
  if (t.vacancyLow === null) return [];
  const hi = t.vacancyHigh ?? t.vacancyLow;
  const asOf = t.asOf ?? "";
  const publisher = trackerPublisher(t);
  const label = `${t.sectorLabel[0].toUpperCase()}${t.sectorLabel.slice(1)} vacancy, metro (tracker)`;
  if (Math.abs(hi - t.vacancyLow) < 0.005) {
    return [{ label, text: `${t.vacancyLow.toFixed(1)}%${t.asOf ? ` (as of ${datedLong(t.asOf)})` : ""}`, value: t.vacancyLow, asOf, publisher }];
  }
  const suffix = t.asOf ? ` (as of ${datedLong(t.asOf)})` : "";
  return [
    { label: `${label}, low read`, text: `${t.vacancyLow.toFixed(1)}%${suffix}`, value: t.vacancyLow, asOf, publisher },
    { label: `${label}, high read`, text: `${hi.toFixed(1)}%${suffix}`, value: hi, asOf, publisher },
  ];
}

/**
 * A commercial deal's vacancy against the tracker's band for its sector in
 * its metro — the one vacancy figure of its own kind the site holds for an
 * office, a warehouse or a store, since the Census survey counts rental
 * housing and nothing else. A band is read as a band: inside it is inside,
 * under its low end is tighter, over its high end is looser.
 */
function trackerVacancyCheck(input: ModelVsMarketInput, v: number): ModelCheck | null {
  const t = input.tracker;
  if (!t || t.sector === "multifamily" || t.vacancyLow === null) return null;
  const hi = t.vacancyHigh ?? t.vacancyLow;
  const published = trackerVacancyFigures(t);
  const band = bandText(t.vacancyLow, hi);
  const tone: CheckTone = v < t.vacancyLow - SAME ? "tighter" : v > hi + SAME ? "looser" : "inside";
  const stock = `the metro's ${t.sectorLabel} stock`;
  const clause =
    tone === "tighter"
      ? `The building would run ${pts(t.vacancyLow - v)} tighter than ${stock} — a leased building against a market average, and the figure to hold the rent roll and the rollover to.`
      : tone === "looser"
        ? `The model runs ${pts(v - hi)} looser than ${stock} — conservative against the tracker.`
        : "The model sits inside the tracker's band.";
  return {
    key: "vacancy",
    title: "Stabilized vacancy",
    model: `${v.toFixed(1)}%`,
    modelSource: sourceWords(input.sources?.vacancyPct),
    published,
    tone,
    toneLabel: TONE_LABEL[tone],
    scope: "metro",
    read: `The model holds ${v.toFixed(1)}% vacancy. The metro's ${t.sectorLabel} vacancy reads ${band} on the research tracker (${trackerWhen(t)}) — a quarterly print, not a feed. ${clause}`,
  };
}

const signed = (v: number, dp = 1): string => `${v > 0 ? "+" : v < 0 ? "-" : ""}${Math.abs(v).toFixed(dp)}`;
const pts = (n: number): string => `${n.toFixed(1)} point${Math.abs(n - 1) < 0.05 ? "" : "s"}`;

/** A tolerance under which two percent figures are the same figure. */
const SAME = 0.05;

function sourceWords(s: InputSource | undefined): string {
  switch (s?.provenance) {
    case "extracted":
      return "from the documents";
    case "derived":
      return "derived from the documents";
    case "assumption":
      return "a screening default";
    default:
      return "as set";
  }
}

function fresh(rates: readonly LiveRate[] | undefined, pick: (r: LiveRate) => boolean): LiveRate | null {
  return rates?.find((r) => pick(r) && r.fresh && Number.isFinite(r.value)) ?? null;
}

type MetroMeta = LiveRate["meta"] & { metric?: string; area?: string; source?: SeriesSource };
const metricOf = (r: LiveRate): string | undefined => (r.meta as MetroMeta).metric;
const areaOf = (r: LiveRate): string | undefined => (r.meta as MetroMeta).area;

function publisherOf(r: LiveRate): string {
  switch ((r.meta as MetroMeta).source) {
    case "bls":
      return "BLS";
    case "census":
      return "Census Bureau";
    default:
      return "FRED";
  }
}

/** The list "a, b and c" — or "a and b", or "a". */
function joinWords(parts: string[]): string {
  if (parts.length <= 1) return parts[0] ?? "";
  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`;
}

/** ahead / inside / behind, against the published figures' range. */
function rangeTone(model: number, published: readonly number[]): CheckTone {
  const hi = Math.max(...published);
  const lo = Math.min(...published);
  if (model > hi + SAME) return "ahead";
  if (model < lo - SAME) return "behind";
  return "inside";
}

/** "by 0.7 points" or "by 0.7 to 2.6 points" — the gap to the nearest and the farthest published figure. */
function byPoints(model: number, published: readonly number[]): string {
  const gaps = published.map((p) => Math.abs(model - p)).sort((a, b) => a - b);
  const near = gaps[0];
  const far = gaps[gaps.length - 1];
  if (gaps.length === 1 || Math.abs(far - near) < SAME) return `by ${pts(near)}`;
  return `by ${near.toFixed(1)} to ${pts(far)}`;
}

/**
 * A commercial deal's rents against the national index of rents its kind
 * of lessor charges (the BLS producer price index, `rentIndexFor`) — the
 * one figure of its own kind the feeds hold for an office, a shop, a
 * warehouse or a storage facility. Said as the nation's, never the
 * metro's. Lodging and licensed care have no lessor's rent and get no row.
 */
function commercialRentCheck(input: ModelVsMarketInput, g: number): ModelCheck | null {
  const idx = rentIndexFor(input.assetClass);
  if (!idx) return null;
  const r = fresh(input.national, (x) => x.meta.id === idx.id);
  if (!r) return null;
  const when = periodLabel(r.obsDate, r.meta.cadence);
  const published: PublishedFigure[] = [
    {
      label: `Rents charged by ${idx.lessor}, national (PPI)`,
      text: `${signed(r.value)}% over the year to ${when}`,
      value: r.value,
      asOf: r.obsDate,
      publisher: "BLS via FRED",
    },
  ];
  const tone = rangeTone(g, [r.value]);
  const clause =
    tone === "ahead"
      ? `The model runs ahead of the index, ${byPoints(g, [r.value])}.`
      : tone === "behind"
        ? `The model runs behind the index, ${byPoints(g, [r.value])}.`
        : "The model sits at the index.";
  return {
    key: "rent_growth",
    title: "Rent growth",
    model: `${g.toFixed(1)}%/yr`,
    modelSource: sourceWords(input.sources?.rentGrowthPct),
    published,
    tone,
    toneLabel: TONE_LABEL[tone],
    scope: "national",
    read: `The model grows rents ${g.toFixed(1)}%/yr. Over the year to ${when} the rents ${idx.lessor} charge moved ${signed(r.value)}% nationally (BLS producer price index, via FRED) — the nation's lessors, not the metro's. ${clause} A trailing year is what the assumption is being asked to beat, not a forecast.`,
  };
}

function rentGrowthCheck(input: ModelVsMarketInput): ModelCheck | null {
  const words = assetWords(input.assetClass ?? undefined);
  const g = input.inputs.rentGrowthPct * 100;
  if (!Number.isFinite(g)) return null;
  if (!words.residential) return commercialRentCheck(input, g);
  const published: PublishedFigure[] = [];
  const phrases: string[] = [];
  const z = input.zori ?? null;
  if (z && z.yoyPct !== null) {
    published.push({ label: "Asking rent, all home types", text: `${signed(z.yoyPct)}% over the year to ${monthOf(z.asOf)}`, value: z.yoyPct, asOf: z.asOf, publisher: "Zillow Research" });
    phrases.push(`the metro's asking rents moved ${signed(z.yoyPct)}%${z.mfrYoyPct !== null ? ` (apartments alone ${signed(z.mfrYoyPct)}%)` : ""} over the year to ${monthOf(z.asOf)} (Zillow)`);
    if (z.mfrYoyPct !== null) {
      published.push({ label: "Asking rent, apartments", text: `${signed(z.mfrYoyPct)}% over the year to ${monthOf(z.asOf)}`, value: z.mfrYoyPct, asOf: z.asOf, publisher: "Zillow Research" });
    }
  }
  const cpiRent = fresh(input.rates, (r) => metricOf(r) === "rent_cpi_yoy");
  if (cpiRent) {
    const when = periodLabel(cpiRent.obsDate, cpiRent.meta.cadence);
    published.push({ label: "Rent paid by sitting tenants (CPI rent)", text: `${signed(cpiRent.value)}% over the year to ${when}`, value: cpiRent.value, asOf: cpiRent.obsDate, publisher: `${publisherOf(cpiRent)}` });
    phrases.push(`sitting tenants' rents ${signed(cpiRent.value)}% over the year to ${when} (CPI rent, ${publisherOf(cpiRent)})`);
  }
  if (published.length === 0) return null;
  const values = published.map((p) => p.value);
  const tone = rangeTone(g, values);
  const clause =
    tone === "ahead"
      ? `The model runs ahead of every published figure, ${byPoints(g, values)}.`
      : tone === "behind"
        ? `The model runs behind every published figure, ${byPoints(g, values)}.`
        : "The model sits inside the published range.";
  return {
    key: "rent_growth",
    title: "Rent growth",
    model: `${g.toFixed(1)}%/yr`,
    modelSource: sourceWords(input.sources?.rentGrowthPct),
    published,
    tone,
    toneLabel: TONE_LABEL[tone],
    scope: "metro",
    read: `The model grows rents ${g.toFixed(1)}%/yr. Over the past year ${joinWords(phrases)}. ${clause} A trailing year is what the assumption is being asked to beat, not a forecast.`,
  };
}

function expenseGrowthCheck(input: ModelVsMarketInput): ModelCheck | null {
  const words = assetWords(input.assetClass ?? undefined);
  if (!words.operating) return null;
  const e = input.inputs.expenseGrowthPct * 100;
  if (!Number.isFinite(e)) return null;
  const cpi = fresh(input.national, (r) => r.meta.id === "CPIAUCSL_YOY");
  if (!cpi) return null;
  const core = fresh(input.national, (r) => r.meta.id === "CPILFESL_YOY");
  const when = periodLabel(cpi.obsDate, cpi.meta.cadence);
  const published: PublishedFigure[] = [
    { label: "Consumer prices (CPI, all items)", text: `${signed(cpi.value)}% over the year to ${when}`, value: cpi.value, asOf: cpi.obsDate, publisher: "BLS via FRED" },
  ];
  if (core) {
    published.push({ label: "Core CPI", text: `${signed(core.value)}% over the year to ${periodLabel(core.obsDate, core.meta.cadence)}`, value: core.value, asOf: core.obsDate, publisher: "BLS via FRED" });
  }
  // The tone is read against the price indexes alone: the insurance index
  // below is one line's repricing, not the expense base's, and folding it
  // into the range would let a 3% model read "inside" a 3–8% band.
  const values = published.map((p) => p.value);
  const tone = rangeTone(e, values);
  const clause =
    tone === "ahead"
      ? `The model runs ahead of the index, ${byPoints(e, values)}.`
      : tone === "behind"
        ? `The model runs behind the index, ${byPoints(e, values)}.`
        : "The model sits inside the published range.";
  // The one line that reprices hardest: what commercial property insurance
  // costs nationally against a year ago. A memorandum's premium is the
  // seller's expiring policy, and the index says how far a new quote has
  // moved — shown beside the price indexes, never averaged into them.
  const insurance = fresh(input.national, (r) => r.meta.id === INSURANCE_INDEX_ID);
  if (insurance) {
    published.push({
      label: "Commercial property insurance premiums (PPI, commercial multiple peril)",
      text: `${signed(insurance.value)}% over the year to ${periodLabel(insurance.obsDate, insurance.meta.cadence)}`,
      value: insurance.value,
      asOf: insurance.obsDate,
      publisher: "BLS via FRED",
    });
  }
  const insuranceClause = insurance
    ? ` Insurance is the line that reprices hardest: commercial property premiums are ${signed(insurance.value)}% nationally over the year to ${periodLabel(insurance.obsDate, insurance.meta.cadence)} (the BLS's index of commercial multiple peril premiums), and a memorandum's premium is the seller's expiring policy, so the index is the floor for the other lines and this is the one to re-quote.`
    : " Insurance and taxes reprice on their own cycles, so the index is the floor for the other lines, not the whole answer.";
  return {
    key: "expense_growth",
    title: "Expense growth",
    model: `${e.toFixed(1)}%/yr`,
    modelSource: sourceWords(input.sources?.expenseGrowthPct),
    published,
    tone,
    toneLabel: TONE_LABEL[tone],
    scope: "national",
    read: `The model grows expenses ${e.toFixed(1)}%/yr against consumer prices ${signed(cpi.value)}% over the year to ${when}${core ? ` (core ${signed(core.value)}%)` : ""}; BLS via FRED. ${clause}${insuranceClause}`,
  };
}

function vacancyCheck(input: ModelVsMarketInput): ModelCheck | null {
  const words = assetWords(input.assetClass ?? undefined);
  const v = input.inputs.vacancyPct * 100;
  if (!Number.isFinite(v)) return null;
  if (!words.residential) return trackerVacancyCheck(input, v);
  const metro = fresh(input.rates, (r) => metricOf(r) === "rental_vacancy_msa");
  const region = fresh(input.rates, (r) => metricOf(r) === "rental_vacancy");
  const anchor = metro ?? region;
  if (!anchor) return null;
  const published: PublishedFigure[] = [];
  const parts: string[] = [];
  // The tracker's apartment read rides beside the survey, dated and
  // sourced — a different construct (a house's survey of managed stock
  // against the Census Bureau's of every rental), so it is shown, never
  // the anchor.
  const t = input.tracker && input.tracker.sector === "multifamily" && input.tracker.vacancyLow !== null ? input.tracker : null;
  const trackerTail = t ? ` The research tracker's apartment read for the metro is ${bandText(t.vacancyLow!, t.vacancyHigh)} (${trackerWhen(t)}) — a house's survey of managed stock, shown beside the Census figure rather than in its place.` : "";
  if (metro) {
    const when = periodLabel(metro.obsDate, metro.meta.cadence);
    published.push({
      label: "Rental vacancy, metro area",
      text: `${metro.value.toFixed(1)}%${metro.moe !== null ? ` ±${metro.moe} pts` : ""} (${when})`,
      value: metro.value,
      asOf: metro.obsDate,
      publisher: publisherOf(metro),
    });
    parts.push(`The metro area's rental vacancy is ${metro.value.toFixed(1)}%${metro.moe !== null ? ` ±${metro.moe} pts` : ""} (${when}; ${publisherOf(metro)})`);
  }
  if (region) {
    const when = periodLabel(region.obsDate, region.meta.cadence);
    const name = areaOf(region) ?? "Census region";
    published.push({ label: `Rental vacancy, ${name}`, text: `${region.value.toFixed(1)}% (${when})`, value: region.value, asOf: region.obsDate, publisher: publisherOf(region) });
    parts.push(metro ? `the ${name}'s ${region.value.toFixed(1)}%` : `The ${name}'s rental vacancy is ${region.value.toFixed(1)}% (${when}; ${publisherOf(region)})`);
  }
  const tolerance = anchor.moe !== null ? anchor.moe : SAME;
  const gap = anchor.value - v;
  const tone: CheckTone = gap > tolerance ? "tighter" : gap < -tolerance ? "looser" : "inside";
  const stock = metro ? "the metro's rental stock as a whole" : "the region's rental stock as a whole";
  const clause =
    tone === "tighter"
      ? `The building would run ${pts(gap)} tighter than ${stock} — usual for a managed asset, and the figure to hold the rent roll to.`
      : tone === "looser"
        ? `The model runs ${pts(-gap)} looser than ${stock} — conservative against the survey.`
        : anchor.moe !== null
          ? "The model sits inside the survey's margin of the published figure."
          : "The model sits at the published figure.";
  return {
    key: "vacancy",
    title: "Stabilized vacancy",
    model: `${v.toFixed(1)}%`,
    modelSource: sourceWords(input.sources?.vacancyPct),
    published: t ? [...published, ...trackerVacancyFigures(t)] : published,
    tone,
    toneLabel: TONE_LABEL[tone],
    scope: "metro",
    read: `The model holds ${v.toFixed(1)}% vacancy. ${parts.length === 2 ? `${parts[0]}, ${parts[1]}` : parts[0]}. ${clause}${trackerTail}`,
  };
}

/**
 * The tracker's cap range for the sector in the metro, where it has one,
 * beside the 10-year read: the published figures it adds and the sentence
 * that sets the exit cap against the range — over its high end is the
 * conservative direction for an exit, under its low end is a cap tighter
 * than the market's own range.
 */
function capBandTail(input: ModelVsMarketInput, x: number): { figures: PublishedFigure[]; sentence: string } {
  const t = input.tracker;
  if (!t || t.capLow === null) return { figures: [], sentence: "" };
  const hi = t.capHigh ?? t.capLow;
  const asOf = t.asOf ?? "";
  const publisher = trackerPublisher(t);
  const label = `${t.sectorLabel[0].toUpperCase()}${t.sectorLabel.slice(1)} cap range, metro (tracker)`;
  const suffix = t.asOf ? ` (as of ${datedLong(t.asOf)})` : "";
  const figures: PublishedFigure[] =
    Math.abs(hi - t.capLow) < 0.005
      ? [{ label, text: `${t.capLow.toFixed(2)}%${suffix}`, value: t.capLow, asOf, publisher }]
      : [
          { label: `${label}, low end`, text: `${t.capLow.toFixed(2)}%${suffix}`, value: t.capLow, asOf, publisher },
          { label: `${label}, high end`, text: `${hi.toFixed(2)}%${suffix}`, value: hi, asOf, publisher },
        ];
  const band = bandText(t.capLow, hi, 2);
  const position =
    x > hi + SAME
      ? `the exit cap sits ${Math.round((x - hi) * 100)} bps over its high end — the conservative direction for an exit.`
      : x < t.capLow - SAME
        ? `the exit cap sits ${Math.round((t.capLow - x) * 100)} bps under its low end — an exit priced tighter than the market's own range today, which is cap compression on top of the spread read.`
        : "the exit cap sits inside it.";
  return {
    figures,
    sentence: ` The research tracker's ${t.sectorLabel} cap range for the metro is ${band} (${trackerWhen(t)}), and ${position}`,
  };
}

function exitCapCheck(input: ModelVsMarketInput): ModelCheck | null {
  const words = assetWords(input.assetClass ?? undefined);
  if (!words.operating) return null;
  const x = input.inputs.exitCapPct * 100;
  if (!Number.isFinite(x) || x <= 0) return null;
  const ten = fresh(input.national, (r) => r.meta.id === "DGS10");
  if (!ten) return null;
  const exitSpread = Math.round((x - ten.value) * 100);
  const when = datedLong(ten.obsDate);
  const published: PublishedFigure[] = [
    { label: "10-year Treasury", text: `${ten.value.toFixed(2)}% on ${when}`, value: ten.value, asOf: ten.obsDate, publisher: "FRED" },
  ];
  const g = input.goingInCapPct;
  const head = `The exit cap ${x.toFixed(2)}% is ${Math.abs(exitSpread)} bps ${exitSpread >= 0 ? "over" : "under"} today's 10-year (${ten.value.toFixed(2)}%, ${when}; FRED).`;
  const band = capBandTail(input, x);
  published.push(...band.figures);
  // The tracker's range is the metro's figure; with it the check reads the
  // metro as well as the nation, and the scope says so.
  const scope: ModelCheck["scope"] = band.figures.length > 0 ? "metro" : "national";
  if (g == null || !Number.isFinite(g) || g <= 0 || input.plan) {
    return {
      key: "exit_cap",
      title: "Exit cap",
      model: `${x.toFixed(2)}%`,
      modelSource: sourceWords(input.sources?.exitCapPct),
      published,
      tone: "stated",
      toneLabel: TONE_LABEL.stated,
      scope,
      read: `${head} ${input.plan ? "A plan deal has no going-in cap to set it against; the spread is the claim, and the finished building's yield on cost is what it is bought at." : "No going-in cap to set it against; the spread is the claim."}${band.sentence}`,
    };
  }
  const inSpread = Math.round((g - ten.value) * 100);
  const delta = exitSpread - inSpread;
  const tone: CheckTone = delta > 0 ? "widens" : delta < 0 ? "compresses" : "level";
  const clause =
    tone === "widens"
      ? `so the exit assumes the spread widens ${delta} bps with the 10-year where it is today — the conservative direction.`
      : tone === "compresses"
        ? `so the exit assumes the spread narrows ${-delta} bps with the 10-year where it is today. Cap compression is not a plan: a return that needs the exit to price tighter than the entry is a bet on the market rather than the building.`
        : "so the exit holds the spread with the 10-year where it is today.";
  return {
    key: "exit_cap",
    title: "Exit cap",
    model: `${x.toFixed(2)}%`,
    modelSource: sourceWords(input.sources?.exitCapPct),
    published,
    tone,
    toneLabel: TONE_LABEL[tone],
    scope,
    read: `${head} The going-in cap ${g.toFixed(2)}% is ${Math.abs(inSpread)} bps ${inSpread >= 0 ? "over" : "under"} it, ${clause}${band.sentence}`,
  };
}

export function modelVsMarket(input: ModelVsMarketInput): ModelVsMarket | null {
  const checks = [rentGrowthCheck(input), expenseGrowthCheck(input), vacancyCheck(input), exitCapCheck(input)].filter(
    (c): c is ModelCheck => c !== null,
  );
  if (checks.length === 0) return null;
  const metroRead = checks.some((c) => c.scope === "metro");
  return {
    readOn: input.now.toISOString().slice(0, 10),
    metro: metroRead ? (input.metro?.name ?? null) : null,
    checks,
  };
}

/** The figures a surface read today (lib/model-vs-market-read's `todayReads`,
 *  or a test's fixtures): the metro's own series, Zillow's rents, the
 *  national table, and the clock they were read on. */
export interface MarketReads {
  rates: readonly LiveRate[];
  zori: ZoriRead | null;
  national: readonly LiveRate[];
  now: Date;
}

/**
 * The read for a deal, from what every surface already holds — the derived
 * model, the extraction, the stored class, the covered metro and today's
 * figures — so the deal page, the report route and the workbook route call
 * ONE function and cannot disagree about the class the deck turned out to
 * be (`shownAssetClass`), whether the deal is a plan (`inferStrategy`), or
 * which cap is the going-in cap (the page's own summary figure where it
 * passes one, else the extraction's, and none on a plan deal).
 */
export function modelVsMarketFor(args: {
  derived: Pick<DerivedModel, "inputs" | "sources">;
  extraction: ExtractionResult | null;
  firstSignal?: FirstSignal | null;
  /** the deal row's own class column — "auto" shows what the deck turned out to be */
  storedAssetClass: string | null | undefined;
  metro: { id: string; name: string } | null;
  reads: MarketReads;
  /** the going-in cap as the page shows it; leave undefined to read the
   *  extraction's, pass null for none */
  goingInCapText?: string | null;
}): ModelVsMarket | null {
  const { derived, extraction, storedAssetClass, metro, reads } = args;
  const planDeal = isPlanDeal(inferStrategy(extraction, args.firstSignal ?? null).kind);
  const capText =
    args.goingInCapText !== undefined
      ? args.goingInCapText
      : planDeal
        ? null
        : (findGoingInCap(extraction?.metrics ?? [])?.value ?? null);
  const assetClass = shownAssetClass(storedAssetClass ?? null, extraction) || null;
  return modelVsMarket({
    inputs: derived.inputs,
    sources: derived.sources,
    assetClass,
    plan: planDeal,
    goingInCapPct: capText ? parsePct(capText) : null,
    metro,
    rates: reads.rates,
    zori: reads.zori,
    national: reads.national,
    // The tracker's read for this kind of building in this metro — the
    // research layer, dated, beside the feeds.
    tracker: metro ? trackerFor(metro.id, assetClass) : null,
    now: reads.now,
  });
}
