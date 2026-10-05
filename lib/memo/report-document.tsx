import "server-only";
import { compactUsd, scaledText } from "@/lib/money";
import { Document, Page, View, Text, Image, StyleSheet, renderToBuffer } from "@react-pdf/renderer";
import type { DealRow } from "@/lib/deals";
import { countNounOf, screenYearOf, type BuyBoxCheck } from "@/lib/criteria";
import { siteFlagsStale, type FloodMapView, type SiteFlagsResult } from "@/lib/site-flags/core";
import { placedBySentence } from "@/lib/placed-by";
import { currentBriefLine } from "@/lib/permit-split";
import { OSM_LOCATION_WORDS, REPORT_FLOOD_SIZE } from "@/lib/basemaps";
import { documentNotices } from "@/lib/data-notices";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  FirstSignal,
  ReconciliationResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
import { basePosition, buildMemoData, MemoPage, pdfSafe, type MemoCover, type MemoData } from "./memo-document";
import { rangeInOrder } from "@/lib/verdict-range";
import { typicalRangeParts } from "@/lib/typical-range";

/** The OM's figure placed on the typical range — "5.25%" on "5.25–5.75%" —
 *  as the memo places a base between its low and high: 0..1, clamped, so a
 *  figure past either end sits at that end (the Read chip says which way);
 *  null when either side does not parse as one scale. */
export function rangeRead(omSays: string, typicalRange: string): number | null {
  // "5.25–5.75%", "5.25%–5.75%" (the unit after the low figure too),
  // "$2,150–$2,450/mo", "2.5 to 3.5%", "5.25%-5.75%" (a hyphen): the one
  // reader the deal page's position bar reads too (lib/typical-range).
  const parts = typicalRangeParts(typicalRange);
  if (!parts) return null;
  return basePosition({ low: parts[0], base: omSays, high: parts[1] });
}
import {
  gridTakeaway,
  heatBucket,
  heatCellIrr,
  heatCellEm,
  heatLegend,
  maxBidSentence,
  HEAT_BG,
  type BaseCase,
  type SensitivityData,
  type HeatCell,
} from "@/lib/underwrite/report-grid";
import { withArticle } from "@/lib/article";
import {
  SPREAD_BG,
  SPREAD_LABEL,
  SPREAD_RULE_OF_THUMB,
  refCapNote,
  spreadBucket,
  type PlanReport,
  type SpreadBucket,
  type YocGrid,
} from "@/lib/plan-sensitivity";
import { planFacts, yieldOnCostText } from "@/lib/plan-facts";
import type { ModelVsMarket } from "@/lib/model-vs-market";
import { readGrainNote, readScope } from "@/lib/model-vs-market-scope";
import { assetClassKey, assetWords } from "@/lib/asset-words";
import { askingPriceOf, inferStrategy, isPlanDeal, notYetDelivered, planSummary } from "@/lib/deal-strategy";
import { interestOf, isWholeShare, noteCollateralSentence, noteYieldSentence, readInterest } from "@/lib/interest";
import { affordableShortLine, readAffordable, type AffordableRead } from "@/lib/affordable";
import { readSingleTenant, singleTenantShortLine } from "@/lib/single-tenant";
import { hotelShortLine, readHotelDeal } from "@/lib/hotel-deal";
import { readSale, saleShortLine } from "@/lib/sale-terms";
import { readRoster, rosterShortLine } from "@/lib/tenant-roster";
import { readValueAdd, valueAddShortLine } from "@/lib/value-add";
import { readTaxAbatement, taxAbatementShortLine } from "@/lib/tax-abatement";
import { readSiteReports, siteReportsShortLine } from "@/lib/site-reports";
import { readStudentHousing, studentShortLine } from "@/lib/student-housing";
import { mhShortLine, readManufacturedHousing } from "@/lib/manufactured-housing";
import { readSelfStorage, storageShortLine } from "@/lib/self-storage";
import { forwardShortLine, readForwardPurchase } from "@/lib/forward-purchase";
import { mixedUseShortLine, readMixedUse } from "@/lib/mixed-use";
import { goingConcernShortLine, readGoingConcern } from "@/lib/going-concern";
import { condoShortLine, readCondo } from "@/lib/condo";
import { readSandwichLease, sandwichShortLine } from "@/lib/sandwich-lease";
import type { AssumableView } from "@/lib/assumable-debt";
import { basisWithheldOf, type InputSource } from "@/lib/underwrite/inputs";
import { yearsText as leaseYears } from "@/lib/ground-lease-term";
import { exitMoney, type LeaseholdExitView } from "@/lib/leasehold-exit";
import { basisScale, fmtBasis, subjectBasis } from "@/lib/comp-detail";
import { gapDisagreementLine, gapScale } from "@/lib/gap-detail";
import { parsePageNumber } from "@/lib/facts";
import { portfolioFacts, propertyFigures, readPortfolio, shareBasisWord, shareOfTrack, type PortfolioRead } from "@/lib/portfolio";
import { liveReadFailedLine } from "@/lib/market-read-failed";

const C = {
  brand: "#114e54",
  ink: "#18211f",
  muted: "#5f6b69",
  line: "#e7e4dd",
  faint: "#f3f5f4",
  pass: "#1b7a5e",
  caution: "#a05a1c",
  kill: "#b23a30",
};

const str = (v: unknown): string =>
  pdfSafe(typeof v === "string" ? v : v == null ? "" : String(v));
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/**
 * A stored day as a reader writes it — "2026-09-28" or a timestamp reads
 * "Sep 28, 2026" — the way the memo dates its screen. A value that is not a
 * date prints as stored rather than as a guess.
 */
