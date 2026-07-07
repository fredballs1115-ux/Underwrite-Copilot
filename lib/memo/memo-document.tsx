import "server-only";
import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { DealRow } from "@/lib/deals";
import type { BuyBoxCheck } from "@/lib/criteria";
import { computeScreenDiff, type PriorScreen } from "@/lib/screen-diff";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";

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

const SEV_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEV_COLOR: Record<string, string> = {
  high: C.kill,
  medium: C.caution,
  low: C.brand,
};
const CALL_COLOR: Record<string, string> = {
  Go: C.pass,
  Caution: C.caution,
  "No-go": C.kill,
};

export type MemoData = {
  name: string;
  market: string;
  assetClass: string;
  dateStr: string;
  verdictWord: string | null;
  verdictColor: string;
  verdictSub: string;
  verdictReason: string;
  keyTerms: { label: string; value: string; flagged: boolean }[];
  topRisks: string[];
  challenges: { severity: string; assumption: string; challenge: string }[];
  flags: { label: string; text: string }[];
  // The pre-model screen — ranges, deal-killers, and where the call flips.
  ranges: { label: string; low: string; base: string; high: string; source: string }[];
  dealKillers: { label: string; read: string; risk: string }[];
  sensitivity: { scenario: string; call: string; note: string }[];
  nextSteps: string[];
  // The buyer's standing criteria, checked deterministically (empty = no box set).
  buyBox: { label: string; status: "pass" | "near" | "miss" | "unknown" }[];
  // One-line retrade summary ("Caution → Go · Price −$1.8M (−2.5%) · …"), or null.
  sinceLast: string | null;
};

const clamp = (s: string, n: number) =>
  s.length > n ? s.slice(0, n - 1).trimEnd() + "\u2026" : s;

// The PDF's standard Helvetica only carries WinAnsi glyphs \u2014 swap the web
// UI's arrows/minus signs for safe equivalents or they silently drop.
const pdfSafe = (s: string) =>
  s.replace(/\u2192/g, "\u203a").replace(/[\u2212\u2013]/g, "-");

