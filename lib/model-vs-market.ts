import type { LiveRate, SeriesSource } from "@/lib/live-rates";
import { assetWords } from "@/lib/asset-words";
import { monthOf, type ZoriRead } from "@/lib/zori";
import type { DerivedModel, InputSource } from "@/lib/underwrite/inputs";
import type { UnderwriteInputs } from "@/lib/underwrite/engine";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { INSURANCE_INDEX_ID, periodLabel, rentIndexFor } from "@/lib/live-market-brief";
import { isStateMarket } from "@/lib/market-match";
import { datedLong } from "@/lib/debt-index";
import {
  IMPLIED_CAP_CEILING,
  askingPriceOf,
  buildingPriceOf,
  inferStrategy,
  isPlanDeal,
  noiFigures,
  signalGoingInCap,
} from "@/lib/deal-strategy";
import { findGoingInCap, parsePct } from "@/lib/criteria";
import { interestOf } from "@/lib/interest";
import { shownAssetClass } from "@/lib/pipeline-slots";
import {
  bandText,
  figureCitation,
  figureRead,
  periodReason,
  trackerAge,
  trackerFor,
  type FigureRead,
  type TrackerRead,
} from "@/lib/tracker-read";
import { staleMark, staleReason, type ResearchAge } from "@/lib/research-age";

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
 *
 * The research tracker ages by the research rule (lib/research-age): past
 * its limit from the day the snapshot was read, a tracker figure is still
 * shown, named stale with its age, and the model is held to nothing in it —
 * a commercial deal's vacancy reads "beside stale research", and the exit
 * cap is set against the 10-year alone. A figure the sector leaderboard
 * would not rank for its own period — undated, or over a year old
 * (lib/tracker-read `periodReason`, the leaderboard's own rule) — is shown
 * and held to nothing the same way, and so is one for a narrower stock than
 * the class.
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
  | "stated"
  | "aside"
  | "stale"
  | "undated"
  | "old";

export const TONE_LABEL: Record<CheckTone, string> = {
  ahead: "ahead of the published figures",
  inside: "inside the published range",
  behind: "behind the published figures",
  // The figures a vacancy is read against may be the metro area's, the
  // region's, the state's or a tracker's own area (Suburban Maryland's,
  // Manhattan's), so the chip names none of them.
  tighter: "tighter than the published figures",
  looser: "looser than the published figures",
  widens: "spread widens at the exit",
  compresses: "assumes cap compression",
  level: "spread held at the exit",
  stated: "spread stated",
  aside: "beside a narrower stock",
  stale: "beside stale research",
  // A tracker figure the sector leaderboard would not rank for its own
  // period: shown, named, held to nothing.
  undated: "beside an undated figure",
  old: "beside a figure over a year old",
};

export interface PublishedFigure {
  /** "Asking rent, apartments" */
  label: string;
  /** "+1.1% over the year to Aug 2026" */
  text: string;
  /** the figure in its own unit — a percent change, or a level in percent */
  value: number;
  /** the figure's own date: a feed's observation day (ISO), or a research
   *  figure's period as its file states it ("Q2 2026") — "undated" where
   *  the file states none, never the day the research was read */
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
  /** the covered metro's name, where the metro figures were read — or the state's, for a deal outside the covered metros */
  metro: string | null;
  /** whose figures the market rows are: a covered metro's, or the state's —
   *  null where none were read; optional so a fixture built before states
   *  could be read stays a metro's */
  grain?: "metro" | "state" | null;
  checks: ModelCheck[];
}

type AssumptionKey = "rentGrowthPct" | "expenseGrowthPct" | "vacancyPct" | "exitCapPct";

export interface ModelVsMarketInput {
  inputs: Pick<UnderwriteInputs, AssumptionKey>;
  /** provenance of each assumption (deriveUnderwriteInputs' sources) — a default is named as one */
  sources?: Partial<Record<AssumptionKey, InputSource>>;
  assetClass?: string | null;
  /** the deck's own class words (the extraction's phrase): a lab or a
   *  cold-storage building filed as plain office or industrial reads no
   *  lessor rent index, as it reads no tracker (lib/tracker-read) */
  deckWords?: string | null;
  plan?: boolean;
  /** the going-in cap, percent, as the page shows it — null on a plan deal */
  goingInCapPct?: number | null;
  /** where that cap came from: stated by the documents (the default), or
   *  implied by their NOI over their price where they state none
   *  (`impliedGoingInCap`) — over the whole price a share implies, for a
   *  share — and said as such */
  goingInCapSource?: "stated" | "implied" | "implied_whole";
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

/**
 * "Colliers, Suburban Maryland (Montgomery and Prince George's together, not
 * a county split), Q1 2026 (read Aug 25, 2026)" — a tracker figure's own
 * house, area and period as the file states them (lib/tracker-read's
 * `figureCitation`, "undated" where it states no period), then the day the
 * research sweep read it, said as the day read and never as the figure's —
 * and, past the research rule's limit, its age and the stale mark ("read
 * Aug 25, 2026; 181 days old, stale").
 */
function trackerCite(t: TrackerRead, f: FigureRead, age: ResearchAge): string {
  const mark = staleMark(age);
  return `${figureCitation(f)}${t.asOf ? ` (read ${datedLong(t.asOf)}${mark ? `; ${mark}` : ""})` : ""}`;
}

/**
 * Why the model is not held to a tracker figure, where it is not, as the
 * opening of a sentence, and the chip that says so: the figure is for a
 * narrower stock than the class (`slice`); it is undated, or over a year
 * old by its own period — the rule the sector leaderboard ranks by
 * (lib/tracker-read `periodReason`), so a figure it will not place is never
 * one an assumption is held to (research pass 26 found a retail deal held to
 * Newark's 2024 figure and Richmond's undated one); or the research is past
 * the research rule's limit — or several. Null where the model is held to
 * it.
 */
function notHeldBecause(
  t: TrackerRead,
  f: FigureRead,
  age: ResearchAge,
  today: string,
): { because: string; tone: CheckTone } | null {
  const period = periodReason(f, today);
  const figure = [
    f.slice ? `for ${f.slice}, not the ${t.sectorLabel} market as a whole` : null,
    period === null ? null : period === "undated" ? "undated" : `from ${f.period}, over a year old`,
  ].filter((x): x is string => x !== null);
  const old = staleReason(age);
  if (figure.length === 0 && !old) return null;
  const because = [
    figure.length > 0 ? `That figure is ${figure.join(", and ")}` : null,
    old ? `${figure.length > 0 ? "and the research is" : "That research is"} ${old}` : null,
  ]
    .filter(Boolean)
    .join(", ");
  // The chip names the first reason of: stale research, a narrower stock, no
  // date, an old one.
  const tone: CheckTone = age.stale ? "stale" : f.slice ? "aside" : period === "undated" ? "undated" : "old";
  return { because, tone };
}

function trackerPublisher(f: FigureRead): string {
  return f.house ? `research tracker: ${f.house}` : "research tracker";
}

const initialCap = (s: string): string => `${s[0].toUpperCase()}${s.slice(1)}`;

/** A figure with nothing named — for a read built without its provenance. */
const UNNAMED: FigureRead = figureRead(null, []);

/**
 * A tracker figure as published figures — one for a point, the low and the
 * high for a band — each labelled with the area it covers where the file
 * states one (never "metro" by default) and dated by its own period; past
 * the research rule's limit, with the day it was read, its age and the
 * stale mark beside the period.
 */
function trackerFigures(
  t: TrackerRead,
  f: FigureRead,
  what: "vacancy" | "cap",
  low: number,
  high: number,
  age: ResearchAge,
): PublishedFigure[] {
  const dp = what === "cap" ? 2 : 1;
  const label = `${initialCap(t.sectorLabel)} ${what} (research tracker)${f.area ? `, ${f.area}` : ""}`;
  const when = f.period ?? "undated";
  const mark = staleMark(age);
  const dated = mark && t.asOf ? `${when}; read ${datedLong(t.asOf)}, ${mark}` : when;
  const publisher = trackerPublisher(f);
  const figure = (value: number, end?: string): PublishedFigure => ({
    label: end ? `${label}, ${end}` : label,
    text: `${value.toFixed(dp)}% (${dated})`,
    value,
    asOf: when,
    publisher,
  });
  if (Math.abs(high - low) < 0.005) return [figure(low)];
  return what === "cap"
    ? [figure(low, "low end"), figure(high, "high end")]
    : [figure(low, "low read"), figure(high, "high read")];
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
  const f = t.vacancy ?? UNNAMED;
  const age = trackerAge(t, input.now);
  const published = trackerFigures(t, f, "vacancy", t.vacancyLow, hi, age);
  const band = bandText(t.vacancyLow, hi);
  // A figure the file says is for a narrower stock than the class (`slice`:
  // Northern Virginia's small-bay space) is shown and named, and the model
  // is not held to it — capBandTail's rule for a cap. A bulk warehouse read
  // against a small-bay band was called a point looser than "the industrial
  // stock the figure covers" (the audit of 2026-10-01). Nor is the model
  // held to research past the research rule's limit (lib/research-age): its
  // figure is shown, named stale, and the chip says so. Nor to a figure the
  // sector leaderboard would not rank for its own period — undated, or over
  // a year old (lib/tracker-read `periodReason`).
  const notHeld = notHeldBecause(t, f, age, input.now.toISOString().slice(0, 10));
  if (notHeld) {
    const point = Math.abs(hi - t.vacancyLow) < SAME;
    const where =
      v > hi + SAME
        ? `${pts(v - hi)} over ${point ? "it" : "its high end"}`
        : v < t.vacancyLow - SAME
          ? `${pts(t.vacancyLow - v)} under ${point ? "it" : "its low end"}`
          : point
            ? "at it"
            : "inside it";
    const tone = notHeld.tone;
    return {
      key: "vacancy",
      title: "Stabilized vacancy",
      model: `${v.toFixed(1)}%`,
      modelSource: sourceWords(input.sources?.vacancyPct),
      published,
      tone,
      toneLabel: TONE_LABEL[tone],
      scope: "metro",
      read: `The model holds ${v.toFixed(1)}% vacancy. ${initialCap(t.sectorLabel)} vacancy reads ${band} on the research tracker: ${trackerCite(t, f, age)} — a research print, not a feed. ${notHeld.because}, so the model is not held to it; its vacancy sits ${where}.`,
    };
  }
  const tone: CheckTone = v < t.vacancyLow - SAME ? "tighter" : v > hi + SAME ? "looser" : "inside";
  // The stock the figure covers — the file's area, which is not always the
  // market's (Suburban Maryland's office figure is filed under both of its
  // counties) — so the sentence never calls it the metro's.
  const stock = `the ${t.sectorLabel} stock the figure covers`;
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
    read: `The model holds ${v.toFixed(1)}% vacancy. ${initialCap(t.sectorLabel)} vacancy reads ${band} on the research tracker: ${trackerCite(t, f, age)} — a research print, not a feed. ${clause}`,
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
 * metro's. Lodging and licensed care have no lessor's rent and get no row,
 * and neither does a lab or a cold-storage building (`rentIndexFor`).
 */
function commercialRentCheck(input: ModelVsMarketInput, g: number): ModelCheck | null {
  const idx = rentIndexFor(input.assetClass, input.deckWords);
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
  // The bond market's own forecast beside the trailing year (2026-09-30):
  // what inflation is expected to average over the next ten years, the
  // 10-year breakeven (the Treasury yield less the inflation-protected
  // one), already on the rates strip. A ten-year horizon, not the hold's,
  // and never in the tone's range: the assumption is read against what
  // prices did, and this says what the market expects them to do.
  const breakeven = fresh(input.national, (r) => r.meta.id === "T10YIE");
  if (breakeven) {
    published.push({
      label: "Expected inflation, next ten years (10-year breakeven)",
      text: `${breakeven.value.toFixed(2)}% a year (${periodLabel(breakeven.obsDate, breakeven.meta.cadence)})`,
      value: breakeven.value,
      asOf: breakeven.obsDate,
      publisher: "FRED",
    });
  }
  const breakevenClause = breakeven
    ? ` The bond market expects inflation to average ${breakeven.value.toFixed(2)}% a year over the next ten years (the 10-year breakeven, ${periodLabel(breakeven.obsDate, breakeven.meta.cadence)}; FRED) — its forecast over ten years, not the hold's.`
    : "";
  return {
    key: "expense_growth",
    title: "Expense growth",
    model: `${e.toFixed(1)}%/yr`,
    modelSource: sourceWords(input.sources?.expenseGrowthPct),
    published,
    tone,
    toneLabel: TONE_LABEL[tone],
    scope: "national",
    read: `The model grows expenses ${e.toFixed(1)}%/yr against consumer prices ${signed(cpi.value)}% over the year to ${when}${core ? ` (core ${signed(core.value)}%)` : ""}; BLS via FRED. ${clause}${insuranceClause}${breakevenClause}`,
  };
}

function vacancyCheck(input: ModelVsMarketInput): ModelCheck | null {
  const words = assetWords(input.assetClass ?? undefined);
  const v = input.inputs.vacancyPct * 100;
  if (!Number.isFinite(v)) return null;
  if (!words.residential) return trackerVacancyCheck(input, v);
  const metro = fresh(input.rates, (r) => metricOf(r) === "rental_vacancy_msa");
  const region = fresh(input.rates, (r) => metricOf(r) === "rental_vacancy");
  // A deal outside the covered metros reads its state's annual figure —
  // the survey's own, a year's rate for the whole state — and nothing
  // finer; the anchor is whichever grain the read has, finest first.
  const state = fresh(input.rates, (r) => metricOf(r) === "rental_vacancy_state");
  const anchor = metro ?? region ?? state;
  if (!anchor) return null;
  const published: PublishedFigure[] = [];
  const parts: string[] = [];
  // The tracker's apartment read rides beside the survey, dated and
  // sourced — a different construct (a house's survey of managed stock
  // against the Census Bureau's of every rental), so it is shown, never
  // the anchor.
  const t = input.tracker && input.tracker.sector === "multifamily" && input.tracker.vacancyLow !== null ? input.tracker : null;
  const tf = t?.vacancy ?? UNNAMED;
  // Never the anchor, so never held to; past the research rule's limit its
  // citation says how old it is and that it is stale.
  const tAge = t ? trackerAge(t, input.now) : null;
  const trackerTail =
    t && tAge
      ? ` The research tracker's apartment vacancy reads ${bandText(t.vacancyLow!, t.vacancyHigh)}: ${trackerCite(t, tf, tAge)} — research, shown beside the Census figure rather than in its place.`
      : "";
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
  if (!metro && !region && state) {
    const when = periodLabel(state.obsDate, state.meta.cadence);
    const name = areaOf(state) ?? "the state";
    published.push({ label: `Rental vacancy, ${name} (annual)`, text: `${state.value.toFixed(1)}% (${when})`, value: state.value, asOf: state.obsDate, publisher: publisherOf(state) });
    parts.push(`The state's rental vacancy is ${state.value.toFixed(1)}% (${when}, the survey's annual figure for the whole of ${name}; ${publisherOf(state)}) — the deal lies outside the metros the site tracks, so no metro figure is read`);
  }
  const tolerance = anchor.moe !== null ? anchor.moe : SAME;
  const gap = anchor.value - v;
  const tone: CheckTone = gap > tolerance ? "tighter" : gap < -tolerance ? "looser" : "inside";
  const stock = metro
    ? "the metro's rental stock as a whole"
    : region
      ? "the region's rental stock as a whole"
      : "the state's rental stock as a whole";
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
    published: t && tAge ? [...published, ...trackerFigures(t, tf, "vacancy", t.vacancyLow!, t.vacancyHigh ?? t.vacancyLow!, tAge)] : published,
    tone,
    toneLabel: TONE_LABEL[tone],
    scope: "metro",
    read: `The model holds ${v.toFixed(1)}% vacancy. ${parts.length === 2 ? `${parts[0]}, ${parts[1]}` : parts[0]}. ${clause}${trackerTail}`,
  };
}

/**
 * The tracker's cap figure for the sector, where it has one, beside the
 * 10-year read: the published figures it adds and the sentence that sets
 * the exit cap against it, with the figure's own house, area and period.
 * Over a range's high end (or a single figure) is the conservative
 * direction for an exit; under its low end is a cap tighter than the
 * market's own figure. A figure the file says is for a narrower stock than
 * the class (`slice` — Chicago's average is its Class B/C small buildings')
 * is shown and named, and the exit is not held to it: a Class A exit read
 * against it would call a sound assumption cap compression. Nor is it held
 * to research past the research rule's limit (lib/research-age): the range
 * is shown, named stale with its age.
 */
function capBandTail(input: ModelVsMarketInput, x: number): { figures: PublishedFigure[]; sentence: string } {
  const t = input.tracker;
  if (!t || t.capLow === null) return { figures: [], sentence: "" };
  const lo = t.capLow;
  const hi = t.capHigh ?? lo;
  const point = Math.abs(hi - lo) < 0.005;
  const f = t.cap ?? UNNAMED;
  const age = trackerAge(t, input.now);
  const figures = trackerFigures(t, f, "cap", lo, hi, age);
  const bps = (n: number): string => `${Math.round(n * 100)} bps`;
  const head = ` The research tracker's ${t.sectorLabel} cap ${point ? "is" : "range is"} ${bandText(lo, hi, 2)}${
    f.construct ? ` (${f.construct})` : ""
  }: ${trackerCite(t, f, age)}`;
  const over = point ? "it" : "its high end";
  const under = point ? "it" : "its low end";
  const notHeld = notHeldBecause(t, f, age, input.now.toISOString().slice(0, 10));
  if (notHeld) {
    const where =
      x > hi + SAME ? `${bps(x - hi)} over ${over}` : x < lo - SAME ? `${bps(lo - x)} under ${under}` : point ? "at it" : "inside it";
    return {
      figures,
      sentence: `${head}. ${notHeld.because}, so the exit is not held to it; the exit cap sits ${where}.`,
    };
  }
  const position =
    x > hi + SAME
      ? `the exit cap sits ${bps(x - hi)} over ${over} — the conservative direction for an exit.`
      : x < lo - SAME
        ? `the exit cap sits ${bps(lo - x)} under ${under} — an exit priced tighter than the market's own ${point ? "figure" : "range"}, which is cap compression on top of the spread read.`
        : point
          ? "the exit cap sits at it."
          : "the exit cap sits inside it.";
  return { figures, sentence: `${head}, and ${position}` };
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
  // The latest published 10-year, printed with its own date — a business
  // day or more old, so never "today's" (research pass 27, the rule
  // lib/debt-index's `ratesPromptLine` follows).
  const head = `The exit cap ${x.toFixed(2)}% is ${Math.abs(exitSpread)} bps ${exitSpread >= 0 ? "over" : "under"} the latest 10-year (${ten.value.toFixed(2)}%, ${when}; FRED).`;
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
  // A cap the documents imply rather than state is said as the arithmetic
  // it is, so the reader can see what the exit is being set against.
  const entry =
    input.goingInCapSource === "implied"
      ? `The going-in cap implied by the OM's NOI over its price, ${g.toFixed(2)}%,`
      : input.goingInCapSource === "implied_whole"
        ? `The going-in cap implied by the OM's NOI over the whole price its share implies, ${g.toFixed(2)}%,`
        : `The going-in cap ${g.toFixed(2)}%`;
  const clause =
    tone === "widens"
      ? `so the exit assumes the spread widens ${delta} bps with the 10-year unchanged — the conservative direction.`
      : tone === "compresses"
        ? `so the exit assumes the spread narrows ${-delta} bps with the 10-year unchanged. Cap compression is not a plan: a return that needs the exit to price tighter than the entry is a bet on the market rather than the building.`
        : "so the exit holds the spread with the 10-year unchanged.";
  return {
    key: "exit_cap",
    title: "Exit cap",
    model: `${x.toFixed(2)}%`,
    modelSource: sourceWords(input.sources?.exitCapPct),
    published,
    tone,
    toneLabel: TONE_LABEL[tone],
    scope,
    read: `${head} ${entry} is ${Math.abs(inSpread)} bps ${inSpread >= 0 ? "over" : "under"} it, ${clause}${band.sentence}`,
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
    grain: metroRead && input.metro ? (isStateMarket(input.metro.id) ? "state" : "metro") : null,
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
 * The going-in cap the documents imply where they state none: the OM's
 * in-place NOI, else its Year-1, over the price the building's own figures
 * describe — the pairing the plausibility check holds a stated cap to
 * (`assessPlausibility`), through the same shared readers: `noiFigures`,
 * `askingPriceOf` (a range at its top) and `buildingPriceOf` (a share's
 * price grossed up to the whole, `whole`; none for a note, whose price is a
 * loan's, a leased fee, whose price is the land's, or a share beside the
 * loan its entity carries, whose grossed-up price is the equity's whole,
 * not the building's). Null where either
 * figure is missing, and outside the band a cap can be — at or under 0.5%,
 * or at IMPLIED_CAP_CEILING and past it, where the NOI is no going-in
 * figure on this price. A plan deal has no going-in cap; the caller says
 * which deal it is.
 */
export function impliedGoingInCap(extraction: ExtractionResult | null): { pct: number; whole: boolean } | null {
  if (!extraction) return null;
  const figs = noiFigures(extraction.metrics ?? []);
  const going = figs.find((f) => f.kind === "in_place") ?? figs.find((f) => f.kind === "year1");
  if (!going || !(going.value > 0)) return null;
  const asked = askingPriceOf(extraction);
  const price = buildingPriceOf(extraction, asked);
  if (asked == null || price == null || !(price > 0)) return null;
  const cap = going.value / price;
  if (!(cap > 0.005) || !(cap < IMPLIED_CAP_CEILING)) return null;
  return { pct: cap * 100, whole: price !== asked };
}

/** A deal's going-in cap, percent, and where it came from. */
export interface DealGoingInCap {
  pct: number;
  /** stated by the documents (or the first signal); implied by their NOI
   *  over their price; or implied on the whole a share's price grosses up to */
  source: "stated" | "implied" | "implied_whole";
}

/**
 * THE going-in cap an exit is set against, wherever one is: the
 * extraction's stated cap, else the first signal's where it can be a cap on
 * the price (`signalGoingInCap`); where neither states one, the cap the
 * documents' NOI implies on their price (`impliedGoingInCap`); and none on a
 * plan deal (its year-1 cap is a dark building's) or a note (the
 * collateral's income over a loan's price is a cap nobody earns, #414).
 * `modelVsMarketFor` reads it, and so does the submarket check's supply
 * warning, so no two surfaces set one exit against two going-in caps.
 */
export function dealGoingInCap(
  extraction: ExtractionResult | null,
  firstSignal?: FirstSignal | null,
): DealGoingInCap | null {
  const planDeal = isPlanDeal(inferStrategy(extraction, firstSignal ?? null).kind);
  if (planDeal || interestOf(extraction).kind === "note") return null;
  const capText = findGoingInCap(extraction?.metrics ?? [])?.value ?? null;
  const parsed = capText ? parsePct(capText) : null;
  const stated =
    parsed != null && Number.isFinite(parsed) && parsed > 0
      ? parsed
      : capText == null
        ? (signalGoingInCap(firstSignal)?.pct ?? null)
        : null;
  if (stated != null) return { pct: stated, source: "stated" };
  // Where the documents state no going-in cap, the one their own NOI and
  // price imply: without it a deal whose NOI is 7.50% of its price read "no
  // going-in cap to set it against" while the model's 6.00% default exit
  // priced 150 bps of compression unsaid.
  const implied = impliedGoingInCap(extraction);
  return implied ? { pct: implied.pct, source: implied.whole ? "implied_whole" : "implied" } : null;
}

/**
 * The read for a deal, from what every surface already holds — the derived
 * model, the extraction, the first signal, the stored class, the covered
 * metro and today's figures — so the deal page, the report route and the
 * workbook route call ONE function and cannot disagree about the class the
 * deck turned out to be (`shownAssetClass`), whether the deal is a plan
 * (`inferStrategy`), or which cap is the going-in cap: the extraction's
 * stated one, else the first signal's where it can be a cap on the price
 * (`signalGoingInCap`, the page's summary bar's own fallback); where
 * neither states one, the cap the documents' NOI implies on their price;
 * and none on a plan deal or a note. The rule lives here and nowhere else:
 * the page once handed in its summary bar's figure while the report and
 * the workbook read the implied cap, and one deal's exit read 60 bps of
 * widening on the page and 20 in the documents.
 */
export function modelVsMarketFor(args: {
  derived: Pick<DerivedModel, "inputs" | "sources">;
  extraction: ExtractionResult | null;
  firstSignal?: FirstSignal | null;
  /** the deal row's own class column — "auto" shows what the deck turned out to be */
  storedAssetClass: string | null | undefined;
  /** the market the live figures are read for (lib/market-county's
   *  `placeDeal(...).live`); `placedBy` where the deal's county alone
   *  placed it there, which reads the metro area's figures and never the
   *  research tracker's */
  metro: { id: string; name: string; placedBy?: unknown } | null;
  reads: MarketReads;
}): ModelVsMarket | null {
  const { derived, extraction, storedAssetClass, metro, reads } = args;
  const planDeal = isPlanDeal(inferStrategy(extraction, args.firstSignal ?? null).kind);
  // A note's price is a loan's (#414): the cap its memorandum states is the
  // collateral's, never the buyer's, so the exit is set against no going-in
  // cap on a note — stated, passed in or implied — on every surface; nor on
  // a plan deal. One reader says which cap it is (`dealGoingInCap`).
  const goingIn = dealGoingInCap(extraction, args.firstSignal ?? null);
  const assetClass = shownAssetClass(storedAssetClass ?? null, extraction) || null;
  return modelVsMarket({
    inputs: derived.inputs,
    sources: derived.sources,
    assetClass,
    deckWords: extraction?.assetClass ?? null,
    plan: planDeal,
    goingInCapPct: goingIn?.pct ?? null,
    goingInCapSource: goingIn?.source,
    metro,
    rates: reads.rates,
    zori: reads.zori,
    national: reads.national,
    // The tracker's read for this kind of building in this metro — the
    // research layer, dated, beside the feeds. Research, so only for a
    // market the address names: a deal its county alone placed (#447) reads
    // the metro area's published figures, and the tracker's may be the core
    // county's — Los Angeles's office vacancy is not Orange County's. The
    // deck's own class words ride along, so a lab, a yard or a cold-storage
    // warehouse the analyst filed as plain office or industrial reads none.
    tracker: metro && !metro.placedBy ? trackerFor(metro.id, assetClass, extraction?.assetClass ?? null) : null,
    now: reads.now,
  });
}
