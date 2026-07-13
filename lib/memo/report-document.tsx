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
import { buildMemoData, MemoPage, pdfSafe, type MemoData } from "./memo-document";
import {
  heatBucket,
  heatCellText,
  HEAT_BG,
  HEAT_LEGEND,
  type CapGrowthGrid,
} from "@/lib/underwrite/report-grid";

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
  h2: {
    fontSize: 13,
    fontFamily: "Helvetica-Bold",
    marginBottom: 8,
  },
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
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingVertical: 3.5,
  },

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
    backgroundColor: C.faint,
    borderRadius: 6,
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

function PageChrome({
  title,
  dealName,
  branding,
  children,
}: {
  title: string;
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
      <Text style={s.h2}>{title}</Text>
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
  /** the exit-cap × rent-growth heatmap (Feature 5); null when the deal has
   *  no extraction to derive a model from */
  grid?: CapGrowthGrid | null;
}

/** Everything the deal screen produced, shaped for the multi-page report. */
export function buildReportData(
  deal: DealRow,
  dateStr: string,
  buyBoxChecks?: BuyBoxCheck[] | null,
  grid?: CapGrowthGrid | null,
  branding?: MemoData["branding"],
): ReportInput {
  return {
    deal,
    memo: buildMemoData(deal, dateStr, buyBoxChecks, branding),
    grid: grid ?? null,
  };
}

/**
 * The FULL report: the one-page memo up front (the page an IC reads), then
 * one page per analysis — every extracted term, every challenge with its
 * broker question, the whole comp set, the market checks, and the
 * reconciliation when one ran. For the people who ask "what's behind the
 * memo?"
 */
export function ReportDocument({ input }: { input: ReportInput }) {
  const { deal, memo, grid } = input;
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
  const checks = list(market?.checks) as NonNullable<MarketResult["checks"]>;
  const rows = list(reconciliation?.rows) as NonNullable<
    ReconciliationResult["rows"]
  >;

  const BASIS_LABEL: Record<string, string> = {
    in_place: "In place",
    pro_forma: "Pro forma",
    na: "—",
  };

  // Heatmap columns share the 85% after the row-label column. Usually 5
  // columns (17% each); fewer when a base at a lever bound deduped stops.
  const gridColW = grid ? `${85 / grid.growthCols.length}%` : "17%";

  return (
    <Document
      title={`${dealName} — Full Screening Report`}
      author={memo.branding?.firmName ?? "Underwrite Copilot"}
    >
      {/* Page 1: the one-page memo, unchanged — the executive read. */}
      <MemoPage data={memo} />

      {/* Sensitivity heatmap (Feature 5): where the deal thrives, where it
          breaks — levered IRR / EM over exit cap × rent growth, computed by
          the same engine as the workbook and the on-screen playground. */}
      {grid && (
        <PageChrome title="Sensitivity analysis" dealName={dealName} branding={memo.branding}>
          <Text style={s.sub}>
            Levered IRR and equity multiple recomputed across the two levers
            that move screening returns most. The bordered cell is the base
            case.
          </Text>
          {/* Header row: rent growth across the columns. (No arrow glyph —
              U+2193 isn't WinAnsi and standard Helvetica would print a stray
              quote in its place.) */}
          <View style={[s.tableHead, { marginTop: 6 }]}>
            <Text style={[s.headText, { width: "15%" }]}>Exit cap</Text>
            {grid.growthCols.map((g, i) => (
              <Text key={i} style={[s.headText, { width: gridColW, textAlign: "center" }]}>
                {`${(g * 100).toFixed(1)}% growth`}
              </Text>
            ))}
          </View>
          {grid.cells.map((row, r) => (
            <View key={r} style={{ flexDirection: "row" }} wrap={false}>
              <Text
                style={{
                  width: "15%",
                  fontSize: 8,
                  fontFamily: "Helvetica-Bold",
                  paddingVertical: 5,
                  paddingRight: 4,
                }}
              >
                {`${(grid.capRows[r] * 100).toFixed(2)}%`}
              </Text>
              {row.map((cell, c) => {
                const isBase = r === grid.baseRow && c === grid.baseCol;
                return (
                  <Text
                    key={c}
                    style={{
                      width: gridColW,
                      fontSize: 7.5,
                      textAlign: "center",
                      paddingVertical: 5,
                      backgroundColor: HEAT_BG[heatBucket(cell.irrPct)],
                      borderWidth: isBase ? 1.4 : 0.4,
                      borderColor: isBase ? C.ink : "#ffffff",
                      fontFamily: isBase ? "Helvetica-Bold" : "Helvetica",
                    }}
                  >
                    {heatCellText(cell)}
                  </Text>
                );
              })}
            </View>
          ))}
          {/* Legend */}
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            {HEAT_LEGEND.map((l) => (
              <View key={l.bucket} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                <View
                  style={{
                    width: 8,
                    height: 8,
                    backgroundColor: HEAT_BG[l.bucket],
                    borderWidth: 0.4,
                    borderColor: C.line,
                  }}
                />
                <Text style={{ fontSize: 7.5, color: C.muted }}>{l.label}</Text>
              </View>
            ))}
          </View>
          <Text style={{ fontSize: 7.5, color: C.muted, marginTop: 6 }}>
            Levered IRR and Equity Multiple across exit cap (rows) and rent
            growth (columns). Green highlights scenarios meeting the 15% IRR
            threshold. Computed from the deal&apos;s derived screening model —
            re-export after changing assumptions.
          </Text>
        </PageChrome>
      )}

      {metrics.length > 0 && (
        <PageChrome title="Extracted terms" dealName={dealName} branding={memo.branding}>
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
            <View key={i} style={s.row} wrap={false}>
              <Text style={{ width: "34%", fontSize: 8.5 }}>{str(m?.label)}</Text>
              <Text
                style={{ width: "24%", fontSize: 8.5, fontFamily: "Helvetica-Bold" }}
              >
                {str(m?.value)}
              </Text>
              <Text style={{ width: "16%", fontSize: 8, color: C.muted }}>
                {BASIS_LABEL[str(m?.basis)] ?? "—"}
              </Text>
              <Text style={{ width: "12%", fontSize: 8, color: C.muted }}>
                {str(m?.page)}
              </Text>
              <Text
                style={{
                  width: "14%",
                  fontSize: 8,
                  color: m?.flagged ? C.caution : C.muted,
                }}
              >
                {m?.flagged ? "verify" : ""}
              </Text>
            </View>
          ))}
        </PageChrome>
      )}

      {chList.length > 0 && (
        <PageChrome title="Assumption challenges" dealName={dealName} branding={memo.branding}>
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
        <PageChrome title="Comp scrutiny" dealName={dealName} branding={memo.branding}>
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
                {g.items.map((cp, i) => (
                  <View key={i} style={s.row} wrap={false}>
                    <Text
                      style={{ width: "26%", fontSize: 8.5, fontFamily: "Helvetica-Bold" }}
                    >
                      {str(cp?.name)}
                    </Text>
                    <Text style={{ width: "30%", fontSize: 8.5 }}>
                      {str(cp?.detail)}
                    </Text>
                    <Text
                      style={{
                        width: "14%",
                        fontSize: 8,
                        fontFamily: "Helvetica-Bold",
                        color: SUPPORT_COLOR[str(cp?.support)] ?? C.muted,
                      }}
                    >
                      {str(cp?.support)}
                    </Text>
                    <Text style={{ width: "22%", fontSize: 7.5, color: C.muted }}>
                      {str(cp?.note)}
                    </Text>
                    <Text style={{ width: "8%", fontSize: 7.5, color: C.muted }}>
                      {str(cp?.page)}
                    </Text>
                  </View>
                ))}
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
        <PageChrome title="Market plausibility" dealName={dealName} branding={memo.branding}>
          <Text style={s.sub}>
            The OM&rsquo;s key assumptions against typical ranges for the asset
            class — rules of thumb, not a live comps feed.
          </Text>
          <View style={s.tableHead}>
            <Text style={[s.headText, { width: "26%" }]}>Assumption</Text>
            <Text style={[s.headText, { width: "18%" }]}>OM says</Text>
            <Text style={[s.headText, { width: "18%" }]}>Typical</Text>
            <Text style={[s.headText, { width: "14%" }]}>Read</Text>
            <Text style={[s.headText, { width: "24%" }]}>Note</Text>
          </View>
          {checks.map((c, i) => (
            <View key={i} style={s.row} wrap={false}>
              <Text style={{ width: "26%", fontSize: 8.5 }}>
                {str(c?.assumption)}
              </Text>
              <Text
                style={{ width: "18%", fontSize: 8.5, fontFamily: "Helvetica-Bold" }}
              >
                {str(c?.omSays)}
              </Text>
              <Text style={{ width: "18%", fontSize: 8.5 }}>
                {str(c?.typicalRange)}
              </Text>
              <Text
                style={{
                  width: "14%",
                  fontSize: 8,
                  fontFamily: "Helvetica-Bold",
                  color: ASSESS_COLOR[str(c?.assessment)] ?? C.muted,
                }}
              >
                {str(c?.assessment)}
              </Text>
              <Text style={{ width: "24%", fontSize: 7.5, color: C.muted }}>
                {str(c?.note)}
              </Text>
            </View>
          ))}
          {str(market?.summary) ? (
            <View style={s.summaryBox} wrap={false}>
              <Text style={s.summaryText}>{str(market?.summary)}</Text>
            </View>
          ) : null}
        </PageChrome>
      )}

      {rows.length > 0 && (
        <PageChrome title="Reconciliation vs. your model" dealName={dealName} branding={memo.branding}>
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
            <View key={i} style={s.row} wrap={false}>
              <Text style={{ width: "26%", fontSize: 8.5 }}>{str(r?.metric)}</Text>
              <Text style={{ width: "22%", fontSize: 8.5 }}>{str(r?.omValue)}</Text>
              <Text style={{ width: "22%", fontSize: 8.5 }}>{str(r?.myValue)}</Text>
              <Text
                style={{
                  width: "30%",
                  fontSize: 8.5,
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