export function readDay(v: string | null | undefined): string {
  const s = (v ?? "").trim();
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s}T00:00:00Z` : s);
  if (!s || !Number.isFinite(t)) return s;
  return new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/**
 * A source note's stored days as a reader writes them: "TTM to 2026-05-31"
 * reads "TTM to May 31, 2026" (research pass 35). Only a real calendar day
 * changes; anything else is left as written. The notes keep their ISO days
 * where they are stored, for the workbook's Sources column.
 */
export function proseDays(s: string): string {
  return s.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (iso, y, m, d) => {
    const t = Date.UTC(Number(y), Number(m) - 1, Number(d));
    const back = new Date(t);
    return back.getUTCFullYear() === Number(y) && back.getUTCMonth() === Number(m) - 1 && back.getUTCDate() === Number(d) ? readDay(iso) : iso;
  });
}

const SEV_COLOR: Record<string, string> = {
  high: C.kill,
  medium: C.caution,
  low: C.brand,
};
const SUPPORT_COLOR: Record<string, string> = {
  supports: C.pass,
  favorable: C.caution,
  stretched: C.kill,
};
const ASSESS_COLOR: Record<string, string> = {
  aggressive: C.kill,
  "in-line": C.pass,
  conservative: C.brand,
};
const DIR_COLOR: Record<string, string> = {
  favorable: C.pass,
  unfavorable: C.kill,
  neutral: C.muted,
};

// Light tints for chip backgrounds — react-pdf has no alpha compositing
// against the page, so the tints are precomputed solids (the memo's trio,
// keyed by the rating color they pair with).
const TINT: Record<string, string> = {
  [C.pass]: "#e9f4ef",
  [C.caution]: "#f8f0e3",
  [C.kill]: "#f9eae8",
  [C.brand]: "#e8f1ef",
  [C.muted]: C.faint,
};

/** A rating word as a bordered, tinted chip — the same treatment the memo
 *  gives buy-box checks, so support/assessment reads scan identically across
 *  both documents. Empty word renders an em dash, not an empty chip. */
function RateChip({ word, color }: { word: string; color: string }) {
  if (!word) return <Text style={{ fontSize: 8, color: C.muted }}>—</Text>;
  return (
    <View style={{ flexDirection: "row" }}>
      <View
        style={{
          borderWidth: 0.75,
          borderColor: color,
          backgroundColor: TINT[color] ?? C.faint,
          borderRadius: 7,
          paddingVertical: 1,
          paddingHorizontal: 5,
        }}
      >
        <Text style={{ fontSize: 7, fontFamily: "Helvetica-Bold", color }}>{word}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: {
    paddingTop: 34,
    paddingBottom: 46,
    paddingHorizontal: 44,
    fontSize: 9.5,
    fontFamily: "Helvetica",
    color: C.ink,
    // NO numeric lineHeight here: react-pdf 4.x re-resolves styles on every
    // relayout pass of a page that contains a render-prop node (the footer's
    // pageNumber), re-multiplying an already-resolved lineHeight each time —
    // the footer ends up drawn thousands of points above the page. Default
    // line height keeps the footer (and page numbers) on the page.
  },
  pageHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingBottom: 6,
    marginBottom: 12,
  },
  pageHeadBrand: { fontSize: 9, fontFamily: "Helvetica-Bold", color: C.brand },
  pageHeadMeta: { fontSize: 8, color: C.muted },
  pageHeadRow: { flexDirection: "row", alignItems: "center" },
  pageHeadLogo: { height: 12, maxWidth: 80, objectFit: "contain", marginRight: 5 },
  h2Row: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  h2Tick: {
    width: 4,
    height: 13,
    backgroundColor: C.brand,
    borderRadius: 2,
    marginRight: 6,
  },
  h2: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
  },
  countPill: {
    borderWidth: 0.75,
    borderColor: C.line,
    backgroundColor: C.faint,
    borderRadius: 8,
    paddingVertical: 1.5,
    paddingHorizontal: 7,
    marginLeft: 8,
  },
  countPillText: { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: C.muted },
  sub: { fontSize: 8.5, color: C.muted, marginBottom: 10 },

  tableHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingBottom: 3,
    marginBottom: 2,
  },
  headText: {
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingVertical: 3.5,
    paddingHorizontal: 2,
  },
  rowAlt: { backgroundColor: C.faint },

  block: { marginBottom: 9 },
  blockTitleRow: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  tag: {
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: "#ffffff",
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 3,
    marginRight: 5,
  },
  blockTitle: { fontSize: 9.5, fontFamily: "Helvetica-Bold", flex: 1 },
  blockBody: { fontSize: 8.5, color: C.muted, marginTop: 1 },
  question: { fontSize: 8.5, color: C.brand, marginTop: 2 },

  summaryBox: {
    marginTop: 10,
    borderWidth: 0.75,
    borderColor: C.line,
    borderLeftWidth: 3,
    borderLeftColor: C.brand,
    backgroundColor: "#fbfcfb",
    borderRadius: 5,
    padding: 9,
  },
  summaryText: { fontSize: 9, color: C.ink },

  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 6,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: C.muted },
  footerLeft: { flex: 1, paddingRight: 12 },
  poweredBy: {
    position: "absolute",
    bottom: 11,
    left: 44,
    right: 44,
    fontSize: 8,
    color: "#8f9995",
    textAlign: "center",
  },
});

/** A page (or in-page) heading with the memo's brand tick, plus an optional
 *  count pill derived from the data on the page ("31 figures · 4 flagged") —
 *  the reader knows the page's weight before reading a row. */
/**
 * The model's assumptions against the published figures (lib/model-vs-market)
 * as the deal page's card prints them: one line an assumption — the model's
 * figure, where it came from, which way it runs — and the sentence naming
 * every figure with its date and publisher. Nothing with no read.
 */
function AssumptionsBlock({ read }: { read: ModelVsMarket | null | undefined }) {
  if (!read || read.checks.length === 0) return null;
  // The deal page's card's own words (lib/model-vs-market-scope): the
  // published figures for the market or the state, and the nation's.
  const scope = readScope(read, readDay(read.readOn));
  return (
    <View style={{ marginTop: 12 }} wrap={false}>
      <TitleRow title="Assumptions against the published figures" marginTop={0} />
      <Text style={s.sub}>
        {str(`${scope} A trailing year is what an assumption is being asked to beat, not a forecast; ${readGrainNote(read)}`)}
      </Text>
      {read.checks.map((c) => (
        <View key={c.key} style={{ marginTop: 3 }}>
          <Text style={{ fontSize: 8.5, color: C.ink }}>
            {str(`${c.title} ${c.model} (${c.modelSource}) — ${c.toneLabel}`)}
          </Text>
          <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{str(c.read)}</Text>
        </View>
      ))}
      {documentNotices(read.checks.flatMap((c) => c.published.map((p) => p.publisher))).map((n) => (
        <Text key={n} style={{ fontSize: 6.5, color: C.muted, marginTop: 4 }}>
          {str(n)}
        </Text>
      ))}
    </View>
  );
}

/**
 * The seller's loan, offered for assumption (#419) — the deal page's card in
 * words: the loan as stated, the rate against the model's new loan and
 * where that rate came from, the one sentence that says what the loan is
 * worth, and what the two positions ran on. The same `assumableView` the
 * card draws, so the report and the page never disagree. Nothing where no
 * loan is offered.
 */
/** A covenant or a contract that sets the rents (#453), printed over the
 *  grids its rent growth axis would otherwise mislead: the restriction in
 *  one line, then what the model's one growth rate is not on it. */
function AffordableCaveat({ read }: { read: AffordableRead | null }) {
  if (!read?.modelCaveat) return null;
  return (
    <Text style={{ fontSize: 8, color: C.caution, fontFamily: "Helvetica-Bold", marginBottom: 6 }}>
      {str(`${affordableShortLine(read)}. ${read.modelCaveat}`)}
    </Text>
  );
}

/** The one lease a single-tenant property is (#454), printed over the grids
 *  whose rent-growth axis and exit cap it speaks to: the lease in one line,
 *  then what it means for the model — the years left at its sale, or the
 *  lease ending inside its hold, and the lease's increases against the
 *  model's growth (the workbook cover's own two lines). */
function SingleTenantCaveat({ lease }: { lease: { line: string; read: string } | null }) {
  if (!lease?.line) return null;
  return (
    <Text style={{ fontSize: 8, color: C.caution, fontFamily: "Helvetica-Bold", marginBottom: 6 }}>
      {str(lease.read ? `${lease.line}. ${lease.read}` : `${lease.line}.`)}
    </Text>
  );
}

function AssumableBlock({ view }: { view: AssumableView | null | undefined }) {
  if (!view) return null;
  // A note the seller offers to carry (#462) is the same arithmetic in the
  // seller's loan's place; only the words change.
  const seller = view.kind === "seller";
  const rate =
    view.couponPct != null && view.marketPct != null && view.underMarketBps != null
      ? `The ${seller ? "note" : "loan"}'s ${view.couponPct.toFixed(2)}%${view.mipPct != null ? " with its MIP" : ""} against ${view.marketPct.toFixed(2)}% for a new one — ${Math.abs(view.underMarketBps)} bps ${
          view.underMarketBps >= 0 ? "under" : "over"
        }.`
      : "";
  return (
    <View style={{ marginTop: 12 }} wrap={false}>
      <TitleRow title={seller ? "The seller's note, offered to carry the price" : "The seller's loan, offered for assumption"} marginTop={0} />
      <Text style={s.sub}>{str(view.termsLine)}</Text>
      {rate ? <Text style={{ fontSize: 8.5, color: C.ink, marginTop: 2 }}>{str(rate)}</Text> : null}
      <Text style={{ fontSize: 8.5, color: C.ink, marginTop: 2 }}>{str(view.sentence)}</Text>
      {view.rateLine ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>{str(view.rateLine)}</Text> : null}
      {view.basisLine ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{str(view.basisLine)}</Text> : null}
      {view.feeLine ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{str(view.feeLine)}</Text> : null}
    </View>
  );
}

/**
 * FEMA's flood map at the building (#427): the aerial with FEMA's zones, in
 * the site's palette (#472, lib/flood-style), as one picture the width of the
 * page, with a ring at its centre (the building), the key of the zones the
 * picture shows under it and the sentence on the zone at
 * the building. The same frame and the same words as the deal page's Flood
 * tab, so the report and the page cannot disagree about the map.
 */
const SITE_MAP_W = 524; // the page's content width: LETTER less 44pt a side
const SITE_MAP_H = Math.round((SITE_MAP_W * REPORT_FLOOD_SIZE.height) / REPORT_FLOOD_SIZE.width);

/**
 * The memorandum's other photographs (#459), two to a row across the page,
 * each with its page's credit under it — the building from more than one
 * side, the way a broker's package opens and the deal page's mosaic shows
 * it. Cut to one frame by attention (lib/memo/cover-aerial
 * `galleryPhotosFor`), so the rows line up.
 */
const PHOTO_W = 256;
const PHOTO_H = 170;

function PhotosBlock({ photos }: { photos: MemoCover[] }) {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", marginTop: 4 }}>
      {photos.map((p, i) => (
        <View key={i} style={{ width: PHOTO_W, marginBottom: 12 }} wrap={false}>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image takes no alt */}
          <Image src={p.dataUri} style={{ width: PHOTO_W, height: PHOTO_H, borderRadius: 4, objectFit: "cover" }} />
          <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 3, textAlign: "right" }}>{str(p.credit)}</Text>
        </View>
      ))}
    </View>
  );
}

/** The site map's credit: what it is drawn from, what its centre is, and —
 *  where Photon placed the point — OpenStreetMap's data. */
export function siteMapCredit(view: Pick<FloodMapView, "ring" | "placedByOsm">): string {
  const centre =
    view.ring !== false
      ? "the ring marks the building."
      : "the frame is centred on the street the address names, not the building: the map data has no house number for it.";
  const osm = view.placedByOsm ? ` ${OSM_LOCATION_WORDS.charAt(0).toUpperCase()}${OSM_LOCATION_WORDS.slice(1)}.` : "";
  return `FEMA National Flood Hazard Layer over USGS The National Map; ${centre}${osm}`;
}

function SiteBlock({ view, lookedUp }: { view: FloodMapView; lookedUp?: string | null }) {
  return (
    <View wrap={false}>
      {view.image ? (
        <>
          <View style={{ position: "relative", width: SITE_MAP_W, height: SITE_MAP_H, marginTop: 2 }}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image takes no alt */}
            <Image src={view.image} style={{ width: SITE_MAP_W, height: SITE_MAP_H, borderRadius: 4, objectFit: "cover" }} />
            {/* The ring over a dark halo, so it reads over the pale tints —
                only where the frame's centre is the building's own point. */}
            {view.ring !== false && (
              <>
                <View
                  style={{
                    position: "absolute",
                    left: SITE_MAP_W / 2 - 8,
                    top: SITE_MAP_H / 2 - 8,
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    borderWidth: 1.5,
                    borderColor: "#1f2937",
                  }}
                />
                <View
                  style={{
                    position: "absolute",
                    left: SITE_MAP_W / 2 - 6.5,
                    top: SITE_MAP_H / 2 - 6.5,
                    width: 13,
                    height: 13,
                    borderRadius: 6.5,
                    borderWidth: 2,
                    borderColor: "#ffffff",
                  }}
                />
              </>
            )}
          </View>
          <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 3, textAlign: "right" }}>
            {siteMapCredit(view)}
          </Text>
        </>
      ) : null}
      {view.key.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
          {view.key.map((k) => (
            <View key={k.label} style={{ flexDirection: "row", alignItems: "center", marginRight: 12, marginBottom: 3 }}>
              {k.image ? (
                // eslint-disable-next-line jsx-a11y/alt-text -- react-pdf's Image takes no alt
                <Image src={k.image} style={{ width: 8, height: 8, marginRight: 4, borderWidth: 0.5, borderColor: C.line }} />
              ) : null}
              <Text style={{ fontSize: 7.5, color: C.ink, fontFamily: k.here ? "Helvetica-Bold" : "Helvetica" }}>
                {str(k.here ? `${k.label} — ${view.ring !== false ? "at the building" : "at the frame's centre"}` : k.label)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
      {view.line ? <Text style={{ fontSize: 9, color: C.ink, marginTop: 6, lineHeight: 1.35 }}>{str(view.line)}</Text> : null}
      {/* The day the zone was looked up, where the stored lookup says it:
          a map is redrawn and a lookup can be months old. */}
      {view.line && lookedUp ? (
        <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 3 }}>
          {str(`The zone as FEMA's National Flood Hazard Layer gave it on ${lookedUp}.`)}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * A leasehold's exit, on the term its ground lease has left at the model's
 * sale (#422) — the deal page's card on paper, from the same
 * `leaseholdExitView`, so the report and the page never disagree. Two
 * pictures in plain Views: the term from today, the model's hold filled
 * dark, the rest of the lease light, the extension options outlined and
 * dashed, the hold's years past the lease's end in the warning tone; and
 * the two exits on one track. Then the sentence and the small print.
 * Nothing where the deal is not a leasehold that states when its lease
 * ends.
 */
function LeaseholdBlock({ view }: { view: LeaseholdExitView | null | undefined }) {
  if (!view) return null;
  const v = view;
  const opts = v.optionYears ?? 0;
  const whole = Math.max(v.yearsLeft + opts, v.holdYears, 1);
  const at = (years: number) => `${Math.max(0, Math.min(100, (years / whole) * 100))}%`;
  const held = Math.min(v.holdYears, Math.max(0, v.yearsLeft));
  const after = Math.max(0, v.yearsLeft - v.holdYears);
  const past = Math.max(0, v.holdYears - Math.max(0, v.yearsLeft));
  const top = Math.max(v.capitalised, v.onTerm ?? 0) || 1;
  const exitBar = (label: string, value: number, color: string) => (
    <View style={{ marginTop: 4 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={{ fontSize: 7.5, color: C.ink }}>{str(label)}</Text>
        <Text style={{ fontSize: 7.5, color: C.ink, fontFamily: "Helvetica-Bold" }}>{str(exitMoney(value))}</Text>
      </View>
      <View style={{ height: 5, backgroundColor: C.faint, borderRadius: 2, marginTop: 1.5 }}>
        <View style={{ height: 5, width: `${Math.max(1.5, (value / top) * 100)}%`, backgroundColor: color, borderRadius: 2 }} />
      </View>
    </View>
  );
  return (
    <View style={{ marginTop: 12 }} wrap={false}>
      {/* The lease the position runs out with: the land's, or a sandwich
          position's master lease of the building (research pass 28). */}
      <TitleRow title={`The exit, on the ${v.lease ?? "ground lease"}'s term`} marginTop={0} />
      <Text style={s.sub}>{str(`${v.termLine}.`)}</Text>
      {v.yearsLeft > 0 ? (
        <View style={{ marginTop: 3 }}>
          <View style={{ height: 6, backgroundColor: C.faint, borderRadius: 3, position: "relative" }}>
            <View style={{ position: "absolute", left: 0, top: 0, height: 6, width: at(held), backgroundColor: C.brand }} />
            {after > 0 ? (
              <View style={{ position: "absolute", left: at(held), top: 0, height: 6, width: at(after), backgroundColor: "#9fb8ba" }} />
            ) : null}
            {past > 0 ? (
              <View style={{ position: "absolute", left: at(Math.max(0, v.yearsLeft)), top: 0, height: 6, width: at(past), backgroundColor: C.kill }} />
            ) : null}
            {opts > 0 ? (
              <View
                style={{
                  position: "absolute",
                  left: at(v.yearsLeft),
                  top: 0,
                  height: 6,
                  width: at(opts),
                  borderWidth: 0.75,
                  borderStyle: "dashed",
                  borderColor: C.brand,
                }}
              />
            ) : null}
          </View>
          <Text style={{ fontSize: 7, color: C.muted, marginTop: 2 }}>
            {str(
              [
                `Dark: the model's ${v.holdYears}-year hold`,
                after > 0 ? `light: the ${leaseYears(after)} left at the sale, to ${v.endLabel}` : "",
                past > 0 ? `red: the hold's ${leaseYears(past)} after the lease ends` : "",
                opts > 0 ? `dashed: ${leaseYears(opts)} of extension options, if exercised` : "",
              ]
                .filter(Boolean)
                .join("; ") + ".",
            )}
          </Text>
        </View>
      ) : null}
      {v.onTerm != null ? (
        <View style={{ marginTop: 3 }}>
          {exitBar("Capitalised, as the model runs it", v.capitalised, "#9aa3a1")}
          {exitBar(`On the ${leaseYears(v.yearsAtSale ?? 0)} left at the sale`, v.onTerm, C.brand)}
        </View>
      ) : null}
      <Text style={{ fontSize: 8.5, color: C.ink, marginTop: 4 }}>{str(v.sentence)}</Text>
      {v.optionsLine ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>{str(v.optionsLine)}</Text> : null}
      {v.lenderLine ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{str(v.lenderLine)}</Text> : null}
      {v.basisLine ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{str(v.basisLine)}</Text> : null}
    </View>
  );
}

/**
 * A portfolio memorandum's properties (lib/portfolio), as the deal page's
 * card draws them: the markets they sit in, the facts a buyer should see
 * before pricing any of it, then one row a property — its share of the
 * count (or area) as a bar and, where EVERY property states an NOI, its
 * share of the income beneath — with the figures the memorandum states for
 * it and its page (validated in the reader: a citation is never invented).
 * The sentences are the card's own (`portfolioFacts`, `propertyFigures`),
 * so the page and the report never disagree. Plain Views.
 */
function PortfolioBlock({ portfolio, noun }: { portfolio: PortfolioRead; noun: { one: string; many: string } }) {
  const p = portfolio;
  const basisWord = shareBasisWord(p, noun);
  // A share of the whole fills that share of the track, as on the deal
  // page's card (`shareOfTrack`).
  const track = 84;
  const bar = (sharePct: number) => Math.max(1.5, shareOfTrack(sharePct) * track);
  return (
    <View>
      <Text style={s.sub}>
        {str(
          `Each property as the memorandum states it — a blank is a figure it does not state. ${
            p.shares && basisWord
              ? `The bar is each property's share of the ${basisWord}${p.noiShares ? "; the thinner one beneath, its share of the NOI" : ""}.`
              : "No bars: the properties do not all state a count, nor all an area, so no share of the whole can be drawn."
          }`,
        )}
      </Text>
      {p.markets.length > 0 ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 7 }}>
          {p.markets.map((m) => (
            <RateChip key={m.id} word={str(`${m.name} · ${m.properties}`)} color={C.brand} />
          ))}
        </View>
      ) : null}
      {portfolioFacts(p).map((f) => (
        <Text key={f} style={{ fontSize: 8, color: C.ink, fontFamily: "Helvetica-Oblique", marginBottom: 2 }}>
          {str(f)}
        </Text>
      ))}
      {/* The table's own View: its header repeats on a page a long list of
          properties runs onto. */}
      <View>
      <View style={[s.tableHead, { marginTop: 8 }]} fixed>
        <Text style={[s.headText, { width: "30%" }]}>Property</Text>
        <Text style={[s.headText, { width: "22%" }]}>{p.shares && basisWord ? "Share" : ""}</Text>
        <Text style={[s.headText, { width: "40%" }]}>What the memorandum states</Text>
        <Text style={[s.headText, { width: "8%" }]}>Page</Text>
      </View>
      {p.assets.map((a, i) => (
        <View key={`${a.name}-${i}`} style={i % 2 === 1 ? [s.row, s.rowAlt] : s.row} wrap={false}>
          <View style={{ width: "30%", paddingRight: 6 }}>
            <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold" }}>{str(a.name)}</Text>
            {a.place ? <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{str(a.place)}</Text> : null}
          </View>
          <View style={{ width: "22%", paddingRight: 6 }}>
            {p.shares ? (
              <View style={{ width: track, height: 4, borderRadius: 2, backgroundColor: C.line, position: "relative" }}>
                <View style={{ position: "absolute", left: 0, top: 0, height: 4, borderRadius: 2, width: bar(p.shares[i]), backgroundColor: "#7fa9a4" }} />
              </View>
            ) : null}
            {p.shares && p.noiShares ? (
              <View style={{ marginTop: 2, width: track, height: 2.5, borderRadius: 1.25, backgroundColor: C.line, position: "relative" }}>
                <View
                  style={{ position: "absolute", left: 0, top: 0, height: 2.5, borderRadius: 1.25, width: bar(p.noiShares[i]), backgroundColor: "#8f9995" }}
                />
              </View>
            ) : null}
          </View>
          <Text style={{ width: "40%", fontSize: 8, color: C.ink, paddingRight: 4 }}>{str(propertyFigures(p, i, noun).join(" · "))}</Text>
          <Text style={{ width: "8%", fontSize: 7.5, color: C.muted }}>{a.page ? str(a.page) : "—"}</Text>
        </View>
      ))}
      </View>
      <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 8 }}>
        {str(
          "An allocation is the seller's split of the price, set for transfer taxes and financing rather than by value; a cap struck on it is the allocation's cap, not the property's. Each property's market is read from its own address; the market check's published figures are the one market's that the deal's address on file sits in, never the portfolio's.",
        )}
      </Text>
    </View>
  );
}

/**
 * A leasehold's model caveat as paper says it. On the web it sends the
 * reader to the ground lease calculator on the stated term; a PDF has no
 * link, and where the report runs that term itself (`LeaseholdBlock`,
 * "The exit, on the ground lease's term") it points there instead
 * (research pass 35). Where the report draws no block, the caveat stands
 * as written.
 */
export function caveatOnPaper(caveat: string, leasehold: LeaseholdExitView | null | undefined): string {
  if (!leasehold) return caveat;
  return caveat.replace(
    /run the ground lease calculator on the stated term(, with the master rent as its rent)?\./,
    `see The exit, on the ${leasehold.lease ?? "ground lease"}'s term, below.`,
  );
}

const COUNT_WORDS = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
/** A count of lines as a sentence says it: "the first two", never "the
 *  first 2" (research pass 35); ten and over stay figures. */
const countWord = (n: number) => (n > 0 && n < 10 ? COUNT_WORDS[n] : String(n));

/**
 * Whose figures a printed block of the market check's evidence is: the
 * address's market first ("the Washington DC market's"), a state as the
 * state's — an outside-the-metros deal read its state and the page said
 * "market's … the metro's" before — and a portfolio's other markets
 * (#413) each with how many of the properties sit there. Never the
 * portfolio's figure.
 */
function briefHeading(b: NonNullable<MarketResult["liveBrief"]>, first: boolean): string {
  const state = b.grain === "state";
  const whose = state ? `the state of ${b.metro}'s` : `the ${b.metro} market's`;
  const pf = b.portfolio;
  const sit = pf ? `${pf.here} of the portfolio's ${pf.of} properties ${pf.here === 1 ? "sits" : "sit"}` : "";
  // The last `national` lines are the nation's, and said so here rather
  // than folded into "each is the metro's".
  const nat = Math.min(Math.max(b.national ?? 0, 0), b.lines.length);
  const nationSays = nat > 0 ? (nat === 1 ? " The last is the nation's, and says so." : ` The last ${countWord(nat)} are the nation's, each said so.`) : "";
  const localCount = b.lines.length - nat;
  const first_ = localCount === 1 ? "The first is" : `The first ${countWord(localCount)} are`;
  // Every line the nation's: none of the market's own figures was current,
  // said in place of "the first none are the metro's" (the pre-merge audit).
  if (localCount === 0 && nat > 0) {
    const each = ` Each is the nation's, and says so.`;
    return first
      ? `Figures the check read beside the rules of thumb: the nation's, as published, read on ${readDay(b.readOn)} — none of ${whose} own was current${
          state ? ", and the address lies outside the metros the site tracks" : ""
        }.${state ? "" : placedBySentence(b.placedBy)}${each}`
      : `And the nation's, where ${sit}, read on ${readDay(b.readOn)}: none of ${whose} own was current.${each}`;
  }
  if (!first) {
    return `And ${whose} own, where ${sit}, read on ${readDay(b.readOn)}. Each is ${state ? "the state's" : "the metro's"} — not those properties' own, and never the portfolio's.${nationSays}`;
  }
  const lead = `Figures the check read beside the rules of thumb: ${whose}, as published, read on ${readDay(b.readOn)}${
    state ? " — the address lies outside the metros the site tracks" : ""
  }.${state ? "" : placedBySentence(b.placedBy)}`;
  const each =
    (nat > 0
      ? state
        ? ` ${first_} the state's, not any metro's, the submarket's or the building's.`
        : ` ${first_} the metro's, not the submarket's or the building's.`
      : state
        ? " Each is the state's, not any metro's, the submarket's or the building's."
        : " Each is the metro's, not the submarket's or the building's.") + nationSays;
  const forWhom = pf
    ? pf.here > 0
      ? ` They speak for the portfolio's ${pf.here} ${pf.here === 1 ? "property" : "properties"} in ${b.metro} of its ${pf.of}, never for the portfolio.`
      : ` They are the address on file's, where none of the portfolio's ${pf.of} properties sits.`
    : "";
  return lead + each + forWhom;
}

function TitleRow({
  title,
  count,
  marginTop,
}: {
  title: string;
  count?: string;
  marginTop?: number;
}) {
  return (
    <View style={marginTop != null ? [s.h2Row, { marginTop }] : s.h2Row}>
      <View style={s.h2Tick} />
      <Text style={s.h2}>{title}</Text>
      {count ? (
        <View style={s.countPill}>
          <Text style={s.countPillText}>{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

function PageChrome({
  title,
  count,
  dealName,
  branding,
  children,
}: {
  title: string;
  count?: string;
  dealName: string;
  branding?: MemoData["branding"];
  children: React.ReactNode;
}) {
  const branded = !!(
    branding &&
    (branding.firmName || branding.logoDataUri || branding.footerText)
  );
  return (
    <Page size="LETTER" style={s.page}>
      <View style={s.pageHead} fixed>
        <View style={s.pageHeadRow}>
          {branding?.logoDataUri ? (
            // react-pdf's Image has no alt concept (print canvas, not DOM)
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={branding.logoDataUri} style={s.pageHeadLogo} />
          ) : null}
          {branding?.firmName ? (
            <Text style={s.pageHeadBrand}>{pdfSafe(branding.firmName)}</Text>
          ) : !branding?.logoDataUri ? (
            <Text style={s.pageHeadBrand}>Underwrite Copilot</Text>
          ) : null}
        </View>
        <Text style={s.pageHeadMeta}>{dealName} — full screening report</Text>
      </View>
      <TitleRow title={title} count={count} />
      {children}
      <View style={s.footer} fixed>
        <View style={s.footerLeft}>
          {branding?.footerText ? (
            <Text style={s.footerText}>{pdfSafe(branding.footerText)}</Text>
          ) : null}
          <Text style={s.footerText}>
            First-pass screen, not investment advice. Verify flagged figures
            against source documents.
          </Text>
        </View>
        <Text
          style={s.footerText}
          render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`}
        />
      </View>
      {branded ? (
        <Text style={s.poweredBy} fixed>
          Powered by Underwrite Copilot
        </Text>
      ) : null}
    </Page>
  );
}

const CALL_COLOR: Record<string, string> = { Go: C.pass, Caution: C.caution, "No-go": C.kill };
// A range's confidence, in the memo's and the deal page's colours.
const CONF_COLOR: Record<string, string> = { high: C.pass, medium: C.caution, low: C.kill };
const CALL_WORD: Record<string, string> = { pass: "Go", caution: "Caution", pass_on: "No-go" };
const LEVER_WORD: Record<string, string> = { basis: "Basis", exit: "Exit", debt: "Debt" };
const SCENARIO_WORD: Record<string, string> = { conservative: "Conservative", base: "Base", sponsor: "Sponsor" };

/**
 * The call, in full: what the one-page memo clamps to fit its boxes or
 * drops for room — the whole rationale, every top risk and next step, each
 * range with its source, its basis and its confidence, and the deal-killers
 * and the flips in their own words. Only what the verdict stores, through
 * the WinAnsi filter; nothing is summarised or added.
 */
function CallInFullPage({
  verdict,
  memo,
}: {
  verdict: VerdictResult;
  memo: MemoData;
}) {
  const word = memo.verdictWord ?? "";
  const color = CALL_COLOR[word] ?? C.brand;
  const risks = list(verdict.topRisks).map(str).filter(Boolean);
  const steps = list(verdict.nextSteps).map(str).filter(Boolean);
  const screen = verdict.screen;
  // Read in numeric order (lib/verdict-range): a verdict stored when the
  // conservative end came first can hold its larger figure as "low".
  const ranges = (list(screen?.ranges) as NonNullable<VerdictResult["screen"]>["ranges"]).map((r) =>
    r ? rangeInOrder({ ...r, low: str(r.low), high: str(r.high) }) : r,
  );
  const killers = list(screen?.dealKillers) as NonNullable<VerdictResult["screen"]>["dealKillers"];
  const flips = list(screen?.sensitivity) as NonNullable<VerdictResult["screen"]>["sensitivity"];
  const item = { fontSize: 9, color: C.ink, lineHeight: 1.3 } as const;
  return (
    <PageChrome title="The call, in full" count={[word, memo.screened].filter(Boolean).join(" · ")} dealName={memo.name} branding={memo.branding}>
      <Text style={s.sub}>
        {"What the one-page memo shortens to fit or leaves out, as the verdict states it: the whole rationale, every risk and next step, and each range with its source, basis and confidence."}
      </Text>
      {str(verdict.reason) ? (
        <View style={[s.summaryBox, { marginTop: 0, borderLeftColor: color }]} wrap={false}>
          {word ? <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color, marginBottom: 3 }}>{word}</Text> : null}
          <Text style={[s.summaryText, { lineHeight: 1.35 }]}>{str(verdict.reason)}</Text>
        </View>
      ) : null}
      {risks.length > 0 ? (
        <View>
          <TitleRow title="Top risks" count={`${risks.length}`} marginTop={14} />
          {risks.map((r, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 4 }} wrap={false}>
              <Text style={{ width: 12, fontSize: 9, color: C.muted }}>•</Text>
              <Text style={[item, { flex: 1 }]}>{r}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {steps.length > 0 ? (
        <View>
          <TitleRow title="Next steps" count={`${steps.length}`} marginTop={10} />
          {steps.map((n, i) => (
            <View key={i} style={{ flexDirection: "row", marginBottom: 4 }} wrap={false}>
              <Text style={{ width: 14, fontSize: 9, color: C.muted }}>{`${i + 1}.`}</Text>
              <Text style={[item, { flex: 1 }]}>{n}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {ranges.length > 0 ? (
        <View>
          <TitleRow title="The screen's ranges" count={`${ranges.length}`} marginTop={10} />
          <View style={s.tableHead} fixed>
            <Text style={[s.headText, { width: "34%" }]}>Assumption</Text>
            <Text style={[s.headText, { width: "15%", textAlign: "right" }]}>Low</Text>
            <Text style={[s.headText, { width: "15%", textAlign: "right" }]}>Base</Text>
            <Text style={[s.headText, { width: "15%", textAlign: "right" }]}>High</Text>
            <Text style={[s.headText, { width: "21%", textAlign: "right" }]}>Confidence</Text>
          </View>
          {ranges.map((r, i) => (
            <View key={i} style={[s.row, { flexDirection: "column", alignItems: "stretch" }, i % 2 === 1 ? s.rowAlt : {}]} wrap={false}>
              <View style={{ flexDirection: "row" }}>
                <Text style={{ width: "34%", fontSize: 8.5, fontFamily: "Helvetica-Bold" }}>{str(r?.label)}</Text>
                <Text style={{ width: "15%", fontSize: 8.5, textAlign: "right" }}>{str(r?.low)}</Text>
                <Text style={{ width: "15%", fontSize: 8.5, textAlign: "right", fontFamily: "Helvetica-Bold", color: C.brand }}>{str(r?.base)}</Text>
                <Text style={{ width: "15%", fontSize: 8.5, textAlign: "right" }}>{str(r?.high)}</Text>
                <Text style={{ width: "21%", fontSize: 8, textAlign: "right", color: CONF_COLOR[str(r?.confidence)] ?? C.muted }}>
                  {str(r?.confidence)}
                </Text>
              </View>
              {str(r?.source) ? (
                <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>{str(`Source: ${str(r?.source)}`)}</Text>
              ) : null}
              {str(r?.basis) ? (
                <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 1 }}>{str(`What drives the spread: ${str(r?.basis)}`)}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
      {killers.length > 0 ? (
        <View wrap={false}>
          <TitleRow title="The deal-killers" marginTop={10} />
          {killers.map((k, i) => (
            <View key={i} style={{ marginBottom: 5 }} wrap={false}>
              <Text style={[item, { fontFamily: "Helvetica-Bold", color: C.brand }]}>
                {str(`${i + 1}. ${LEVER_WORD[str(k?.lever)] ?? str(k?.lever)}`)}
              </Text>
              {str(k?.read) ? <Text style={item}>{str(k?.read)}</Text> : null}
              {str(k?.risk) ? <Text style={[item, { color: C.kill }]}>{str(`Breaks if (screen's estimate): ${str(k?.risk)}`)}</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
      {flips.length > 0 ? (
        <View wrap={false}>
          <TitleRow title="Where the call flips" count="the screen's estimate, not the model's" marginTop={10} />
          {flips.map((f, i) => {
            const call = CALL_WORD[str(f?.call)] ?? str(f?.call);
            return (
              <Text key={i} style={[item, { marginBottom: 3 }]}>
                {str(`${SCENARIO_WORD[str(f?.scenario)] ?? str(f?.scenario)}: ${call}${str(f?.note) ? ` — ${str(f?.note)}` : ""}`)}
              </Text>
            );
          })}
        </View>
      ) : null}
    </PageChrome>
  );
}

export interface ReportInput {
  deal: DealRow;
  memo: MemoData;
  /** the sensitivity page's data (Feature 5): both grids, the buyer-hurdle
   *  color scale, the takeaway, and the max bid; null when the deal has no
   *  extraction to derive a model from */
  sensitivity?: SensitivityData | null;
  /** why the IRR page and the max bid are left out where the model runs on
   *  a placeholder price or an assumed year-1 NOI (lib/underwrite/report-grid
   *  `placeholderReturnsLine`); printed on the page the grids would have
   *  been on. Null where the grids print, and on a plan deal, whose plan
   *  page says why its IRR page is left out. */
  withheld?: string | null;
  /** the plan page for a conversion / development / lease-up / value-add:
   *  the plan as the OM states it and yield on total cost stressed across
   *  NOI shortfall and budget overrun; null for a stabilized asset or when
   *  the OM did not state a budget and a stabilized NOI */
  plan?: PlanReport | null;
  /** why a plan deal's plan page is left out where the route built a model
   *  but no yield on cost can be stressed on what was read (a figure the
   *  page needs was not read, named; the developer funds a forward
   *  purchase's works; the price is not the project's): printed on the page
   *  that carries the deal's terms — its pill and its sentence — whose
   *  model reads are then withheld as a placeholder model's are. Null
   *  everywhere else: a report whose route built no model says that
   *  instead. */
  planLeftOut?: { count: string; why: string } | null;
  /** the OM's real page count, from the extraction — a citation prints only
   *  when it falls inside it (lib/facts.ts: never an unvalidated page);
   *  null when the count is unknown, and then no page prints */
  totalPages: number | null;
  /** the model's assumptions against the published figures
   *  (lib/model-vs-market), read when the report was built — printed under
   *  the sensitivity grids, or under the plan's grid on a plan deal; null
   *  where there was no model or nothing fresh to read it against */
  modelVsMarket?: ModelVsMarket | null;
  /** the seller's loan offered for assumption, priced against the model's
   *  new loan (lib/assumable-debt, #419) — printed beside the assumptions
   *  read; null where none is offered or there was no model */
  assumable?: AssumableView | null;
  /** a leasehold's exit on the term its ground lease has left at the
   *  model's sale (lib/leasehold-exit, #422) — printed beside the
   *  assumptions read; null unless a leasehold states when its lease ends */
  leasehold?: LeaseholdExitView | null;
  /** the one lease a single-tenant property is, and the model's read of it
   *  (lib/single-tenant via the derived model's `meta.singleTenant`, #454)
   *  — printed over the grids; absent where the caller built no model, and
   *  then the lease's own line prints alone */
  singleTenant?: { line: string; read: string } | null;
  /** what a hotel is sold with, and the model's read of it (lib/hotel-deal
   *  via the derived model's `meta.hotel`, #455) — printed over the grids;
   *  absent where the caller built no model, and then the line prints
   *  alone */
  hotel?: { line: string; read: string } | null;
  /** how the property is sold, and the ceiling bid at the report's hurdle
   *  (lib/sale-terms + lib/sale-ceiling, #456) — printed over the grids;
   *  absent where the caller built no model, and then the line prints
   *  alone */
  sale?: { line: string; read: string } | null;
  /** a multi-tenant property's listed tenants, and what the model does not
   *  carry for their roll (lib/tenant-roster via the derived model's
   *  `meta.roster`, #457) — printed over the grids; absent where the caller
   *  built no model, and then the line prints alone */
  roster?: { line: string; read: string } | null;
  /** a value-add renovation program, and what a door is worth at the
   *  model's exit cap (lib/value-add via the derived model's
   *  `meta.valueAdd`, #460) — printed over the grids; absent where the
   *  caller built no model, and then the line prints alone */
  valueAdd?: { line: string; read: string } | null;
  /** a property-tax abatement, and where it ends against the model's sale
   *  (lib/tax-abatement via the derived model's `meta.taxAbatement`, #461)
   *  — printed over the grids; absent where the caller built no model, and
   *  then the line prints alone */
  taxAbatement?: { line: string; read: string } | null;
  /** a note the seller offers to carry, priced against the model's new loan
   *  (lib/seller-financing `sellerFinancingView`, #462); null where none is
   *  offered */
  sellerNote?: AssumableView | null;
  /** what the third-party reports found, and what the model does with the
   *  immediate repairs (lib/site-reports via the derived model's
   *  `meta.siteReports`, #465) — printed over the grids; absent where the
   *  caller built no model, and then the line prints alone */
  siteReports?: { line: string; read: string } | null;
  /** a student building's pre-leasing, beds and walk, and the model's
   *  vacancy against the beds still to sign (lib/student-housing via the
   *  derived model's `meta.student`, #468) — printed over the grids;
   *  absent where the caller built no model, and then the line prints
   *  alone */
  student?: { line: string; read: string } | null;
  /** a manufactured-housing park's pads, lot rent, homes and utilities,
   *  and what the model does with the gap to market, the park-owned homes
   *  and a private system (lib/manufactured-housing via the derived
   *  model's `meta.mh`, #470) — printed over the grids; absent where the
   *  caller built no model, and then the line prints alone */
  mh?: { line: string; read: string } | null;
  /** a self-storage facility's occupancies, rates and platform, and what
   *  the model does with the premium over street and a lease-up
   *  (lib/self-storage via the derived model's `meta.storage`, #471) —
   *  printed over the grids; absent where the caller built no model, and
   *  then the line prints alone */
  storage?: { line: string; read: string } | null;
  /** the rent rules that reach the building — the regime, the regulated
   *  share as stated and the allowance in force — and the model's one growth
   *  rate set beside the allowance (lib/rent-regulation, read by the route
   *  through `regulationForDeal`, with the derived model's
   *  `meta.regulation`) — printed over the grids; the line alone where the
   *  model built nothing worth printing, and nothing where the caller read
   *  no regulation */
  regulation?: { line: string; read: string } | null;
  /** a forward purchase or a build-to-suit bought at delivery, and what the
   *  model does with it — the price as paid at closing, its year-one NOI
   *  beside the memorandum's at delivery (lib/forward-purchase via the
   *  derived model's `meta.forward`) — printed over the grids; absent where
   *  the caller built no model, and then the line prints alone */
  forward?: { line: string; read: string } | null;
  /** a mixed-use building's two incomes, and what the model does with them
   *  — one exit cap and one growth rate for both (lib/mixed-use via the
   *  derived model's `meta.mixedUse`) — printed over the grids; absent
   *  where the caller built no model, and then the line prints alone */
  mixedUse?: { line: string; read: string } | null;
  /** an operating business on its real estate, and what the model does with
   *  its income — capitalised as rent, nothing allocated to the business
   *  (lib/going-concern via the derived model's `meta.goingConcern`) —
   *  printed over the grids; absent where the caller built no model, and
   *  then the line prints alone */
  goingConcern?: { line: string; read: string } | null;
  /** condominium units bought in bulk, and what the model does with them —
   *  one building at one exit cap, no retail exit (lib/condo via the derived
   *  model's `meta.condo`) — printed over the grids; absent where the caller
   *  built no model, and then the line prints alone */
  condo?: { line: string; read: string } | null;
  /** a sandwich position, and what the model does with it — its income
   *  capitalised at the sale as if it ran forever while the master lease
   *  ends (lib/sandwich-lease via the derived model's `meta.sandwich`) —
   *  printed over the grids; absent where the caller built no model, and
   *  then the line prints alone */
  sandwich?: { line: string; read: string } | null;
  /** FEMA's flood map at the building (lib/flood-map `floodMapFor`, #427,
   *  #472): the deal's flood frame cut to the band, the key of the zones it
   *  shows and the zone sentence; null for no page */
  floodMap?: FloodMapView | null;
  /** the memorandum's other photographs, cut to the page's frame and
   *  credited (lib/memo/cover-aerial `galleryPhotosFor`, #459); fewer than
   *  two is no page */
  photos?: MemoCover[] | null;
  /** the page the memo's target-return chip names for the model's IRR —
   *  the sensitivity page's, counted from the pages before it on a
   *  one-page memo and call; `renderReportPdf` draws again where the page
   *  landed elsewhere. Null where the chip names none. */
  targetReturnPage?: number | null;
}

/** The chip the target-return check prints, as the memo clamps its label. */
const TARGET_RETURN = "Target return";

/**
 * Why a plan deal's plan page is left out where its model was built, in
 * words true of the deal. The plan page (lib/plan-sensitivity
 * `buildPlanReport`) stresses a yield on cost: a stabilized NOI over the
 * price and the buyer's budget, or over an all-in total. A forward
 * purchase's works are the developer's; a price that is not the project's
 * says so; otherwise the figures the page could not read are named — "read",
 * since a budget the memorandum states may be one the reader refused. Where
 * every figure was read, the caller simply built no plan page, and the
 * sentence says only that.
 */
function planLeftOutWhy(extraction: ExtractionResult | null, signal: FirstSignal | null): { count: string; why: string } {
  const plan = planSummary(extraction, inferStrategy(extraction, signal));
  const terms = "these are the memorandum's terms as read, without the model's read beside them.";
  const rest = `the plan page is left out, and ${terms}`;
  if (plan?.forward) {
    return { count: "the developer funds the works", why: `The developer funds the works, so the buyer has no budget for the plan page to stress: ${rest}` };
  }
  if (plan?.priceWithheld) {
    return { count: "no yield on cost struck", why: `The price is ${plan.priceWithheld}, so no yield on cost is struck: ${rest}` };
  }
  if (plan?.costWithheld) return { count: "no yield on cost struck", why: `${plan.costWithheld.replace(/\.$/, "")}: ${rest}` };
  const noi = plan?.stabilizedNoi?.value ?? null;
  const budget = plan?.budget?.budget ?? null;
  const price = plan?.price ?? (plan?.budget?.isTotal ? 0 : null);
  const missing = [
    noi == null ? "stabilized NOI" : noi > 0 ? null : "stabilized NOI above zero",
    budget == null ? "budget" : budget > 0 ? null : "budget above zero",
    price == null ? "price to set the budget against" : null,
  ].filter((m): m is string => m != null);
  if (missing.length === 0) return { count: "left out", why: `No plan page was built for this report, so ${terms}` };
  const named = missing.length === 1 ? missing[0] : `${missing.slice(0, -1).join(", ")} or ${missing[missing.length - 1]}`;
  return { count: "no yield on cost struck", why: `No ${named} was read from the memorandum, so no yield on cost is struck: ${rest}` };
}

/**
 * The memo page's target-return chip, where the buy-box check read no IRR
 * from the screen ("—") and the report grades the model's own against the
 * same target a few pages on: the chip names the model's figure and its
 * page ("— Target return · model 9.3%, p. 3"; research pass 35: one PDF
 * printed an unknown target return on page 1 and graded a 9.3% IRR against
 * it on page 4). Only where the grids are the deal's own returns
 * (`gridSubjectOf`), never a note's collateral's. The check itself is
 * unchanged: reading the model's IRR into it is the owner's call.
 */
function withTargetReturnNote(memo: MemoData, irr: number | null, page: number | null): MemoData {
  if (irr == null || !Number.isFinite(irr) || page == null) return memo;
  return {
    ...memo,
    buyBox: memo.buyBox.map((c) =>
      c.label === TARGET_RETURN && c.status === "unknown" ? { ...c, note: `model ${(irr * 100).toFixed(1)}%, p. ${page}` } : c,
    ),
  };
}

/** The model's levered IRR the sensitivity page grades: the base case's
 *  tile, else the ink-bordered cell it equals. */
function gradedIrrOf(s: SensitivityData): number | null {
  return s.baseCase?.leveredIrr ?? s.grid.cells[s.grid.baseRow]?.[s.grid.baseCol]?.irrPct ?? null;
}

/** The deal's first signal, which the deal page reads beside the
 *  extraction to infer the deal's kind; null on a row screened before it. */
function firstSignalOf(deal: DealRow): FirstSignal | null {
  return (deal.first_signal as FirstSignal | null | undefined) ?? null;
}

/** Everything the deal screen produced, shaped for the multi-page report. */
export function buildReportData(
  deal: DealRow,
  dateStr: string,
  buyBoxChecks?: BuyBoxCheck[] | null,
  sensitivity?: SensitivityData | null,
  branding?: MemoData["branding"],
  plan?: PlanReport | null,
  overrides?: string[] | null,
  cover?: MemoData["cover"],
  modelVsMarket?: ModelVsMarket | null,
  assumable?: AssumableView | null,
  leasehold?: LeaseholdExitView | null,
  floodMap?: FloodMapView | null,
  singleTenant?: { line: string; read: string } | null,
  hotel?: { line: string; read: string } | null,
  sale?: { line: string; read: string } | null,
  roster?: { line: string; read: string } | null,
  photos?: MemoCover[] | null,
  valueAdd?: { line: string; read: string } | null,
  taxAbatement?: { line: string; read: string } | null,
  sellerNote?: AssumableView | null,
  siteReports?: { line: string; read: string } | null,
  student?: { line: string; read: string } | null,
  mh?: { line: string; read: string } | null,
  storage?: { line: string; read: string } | null,
  regulation?: { line: string; read: string } | null,
  forward?: { line: string; read: string } | null,
  mixedUse?: { line: string; read: string } | null,
  goingConcern?: { line: string; read: string } | null,
  condo?: { line: string; read: string } | null,
  sandwich?: { line: string; read: string } | null,
  /** the day the report is read on, an ISO day — the reader's own, which the
   *  route dates the report and names its file for: its first page's dated
   *  lines (the rent allowance in force) read it, as the route's own
   *  regulation read does. The clock's UTC day where a caller passes none. */
  today?: string,
): ReportInput {
  const extraction = (deal.extraction as ExtractionResult | null) ?? null;
  const pages = extraction?.totalPages;
  // On a plan deal the annual screening model books the budget in year 1
  // and anchors year 1 on in-place income, so its IRR grid is not the
  // plan's return — it once printed a -48% IRR and a -17.9x multiple as
  // the base case. The plan page carries the sensitivity such a deal is
  // judged on; the IRR page is omitted rather than caveated. The kind is
  // the deal page's read: the extraction and the first signal.
  const planDeal = isPlanDeal(inferStrategy(extraction, firstSignalOf(deal)).kind);
  // A model on a placeholder price or an assumed year-1 NOI (the route's
  // sources say which) has no returns worth printing: the IRR page and the
  // max bid are left out the same way, with the line that says why — and
  // nothing else it computed prints either, so its reads fall back to the
  // lines the memorandum states, as for a caller that built no model. A
  // plan deal's page already says why its IRR page is left out.
  const withheld = planDeal ? null : (sensitivity?.withheld ?? null);
  // A plan deal whose plan page could not be built (no yield on cost can be
  // struck on what was read) prints neither page, so its model's reads
  // would stand beside no grid at all: they are withheld as a placeholder
  // model's are, and the page that carries its terms says why — never "No
  // screening model was built", which is a report whose route built none
  // (the batch audit: the page said so over the model's reads).
  const planLeftOut = planDeal && !plan && sensitivity != null ? planLeftOutWhy(extraction, firstSignalOf(deal)) : null;
  const readsWithheld = !!withheld || !!planLeftOut;
  const modelRead = <T,>(v: T | null | undefined): T | null => (readsWithheld ? null : (v ?? null));
  // The grids the report prints, and the page they land on where the memo
  // and the call each take one: the memo's target-return chip names it.
  const graded = planDeal || withheld ? null : (sensitivity ?? null);
  const memo = buildMemoData(deal, dateStr, buyBoxChecks, branding, overrides, cover, today);
  const irr = graded ? gradedIrrOf(graded) : null;
  const chip = memo.buyBox.some((c) => c.label === TARGET_RETURN && c.status === "unknown");
  const targetReturnPage =
    graded && chip && irr != null && Number.isFinite(irr) && gridSubjectOf(extraction) == null
      ? 2 + ((deal.verdict as VerdictResult | null) ? 1 : 0) + (plan ? 1 : 0)
      : null;
  const annotated = targetReturnPage != null ? withTargetReturnNote(memo, irr, targetReturnPage) : memo;
  return {
    modelVsMarket: modelVsMarket ?? null,
    assumable: modelRead(assumable),
    leasehold: modelRead(leasehold),
    floodMap: floodMap ?? null,
    singleTenant: modelRead(singleTenant),
    hotel: modelRead(hotel),
    sale: modelRead(sale),
    roster: modelRead(roster),
    photos: photos ?? null,
    valueAdd: modelRead(valueAdd),
    taxAbatement: modelRead(taxAbatement),
    sellerNote: modelRead(sellerNote),
    siteReports: modelRead(siteReports),
    student: modelRead(student),
    mh: modelRead(mh),
    storage: modelRead(storage),
    // The rent rules are the site's rules and the memorandum's words, not
    // the model's: where the model's reads are withheld, the line still
    // prints, without the model's growth set beside the allowance.
    regulation: regulation ? (readsWithheld ? { line: regulation.line, read: "" } : regulation) : null,
    forward: modelRead(forward),
    mixedUse: modelRead(mixedUse),
    goingConcern: modelRead(goingConcern),
    condo: modelRead(condo),
    sandwich: modelRead(sandwich),
    deal,
    // Page 1 IS the memo, dismissed submarket checks and the cover aerial
    // included: the analyst's own words on an override travel with the
    // report as they do with the standalone memo.
    memo: annotated,
    sensitivity: graded,
    withheld,
    plan: plan ?? null,
    planLeftOut,
    totalPages: typeof pages === "number" && Number.isFinite(pages) && pages > 0 ? Math.round(pages) : null,
    targetReturnPage,
  };
}

/**
 * The full report as PDF bytes — what the report routes serve. The memo's
 * target-return chip names the sensitivity page by number, and that page
 * moves where the memo or the call runs to a second page; the page is
 * recorded where it lands as the report is laid out, and where it is not
 * the one the chip names, the report is drawn once more naming it (the
 * same length of words, so nothing else moves).
 */
export async function renderReportPdf(input: ReportInput): Promise<Buffer> {
  let landed: number | null = null;
  const draw = (i: ReportInput) =>
    renderToBuffer(
      <ReportDocument
        input={i}
        onSensitivityPage={(n) => {
          landed = n;
        }}
      />,
    );
  const first = await draw(input);
  const named = input.targetReturnPage ?? null;
  if (named == null || landed == null || landed === named || !input.sensitivity) return first;
  return draw({ ...input, memo: withTargetReturnNote(input.memo, gradedIrrOf(input.sensitivity), landed), targetReturnPage: landed });
}

/** A metric's page for the page column — the citation as extracted when it
 *  parses and falls inside the document, a dash otherwise. The deal page
 *  shows the same rows as "source not located"; the report must not show
 *  more than the app does. */
export function citedPage(page: unknown, totalPages: number | null): string {
  const n = parsePageNumber(typeof page === "string" ? page : null);
  return n != null && totalPages != null && n <= totalPages ? str(page) : "—";
}

const fmtPct = (d: number, dp = 1): string => `${(d * 100).toFixed(dp)}%`;
const fmtDelta = (d: number): string => `${d > 0 ? "+" : ""}${Math.round(d * 100)}%`;
const fmtUsd0 = (n: number): string => `$${Math.round(n).toLocaleString("en-US")}`;

/**
 * Where one of the model's inputs came from, as the workbook's Sources
 * column marks it (lib/underwrite/workbook): its note — which names the
 * document for a figure read from one ("OM asking / purchase price", "Rent
 * roll actual …") — then in brackets its page where it falls inside the
 * memorandum (lib/facts' rule), "derived" for a figure computed from stated
 * ones, "assumption" for a default, so a default never reads as the
 * sponsor's case. "" where the model carries no source for it.
 */
export function sourceSays(src: InputSource | null | undefined, totalPages: number | null): string {
  if (!src) return "";
  const note = proseDays((src.note ?? "").trim().replace(/[.;,\s]+$/, ""));
  const page = citedPage(src.page, totalPages);
  const tag =
    src.provenance === "extracted" ? (page === "—" ? "" : page) : src.provenance === "derived" ? "derived" : "assumption";
  return tag ? `${note} (${tag})` : note;
}
/** Where one of the model's inputs came from, as a tag: "OM p. 3" (the page
 *  only where it falls inside the memorandum), "derived", "assumption". */
function provenanceOf(src: InputSource | null | undefined, totalPages: number | null): string {
  if (!src) return "";
  if (src.provenance === "extracted") {
    const page = citedPage(src.page, totalPages);
    return page === "—" ? "OM" : `OM ${page}`;
  }
  return src.provenance;
}

const pctOrDash = (d: number | null | undefined, dp = 1) => (d == null || !Number.isFinite(d) ? "—" : `${(d * 100).toFixed(dp)}%`);
const xOrDash = (d: number | null | undefined, dp = 2) => (d == null || !Number.isFinite(d) || d <= 0 ? "—" : `${d.toFixed(dp)}x`);

/**
 * The terms the grids run on, said under them: the hold, the loan against
 * cost and how it amortizes, the rate with its source note — dated where
 * today's curve seeded it — each with its provenance; then what every
 * year's cash flow carries below the NOI, the asset-management fee and the
 * capital reserves (research pass 35: both came out of every return and
 * were named nowhere in the report); then what the returns carry for buying
 * and selling (the deal page's playground's own line).
 */
export function gridTermsLine(b: BaseCase, totalPages: number | null): string {
  const tag = (src: InputSource | null) => (src ? ` (${provenanceOf(src, totalPages)})` : "");
  const amort =
    b.ioMonths >= 999
      ? "interest-only for the whole hold"
      : b.ioMonths > 0
        ? `interest-only for ${b.ioMonths} months, then amortizing over ${Number(b.amortYears.toFixed(1))} years`
        : `amortizing over ${Number(b.amortYears.toFixed(1))} years`;
  // The seeded rate's note names the index and its day ("5-yr Treasury
  // 4.78% (FRED, Sep 17, 2026) + 200 bps …"); a placeholder's is only the
  // instruction to enter one, which the provenance already says.
  const rawNote = proseDays((b.rateSource?.note ?? "").trim().replace(/[.;,\s]+$/, ""));
  const rateNote = /^enter\b/i.test(rawNote) ? "" : rawNote;
  // Each as the model holds it, never a figure typed here.
  const yearly = [
    b.amFee > 0 ? `an asset-management fee of ${Number((b.amFee * 100).toFixed(2))}% of equity${tag(b.amFeeSource)}` : "",
    b.reservesPsf > 0 ? `capital reserves of $${b.reservesPsf.toFixed(2)} a square foot, grown with expenses${tag(b.reservesSource)}` : "",
  ].filter(Boolean);
  return (
    [
      `The grids run on ${withArticle(`${b.holdYears}-year hold`)}${tag(b.holdSource)}`,
      `a loan of ${(b.ltc * 100).toFixed(0)}% of cost${tag(b.ltcSource)}, ${amort}`,
      `and ${withArticle(`${(b.rate * 100).toFixed(2)}% all-in rate`)}${rateNote ? `: ${rateNote}` : ""}${tag(b.rateSource)}.`,
    ].join("; ") +
    (yearly.length > 0 ? ` Every year's cash flow carries ${yearly.join(" and ")}.` : "") +
    ` ${b.costLine}`
  );
}

/**
 * The base case the grids are struck around (lib/underwrite/report-grid
 * `buildBaseCase`): the returns the ink-bordered cells show and year 1's
 * coverage as tiles; then the inputs with where each came from, beside the
 * sources and uses. The workbook's Deal Summary on one strip of paper.
 */
function BaseCaseBlock({ b, totalPages }: { b: BaseCase; totalPages: number | null }) {
  const tiles: [string, string][] = [
    ["Levered IRR", pctOrDash(b.leveredIrr)],
    ["Equity multiple", xOrDash(b.equityMultiple)],
    ["Year-1 cash-on-cash", pctOrDash(b.cocY1)],
    ["Year-1 DSCR", xOrDash(b.dscrY1)],
    ["Year-1 debt yield", pctOrDash(b.debtYieldY1)],
  ];
  const line = (label: string, value: string, note?: string, key?: string) => (
    <View key={key ?? label} style={{ flexDirection: "row", marginBottom: 2 }} wrap={false}>
      <Text style={{ width: 70, fontSize: 7.5, color: C.muted }}>{str(label)}</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 8, color: C.ink, fontFamily: "Helvetica-Bold" }}>{str(value)}</Text>
        {note ? <Text style={{ fontSize: 7, color: C.muted, marginTop: 0.5 }}>{str(note)}</Text> : null}
      </View>
    </View>
  );
  const money = (label: string, n: number, bold = false) => (
    <View key={label} style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 1.5 }}>
      <Text style={{ fontSize: 7.5, color: bold ? C.ink : C.muted, fontFamily: bold ? "Helvetica-Bold" : "Helvetica" }}>{label}</Text>
      <Text style={{ fontSize: 7.5, color: C.ink, fontFamily: bold ? "Helvetica-Bold" : "Helvetica" }}>{fmtUsd0(n)}</Text>
    </View>
  );
  // The year-1 NOI's note is the rent input's: how the model's rent was
  // backed out of the NOI it anchors on, which names that NOI. Said as the
  // rent's, with the rent's provenance (research pass 35: printed under the
  // NOI as its own source, with an ISO day in it).
  const rentNote = proseDays((b.noiSource?.note ?? "").trim().replace(/[.;,\s]+$/, ""));
  const noiNote = rentNote
    ? `The model's rent: ${rentNote[0].toLowerCase()}${rentNote.slice(1)}${b.noiSource ? ` (${provenanceOf(b.noiSource, totalPages)})` : ""}`
    : "";
  const exitNote = proseDays((b.exitCapSource?.note ?? "").trim().replace(/[.;,\s]+$/, ""));
  return (
    <View style={{ marginBottom: 10 }} wrap={false}>
      <TitleRow title="The base case" count="the ink-bordered cells" marginTop={0} />
      <View style={{ flexDirection: "row", borderTopWidth: 0.7, borderBottomWidth: 0.7, borderColor: C.line, paddingVertical: 5, marginBottom: 6 }}>
        {tiles.map(([label, value]) => (
          <View key={label} style={{ width: "20%" }}>
            <Text style={{ fontSize: 6.5, letterSpacing: 0.6, color: C.muted }}>{label.toUpperCase()}</Text>
            <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: C.brand, marginTop: 1 }}>{value}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: "58%", paddingRight: 14 }}>
          {line("Price", `${fmtUsd0(b.price)} · ${provenanceOf(b.priceSource, totalPages)}`)}
          {line("Loan", `${fmtUsd0(b.loan)} · ${(b.ltc * 100).toFixed(0)}% of cost · ${provenanceOf(b.ltcSource, totalPages)}`)}
          {line("Equity", `${fmtUsd0(b.equity)} · total uses less the loan`)}
          {line("Hold", `${b.holdYears} years · ${provenanceOf(b.holdSource, totalPages)}`)}
          {line("Year-1 NOI", fmtUsd0(b.noiY1), noiNote)}
          {/* The exit the grids' bold row runs at, and where it came from:
              on a memorandum that states no cap, the model's default. */}
          {line("Exit cap", `${(b.exitCap * 100).toFixed(2)}%${b.exitCapSource ? ` · ${provenanceOf(b.exitCapSource, totalPages)}` : ""}`, exitNote)}
        </View>
        <View style={{ width: "42%" }}>
          <Text style={{ fontSize: 6.5, letterSpacing: 0.6, color: C.muted, marginBottom: 2 }}>USES</Text>
          {money("Purchase price", b.price)}
          {money("Closing costs", b.closingCosts)}
          {b.acqFee > 0 ? money("Acquisition fee", b.acqFee) : null}
          {money("Financing costs", b.financingCosts)}
          {money("Total uses", b.totalUses, true)}
          <Text style={{ fontSize: 6.5, letterSpacing: 0.6, color: C.muted, marginTop: 4, marginBottom: 2 }}>SOURCES</Text>
          {money("Loan", b.loan)}
          {money("Equity", b.equity)}
          {money("Total sources", b.loan + b.equity, true)}
        </View>
      </View>
    </View>
  );
}

/**
 * The max bid, or why there is none, for what the price buys (lib/interest).
 * A note's model runs the collateral at the loan's price, so a bid solved on
 * it is a price for the building, never for the note: none prints. Nor on a
 * preferred equity position, whose model runs the whole building at the
 * position's price (lib/position): a bid solved on it is the building's,
 * never the position's, which buys a rate and a redemption. A share's
 * model runs the whole asset its price implies, so its bid is the whole
 * building's, and says so. A share whose percentage the memorandum does not
 * state cannot be grossed up to the whole at all, so a bid solved on it is
 * neither the share's price nor the building's: none prints. A leasehold's
 * bid is solved on the model's capitalised exit, a perpetuity's, so the
 * line says what that price returns on the lease's term, from the term
 * block's own read (research pass 35: "At that price: IRR 19.8%" one
 * paragraph above a block taking 5.5 points off the base IRR).
 */
function maxBidLineFor(s: SensitivityData, interest: ReturnType<typeof interestOf>, leasehold?: LeaseholdExitView | null): string {
  if (interest.kind === "note") {
    return "No max bid: the model's price is the collateral's, run as if the building were bought at the loan's price, so a bid solved on it is not a price for the note.";
  }
  if (interest.kind === "preferred_equity") {
    return "No max bid: the model runs the whole building as if bought at the preferred equity position's price, so a bid solved on it is the building's, not a price for the position, which buys a rate and a redemption.";
  }
  if (interest.kind === "partial_interest" && interest.sharePct == null) {
    return "No max bid: the memorandum states no single percentage for the share, so the model cannot gross its price up to the whole building, and a bid solved on it would be neither the share's price nor the building's.";
  }
  const line = maxBidSentence(s);
  // All of the entity's interests (a stated 100%) is no share: the bid is
  // for them, as the price is (research pass 28).
  if (interest.kind === "partial_interest" && !isWholeShare(interest.sharePct) && s.maxBid && !s.maxBid.unbounded) {
    return `${line} It is the whole building's price, not the share's.`;
  }
  const bid = s.maxBid;
  if (interest.kind === "leasehold" && leasehold && bid) {
    const lease = leasehold.lease ?? "ground lease";
    const see = `see The exit, on the ${lease}'s term, below`;
    if (leasehold.endsInHold) {
      return `${line} It is solved on a sale the model cannot make: ${
        leasehold.yearsLeft > 0 ? `the ${lease} ends inside its hold` : `the ${lease}'s stated end has passed`
      } (${see}).`;
    }
    if (bid.onTerm) {
      const lead = bid.unbounded ? "That is on the model's capitalised exit" : "That IRR runs on the model's capitalised exit";
      const where = `on the term the ${lease} has left at the sale`;
      const at = bid.unbounded ? "at twice the modelled price" : "at that price";
      return `${line} ${lead}; ${
        bid.onTerm.irr != null
          ? `${where} the levered IRR ${at} is ${pctOrDash(bid.onTerm.irr)}`
          : `${where}, the sale ${at} does not repay the model's loan, so no levered return solves`
      } (${see}).`;
    }
  }
  return line;
}

/**
 * What the sensitivity grids are of where the price did not buy the
 * building — the derived model's `meta.interest.basisWithheld`, the one rule
 * every surface reads (lib/underwrite/inputs `basisWithheldOf`): the grid's
 * takeaway names it rather than calling a note's collateral, a position's
 * building or an equity's whole "the deal", as the caveat over the grids
 * already says (research pass 35). Null where the price is the building's.
 */
export function gridSubjectOf(extraction: ExtractionResult | null): string | null {
  const withheld = basisWithheldOf(extraction);
  if (!withheld) return null;
  switch (withheld.word) {
    case "note":
      return "the collateral, run at the note's price";
    case "position":
      return "the building, run at the position's price";
    case "leased fee":
      return "a building's model, run at the leased fee's price";
    default:
      return interestOf(extraction).entityLoan != null ? "the whole building, run at the equity's whole" : "the whole building, run at the share's price";
  }
}

/** What the overrun axis and sentence call the figure they stress. When the
 *  OM stated only an all-in total and no price, the "budget" IS that total
 *  with the acquisition inside it — the strip above declines to call it a
 *  budget, so the sentence must not either. */
const budgetNoun = (plan: PlanReport): string => (plan.plan.budget?.isTotal ? "Total cost" : "The budget");
const SPREAD_ORDER: SpreadBucket[] = ["wide", "adequate", "thin", "none", "negative"];

/**
 * The plan's grid: yield on total cost (bold) and its spread over the
 * reference cap, stabilized NOI down the rows and budget across. Same
 * geometry as HeatGrid so the two pages read alike; the fills are the
 * development-spread bands, not the IRR hurdle.
 */
function YocGridPdf({ grid, axis }: { grid: YocGrid; axis: string }) {
  const rowLabelWidth = "17%";
  const colW = `${(100 - parseFloat(rowLabelWidth)) / grid.budgetCols.length}%`;
  const axisText = { fontSize: 6.5, letterSpacing: 0.6, color: C.muted } as const;
  return (
    <View style={{ marginTop: 6 }}>
      <View style={{ flexDirection: "row" }}>
        <Text style={{ width: rowLabelWidth }} />
        <Text style={{ ...axisText, width: `${100 - parseFloat(rowLabelWidth)}%`, textAlign: "center", paddingBottom: 2 }}>
          {str(axis)}
        </Text>
      </View>
      <View
        style={{
          flexDirection: "row",
          borderBottomWidth: 0.7,
          borderBottomColor: C.line,
          paddingBottom: 2.5,
          marginBottom: 1,
        }}
      >
        <Text style={{ ...axisText, width: rowLabelWidth, paddingRight: 4 }}>STABILIZED NOI</Text>
        {grid.budgetCols.map((c, i) => (
          <View key={i} style={{ width: colW, alignItems: "center" }}>
            <Text style={{ fontSize: 8, fontFamily: i === grid.baseCol ? "Helvetica-Bold" : "Helvetica", color: C.ink }}>
              {c.delta === 0 ? "OM budget" : fmtDelta(c.delta)}
            </Text>
            <Text style={{ fontSize: 6.5, color: C.muted }}>{fmtCompactUsd(c.totalCost)}</Text>
          </View>
        ))}
      </View>
      {grid.cells.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", alignItems: "stretch" }} wrap={false}>
          <View style={{ width: rowLabelWidth, justifyContent: "center", paddingRight: 4 }}>
            <Text style={{ fontSize: 8, fontFamily: r === grid.baseRow ? "Helvetica-Bold" : "Helvetica", color: C.ink }}>
              {grid.noiRows[r].delta === 0 ? "OM NOI" : fmtDelta(grid.noiRows[r].delta)}
            </Text>
            <Text style={{ fontSize: 6.5, color: C.muted }}>{fmtCompactUsd(grid.noiRows[r].noi)}</Text>
          </View>
          {row.map((cell, c) => {
            const isBase = r === grid.baseRow && c === grid.baseCol;
            return (
              <View
                key={c}
                style={{
                  width: colW,
                  paddingVertical: 4,
                  backgroundColor: SPREAD_BG[spreadBucket(cell.spreadBps)],
                  borderWidth: isBase ? 1.6 : 1,
                  borderColor: isBase ? C.ink : "#ffffff",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.ink }}>
                  {yieldOnCostText(cell.yieldOnCost)}
                </Text>
                <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 1 }}>
                  {`${cell.spreadBps >= 0 ? "+" : ""}${cell.spreadBps} bps`}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

/**
 * The FULL report: the one-page memo up front (the page an IC reads), then
 * one page per analysis — every extracted term, every challenge with its
 * broker question, the whole comp set, the market checks, and the
 * reconciliation when one ran. For the people who ask "what's behind the
 * memo?"
 */
const fmtHurdle = (pct: number): string => `${Number(pct.toFixed(1))}%`;

const fmtCompactUsd = (n: number): string => compactUsd(n, { millions: "auto", trim: true, thousandsFrom: 0 });

/**
 * The retrade grid's prices, one precision down the column and its zeros
 * kept, so the modelled row reads "$36.0M" beside "$32.4M", never "$36M"
 * (research pass 35). The unit and the places are the smallest row's: one
 * place in millions from $10M, two from $1M (a $1.2M deal's 5% steps would
 * otherwise round two rows to one figure), else whole thousands.
 */
export function retradePrices(prices: readonly number[]): string[] {
  const min = Math.min(...prices);
  if (min >= 1e6) {
    const places: 1 | 2 = min >= 1e7 ? 1 : 2;
    return prices.map((p) => compactUsd(p, { millions: places }));
  }
  // Thousands down the whole column, a row past a million included
  // ("$1,050k"), through lib/money's one rounding.
  return prices.map((p) => `$${Number(scaledText(p, 1e3, 0)).toLocaleString("en-US")}k`);
}


/**
 * One sensitivity grid: a spanning axis title over the column values, a
 * left axis label over bold row labels, and two-line cells (IRR bold, EM
 * muted) coloured by distance from the buyer's hurdle. The base cell wears
 * an ink border. Shared by the cap × growth grid and the retrade grid so
 * they can never drift apart visually.
 */
function HeatGrid({
  axisLabel,
  spanLabel,
  colLabels,
  rowLabels,
  cells,
  baseRow,
  baseCol,
  hurdlePct,
  rowLabelWidth = "13%",
}: {
  axisLabel: string;
  spanLabel: string;
  colLabels: string[];
  rowLabels: string[];
  cells: HeatCell[][];
  baseRow: number;
  baseCol: number;
  hurdlePct: number;
  rowLabelWidth?: string;
}) {
  const colW = `${(100 - parseFloat(rowLabelWidth)) / colLabels.length}%`;
  return (
    <View style={{ marginTop: 6 }}>
      {/* Spanning axis title over the value columns. */}
      <View style={{ flexDirection: "row" }}>
        <Text style={{ width: rowLabelWidth }} />
        <Text
          style={{
            width: `${100 - parseFloat(rowLabelWidth)}%`,
            fontSize: 6.5,
            letterSpacing: 0.6,
            color: C.muted,
            textAlign: "center",
            paddingBottom: 2,
          }}
        >
          {spanLabel}
        </Text>
      </View>
      {/* Column value row + left axis label in the corner. */}
      <View
        style={{
          flexDirection: "row",
          borderBottomWidth: 0.7,
          borderBottomColor: C.line,
          paddingBottom: 2.5,
          marginBottom: 1,
        }}
      >
        <Text
          style={{
            width: rowLabelWidth,
            fontSize: 6.5,
            letterSpacing: 0.6,
            color: C.muted,
            paddingRight: 4,
          }}
        >
          {axisLabel}
        </Text>
        {colLabels.map((label, i) => (
          <Text
            key={i}
            style={{
              width: colW,
              fontSize: 8,
              fontFamily: i === baseCol ? "Helvetica-Bold" : "Helvetica",
              color: C.ink,
              textAlign: "center",
            }}
          >
            {label}
          </Text>
        ))}
      </View>
      {cells.map((row, r) => (
        <View key={r} style={{ flexDirection: "row", alignItems: "stretch" }} wrap={false}>
          <View style={{ width: rowLabelWidth, justifyContent: "center", paddingRight: 4 }}>
            <Text
              style={{
                fontSize: 8,
                fontFamily: r === baseRow ? "Helvetica-Bold" : "Helvetica",
                color: C.ink,
              }}
            >
              {rowLabels[r]}
            </Text>
          </View>
          {row.map((cell, c) => {
            const isBase = r === baseRow && c === baseCol;
            return (
              <View
                key={c}
                style={{
                  width: colW,
                  paddingVertical: 4,
                  backgroundColor: HEAT_BG[heatBucket(cell.irrPct, hurdlePct)],
                  borderWidth: isBase ? 1.6 : 1,
                  borderColor: isBase ? C.ink : "#ffffff",
                  alignItems: "center",
                }}
              >
                <Text
                  style={{
                    fontSize: 8.5,
                    fontFamily: "Helvetica-Bold",
                    color: C.ink,
                  }}
                >
                  {heatCellIrr(cell)}
                </Text>
                <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 1 }}>
                  {heatCellEm(cell)}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
    </View>
  );
}

export function ReportDocument({
  input,
  onSensitivityPage,
}: {
  input: ReportInput;
  /** told the page the sensitivity analysis lands on as the report is laid
   *  out (`renderReportPdf`, which the memo's target-return chip names) */
  onSensitivityPage?: (page: number) => void;
}) {
  const { deal, memo, sensitivity, plan, modelVsMarket } = input;
  // Older callers built the input by hand without a page count: then no
  // citation validates, and none prints (the rule in lib/facts.ts).
  const totalPages = input.totalPages ?? null;
  const dealName = memo.name;
  // The class's own noun (lib/asset-words) — a hotel's keys, never units —
  // for the comps' basis captions and the portfolio's rows; the plan page
  // reads the row it counts (`planCount`, below).
  const planNoun = assetWords(memo.assetClass).noun ?? { one: "unit", many: "units" };
  // A hotel's model grows its rooms revenue at the growth lever: the grid's
  // axis and its takeaway call it RevPAR growth, not rent growth.
  const hotelGrid = assetClassKey(memo.assetClass) === "hospitality_str";
  const extraction = deal.extraction as ExtractionResult | null;
  // One OM, several properties (#411): the portfolio page, read by the same
  // reader as the deal page's card; null for a single property.
  const portfolio = readPortfolio(extraction);
  // What is being sold (#414): on a note or a share the sensitivity grids
  // are the collateral's or the whole asset's, and the page says so — and on
  // a note, what the note itself earns at its price (#416), beside them; on
  // a preferred equity position, the position's own read the same way
  // (lib/position: its yield to redemption, its cash and accrual, its stack).
  const interest = readInterest(extraction, askingPriceOf(extraction));
  const noteFigures = interest?.note
    ? [noteYieldSentence(interest.note), noteCollateralSentence(interest.note)].filter(Boolean).join(" ")
    : "";
  const ownTerms = noteFigures
    ? `The note, on its own terms: ${noteFigures}`
    : interest?.position
      ? `The position, on its own terms: ${interest.position.sentences.join(" ")}`
      : "";
  // What the grids are of where the price did not buy the building; null
  // where they are the deal's own (research pass 35).
  const gridSubject = gridSubjectOf(extraction);
  // A covenant or a contract that sets the rents (#453): the grids grow
  // every rent at one rate, which the restricted units' rents do not.
  const affordable = readAffordable(extraction);
  // The one lease a single-tenant property is (#454): the model's read of
  // it where the caller derived the model, else the lease's line alone.
  const singleTenantRead = readSingleTenant(extraction);
  const singleTenant =
    input.singleTenant ?? (singleTenantRead ? { line: singleTenantShortLine(singleTenantRead), read: "" } : null);
  // What a hotel is sold with (#455), the same way.
  const hotelRead = readHotelDeal(extraction);
  const hotel = input.hotel ?? (hotelRead ? { line: hotelShortLine(hotelRead), read: "" } : null);
  // How it is sold (#456), the same way.
  const saleRead = readSale(extraction);
  const sale = input.sale ?? (saleRead ? { line: saleShortLine(saleRead), read: "" } : null);
  // A multi-tenant property's listed tenants (#457), the same way.
  const rosterRead = readRoster(extraction);
  const roster = input.roster ?? (rosterRead ? { line: rosterShortLine(rosterRead), read: "" } : null);
  // A value-add renovation program (#460), the same way.
  const valueAddRead = readValueAdd(extraction);
  const valueAdd = input.valueAdd ?? (valueAddRead ? { line: valueAddShortLine(valueAddRead), read: "" } : null);
  // A property-tax abatement (#461), the same way.
  const abatementRead = readTaxAbatement(extraction);
  const taxAbatement = input.taxAbatement ?? (abatementRead ? { line: taxAbatementShortLine(abatementRead), read: "" } : null);
  // What the third-party reports found (#465), the same way.
  const reportsRead = readSiteReports(extraction);
  const siteReports = input.siteReports ?? (reportsRead ? { line: siteReportsShortLine(reportsRead), read: "" } : null);
  // A student building (#468), the same way.
  const studentRead = readStudentHousing(extraction);
  const student = input.student ?? (studentRead ? { line: studentShortLine(studentRead), read: "" } : null);
  // A manufactured-housing park (#470), the same way.
  const mhRead = readManufacturedHousing(extraction);
  const mh = input.mh ?? (mhRead ? { line: mhShortLine(mhRead), read: "" } : null);
  // A self-storage facility (#471), the same way.
  const storageRead = readSelfStorage(extraction);
  const storage = input.storage ?? (storageRead ? { line: storageShortLine(storageRead), read: "" } : null);
  // The rent rules that reach the building, as the route read them: the
  // rules need the deal's place and a day, which the route holds.
  const regulation = input.regulation ?? null;
  // A forward purchase (lib/forward-purchase): the model's read where the
  // caller derived the model, else the purchase's line alone.
  const forwardRead = readForwardPurchase(extraction);
  const forward = input.forward ?? (forwardRead ? { line: forwardShortLine(forwardRead), read: "" } : null);
  // A mixed-use building (lib/mixed-use), the same way.
  const mixedUseRead = readMixedUse(extraction);
  const mixedUse = input.mixedUse ?? (mixedUseRead ? { line: mixedUseShortLine(mixedUseRead), read: "" } : null);
  // An operating business (lib/going-concern), the same way.
  const goingConcernRead = readGoingConcern(extraction);
  const goingConcern = input.goingConcern ?? (goingConcernRead ? { line: goingConcernShortLine(goingConcernRead), read: "" } : null);
  // Condominium units bought in bulk (lib/condo), the same way.
  const condoRead = readCondo(extraction);
  const condo = input.condo ?? (condoRead ? { line: condoShortLine(condoRead), read: "" } : null);
  // A sandwich position (lib/sandwich-lease), the same way.
  const sandwichRead = readSandwichLease(extraction);
  const sandwich = input.sandwich ?? (sandwichRead ? { line: sandwichShortLine(sandwichRead), read: "" } : null);
  // The deal's terms beside the model, each the model's read where the
  // caller derived one, else the memorandum's line alone: printed over the
  // grids they speak to — the plan's or the IRR's — and, where the report
  // has neither (a model left out, or none built), on the page that says
  // so, never nowhere (#183).
  const termLines = [forward, goingConcern, regulation, singleTenant, hotel, sale, roster, valueAdd, taxAbatement, siteReports, student, mh, storage, mixedUse, condo, sandwich];
  const anyCaveat = termLines.some((t) => !!t?.line) || !!affordable?.modelCaveat;
  const caveats = (
    <>
      <SingleTenantCaveat lease={forward} />
      <SingleTenantCaveat lease={goingConcern} />
      <AffordableCaveat read={affordable} />
      <SingleTenantCaveat lease={regulation} />
      <SingleTenantCaveat lease={singleTenant} />
      <SingleTenantCaveat lease={hotel} />
      <SingleTenantCaveat lease={sale} />
      <SingleTenantCaveat lease={roster} />
      <SingleTenantCaveat lease={valueAdd} />
      <SingleTenantCaveat lease={taxAbatement} />
      <SingleTenantCaveat lease={siteReports} />
      <SingleTenantCaveat lease={student} />
      <SingleTenantCaveat lease={mh} />
      <SingleTenantCaveat lease={storage} />
      <SingleTenantCaveat lease={mixedUse} />
      <SingleTenantCaveat lease={condo} />
      <SingleTenantCaveat lease={sandwich} />
    </>
  );
  const challenges = deal.challenges as ChallengerResult | null;
  const comps = deal.comps as BrokerCompsResult | null;
  const market = deal.market as MarketResult | null;
  const reconciliation = deal.reconciliation as ReconciliationResult | null;
  const verdict = (deal.verdict as VerdictResult | null) ?? null;
  // The day the flood zone on the site page was looked up: the stored
  // lookup's own date, only where it answered for the address the map is
  // drawn at (the route's floodMapFor reads the same row the same way).
  const siteFlags = (deal as { site_flags?: SiteFlagsResult | null }).site_flags ?? null;
  const floodLookedUp =
    siteFlags?.status === "ok" &&
    !siteFlagsStale(siteFlags, (deal.address as { label?: string } | null)?.label) &&
    Number.isFinite(Date.parse(siteFlags.retrievedAt ?? ""))
      ? readDay(siteFlags.retrievedAt)
      : null;

  const metrics = list(extraction?.metrics) as NonNullable<
    ExtractionResult["metrics"]
  >;
  // The plan's finished product in the counting row's own noun
  // (`countNounOf`): a hotel counting "Rooms" is costed per room, as the
  // deal page's plan strip, the pipeline card and the workbook say it — else
  // the class's (research pass 34: this page said "key" beside them).
  const planCount = countNounOf(
    metrics.map((m) => ({ label: str(m?.label), value: str(m?.value) })),
    memo.assetClass,
  );
  const chList = list(challenges?.challenges) as NonNullable<
    ChallengerResult["challenges"]
  >;
  const saleComps = list(comps?.saleComps) as NonNullable<
    BrokerCompsResult["saleComps"]
  >;
  const leaseComps = list(comps?.leaseComps) as NonNullable<
    BrokerCompsResult["leaseComps"]
  >;
  const redFlags = list(comps?.redFlags).map(str);
  // Each sale comp's stated basis on one track with the subject's own as a
  // tick — lib/comp-detail, the reader behind the deal page's comps table,
  // so the report and the page never disagree on a comp. Drawn as plain
  // Views under the detail text; a comp that states no basis draws none.
  const compScale = basisScale(
    saleComps,
    subjectBasis(
      metrics.map((m) => ({ label: str(m?.label), value: str(m?.value) })),
      inferStrategy(extraction, firstSignalOf(deal)).kind,
      screenYearOf(extraction),
      interestOf(extraction),
      extraction?.assetClass,
    ),
    planNoun.one,
  );
  const checks = list(market?.checks) as NonNullable<MarketResult["checks"]>;
  // The published figures the check read (lib/live-market-brief), printed
  // under the checks so the report carries the check's evidence as the
  // deal page does. Standard Helvetica: the lines carry only WinAnsi text.
  const liveBrief = market?.liveBrief ?? null;
  // A portfolio across markets (#413): each other market's own figures,
  // printed under the address's with a heading saying whose they are.
  const briefBlocks = [
    ...(liveBrief ? [{ rec: liveBrief, first: true }] : []),
    ...list(market?.otherBriefs).map((rec) => ({ rec: rec as NonNullable<MarketResult["liveBrief"]>, first: false })),
  ]
    .map((b) => ({ ...b, lines: list(b.rec?.lines).map(str).filter(Boolean).map(currentBriefLine) }))
    .filter((b) => b.lines.length > 0);
  // A covered market whose figures could not be read that day: said under
  // the checks, as the deal page says it (lib/market-read-failed).
  const liveReadFailed = liveBrief ? null : liveReadFailedLine(market?.liveReadFailed);
  const rows = list(reconciliation?.rows) as NonNullable<
    ReconciliationResult["rows"]
  >;
  // Each reconciliation gap as a bar from a centre line — the same reader as
  // the deal page's table (lib/gap-detail), so a dollar gap scales against
  // the widest dollar gap and a basis-point gap against the widest in basis
  // points, never across; a neutral or figureless row draws none.
  const gapShares = gapScale(
    rows.map((r) => ({ gap: str(r?.gap), omValue: str(r?.omValue), myValue: str(r?.myValue), direction: str(r?.direction) })),
  ).shares;

  const BASIS_LABEL: Record<string, string> = {
    in_place: "In place",
    pro_forma: "Pro forma",
    na: "—",
  };

  // Count pills for each page title — derived from the rows on the page, so
  // the pill can never disagree with the table under it.
  const flaggedCount = metrics.filter((m) => m?.flagged).length;
  const highCount = chList.filter((c) => str(c?.severity) === "high").length;
  const compCount = saleComps.length + leaseComps.length;
  const aggressiveCount = checks.filter(
    (c) => str(c?.assessment) === "aggressive",
  ).length;
  const unfavCount = rows.filter(
    (r) => str(r?.direction) === "unfavorable",
  ).length;

  return (
    <Document
      title={`${dealName} — Full Screening Report`}
      author={memo.branding?.firmName ?? "Underwrite Copilot"}
    >
      {/* Page 1: the one-page memo, unchanged — the executive read —
          numbered as every page after it is. */}
      <MemoPage data={memo} pageNumbers />

      {/* What the memo shortens to fit or leaves out, as the verdict
          states it, before any page the model computed. */}
      {verdict && <CallInFullPage verdict={verdict} memo={memo} />}

      {/* The plan page, before the IRR grids, on a deal that is not a
          stabilized asset: the plan as the OM states it, then yield on total
          cost stressed across NOI shortfall and budget overrun — the
          sensitivity such a deal is actually judged on. */}
      {plan && (
        <PageChrome
          title="The plan, stressed"
          count={plan.label}
          dealName={dealName}
          branding={memo.branding}
        >
          {plan.summary ? <Text style={s.sub}>{str(plan.summary)}</Text> : null}
          <View
            style={{
              flexDirection: "row",
              marginTop: 4,
              paddingVertical: 6,
              borderTopWidth: 0.7,
              borderBottomWidth: 0.7,
              borderColor: C.line,
            }}
          >
            {/* The same reader as the deal page's plan strip and the shared
                screen (lib/plan-facts.ts) — one set of labels, one money
                format, one blank rule — so the three never disagree. */}
            {planFacts(plan.plan, planCount.one).map(([label, value], _i, all) => (
              <View key={label} style={{ width: `${100 / all.length}%` }}>
                <Text style={{ fontSize: 6.5, letterSpacing: 0.6, color: C.muted }}>{str(label).toUpperCase()}</Text>
                <Text style={{ fontSize: 11, fontFamily: "Helvetica-Bold", color: C.brand, marginTop: 1 }}>
                  {str(value)}
                </Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 4 }}>
            {str(
              `${
                plan.plan.timeline
                  ? `Timeline as stated: ${plan.plan.timeline}.`
                  : "Timeline to stabilization: not stated."
              }${
                plan.plan.costPerUnit != null && plan.plan.units != null
                  ? // "planned" only where the building is still to be
                    // delivered: a value-add's or a lease-up's units stand.
                    ` The all-in basis is total cost over the ${plan.plan.units.toLocaleString("en-US")} ${notYetDelivered(plan.kind) ? "planned " : ""}${planCount.many}.`
                  : ""
              }`,
            )}
          </Text>

          <TitleRow title="Yield on cost, stressed" marginTop={14} />
          <Text style={s.sub}>
            {str(
              `The plan is judged on the spread between the finished project's yield on total cost and the cap rate that product trades at once it is done — not on a cap rate against the price. Stabilized NOI under the pro forma runs down the rows, budget over the OM's across; each cell is the yield on total cost (bold) and its spread over the ${fmtPct(
                plan.refCap.pct,
                2,
              )} reference cap in basis points. The ink-bordered cell is the OM's own case. A pro forma that keeps its spread with NOI 20% short and the budget 30% over is conservative; one that needs its own base case is not.`,
            )}
          </Text>
          <YocGridPdf
            grid={plan.grid}
            axis={`${budgetNoun(plan).toUpperCase()}, AGAINST THE OM'S (TOTAL COST BENEATH)`}
          />
          <Text style={{ fontSize: 8, color: C.ink, marginTop: 7, fontFamily: "Helvetica-Oblique" }}>
            {str(
              plan.breakevens.noiCushion > 0
                ? `Stabilized NOI can come in ${fmtPct(plan.breakevens.noiCushion)} under the OM's ${fmtCompactUsd(
                    plan.plan.stabilizedNoi!.value,
                  )} — down to ${fmtCompactUsd(plan.breakevens.noiAtRefCap)} — before the yield on cost falls to the ${fmtPct(
                    plan.refCap.pct,
                    2,
                  )} reference cap.`
                : `The OM's ${fmtCompactUsd(plan.plan.stabilizedNoi!.value)} stabilized NOI already yields less than the ${fmtPct(
                    plan.refCap.pct,
                    2,
                  )} reference cap on ${fmtCompactUsd(plan.plan.totalCost ?? 0)} of total cost — the plan is under water before any stress.`,
            )}
          </Text>
          <Text style={{ fontSize: 8, color: C.ink, marginTop: 3, fontFamily: "Helvetica-Oblique" }}>
            {str(
              plan.breakevens.overrunToRefCap != null
                ? `${budgetNoun(plan)} would have to run ${fmtPct(plan.breakevens.overrunToRefCap, 0)} over — ${fmtCompactUsd(
                    plan.plan.budget!.budget * (1 + plan.breakevens.overrunToRefCap),
                  )} against ${fmtCompactUsd(plan.plan.budget!.budget)} — before the yield fell to the reference cap.`
                : "Any overrun deepens a yield that already sits below the cap.",
            )}
          </Text>

          {/* The bands are a rule of thumb (lib/plan-sensitivity), said
              beside the swatches as the deal page says it. */}
          <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 9 }}>{str(SPREAD_RULE_OF_THUMB)}</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 4 }}>
            {SPREAD_ORDER.map((b) => (
              <View key={b} style={{ flexDirection: "row", alignItems: "center", gap: 3.5 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 2,
                    backgroundColor: SPREAD_BG[b],
                    borderWidth: 0.5,
                    borderColor: C.line,
                  }}
                />
                <Text style={{ fontSize: 7.5, color: C.muted }}>{str(SPREAD_LABEL[b])}</Text>
              </View>
            ))}
          </View>

          <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 10 }}>
            {str(
              // A comma, not a dash, before the note: the default's own note
              // carries a dash ("the model's exit-cap default — set your own
              // view in the model").
              `Reference cap: ${fmtPct(plan.refCap.pct, 2)}, ${refCapNote(
                plan.refCap.provenance,
              )}. Figures are the OM's as extracted; the challenger's page tests whether the stabilized NOI is as conservative as the deck presents it. The IRR sensitivity page is omitted on a plan deal: the annual screening model books the budget in year 1 and anchors year 1 on in-place income, so its IRR grid is not the plan's return — this grid is.`,
            )}
          </Text>

          {/* The plan deal has no sensitivity page, so its assumptions read
              lands here, under the grid it is judged on. */}
          {!sensitivity && caveats}
          {!sensitivity && <AssumptionsBlock read={modelVsMarket} />}
          {!sensitivity && <AssumableBlock view={input.assumable} />}
          {!sensitivity && <AssumableBlock view={input.sellerNote} />}
          {!sensitivity && <LeaseholdBlock view={input.leasehold} />}
        </PageChrome>
      )}

      {/* Sensitivity page (Feature 5): where the deal thrives, where it
          breaks — two grids from the same engine as the workbook and the
          on-screen playground, coloured against the BUYER'S hurdle. */}
      {sensitivity && (
        <PageChrome
          title="Sensitivity analysis"
          count={`graded vs ${fmtHurdle(sensitivity.hurdlePct)} IRR`}
          dealName={dealName}
          branding={memo.branding}
        >
          {/* Where this page lands, for the memo's target-return chip that
              names it: drawn as nothing, out of the page's flow. */}
          {onSensitivityPage ? (
            <Text
              style={{ position: "absolute", top: 0, left: 0, fontSize: 1 }}
              render={({ pageNumber }) => {
                if (typeof pageNumber === "number") onSensitivityPage(pageNumber);
                return "";
              }}
            />
          ) : null}
          <Text style={s.sub}>
            {`Levered IRR (bold) and equity multiple, recomputed cell by cell. Colour marks distance from the ${
              sensitivity.hurdleSource === "buybox"
                ? `${fmtHurdle(sensitivity.hurdlePct)} IRR target in your buy box`
                : `${fmtHurdle(sensitivity.hurdlePct)} screening hurdle`
            } — deeper green clears it by more, deeper red misses by more. The ink-bordered cell is the modelled base case.`}
          </Text>
          {interest?.modelCaveat ? (
            <Text style={{ fontSize: 8, color: C.caution, fontFamily: "Helvetica-Bold", marginBottom: 6 }}>
              {str(`${interest.label}: ${caveatOnPaper(interest.modelCaveat, input.leasehold)}`)}
            </Text>
          ) : null}
          {ownTerms ? (
            <Text style={{ fontSize: 8, color: C.ink, marginBottom: 6 }}>
              {str(ownTerms)}
            </Text>
          ) : null}
          {caveats}

          {/* The base case the grids are struck around, each input with
              where it came from — the workbook's Deal Summary. */}
          {sensitivity.baseCase ? <BaseCaseBlock b={sensitivity.baseCase} totalPages={totalPages} /> : null}

          <View wrap={false}>
            <HeatGrid
              axisLabel="EXIT CAP"
              spanLabel={hotelGrid ? "REVPAR GROWTH (ANNUAL)" : "RENT GROWTH (ANNUAL)"}
              colLabels={sensitivity.grid.growthCols.map((g) => `${(g * 100).toFixed(1)}%`)}
              rowLabels={sensitivity.grid.capRows.map((cap) => `${(cap * 100).toFixed(2)}%`)}
              cells={sensitivity.grid.cells}
              baseRow={sensitivity.grid.baseRow}
              baseCol={sensitivity.grid.baseCol}
              hurdlePct={sensitivity.hurdlePct}
            />
            {/* What the grids are of, said as the caveat above says it: a
                note's collateral or an equity's whole is never "the deal". */}
            <Text style={{ fontSize: 8, color: C.ink, marginTop: 7, fontFamily: "Helvetica-Oblique" }}>
              {str(
                hotelGrid || gridSubject
                  ? gridTakeaway(sensitivity.grid, sensitivity.hurdlePct, hotelGrid ? "RevPAR growth" : "rent growth", gridSubject)
                  : sensitivity.takeaway,
              )}
            </Text>

            {/* Legend — shared by both grids. */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 9 }}>
              {heatLegend(sensitivity.hurdlePct).map((l) => (
                <View key={l.bucket} style={{ flexDirection: "row", alignItems: "center", gap: 3.5 }}>
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 2,
                      backgroundColor: HEAT_BG[l.bucket],
                      borderWidth: 0.5,
                      borderColor: C.line,
                    }}
                  />
                  <Text style={{ fontSize: 7.5, color: C.muted }}>{str(l.label)}</Text>
                </View>
              ))}
            </View>

            {/* The terms every cell runs on: the hold, the loan, the rate
                with its source, and the costs of buying and selling. */}
            {sensitivity.baseCase ? (
              <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 6 }}>
                {str(gridTermsLine(sensitivity.baseCase, totalPages))}
              </Text>
            ) : null}
          </View>

          {/* The retrade grid moves to the next page whole, its title and
              its max bid with it, rather than leave a heading or half a
              grid at the foot of this one. */}
          <View wrap={false}>
          <TitleRow title="The retrade grid" marginTop={16} />
          <Text style={s.sub}>
            The same model repriced: what paying less (or more) does to
            returns at each exit cap. Rows re-size the loan, fees, and equity
            from the new price.
          </Text>
          {/* The base row is the MODELLED price, which is the ask only where
              the ask is what the model runs at: a share's price grossed up
              to the whole, an auction's floor and a price backed out of NOI
              and the cap are not. The source says which. */}
          {sensitivity.priceSource ? (
            <Text style={{ fontSize: 7.5, color: C.muted, marginTop: -6, marginBottom: 4 }}>
              {str(
                `The modelled price is ${fmtUsd0(sensitivity.priceGrid.priceRows[sensitivity.priceGrid.baseRow]?.price ?? 0)}: ${sourceSays(
                  sensitivity.priceSource,
                  totalPages,
                )}.`,
              )}
            </Text>
          ) : null}
          <HeatGrid
            axisLabel="PRICE"
            spanLabel="EXIT CAP"
            colLabels={sensitivity.priceGrid.capCols.map((cap) => `${(cap * 100).toFixed(2)}%`)}
            rowLabels={retradePrices(sensitivity.priceGrid.priceRows.map((p) => p.price)).map((price, i) => {
              const d = sensitivity.priceGrid.priceRows[i].deltaPct;
              return `${price}  ${d === 0 ? "(modelled)" : `(${d > 0 ? "+" : ""}${Math.round(d * 100)}%)`}`;
            })}
            cells={sensitivity.priceGrid.cells}
            baseRow={sensitivity.priceGrid.baseRow}
            baseCol={sensitivity.priceGrid.baseCol}
            hurdlePct={sensitivity.hurdlePct}
            rowLabelWidth="19%"
          />
          {/* The deal page's max bid, solved on the buy box's own floors
              and named by the one that binds (lib/underwrite/report-grid) —
              none on a note, the whole building's on a share. */}
          <Text style={{ fontSize: 8, color: C.ink, marginTop: 7, fontFamily: "Helvetica-Oblique" }}>
            {str(maxBidLineFor(sensitivity, interestOf(extraction), input.leasehold))}
          </Text>
          </View>

          <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 10 }}>
            Computed from the deal&apos;s derived screening model — the same
            engine behind the Excel workbook and the on-screen playground.
            Re-export after changing assumptions.
          </Text>

          <AssumptionsBlock read={modelVsMarket} />
          <AssumableBlock view={input.assumable} />
          <AssumableBlock view={input.sellerNote} />
          <LeaseholdBlock view={input.leasehold} />
        </PageChrome>
      )}

      {/* A model on a placeholder price or an assumed year-1 NOI: its grids
          and its max bid would be the placeholder's, so the page says why
          they are left out where they would have been — and keeps the
          model's assumptions against the published figures, which no price
          enters. */}
      {!sensitivity && input.withheld && (
        <PageChrome title="Sensitivity analysis" count="left out" dealName={dealName} branding={memo.branding}>
          <Text style={{ fontSize: 9, color: C.ink, marginBottom: 6 }}>{str(input.withheld)}</Text>
          {/* The terms the memorandum states, each its line alone: the
              model's reads are left out with its grids (#183). */}
          {plan ? null : caveats}
          <AssumptionsBlock read={modelVsMarket} />
        </PageChrome>
      )}

      {/* A plan deal whose plan page could not be built: no plan page and
          no IRR page, so where its terms print, the page says why, and they
          print as the memorandum states them — the model's reads withheld
          (buildReportData), never beside a "no model built" line, since a
          model was built. */}
      {!sensitivity && !plan && input.planLeftOut && (anyCaveat || (modelVsMarket?.checks.length ?? 0) > 0) && (
        <PageChrome title="The plan page is left out" count={input.planLeftOut.count} dealName={dealName} branding={memo.branding}>
          <Text style={s.sub}>{str(input.planLeftOut.why)}</Text>
          {caveats}
          <AssumptionsBlock read={modelVsMarket} />
        </PageChrome>
      )}

      {/* No grid page at all — no model was built for this report — and
          terms the grids would have carried: they print here, never
          nowhere (#183). */}
      {!sensitivity && !plan && !input.withheld && !input.planLeftOut && (anyCaveat || (modelVsMarket?.checks.length ?? 0) > 0) && (
        <PageChrome title="The deal's terms" count="no model built" dealName={dealName} branding={memo.branding}>
          <Text style={s.sub}>
            {str("No screening model was built for this report, so these are the memorandum's terms as read, without the model's read beside them.")}
          </Text>
          {caveats}
          <AssumptionsBlock read={modelVsMarket} />
        </PageChrome>
      )}

      {/* The property (#459): the memorandum's other photographs, before
          the site — the building from more than one side. */}
      {input.photos && input.photos.length >= 2 && (
        <PageChrome
          title="The property"
          count={`${input.photos.length} photographs from the memorandum`}
          dealName={dealName}
          branding={memo.branding}
        >
          <Text style={s.sub}>{"The offering memorandum's own photographs of the property, each with the page it came from."}</Text>
          <PhotosBlock photos={input.photos} />
        </PageChrome>
      )}

      {/* The site (#427): FEMA's flood map at the building, before the
          terms — a Special Flood Hazard Area is a lender's condition and a
          line in the expenses. */}
      {input.floodMap && (
        <PageChrome title="The site" count="FEMA flood map" dealName={dealName} branding={memo.branding}>
          <Text style={s.sub}>{"What FEMA's flood insurance rate map shows around the building: FEMA's own zones, drawn in the colours of the key below."}</Text>
          <SiteBlock view={input.floodMap} lookedUp={floodLookedUp} />
        </PageChrome>
      )}

      {/* A portfolio memorandum: what is being bought, property by
          property, before the terms extracted for the whole. */}
      {portfolio && (
        <PageChrome
          title="The portfolio"
          count={`${portfolio.assets.length} properties · ${portfolio.markets.length} ${portfolio.markets.length === 1 ? "market" : "markets"}`}
          dealName={dealName}
          branding={memo.branding}
        >
          <PortfolioBlock portfolio={portfolio} noun={planNoun} />
        </PageChrome>
      )}

      {metrics.length > 0 && (
        <PageChrome
          title="Extracted terms"
          count={`${metrics.length} figures${flaggedCount ? ` \u00b7 ${flaggedCount} flagged` : ""}`}
          dealName={dealName}
          branding={memo.branding}
        >
          <Text style={s.sub}>
            Every figure the screen pulled from the OM, with its basis and
            source page. Flagged rows deserve independent verification.
          </Text>
          {/* The table's own View, so its header row — fixed — repeats at
              the top of every page the rows run onto. */}
          <View>
          <View style={s.tableHead} fixed>
            <Text style={[s.headText, { width: "34%" }]}>Term</Text>
            <Text style={[s.headText, { width: "24%" }]}>Value</Text>
            <Text style={[s.headText, { width: "16%" }]}>Basis</Text>
            <Text style={[s.headText, { width: "12%" }]}>Page</Text>
            <Text style={[s.headText, { width: "14%" }]}>Flag</Text>
          </View>
          {metrics.map((m, i) => (
            <View key={i} style={i % 2 === 1 ? [s.row, s.rowAlt] : s.row} wrap={false}>
              {/* Each text cell keeps a gutter before the next column: a
                  long value ran into the basis column's dash ("October 22,
                  2026 at 5:00 PM ET—", research pass 35). */}
              <Text style={{ width: "34%", fontSize: 8.5, paddingRight: 6 }}>{str(m?.label)}</Text>
              <Text
                style={{ width: "24%", fontSize: 8.5, fontFamily: "Helvetica-Bold", paddingRight: 6 }}
              >
                {str(m?.value)}
              </Text>
              <Text
                style={{
                  width: "16%",
                  fontSize: 8,
                  color: str(m?.basis) === "pro_forma" ? C.caution : C.muted,
                }}
              >
                {BASIS_LABEL[str(m?.basis)] ?? "—"}
              </Text>
              <Text style={{ width: "12%", fontSize: 8, color: C.muted }}>
                {citedPage(m?.page, totalPages)}
              </Text>
              <View style={{ width: "14%" }}>
                {m?.flagged ? <RateChip word="verify" color={C.caution} /> : null}
              </View>
            </View>
          ))}
          </View>
        </PageChrome>
      )}

      {chList.length > 0 && (
        <PageChrome
          title="Assumption challenges"
          count={`${chList.length} challenges${highCount ? ` \u00b7 ${highCount} high` : ""}`}
          dealName={dealName}
          branding={memo.branding}
        >
          {/* The challenger is asked for its challenges most severe first
              (lib/anthropic/prompts), so that is the order the page says. */}
          <Text style={s.sub}>
            The pro forma&apos;s assumptions, challenged most severe first,
            each with the exact question to put to the broker.
          </Text>
          {chList.map((c, i) => (
            <View key={i} style={s.block} wrap={false}>
              <View style={s.blockTitleRow}>
                <Text
                  style={[s.tag, { backgroundColor: SEV_COLOR[str(c?.severity)] ?? C.caution }]}
                >
                  {str(c?.severity) || "medium"}
                </Text>
                <Text style={s.blockTitle}>{str(c?.assumption)}</Text>
              </View>
              <Text style={s.blockBody}>{str(c?.challenge)}</Text>
              {str(c?.question) ? (
                <Text style={s.question}>Ask: {str(c?.question)}</Text>
              ) : null}
            </View>
          ))}
          {/* The challenger estimates what reverting an assumption does to
              the returns without running the engine; the box says so. */}
          {str(challenges?.stressTest) ? (
            <View style={s.summaryBox} wrap={false}>
              <Text style={[s.headText, { marginBottom: 3 }]}>Stress test — the screen&apos;s estimate, not the model&apos;s</Text>
              <Text style={s.summaryText}>{str(challenges?.stressTest)}</Text>
            </View>
          ) : null}
        </PageChrome>
      )}

      {(saleComps.length > 0 || leaseComps.length > 0 || redFlags.length > 0) && (
        <PageChrome
          title="Comp scrutiny"
          count={`${compCount} comps${redFlags.length ? ` \u00b7 ${redFlags.length} flags` : ""}`}
          dealName={dealName}
          branding={memo.branding}
        >
          <Text style={s.sub}>
            Every comp the OM presented, rated for how hard it actually
            supports the deal — sell-side sets tend to lean favorable.
          </Text>
          {[
            { label: "Sale comps", items: saleComps },
            { label: "Lease comps", items: leaseComps },
          ]
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <View key={g.label} style={{ marginBottom: 10 }}>
                <Text style={[s.headText, { marginBottom: 4 }]}>{g.label}</Text>
                {/* The columns named, as every other table's are, and
                    repeated on a page the rows run onto (research pass 35:
                    with none, the page column's dash read as the note's
                    last word). */}
                <View style={s.tableHead} fixed>
                  <Text style={[s.headText, { width: "26%" }]}>Comp</Text>
                  <Text style={[s.headText, { width: "30%" }]}>Detail</Text>
                  <Text style={[s.headText, { width: "14%" }]}>Support</Text>
                  <Text style={[s.headText, { width: "22%" }]}>Why</Text>
                  <Text style={[s.headText, { width: "8%" }]}>Page</Text>
                </View>
                {g.items.map((cp, i) => {
                  // Sale comps only: the basis bar and the subject's tick.
                  const scale = g.label === "Sale comps" ? compScale : null;
                  const share = scale?.shares[i] ?? null;
                  const track = 60;
                  return (
                  <View key={i} style={i % 2 === 1 ? [s.row, s.rowAlt] : s.row} wrap={false}>
                    <Text
                      style={{ width: "26%", fontSize: 8.5, fontFamily: "Helvetica-Bold", paddingRight: 6 }}
                    >
                      {str(cp?.name)}
                    </Text>
                    <View style={{ width: "30%", paddingRight: 6 }}>
                      <Text style={{ fontSize: 8.5 }}>{str(cp?.detail)}</Text>
                      {scale && share != null ? (
                        <View
                          style={{
                            marginTop: 2.5,
                            width: track,
                            height: 2.5,
                            borderRadius: 1.25,
                            backgroundColor: C.line,
                            position: "relative",
                          }}
                        >
                          <View
                            style={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              height: 2.5,
                              borderRadius: 1.25,
                              width: share * track,
                              backgroundColor: "#b5cdc9",
                            }}
                          />
                          {scale.subjectShare != null ? (
                            <View
                              style={{
                                position: "absolute",
                                top: -1.5,
                                left: scale.subjectShare * track - 0.5,
                                width: 1,
                                height: 5.5,
                                backgroundColor: C.ink,
                              }}
                            />
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                    <View style={{ width: "14%", paddingRight: 3 }}>
                      <RateChip
                        word={str(cp?.support)}
                        color={SUPPORT_COLOR[str(cp?.support)] ?? C.muted}
                      />
                    </View>
                    <Text style={{ width: "22%", fontSize: 7.5, color: C.muted, paddingRight: 8 }}>
                      {str(cp?.note)}
                    </Text>
                    <Text style={{ width: "8%", fontSize: 7.5, color: C.muted }}>
                      {citedPage(cp?.page, totalPages)}
                    </Text>
                  </View>
                  );
                })}
                {g.label === "Sale comps" && compScale ? (
                  <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 3 }}>
                    {compScale.subjectValue != null
                      ? `Bars: each comp's basis per ${compScale.unit === "unit" ? compScale.noun : "SF"}; the tick is the subject at ${fmtBasis(compScale.subjectValue, compScale.unit, compScale.noun)}.`
                      : `Bars: each comp's basis per ${compScale.unit === "unit" ? compScale.noun : "SF"}, scaled to the widest in the set.`}
                  </Text>
                ) : null}
              </View>
            ))}
          {redFlags.length > 0 && (
            <View style={s.summaryBox} wrap={false}>
              <Text style={[s.headText, { marginBottom: 3 }]}>
                Selection & omission flags
              </Text>
              {redFlags.map((f, i) => (
                <Text key={i} style={[s.summaryText, { marginBottom: 2 }]}>
                  • {f}
                </Text>
              ))}
            </View>
          )}
          {str(comps?.summary) ? (
            <Text style={[s.blockBody, { marginTop: 8 }]}>
              {str(comps?.summary)}
            </Text>
          ) : null}
        </PageChrome>
      )}

      {checks.length > 0 && (
        <PageChrome
          title="Market plausibility"
          count={`${checks.length} checks${aggressiveCount ? ` \u00b7 ${aggressiveCount} aggressive` : ""}`}
          dealName={dealName}
          branding={memo.branding}
        >
          <Text style={s.sub}>
            The OM&rsquo;s key assumptions against typical ranges for the asset
            class — rules of thumb, not a live comps feed.
          </Text>
          {/* The table's own View: its header repeats on a page the rows
              run onto. */}
          <View>
          <View style={s.tableHead} fixed>
            <Text style={[s.headText, { width: "24%" }]}>Assumption</Text>
            <Text style={[s.headText, { width: "14%" }]}>OM says</Text>
            <Text style={[s.headText, { width: "14%" }]}>Typical</Text>
            <Text style={[s.headText, { width: "12%" }]}>On range</Text>
            <Text style={[s.headText, { width: "12%" }]}>Read</Text>
            <Text style={[s.headText, { width: "24%" }]}>Note</Text>
          </View>
          {checks.map((c, i) => {
            // The OM's figure on the typical range, as the memo draws a base
            // on its low–high: a track, the span to the figure, a dot in the
            // read's colour. Plain Views; no height beyond the row's text.
            const pos = rangeRead(str(c?.omSays), str(c?.typicalRange));
            const track = 50;
            const tone = ASSESS_COLOR[str(c?.assessment)] ?? C.brand;
            return (
              <View key={i} style={i % 2 === 1 ? [s.row, s.rowAlt] : s.row} wrap={false}>
                <Text style={{ width: "24%", fontSize: 8.5 }}>
                  {str(c?.assumption)}
                </Text>
                <Text
                  style={{ width: "14%", fontSize: 8.5, fontFamily: "Helvetica-Bold" }}
                >
                  {str(c?.omSays)}
                </Text>
                <Text style={{ width: "14%", fontSize: 8.5 }}>
                  {str(c?.typicalRange)}
                </Text>
                <View style={{ width: "12%", paddingTop: 3.5, paddingRight: 6 }}>
                  {pos != null ? (
                    <View
                      style={{
                        width: track,
                        height: 2.5,
                        borderRadius: 1.25,
                        backgroundColor: C.line,
                        position: "relative",
                      }}
                    >
                      <View
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          height: 2.5,
                          borderRadius: 1.25,
                          width: pos * track,
                          backgroundColor: "#b5cdc9",
                        }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          top: -1.75,
                          left: pos * track - 3,
                          width: 6,
                          height: 6,
                          borderRadius: 3,
                          backgroundColor: tone,
                        }}
                      />
                    </View>
                  ) : null}
                </View>
                <View style={{ width: "12%", paddingRight: 3 }}>
                  <RateChip
                    word={str(c?.assessment)}
                    color={ASSESS_COLOR[str(c?.assessment)] ?? C.muted}
                  />
                </View>
                <Text style={{ width: "24%", fontSize: 7.5, color: C.muted }}>
                  {str(c?.note)}
                </Text>
              </View>
            );
          })}
          </View>
          {str(market?.summary) ? (
            <View style={s.summaryBox} wrap={false}>
              <Text style={s.summaryText}>{str(market?.summary)}</Text>
            </View>
          ) : null}
          {liveReadFailed ? <Text style={[s.sub, { marginTop: 8 }]}>{liveReadFailed}</Text> : null}
          {briefBlocks.map((b, bi) => (
            <View key={`${str(b.rec.metro)}-${bi}`} style={{ marginTop: 8 }}>
              <Text style={s.sub}>{str(briefHeading(b.rec, b.first))}</Text>
              {b.lines.map((l, i) => (
                <Text key={i} style={{ fontSize: 7.5, color: C.muted, marginTop: 2 }}>
                  {`• ${l}`}
                </Text>
              ))}
            </View>
          ))}
          {/* The providers' own notices under their figures (lib/data-notices). */}
          {documentNotices(briefBlocks.flatMap((b) => b.lines)).map((n) => (
            <Text key={n} style={{ fontSize: 6.5, color: C.muted, marginTop: 4 }}>
              {str(n)}
            </Text>
          ))}
        </PageChrome>
      )}

      {rows.length > 0 && (
        <PageChrome
          title="Reconciliation vs. your model"
          count={`${rows.length} metrics${unfavCount ? ` \u00b7 ${unfavCount} unfavorable` : ""}`}
          dealName={dealName}
          branding={memo.branding}
        >
          <Text style={s.sub}>
            Where the OM and your own underwriting disagree, framed from your
            side of the table.
          </Text>
          {/* The table's own View: its header repeats on a page the rows
              run onto. */}
          <View>
          <View style={s.tableHead} fixed>
            <Text style={[s.headText, { width: "26%" }]}>Metric</Text>
            <Text style={[s.headText, { width: "22%" }]}>OM</Text>
            <Text style={[s.headText, { width: "22%" }]}>Your model</Text>
            <Text style={[s.headText, { width: "30%" }]}>Gap</Text>
          </View>
          {rows.map((r, i) => {
            const share = gapShares[i] ?? null;
            // The bar: a 60pt track, the fill from its centre — right for a
            // favorable gap, left for an unfavorable one — and a 1pt centre
            // tick, three shapes a drawn row.
            const track = 60;
            const half = share === null ? 0 : Math.abs(share) * (track / 2);
            return (
              <View key={i} style={i % 2 === 1 ? [s.row, s.rowAlt] : s.row} wrap={false}>
                <Text style={{ width: "26%", fontSize: 8.5 }}>{str(r?.metric)}</Text>
                <Text style={{ width: "22%", fontSize: 8.5 }}>{str(r?.omValue)}</Text>
                <Text style={{ width: "22%", fontSize: 8.5 }}>{str(r?.myValue)}</Text>
                <View style={{ width: "30%" }}>
                  <Text
                    style={{
                      fontSize: 8.5,
                      fontFamily:
                        str(r?.direction) === "unfavorable"
                          ? "Helvetica-Bold"
                          : "Helvetica",
                      color: DIR_COLOR[str(r?.direction)] ?? C.ink,
                    }}
                  >
                    {str(r?.gap)}
                  </Text>
                  {(() => {
                    // Where the line's figure is not the two figures' own
                    // gap, the page says so, as the deal page does.
                    const differs = gapDisagreementLine({ gap: str(r?.gap), omValue: str(r?.omValue), myValue: str(r?.myValue) });
                    return differs ? <Text style={{ fontSize: 7, color: C.muted, marginTop: 1.5 }}>{pdfSafe(differs)}</Text> : null;
                  })()}
                  {share !== null ? (
                    <View
                      style={{
                        position: "relative",
                        width: track,
                        height: 2.5,
                        marginTop: 2.5,
                        borderRadius: 1.25,
                        backgroundColor: C.line,
                      }}
                    >
                      <View
                        style={{
                          position: "absolute",
                          top: 0,
                          left: share < 0 ? track / 2 - half : track / 2,
                          width: Math.max(0.5, half),
                          height: 2.5,
                          borderRadius: 1.25,
                          backgroundColor:
                            DIR_COLOR[share < 0 ? "unfavorable" : "favorable"] ?? C.ink,
                        }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          top: -1.5,
                          left: track / 2 - 0.5,
                          width: 1,
                          height: 5.5,
                          backgroundColor: C.ink,
                        }}
                      />
                    </View>
                  ) : null}
                </View>
              </View>
            );
          })}
          </View>
          {gapShares.some((g) => g !== null) ? (
            <Text style={{ fontSize: 6.5, color: C.muted, marginTop: 3 }}>
              Bars: each gap scaled to the widest of its kind; favorable right, unfavorable left.
            </Text>
          ) : null}
          {str(reconciliation?.takeaway) ? (
            <View style={s.summaryBox} wrap={false}>
              <Text style={s.summaryText}>{str(reconciliation?.takeaway)}</Text>
            </View>
          ) : null}
        </PageChrome>
      )}
    </Document>
  );
}
