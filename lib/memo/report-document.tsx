import "server-only";
import { Document, Page, View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import type { DealRow } from "@/lib/deals";
import type { BuyBoxCheck } from "@/lib/criteria";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  ReconciliationResult,
  MarketResult,
} from "@/lib/anthropic/types";
import { basePosition, buildMemoData, MemoPage, pdfSafe, type MemoData } from "./memo-document";

/** The OM's figure placed on the typical range — "5.25%" on "5.25–5.75%" —
 *  as the memo places a base between its low and high: 0..1, clamped, so a
 *  figure past either end sits at that end (the Read chip says which way);
 *  null when either side does not parse as one scale. */
export function rangeRead(omSays: string, typicalRange: string): number | null {
  const m = typicalRange.match(/(\$?-?\d[\d,]*\.?\d*)\s*(?:–|—|-|to)\s*(\$?-?\d[\d,]*\.?\d*)/);
  if (!m) return null;
  return basePosition({ low: m[1], base: omSays, high: m[2] });
}
import {
  heatBucket,
  heatCellIrr,
  heatCellEm,
  heatLegend,
  HEAT_BG,
  type SensitivityData,
  type HeatCell,
} from "@/lib/underwrite/report-grid";
import {
  SPREAD_BG,
  SPREAD_LABEL,
  refCapNote,
  spreadBucket,
  type PlanReport,
  type SpreadBucket,
  type YocGrid,
} from "@/lib/plan-sensitivity";
import { planFacts } from "@/lib/plan-facts";
import { inferStrategy, isPlanDeal } from "@/lib/deal-strategy";
import { basisScale, fmtBasis, subjectBasis } from "@/lib/comp-detail";
import { parsePageNumber } from "@/lib/facts";

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

