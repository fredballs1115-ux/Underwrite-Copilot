import {
  Document,
  Page,
  View,
  Text,
  StyleSheet,
} from "@react-pdf/renderer";
import type { DealRow } from "@/lib/deals";
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
  pass: "#15803d",
  caution: "#b45309",
  kill: "#b3261e",
};

const SEV_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };
const SEV_COLOR: Record<string, string> = {
  high: C.kill,
  medium: C.caution,
  low: C.brand,
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
};

/** Shape the stored analysis into the flat data the one-page memo renders. */
export function buildMemoData(deal: DealRow, dateStr: string): MemoData {
  const extraction = deal.extraction as ExtractionResult | null;
  const challenges = deal.challenges as ChallengerResult | null;
  const comps = deal.comps as BrokerCompsResult | null;
  const market = deal.market as MarketResult | null;
  const verdict = deal.verdict as VerdictResult | null;

  const vmeta = verdict
    ? (
        {
          pass: { word: "Pass", color: C.pass, sub: "Worth deeper work" },
          caution: {
            word: "Caution",
            color: C.caution,
            sub: "Proceed only with named conditions",
          },
          pass_on: { word: "Pass on", color: C.kill, sub: "Recommend passing" },
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

  return {
    name: deal.name,
    market: extraction?.market ?? "",
    assetClass: deal.asset_class,
    dateStr,
    verdictWord: vmeta?.word ?? null,
    verdictColor: vmeta?.color ?? C.muted,
    verdictSub: vmeta?.sub ?? "",
    verdictReason: verdict?.reason ?? "",
    keyTerms,
    topRisks: (verdict?.topRisks ?? []).slice(0, 4),
    challenges: ch,
    flags: flags.slice(0, 4),
  };
}

const s = StyleSheet.create({
  page: {
    paddingVertical: 40,
    paddingHorizontal: 44,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: C.ink,
    lineHeight: 1.4,
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
  divider: { borderBottomWidth: 1, borderBottomColor: C.line, marginVertical: 12 },
  title: { fontSize: 18, fontFamily: "Helvetica-Bold" },
  sub: { fontSize: 10, color: C.muted, marginTop: 2 },

  verdictBox: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: C.line,
    borderLeftWidth: 4,
    borderRadius: 6,
    padding: 12,
  },
  eyebrow: {
    fontSize: 8,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  verdictWord: { fontSize: 20, fontFamily: "Helvetica-Bold", marginTop: 3 },
  verdictSub: { fontSize: 10, color: C.muted, marginTop: 1 },
  verdictReason: { marginTop: 6, fontSize: 10, color: C.ink },

  section: { marginTop: 16 },
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
    marginBottom: 9,
  },
  termLabel: { fontSize: 7.5, color: C.muted, textTransform: "uppercase" },
  termValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 1 },
  verify: { fontSize: 7, color: C.caution },

  row: { flexDirection: "row", marginBottom: 5 },
  bullet: { width: 10, color: C.muted },
  itemText: { flex: 1, fontSize: 9.5 },

  challenge: { marginBottom: 8 },
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
          </View>
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

        {data.topRisks.length > 0 && (
          <Section title="Top risks">
            {data.topRisks.map((r, i) => (
              <View key={i} style={s.row}>
                <Text style={s.bullet}>•</Text>
                <Text style={s.itemText}>{r}</Text>
              </View>
            ))}
          </Section>
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