/** Shape the stored analysis into the flat data the one-page memo renders. */
export function buildMemoData(
  deal: DealRow,
  dateStr: string,
  buyBoxChecks?: BuyBoxCheck[] | null,
): MemoData {
  const extraction = deal.extraction as ExtractionResult | null;
  const challenges = deal.challenges as ChallengerResult | null;
  const comps = deal.comps as BrokerCompsResult | null;
  const market = deal.market as MarketResult | null;
  const verdict = deal.verdict as VerdictResult | null;

  const vmeta = verdict
    ? (
        {
          pass: { word: "Go", color: C.pass, sub: "Worth deeper work" },
          caution: {
            word: "Caution",
            color: C.caution,
            sub: "Proceed only with named conditions",
          },
          pass_on: { word: "No-go", color: C.kill, sub: "Recommend passing" },
        } as const
      )[verdict.verdict]
    : null;

  const metrics = extraction?.metrics ?? [];
  const ordered = [
    ...metrics.filter((m) => m.flagged),
    ...metrics.filter((m) => !m.flagged),
  ];
  const keyTerms = ordered
    .slice(0, 8)
    .map((m) => ({ label: m.label, value: m.value, flagged: m.flagged }));

  const ch = [...(challenges?.challenges ?? [])]
    .sort((a, b) => (SEV_RANK[a.severity] ?? 1) - (SEV_RANK[b.severity] ?? 1))
    .slice(0, 3)
    .map((c) => ({
      severity: c.severity,
      assumption: c.assumption,
      challenge: c.challenge,
    }));

  const flags: { label: string; text: string }[] = [];
  for (const f of comps?.redFlags ?? []) flags.push({ label: "Comps", text: f });
  for (const c of market?.checks ?? []) {
    if (c.assessment === "aggressive") {
      flags.push({
        label: "Market",
        text: `${c.assumption}: OM ${c.omSays} vs. typical ${c.typicalRange}`,
      });
    }
  }

  // The pre-model screen (added to verdicts later — older deals won't have it).
  const screen = verdict?.screen;
  const LEVER_LABEL: Record<string, string> = {
    basis: "Basis",
    exit: "Exit",
    debt: "Debt",
  };
  const SCENARIO_LABEL: Record<string, string> = {
    conservative: "Conservative",
    base: "Base",
    sponsor: "Sponsor",
  };
  const CALL_LABEL: Record<string, string> = {
    pass: "Go",
    caution: "Caution",
    pass_on: "No-go",
  };
  const ranges = (screen?.ranges ?? []).slice(0, 4).map((r) => ({
    label: clamp(r.label, 28),
    low: r.low,
    base: r.base,
    high: r.high,
    source: clamp(r.source, 62),
  }));
  const dealKillers = (screen?.dealKillers ?? []).slice(0, 3).map((k) => ({
    label: LEVER_LABEL[k.lever] ?? k.lever,
    read: clamp(k.read, 72),
    risk: clamp(k.risk ?? "", 72),
  }));
  const sensitivity = (screen?.sensitivity ?? []).map((sc) => ({
    scenario: SCENARIO_LABEL[sc.scenario] ?? sc.scenario,
    call: CALL_LABEL[sc.call] ?? sc.call,
    note: clamp(sc.note ?? "", 90),
  }));

  // When the screen is present it earns the page space — tighten the older
  // sections so the memo stays one page.
  const hasScreen = ranges.length > 0;

  // Retrade line: what moved since the previous screen, compressed to one
  // sentence-length string. Only when something actually moved.
  let sinceLast: string | null = null;
  const prior = (deal.prior_screen as PriorScreen | undefined) ?? null;
  if (prior && extraction) {
    try {
      const diff = computeScreenDiff(prior, extraction, verdict);
      if (diff && (!diff.allFlat || diff.verdictChanged)) {
        const parts: string[] = [];
        if (diff.verdictFrom && diff.verdictTo) {
          parts.push(
            `${CALL_LABEL_GLOBAL[diff.verdictFrom] ?? diff.verdictFrom} › ${CALL_LABEL_GLOBAL[diff.verdictTo] ?? diff.verdictTo}`,
          );
        }
        for (const r of diff.rows.filter((x) => x.direction !== "flat").slice(0, 3)) {
          parts.push(`${r.label} ${r.delta}`);
        }
        const when = new Date(diff.at).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        });
        sinceLast = pdfSafe(
          clamp(`Since last screen (${when}): ${parts.join("  ·  ")}`, 150),
        );
      }
    } catch {
      sinceLast = null;
    }
  }

  return {
    name: deal.name,
    market: extraction?.market ?? "",
    assetClass: deal.asset_class,
    dateStr,
    verdictWord: vmeta?.word ?? null,
    verdictColor: vmeta?.color ?? C.muted,
    verdictSub: vmeta?.sub ?? "",
    verdictReason: clamp(verdict?.reason ?? "", 280),
    keyTerms: hasScreen ? keyTerms.slice(0, 4) : keyTerms,
    topRisks: (verdict?.topRisks ?? []).slice(0, hasScreen ? 2 : 4),
    // With the screen present, the deal-killers + top risks already carry the
    // critique and the ranges carry the comp/market story — drop the two
    // overlapping sections so the memo stays one page.
    challenges: hasScreen ? [] : ch,
    flags: hasScreen ? [] : flags.slice(0, 4),
    ranges,
    dealKillers,
    sensitivity,
    nextSteps: (verdict?.nextSteps ?? []).slice(0, hasScreen ? 2 : 4),
    buyBox: (buyBoxChecks ?? []).map((c) => ({
      label: clamp(c.label, 20),
      status: c.status,
    })),
    sinceLast,
  };
}