export interface ReportInput {
  deal: DealRow;
  memo: MemoData;
  /** the sensitivity page's data (Feature 5): both grids, the buyer-hurdle
   *  color scale, the takeaway, and the max bid; null when the deal has no
   *  extraction to derive a model from */
  sensitivity?: SensitivityData | null;
  /** the plan page for a conversion / development / lease-up / value-add:
   *  the plan as the OM states it and yield on total cost stressed across
   *  NOI shortfall and budget overrun; null for a stabilized asset or when
   *  the OM did not state a budget and a stabilized NOI */
  plan?: PlanReport | null;
  /** the OM's real page count, from the extraction — a citation prints only
   *  when it falls inside it (lib/facts.ts: never an unvalidated page);
   *  null when the count is unknown, and then no page prints */
  totalPages: number | null;
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
): ReportInput {
  const extraction = (deal.extraction as ExtractionResult | null) ?? null;
  const pages = extraction?.totalPages;
  return {
    deal,
    // Page 1 IS the memo, dismissed submarket checks and the cover aerial
    // included: the analyst's own words on an override travel with the
    // report as they do with the standalone memo.
    memo: buildMemoData(deal, dateStr, buyBoxChecks, branding, overrides, cover),
    // On a plan deal the annual screening model books the budget in year 1
    // and anchors year 1 on in-place income, so its IRR grid is not the
    // plan's return — it once printed a -48% IRR and a -17.9x multiple as
    // the base case. The plan page carries the sensitivity such a deal is
    // judged on; the IRR page is omitted rather than caveated.
    sensitivity: isPlanDeal(inferStrategy(extraction).kind) ? null : (sensitivity ?? null),
    plan: plan ?? null,
    totalPages: typeof pages === "number" && Number.isFinite(pages) && pages > 0 ? Math.round(pages) : null,
  };
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
                  {fmtPct(cell.yieldOnCost)}
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

const fmtCompactUsd = (n: number): string =>
  n >= 1e6
    ? `$${(n / 1e6).toFixed(n >= 1e7 ? 1 : 2).replace(/\.?0+$/, "")}M`
    : `$${Math.round(n / 1e3)}k`;

/**
 * One sensitivity grid: a spanning axis title over the column values, a
 * left axis label over bold row labels, and two-line cells (IRR bold, EM
 * muted) colored by distance from the buyer's hurdle. The base cell wears
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

export function ReportDocument({ input }: { input: ReportInput }) {
  const { deal, memo, sensitivity, plan } = input;
  // Older callers built the input by hand without a page count: then no
  // citation validates, and none prints (the rule in lib/facts.ts).
  const totalPages = input.totalPages ?? null;
  const dealName = memo.name;
  const extraction = deal.extraction as ExtractionResult | null;
  const challenges = deal.challenges as ChallengerResult | null;
  const comps = deal.comps as BrokerCompsResult | null;
  const market = deal.market as MarketResult | null;
  const reconciliation = deal.reconciliation as ReconciliationResult | null;

  const metrics = list(extraction?.metrics) as NonNullable<
    ExtractionResult["metrics"]
  >;
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
      inferStrategy(extraction).kind,
    ),
  );
  const checks = list(market?.checks) as NonNullable<MarketResult["checks"]>;
  const rows = list(reconciliation?.rows) as NonNullable<
    ReconciliationResult["rows"]
  >;

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
      {/* Page 1: the one-page memo, unchanged — the executive read. */}
      <MemoPage data={memo} />

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
            {planFacts(plan.plan).map(([label, value], _i, all) => (
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
                  ? ` The all-in basis is total cost over the ${plan.plan.units.toLocaleString("en-US")} planned units.`
                  : ""
              }`,
            )}
          </Text>

          <TitleRow title="Yield on cost, stressed" marginTop={14} />
          <Text style={s.sub}>
            {str(
              `The plan is judged on the spread between the finished project's yield on total cost and the cap rate that product trades at once it is done - not on a cap rate against the price. Stabilized NOI under the pro forma runs down the rows, budget over the OM's across; each cell is the yield on total cost (bold) and its spread over the ${fmtPct(
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
                  )} - down to ${fmtCompactUsd(plan.breakevens.noiAtRefCap)} - before the yield on cost falls to the ${fmtPct(
                    plan.refCap.pct,
                    2,
                  )} reference cap.`
                : `The OM's ${fmtCompactUsd(plan.plan.stabilizedNoi!.value)} stabilized NOI already yields less than the ${fmtPct(
                    plan.refCap.pct,
                    2,
                  )} reference cap on ${fmtCompactUsd(plan.plan.totalCost ?? 0)} of total cost - the plan is under water before any stress.`,
            )}
          </Text>
          <Text style={{ fontSize: 8, color: C.ink, marginTop: 3, fontFamily: "Helvetica-Oblique" }}>
            {str(
              plan.breakevens.overrunToRefCap != null
                ? `${budgetNoun(plan)} would have to run ${fmtPct(plan.breakevens.overrunToRefCap, 0)} over - ${fmtCompactUsd(
                    plan.plan.budget!.budget * (1 + plan.breakevens.overrunToRefCap),
                  )} against ${fmtCompactUsd(plan.plan.budget!.budget)} - before the yield fell to the reference cap.`
                : "Any overrun deepens a yield that already sits below the cap.",
            )}
          </Text>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 9 }}>
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
              `Reference cap: ${fmtPct(plan.refCap.pct, 2)} - ${refCapNote(
                plan.refCap.provenance,
              )}. Figures are the OM's as extracted; the challenger's page tests whether the stabilized NOI is as conservative as the deck presents it. The IRR sensitivity page is omitted on a plan deal: the annual screening model books the budget in year 1 and anchors year 1 on in-place income, so its IRR grid is not the plan's return - this grid is.`,
            )}
          </Text>
        </PageChrome>
      )}

      {/* Sensitivity page (Feature 5): where the deal thrives, where it
          breaks — two grids from the same engine as the workbook and the
          on-screen playground, colored against the BUYER'S hurdle. */}
      {sensitivity && (
        <PageChrome
          title="Sensitivity analysis"
          count={`graded vs ${fmtHurdle(sensitivity.hurdlePct)} IRR`}
          dealName={dealName}
          branding={memo.branding}
        >
          <Text style={s.sub}>
            {`Levered IRR (bold) and equity multiple, recomputed cell by cell. Color marks distance from the ${
              sensitivity.hurdleSource === "buybox"
                ? `${fmtHurdle(sensitivity.hurdlePct)} IRR target in your buy box`
                : `${fmtHurdle(sensitivity.hurdlePct)} screening hurdle`
            } — deeper green clears it by more, deeper red misses by more. The ink-bordered cell is the modeled base case.`}
          </Text>

          <HeatGrid
            axisLabel="EXIT CAP"
            spanLabel="RENT GROWTH (ANNUAL)"
            colLabels={sensitivity.grid.growthCols.map((g) => `${(g * 100).toFixed(1)}%`)}
            rowLabels={sensitivity.grid.capRows.map((cap) => `${(cap * 100).toFixed(2)}%`)}
            cells={sensitivity.grid.cells}
            baseRow={sensitivity.grid.baseRow}
            baseCol={sensitivity.grid.baseCol}
            hurdlePct={sensitivity.hurdlePct}
          />
          <Text style={{ fontSize: 8, color: C.ink, marginTop: 7, fontFamily: "Helvetica-Oblique" }}>
            {sensitivity.takeaway}
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
                <Text style={{ fontSize: 7.5, color: C.muted }}>{l.label}</Text>
              </View>
            ))}
          </View>

          <TitleRow title="The retrade grid" marginTop={16} />
          <Text style={s.sub}>
            The same model repriced: what paying less (or more) does to
            returns at each exit cap. Rows re-size the loan, fees, and equity
            from the new price.
          </Text>
          <HeatGrid
            axisLabel="PRICE"
            spanLabel="EXIT CAP"
            colLabels={sensitivity.priceGrid.capCols.map((cap) => `${(cap * 100).toFixed(2)}%`)}
            rowLabels={sensitivity.priceGrid.priceRows.map(
              (p) =>
                `${fmtCompactUsd(p.price)}  ${
                  p.deltaPct === 0 ? "(ask)" : `(${p.deltaPct > 0 ? "+" : ""}${Math.round(p.deltaPct * 100)}%)`
                }`,
            )}
            cells={sensitivity.priceGrid.cells}
            baseRow={sensitivity.priceGrid.baseRow}
            baseCol={sensitivity.priceGrid.baseCol}
            hurdlePct={sensitivity.hurdlePct}
            rowLabelWidth="19%"
          />
          <Text style={{ fontSize: 8, color: C.ink, marginTop: 7, fontFamily: "Helvetica-Oblique" }}>
            {sensitivity.maxBid
              ? sensitivity.maxBid.unbounded
                ? `Max bid holding ${fmtHurdle(sensitivity.hurdlePct)} IRR: clears at every tested price — the constraint never binds inside the search range.`
                : `Max bid holding ${fmtHurdle(sensitivity.hurdlePct)} IRR: ${fmtCompactUsd(sensitivity.maxBid.price)} (${
                    sensitivity.maxBid.deltaPct > 0 ? "+" : ""
                  }${(sensitivity.maxBid.deltaPct * 100).toFixed(1)}% vs the modeled price).`
              : `No price inside the tested range holds ${fmtHurdle(sensitivity.hurdlePct)} IRR under these assumptions.`}
          </Text>

          <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 10 }}>
            Computed from the deal&apos;s derived screening model — the same
            engine behind the Excel workbook and the on-screen playground.
            Re-export after changing assumptions.
          </Text>
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
          <View style={s.tableHead}>
            <Text style={[s.headText, { width: "34%" }]}>Term</Text>
            <Text style={[s.headText, { width: "24%" }]}>Value</Text>
            <Text style={[s.headText, { width: "16%" }]}>Basis</Text>
            <Text style={[s.headText, { width: "12%" }]}>Page</Text>
            <Text style={[s.headText, { width: "14%" }]}>Flag</Text>
          </View>
          {metrics.map((m, i) => (
            <View key={i} style={i % 2 === 1 ? [s.row, s.rowAlt] : s.row} wrap={false}>
              <Text style={{ width: "34%", fontSize: 8.5 }}>{str(m?.label)}</Text>
              <Text
                style={{ width: "24%", fontSize: 8.5, fontFamily: "Helvetica-Bold" }}
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
        </PageChrome>
      )}

      {chList.length > 0 && (
        <PageChrome
          title="Assumption challenges"
          count={`${chList.length} challenges${highCount ? ` \u00b7 ${highCount} high` : ""}`}
          dealName={dealName}
          branding={memo.branding}
        >
          <Text style={s.sub}>
            The pro forma grilled in the order deals die — basis, exit, debt —
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
          {str(challenges?.stressTest) ? (
            <View style={s.summaryBox} wrap={false}>
              <Text style={[s.headText, { marginBottom: 3 }]}>Stress test</Text>
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
                {g.items.map((cp, i) => {
                  // Sale comps only: the basis bar and the subject's tick.
                  const scale = g.label === "Sale comps" ? compScale : null;
                  const share = scale?.shares[i] ?? null;
                  const track = 60;
                  return (
                  <View key={i} style={i % 2 === 1 ? [s.row, s.rowAlt] : s.row} wrap={false}>
                    <Text
                      style={{ width: "26%", fontSize: 8.5, fontFamily: "Helvetica-Bold" }}
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
                    <Text style={{ width: "22%", fontSize: 7.5, color: C.muted }}>
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
                      ? `Bars: each comp's basis per ${compScale.unit === "unit" ? "unit" : "SF"}; the tick is the subject at ${fmtBasis(compScale.subjectValue, compScale.unit)}.`
                      : `Bars: each comp's basis per ${compScale.unit === "unit" ? "unit" : "SF"}, scaled to the widest in the set.`}
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
          <View style={s.tableHead}>
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
          {str(market?.summary) ? (
            <View style={s.summaryBox} wrap={false}>
              <Text style={s.summaryText}>{str(market?.summary)}</Text>
            </View>
          ) : null}
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
          <View style={s.tableHead}>
            <Text style={[s.headText, { width: "26%" }]}>Metric</Text>
            <Text style={[s.headText, { width: "22%" }]}>OM</Text>
            <Text style={[s.headText, { width: "22%" }]}>Your model</Text>
            <Text style={[s.headText, { width: "30%" }]}>Gap</Text>
          </View>
          {rows.map((r, i) => (
            <View key={i} style={i % 2 === 1 ? [s.row, s.rowAlt] : s.row} wrap={false}>
              <Text style={{ width: "26%", fontSize: 8.5 }}>{str(r?.metric)}</Text>
              <Text style={{ width: "22%", fontSize: 8.5 }}>{str(r?.omValue)}</Text>
              <Text style={{ width: "22%", fontSize: 8.5 }}>{str(r?.myValue)}</Text>
              <Text
                style={{
                  width: "30%",
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
            </View>
          ))}
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