// Verdict-call display names, shared by the retrade line above.
const CALL_LABEL_GLOBAL: Record<string, string> = {
  pass: "Go",
  caution: "Caution",
  pass_on: "No-go",
};

const s = StyleSheet.create({
  page: {
    paddingVertical: 28,
    paddingHorizontal: 44,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: C.ink,
    lineHeight: 1.32,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  brandRow: { flexDirection: "row", alignItems: "center" },
  badge: {
    width: 20,
    height: 20,
    borderRadius: 5,
    backgroundColor: C.brand,
    color: "#ffffff",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textAlign: "center",
    paddingTop: 5,
    marginRight: 6,
  },
  brandText: { fontSize: 11, fontFamily: "Helvetica-Bold" },
  metaRight: { textAlign: "right", color: C.muted, fontSize: 9 },
  divider: { borderBottomWidth: 1, borderBottomColor: C.line, marginVertical: 10 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 10, color: C.muted, marginTop: 2 },

  verdictBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: C.line,
    borderLeftWidth: 4,
    borderRadius: 6,
    padding: 10,
  },
  eyebrow: {
    fontSize: 8,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  verdictWord: {
    fontSize: 20,
    fontFamily: "Helvetica-Bold",
    marginTop: 3,
    lineHeight: 1.05,
  },
  verdictSub: { fontSize: 10, color: C.muted, marginTop: 2 },
  verdictReason: { marginTop: 6, fontSize: 10, color: C.ink },
  sinceLast: { marginTop: 6, fontSize: 8, color: C.muted },

  buyBoxRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 8,
  },
  buyBoxTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginRight: 8,
  },
  buyBoxChip: { flexDirection: "row", marginRight: 10, marginBottom: 2 },
  buyBoxMark: { fontSize: 8.5, fontFamily: "Helvetica-Bold", marginRight: 2.5 },
  buyBoxLabel: { fontSize: 8.5, color: C.ink },

  section: { marginTop: 13 },
  twoCol: { flexDirection: "row", marginTop: 13, gap: 14 },
  col: { flex: 1 },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 7,
  },

  termsWrap: { flexDirection: "row", flexWrap: "wrap" },
  term: {
    width: "25%",
    paddingRight: 10,
    marginBottom: 7,
  },
  termLabel: { fontSize: 7.5, color: C.muted, textTransform: "uppercase" },
  termValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 1 },
  verify: { fontSize: 7, color: C.caution },

  row: { flexDirection: "row", marginBottom: 5 },
  bullet: { width: 10, color: C.muted },
  itemText: { flex: 1, fontSize: 9.5 },

  challenge: { marginBottom: 6 },
  chHead: { flexDirection: "row", alignItems: "center", marginBottom: 2 },
  chTag: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    color: "#ffffff",
    paddingVertical: 1,
    paddingHorizontal: 4,
    borderRadius: 3,
    marginRight: 6,
  },
  chTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", flex: 1 },
  chBody: { fontSize: 9, color: C.muted },

  flagRow: { flexDirection: "row", marginBottom: 5 },
  flagTag: {
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    color: C.kill,
    width: 38,
    textTransform: "uppercase",
  },

  // The screen: ranges table
  rangeHead: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.line,
    paddingBottom: 3,
    marginBottom: 3,
  },
  rangeRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
    paddingVertical: 3,
  },
  rangeLabel: { width: "26%", fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  rangeCell: { width: "13%", fontSize: 8.5, textAlign: "right", paddingRight: 6 },
  rangeCellBase: {
    width: "13%",
    fontSize: 8.5,
    textAlign: "right",
    paddingRight: 6,
    fontFamily: "Helvetica-Bold",
    color: C.brand,
  },
  rangeSource: { width: "35%", fontSize: 7.5, color: C.muted },
  rangeHeadText: {
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // The screen: deal-killers + sensitivity
  killersRow: { flexDirection: "row", marginTop: 8 },
  killerCol: { flex: 1, paddingRight: 10 },
  killerName: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.brand },
  killerRead: { fontSize: 8, color: C.muted, marginTop: 1.5 },
  killerRisk: { fontSize: 7.5, color: C.kill, marginTop: 1.5 },
  sensBlock: { marginTop: 8 },
  sensLabel: {
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  sensLine: { flexDirection: "row", alignItems: "baseline", marginBottom: 1.5 },
  sensScenario: { fontSize: 8, color: C.muted, width: 62 },
  sensCall: { fontSize: 8.5, fontFamily: "Helvetica-Bold", width: 46 },
  sensNote: { fontSize: 7.5, color: C.muted, flex: 1 },

  footer: {
    position: "absolute",
    bottom: 28,
    left: 44,
    right: 44,
    borderTopWidth: 1,
    borderTopColor: C.line,
    paddingTop: 8,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  footerText: { fontSize: 7.5, color: C.muted },
});

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

export function MemoDocument({ data }: { data: MemoData }) {
  const subParts = [data.market, cap(data.assetClass)].filter(Boolean);
  return (
    <Document
      title={`${data.name} — Screening Memo`}
      author="Underwrite Copilot"
    >
      <Page size="LETTER" style={s.page}>
        <View style={s.header}>
          <View style={s.brandRow}>
            <Text style={s.badge}>UC</Text>
            <Text style={s.brandText}>Underwrite Copilot</Text>
          </View>
          <View>
            <Text style={s.metaRight}>Deal Screening Memo</Text>
            <Text style={s.metaRight}>{data.dateStr}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <Text style={s.title}>{data.name}</Text>
        {subParts.length > 0 && (
          <Text style={s.sub}>{subParts.join("  ·  ")}</Text>
        )}

        {data.verdictWord && (
          <View style={[s.verdictBox, { borderLeftColor: data.verdictColor }]}>
            <Text style={s.eyebrow}>Verdict</Text>
            <Text style={[s.verdictWord, { color: data.verdictColor }]}>
              {data.verdictWord}
            </Text>
            {data.verdictSub ? (
              <Text style={s.verdictSub}>{data.verdictSub}</Text>
            ) : null}
            {data.verdictReason ? (
              <Text style={s.verdictReason}>{data.verdictReason}</Text>
            ) : null}
            {data.sinceLast ? (
              <Text style={s.sinceLast}>{data.sinceLast}</Text>
            ) : null}
          </View>
        )}

        {data.buyBox.length > 0 && (
          <View style={s.buyBoxRow}>
            <Text style={s.buyBoxTitle}>Buy box</Text>
            {data.buyBox.map((c, i) => (
              <View key={i} style={s.buyBoxChip}>
                <Text
                  style={[
                    s.buyBoxMark,
                    {
                      color:
                        c.status === "miss"
                          ? C.kill
                          : c.status === "near"
                            ? C.caution
                            : c.status === "pass"
                              ? C.pass
                              : C.muted,
                    },
                  ]}
                >
                  {c.status === "miss"
                    ? "×"
                    : c.status === "near"
                      ? "±"
                      : c.status === "pass"
                        ? "•"
                        : "—"}
                </Text>
                <Text style={s.buyBoxLabel}>{c.label}</Text>
              </View>
            ))}
          </View>
        )}

        {data.ranges.length > 0 && (
          <Section title="The screen — ranges, not hero numbers">
            <View style={s.rangeHead}>
              <Text style={[s.rangeLabel, s.rangeHeadText]}>Assumption</Text>
              <Text style={[s.rangeCell, s.rangeHeadText]}>Low</Text>
              <Text style={[s.rangeCell, s.rangeHeadText]}>Base</Text>
              <Text style={[s.rangeCell, s.rangeHeadText]}>High</Text>
              <Text style={[s.rangeSource, s.rangeHeadText]}>Source</Text>
            </View>
            {data.ranges.map((r, i) => (
              <View key={i} style={s.rangeRow}>
                <Text style={s.rangeLabel}>{r.label}</Text>
                <Text style={s.rangeCell}>{r.low}</Text>
                <Text style={s.rangeCellBase}>{r.base}</Text>
                <Text style={s.rangeCell}>{r.high}</Text>
                <Text style={s.rangeSource}>{r.source}</Text>
              </View>
            ))}

            {data.dealKillers.length > 0 && (
              <View style={s.killersRow}>
                {data.dealKillers.map((k, i) => (
                  <View key={i} style={s.killerCol}>
                    <Text style={s.killerName}>
                      {i + 1}. {k.label}
                    </Text>
                    <Text style={s.killerRead}>{k.read}</Text>
                    {k.risk ? (
                      <Text style={s.killerRisk}>Breaks if: {k.risk}</Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {data.sensitivity.length > 0 && (
              <View style={s.sensBlock}>
                <Text style={s.sensLabel}>Where the call flips</Text>
                {data.sensitivity.map((sc, i) => (
                  <View key={i} style={s.sensLine}>
                    <Text style={s.sensScenario}>{sc.scenario}</Text>
                    <Text
                      style={[s.sensCall, { color: CALL_COLOR[sc.call] ?? C.ink }]}
                    >
                      {sc.call}
                    </Text>
                    {sc.note ? <Text style={s.sensNote}>— {sc.note}</Text> : null}
                  </View>
                ))}
              </View>
            )}
          </Section>
        )}

        {data.keyTerms.length > 0 && (
          <Section title="Key terms">
            <View style={s.termsWrap}>
              {data.keyTerms.map((t, i) => (
                <View key={i} style={s.term}>
                  <Text style={s.termLabel}>{t.label}</Text>
                  <Text style={s.termValue}>{t.value}</Text>
                  {t.flagged ? <Text style={s.verify}>verify vs. source</Text> : null}
                </View>
              ))}
            </View>
          </Section>
        )}

        {(data.topRisks.length > 0 || data.nextSteps.length > 0) && (
          <View style={s.twoCol}>
            {data.topRisks.length > 0 && (
              <View style={s.col}>
                <Text style={s.sectionTitle}>Top risks</Text>
                {data.topRisks.map((r, i) => (
                  <View key={i} style={s.row}>
                    <Text style={s.bullet}>•</Text>
                    <Text style={s.itemText}>{r}</Text>
                  </View>
                ))}
              </View>
            )}
            {data.nextSteps.length > 0 && (
              <View style={s.col}>
                <Text style={s.sectionTitle}>Next steps</Text>
                {data.nextSteps.map((n, i) => (
                  <View key={i} style={s.row}>
                    <Text style={s.bullet}>{i + 1}.</Text>
                    <Text style={s.itemText}>{n}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {data.challenges.length > 0 && (
          <Section title="Headline challenges">
            {data.challenges.map((c, i) => (
              <View key={i} style={s.challenge}>
                <View style={s.chHead}>
                  <Text
                    style={[
                      s.chTag,
                      { backgroundColor: SEV_COLOR[c.severity] ?? C.caution },
                    ]}
                  >
                    {c.severity}
                  </Text>
                  <Text style={s.chTitle}>{c.assumption}</Text>
                </View>
                <Text style={s.chBody}>{c.challenge}</Text>
              </View>
            ))}
          </Section>
        )}

        {data.flags.length > 0 && (
          <Section title="Comp & market flags">
            {data.flags.map((f, i) => (
              <View key={i} style={s.flagRow}>
                <Text style={s.flagTag}>{f.label}</Text>
                <Text style={s.itemText}>{f.text}</Text>
              </View>
            ))}
          </Section>
        )}

        <View style={s.footer} fixed>
          <Text style={s.footerText}>
            First-pass screen, not investment advice. Verify flagged figures
            against source documents.
          </Text>
          <Text style={s.footerText}>Underwrite Copilot</Text>
        </View>
      </Page>
    </Document>
  );
}

function cap(str: string): string {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}
