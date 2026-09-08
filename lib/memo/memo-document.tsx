import "server-only";
import {
  Document,
  Font,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";
import type { DealRow } from "@/lib/deals";

// react-pdf hyphenates by default, and a deal's name is a proper noun: the
// sample once printed as "The Maddox at Brewery-" / "town" the moment the
// title column narrowed. A word wraps whole; only a word too long for any
// column (a URL, a run of digits) is split, in plain twelve-letter pieces.
Font.registerHyphenationCallback((word) =>
  word.length <= 24 ? [word] : (word.match(/.{1,12}/g) ?? [word]),
);
import type { BuyBoxCheck } from "@/lib/criteria";
import { pdfSafe } from "./pdf-text";
import { computeScreenDiff, type PriorScreen } from "@/lib/screen-diff";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
import { inferStrategy, planSummary } from "@/lib/deal-strategy";
import { keyTermRows } from "@/lib/key-terms";

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
// A range's confidence, in the deal page's colours (RANGE_CONF there).
const RANGE_CONF_COLOR: Record<string, string> = {
  high: C.pass,
  medium: C.caution,
  low: C.kill,
};
// Light tints for banner backgrounds — react-pdf has no alpha compositing
// against the page, so the tints are precomputed solids.
const VERDICT_TINT: Record<string, string> = {
  Go: "#e9f4ef",
  Caution: "#f8f0e3",
  "No-go": "#f9eae8",
};
// The marks are WinAnsi glyphs on purpose: standard Helvetica has no check
// mark, and a "✓" here once encoded to an undefined byte, so every passing
// criterion printed as an empty chip (the tints are indistinguishable in
// grayscale). pdf-text.ts holds the rule; the test asserts each mark
// survives it.
export const STATUS_CHIP: Record<
  "pass" | "near" | "miss" | "unknown",
  { color: string; bg: string; mark: string }
> = {
  pass: { color: C.pass, bg: "#e9f4ef", mark: "+" },
  near: { color: C.caution, bg: "#f8f0e3", mark: "±" },
  miss: { color: C.kill, bg: "#f9eae8", mark: "×" },
  unknown: { color: C.muted, bg: C.faint, mark: "—" },
};

/**
 * The deal type for the memo's subtitle — and, on a plan deal, the plan's
 * headline in one clause: the stabilized NOI over the total cost it takes to
 * earn it. A stabilized asset adds nothing (the subtitle already says what
 * the building is); an unknown strategy adds nothing rather than a guess.
 */
function strategyLineFor(extraction: ExtractionResult | null): string {
  const strategy = inferStrategy(extraction);
  if (strategy.kind === "unknown" || strategy.kind === "stabilized") return "";
  const plan = planSummary(extraction, strategy);
  const m = (n: number) =>
    n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : `$${Math.round(n).toLocaleString("en-US")}`;
  if (plan?.stabilizedNoi && plan.totalCost != null && plan.yieldOnCost != null) {
    return `${strategy.label} · stabilized NOI ${m(plan.stabilizedNoi.value)} on ${m(plan.totalCost)} total cost (${(plan.yieldOnCost * 100).toFixed(1)}% yield on cost${
      plan.costPerUnit != null ? `; ${m(plan.costPerUnit)} per planned unit all-in` : ""
    })`;
  }
  if (plan?.stabilizedNoi) return `${strategy.label} · stabilized NOI ${m(plan.stabilizedNoi.value)}`;
  return strategy.label;
}

export type MemoData = {
  name: string;
  market: string;
  assetClass: string;
  /** deal type and, for a plan deal, the plan's headline figures ("" for a
   *  stabilized asset). Optional for callers built before it existed. */
  strategyLine?: string;
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
  // Each range keeps the confidence the model gave it: a low-confidence
  // range and a high-confidence one must not read alike on the page.
  ranges: {
    label: string;
    low: string;
    base: string;
    high: string;
    source: string;
    confidence: "high" | "medium" | "low" | "";
  }[];
  dealKillers: { label: string; read: string; risk: string }[];
  sensitivity: { scenario: string; call: string; note: string }[];
  nextSteps: string[];
  // The buyer's standing criteria, checked deterministically (empty = no box set).
  buyBox: { label: string; status: "pass" | "near" | "miss" | "unknown" }[];
  // One-line retrade summary ("Caution → Go · Price −$1.8M (−2.5%) · …"), or null.
  sinceLast: string | null;
  /**
   * Submarket assumption checks the analyst dismissed, each with the reason
   * they gave (Phase 4). Overriding a check is normal. Doing it silently is
   * not — so the override travels with the memo, in the analyst's own words.
   */
  overrides: string[];
  /** Custom firm branding (Feature 6, Pro/Team) — null renders the default
   *  Underwrite Copilot identity. */
  branding: {
    firmName: string | null;
    logoDataUri: string | null;
    footerText: string | null;
  } | null;
  /** The building from above, on the cover: a JPEG or PNG data URI and its
   *  credit line (lib/memo/cover-aerial.ts). Null or absent prints the
   *  cover as it always was. */
  cover?: MemoCover | null;
};

export interface MemoCover {
  dataUri: string;
  credit: string;
}

/** Analysis output and user-shaped rows can carry surprises — numbers where
 *  strings are expected, nulls inside arrays, glyphs standard Helvetica can't
 *  encode. Every rendered value passes through here (incl. pdfSafe, same as
 *  the report's str) so no data shape can throw or mis-render mid-render. */
const str = (v: unknown): string =>
  pdfSafe(typeof v === "string" ? v : v == null ? "" : String(v));

const clamp = (v: unknown, n: number) => {
  const s = str(v);
  return s.length > n ? s.slice(0, n - 1).trimEnd() + "\u2026" : s;
};

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A range's confidence as the model gave it, or "" for anything else. */
const confidenceOf = (v: unknown): MemoData["ranges"][number]["confidence"] =>
  v === "high" || v === "medium" || v === "low" ? v : "";

/** Pull the first numeric out of a display string ("$1,495" → 1495). */
function firstNum(sv: string): number | null {
  const m = sv.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : null;
}

/** Where the base sits inside low → high, 0..1 — the deal page's positional
 *  read (a base hugging the sponsor's end is a tell); null when the three
 *  figures do not parse as one scale. */
export function basePosition(r: { low: string; base: string; high: string }): number | null {
  const lo = firstNum(r.low);
  const hi = firstNum(r.high);
  const base = firstNum(r.base);
  return lo != null && hi != null && base != null && hi > lo
    ? Math.min(1, Math.max(0, (base - lo) / (hi - lo)))
    : null;
}

// WinAnsi-only text (standard Helvetica can't encode anything else) \u2014 the
// full filter lives in pdf-text.ts (universal, unit-tested); re-exported here
// for the full report and any other document module.
export { pdfSafe };

/** Shape the stored analysis into the flat data the one-page memo renders. */
export function buildMemoData(
  deal: DealRow,
  dateStr: string,
  buyBoxChecks?: BuyBoxCheck[] | null,
  branding?: MemoData["branding"],
  overrides?: string[] | null,
  cover?: MemoCover | null,
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

  const metrics = list(extraction?.metrics) as ExtractionResult["metrics"];
  // The deal-defining rows first (price, cap or the plan's figures, units),
  // then the flagged ones — so the block never opens on four speculative
  // pro-forma figures and omits the asking price (lib/key-terms.ts).
  const keyTerms = keyTermRows(metrics, inferStrategy(extraction ?? null).kind, 8).map((m) => ({
    label: str(m.label),
    value: str(m.value),
    flagged: !!m.flagged,
  }));

  const ch = (list(challenges?.challenges) as ChallengerResult["challenges"])
    .slice()
    .sort((a, b) => (SEV_RANK[a?.severity] ?? 1) - (SEV_RANK[b?.severity] ?? 1))
    .slice(0, 3)
    .map((c) => ({
      severity: str(c?.severity),
      assumption: str(c?.assumption),
      challenge: str(c?.challenge),
    }));

  const flags: { label: string; text: string }[] = [];
  for (const f of list(comps?.redFlags)) flags.push({ label: "Comps", text: str(f) });
  for (const c of list(market?.checks) as MarketResult["checks"]) {
    if (c?.assessment === "aggressive") {
      flags.push({
        label: "Market",
        text: `${str(c.assumption)}: OM ${str(c.omSays)} vs. typical ${str(c.typicalRange)}`,
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
  const ranges = (list(screen?.ranges) as NonNullable<typeof screen>["ranges"])
    .slice(0, 4)
    .map((r) => ({
      label: clamp(r?.label, 28),
      low: str(r?.low),
      base: str(r?.base),
      high: str(r?.high),
      source: clamp(r?.source, 56),
      confidence: confidenceOf(r?.confidence),
    }));
  const dealKillers = (
    list(screen?.dealKillers) as NonNullable<typeof screen>["dealKillers"]
  )
    .slice(0, 3)
    .map((k) => ({
      label: LEVER_LABEL[k?.lever] ?? str(k?.lever),
      read: clamp(k?.read, 72),
      risk: clamp(k?.risk ?? "", 72),
    }));
  const sensitivity = (
    list(screen?.sensitivity) as NonNullable<typeof screen>["sensitivity"]
  ).map((sc) => ({
    scenario: SCENARIO_LABEL[sc?.scenario] ?? str(sc?.scenario),
    call: CALL_LABEL[sc?.call] ?? str(sc?.call),
    note: clamp(sc?.note ?? "", 90),
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
    name: str(deal.name) || "Deal",
    market: str(extraction?.market),
    assetClass: str(deal.asset_class),
    strategyLine: pdfSafe(strategyLineFor(extraction ?? null)),
    dateStr,
    verdictWord: vmeta?.word ?? null,
    verdictColor: vmeta?.color ?? C.muted,
    verdictSub: vmeta?.sub ?? "",
    verdictReason: clamp(verdict?.reason ?? "", 280),
    keyTerms: hasScreen ? keyTerms.slice(0, 4) : keyTerms,
    topRisks: list(verdict?.topRisks).map(str).slice(0, hasScreen ? 2 : 4),
    // With the screen present, the deal-killers + top risks already carry the
    // critique and the ranges carry the comp/market story — drop the two
    // overlapping sections so the memo stays one page.
    challenges: hasScreen ? [] : ch,
    flags: hasScreen ? [] : flags.slice(0, 4),
    ranges,
    dealKillers,
    sensitivity,
    nextSteps: list(verdict?.nextSteps).map(str).slice(0, hasScreen ? 2 : 4),
    buyBox: (buyBoxChecks ?? []).map((c) => ({
      label: clamp(c.label, 20),
      status: c.status,
    })),
    sinceLast,
    // The analyst's own words, clamped but never paraphrased.
    overrides: (overrides ?? []).map((o) => clamp(o, 220)).slice(0, 4),
    branding: branding ?? null,
    cover: cover ?? null,
  };
}

// Verdict-call display names, shared by the retrade line above.
const CALL_LABEL_GLOBAL: Record<string, string> = {
  pass: "Go",
  caution: "Caution",
  pass_on: "No-go",
};

const s = StyleSheet.create({
  // The footer is absolutely positioned at 28pt from the foot; the bottom
  // padding reserves its band (its rule, its line of text) so a memo that
  // cannot fit flows to a second page instead of over its own footer — the
  // sample once ended within a few points of it. The margins below were
  // trimmed to give the reservation back, so the sample still fits one page.
  page: {
    paddingTop: 26,
    paddingBottom: 46,
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
  brandLogo: { height: 22, maxWidth: 130, objectFit: "contain", marginRight: 6 },
  metaRight: { textAlign: "right", color: C.muted, fontSize: 9 },
  divider: {
    borderBottomWidth: 2,
    borderBottomColor: C.brand,
    marginTop: 8,
    marginBottom: 10,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: {
    fontSize: 19,
    fontFamily: "Helvetica-Bold",
    letterSpacing: -0.2,
    lineHeight: 1.15,
  },
  sub: { fontSize: 10, color: C.muted, marginTop: 4 },
  titleChipBox: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 11,
    marginLeft: 10,
  },
  titleChipText: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#ffffff",
  },
  // The masthead row: everything above the verdict box on the left, the
  // cover aerial (when there is one) on the right, top-aligned with the
  // brand line and shorter than the three rows it sits beside.
  masthead: { flexDirection: "row", alignItems: "flex-start" },
  // 96 wide leaves the title 414pt: a name of some forty characters still
  // sits on one line, and the memo's bottom edge — which the sample already
  // runs to within a few points of the footer — does not move.
  coverBox: { marginLeft: 12, alignItems: "flex-end" },
  cover: {
    width: 96,
    height: 54,
    borderRadius: 5,
    objectFit: "cover",
  },
  coverCredit: { fontSize: 5.5, color: C.muted, marginTop: 2 },

  verdictBox: {
    marginTop: 9,
    borderWidth: 1,
    borderColor: C.line,
    borderLeftWidth: 4,
    borderRadius: 6,
    padding: 10,
  },
  verdictHead: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  eyebrow: {
    fontSize: 8,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  verdictWord: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    marginTop: 2,
    lineHeight: 1.05,
  },
  verdictSub: { fontSize: 9.5, color: C.muted },
  verdictReason: { marginTop: 6, fontSize: 10, color: C.ink },
  sinceLast: { marginTop: 6, fontSize: 8, color: C.muted },

  buyBoxRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    marginTop: 7,
  },
  buyBoxTitle: {
    fontSize: 7.5,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginRight: 8,
  },
  buyBoxChip: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 5,
    marginBottom: 3,
    borderWidth: 0.75,
    borderRadius: 8,
    paddingVertical: 1.5,
    paddingHorizontal: 6,
  },
  buyBoxMark: { fontSize: 8, fontFamily: "Helvetica-Bold", marginRight: 3 },
  buyBoxLabel: { fontSize: 8, color: C.ink },

  section: { marginTop: 11 },
  twoCol: { flexDirection: "row", marginTop: 11, gap: 14 },
  col: { flex: 1 },
  sectionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 7,
  },
  sectionTick: {
    width: 3,
    height: 8,
    backgroundColor: C.brand,
    borderRadius: 1.5,
    marginRight: 5,
  },
  sectionTitle: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 1,
  },

  termsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 0.75,
    borderColor: C.line,
    borderRadius: 6,
    overflow: "hidden",
  },
  term: {
    width: "25%",
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRightWidth: 0.5,
    borderRightColor: C.line,
    borderBottomWidth: 0.5,
    borderBottomColor: C.line,
  },
  termLabel: { fontSize: 7, color: C.muted, textTransform: "uppercase", letterSpacing: 0.4 },
  termValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 1.5 },
  verify: { fontSize: 6.5, color: C.caution, marginTop: 1 },

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
    paddingVertical: 3.25,
    paddingHorizontal: 2,
  },
  rangeRowAlt: { backgroundColor: C.faint },
  rangeLabel: { width: "23%", fontSize: 8.5, fontFamily: "Helvetica-Bold" },
  rangeCell: { width: "10%", fontSize: 8.5, textAlign: "right", paddingRight: 6 },
  rangeConf: { width: "8%", fontSize: 7.5, textAlign: "right" },
  rangeCellBase: {
    width: "12%",
    fontSize: 8.5,
    textAlign: "right",
    paddingRight: 6,
    fontFamily: "Helvetica-Bold",
    color: C.brand,
    backgroundColor: "#e8f1ef",
    borderRadius: 3,
  },
  // Where the base sits inside the range, as the deal page and the shared
  // screen draw it: a track, the span up to the base, and a dot — in the
  // caution colour when the base hugs the optimistic end. Plain Views, so
  // nothing to decode and no height beyond the row's text.
  rangeBar: { width: "9%", paddingTop: 4, paddingRight: 8 },
  barTrack: { height: 2.5, borderRadius: 1.25, backgroundColor: C.line, position: "relative" },
  barFill: { position: "absolute", left: 0, top: 0, height: 2.5, borderRadius: 1.25, backgroundColor: "#b5cdc9" },
  barDot: { position: "absolute", top: -1.75, width: 6, height: 6, borderRadius: 3 },
  rangeSource: { width: "28%", fontSize: 7.5, color: C.muted },
  rangeHeadText: {
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // The screen: deal-killers as cards + the scenario trio
  killersRow: { flexDirection: "row", marginTop: 7, gap: 6 },
  killerCard: {
    flex: 1,
    borderWidth: 0.75,
    borderColor: C.line,
    borderLeftWidth: 3,
    borderLeftColor: C.brand,
    borderRadius: 5,
    padding: 5.5,
    backgroundColor: "#fbfcfb",
  },
  killerName: { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: C.brand },
  killerRead: { fontSize: 8, color: C.muted, marginTop: 2 },
  killerRisk: { fontSize: 7.5, color: C.kill, marginTop: 2 },
  sensBlock: { marginTop: 7 },
  sensCallRow: { flexDirection: "row", alignItems: "center", marginTop: 1.5 },
  sensDot: { width: 5, height: 5, borderRadius: 2.5, marginRight: 3 },
  sensLabel: {
    fontSize: 7,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  sensRow: {
    flexDirection: "row",
    borderWidth: 0.75,
    borderColor: C.line,
    borderRadius: 5,
    overflow: "hidden",
  },
  sensCell: {
    flex: 1,
    paddingVertical: 5,
    paddingHorizontal: 7,
    borderRightWidth: 0.5,
    borderRightColor: C.line,
  },
  sensScenario: {
    fontSize: 6.5,
    color: C.muted,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  sensCall: { fontSize: 9.5, fontFamily: "Helvetica-Bold", marginTop: 1 },
  sensNote: { fontSize: 7, color: C.muted, marginTop: 1.5 },

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
  footerLeft: { flex: 1, paddingRight: 12 },
  poweredBy: {
    position: "absolute",
    bottom: 13,
    left: 44,
    right: 44,
    fontSize: 8,
    color: "#8f9995",
    textAlign: "center",
  },
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
      <View style={s.sectionTitleRow}>
        <View style={s.sectionTick} />
        <Text style={s.sectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export function MemoDocument({ data }: { data: MemoData }) {
  return (
    <Document
      title={`${data.name} — Screening Memo`}
      author={data.branding?.firmName ?? "Underwrite Copilot"}
    >
      <MemoPage data={data} />
    </Document>
  );
}

/** The memo's single page, exported so the full report can lead with it. */
export function MemoPage({ data }: { data: MemoData }) {
  const subParts = [data.market, cap(data.assetClass), data.strategyLine ?? ""].filter(Boolean);
  const b = data.branding;
  const branded = !!(b && (b.firmName || b.logoDataUri || b.footerText));
  return (
    <Page size="LETTER" style={s.page}>
        {/* The masthead: brand and date, the rule, the title and its chip —
            and, when there is one, the cover aerial at the far right spanning
            all three rows. It borrows the height the masthead already spends,
            so a memo that fit one page without it still does. */}
        <View style={s.masthead}>
          <View style={{ flex: 1 }}>
        <View style={s.header}>
          <View style={s.brandRow}>
            {b?.logoDataUri ? (
              // react-pdf's Image has no alt concept (print canvas, not DOM)
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={b.logoDataUri} style={s.brandLogo} />
            ) : null}
            {!b?.logoDataUri && !b?.firmName ? (
              <Text style={s.badge}>UC</Text>
            ) : null}
            {b?.firmName ? (
              <Text style={s.brandText}>{pdfSafe(b.firmName)}</Text>
            ) : !b?.logoDataUri ? (
              <Text style={s.brandText}>Underwrite Copilot</Text>
            ) : null}
          </View>
          <View>
            <Text style={s.metaRight}>Deal Screening Memo</Text>
            <Text style={s.metaRight}>{data.dateStr}</Text>
          </View>
        </View>

        <View style={s.divider} />

        <View style={s.titleRow}>
          <View style={{ flex: 1 }}>
            <Text style={s.title}>{data.name}</Text>
            {subParts.length > 0 && (
              <Text style={s.sub}>{subParts.join("  ·  ")}</Text>
            )}
          </View>
          {data.verdictWord ? (
            <View
              style={[s.titleChipBox, { backgroundColor: data.verdictColor }]}
            >
              <Text style={s.titleChipText}>{data.verdictWord}</Text>
            </View>
          ) : null}
        </View>
          </View>
          {data.cover ? (
            <View style={s.coverBox}>
              {/* react-pdf's Image has no alt concept (print canvas, not DOM) */}
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image src={data.cover.dataUri} style={s.cover} />
              <Text style={s.coverCredit}>{pdfSafe(data.cover.credit)}</Text>
            </View>
          ) : null}
        </View>

        {data.verdictWord && (
          <View
            style={[
              s.verdictBox,
              {
                borderLeftColor: data.verdictColor,
                backgroundColor: VERDICT_TINT[data.verdictWord] ?? C.faint,
              },
            ]}
          >
            <View style={s.verdictHead}>
              <Text style={[s.verdictWord, { color: data.verdictColor }]}>
                {data.verdictWord}
              </Text>
              {data.verdictSub ? (
                <Text style={s.verdictSub}>{data.verdictSub}</Text>
              ) : null}
            </View>
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
            {data.buyBox.map((c, i) => {
              const chip = STATUS_CHIP[c.status] ?? STATUS_CHIP.unknown;
              return (
                <View
                  key={i}
                  style={[
                    s.buyBoxChip,
                    { borderColor: chip.color, backgroundColor: chip.bg },
                  ]}
                >
                  <Text style={[s.buyBoxMark, { color: chip.color }]}>
                    {chip.mark}
                  </Text>
                  <Text style={s.buyBoxLabel}>{c.label}</Text>
                </View>
              );
            })}
          </View>
        )}

        {data.ranges.length > 0 && (
          <Section title="The screen — ranges, not hero numbers">
            <View style={s.rangeHead}>
              <Text style={[s.rangeLabel, s.rangeHeadText]}>Assumption</Text>
              <Text style={[s.rangeCell, s.rangeHeadText]}>Low</Text>
              <Text style={[s.rangeCell, s.rangeHeadText]}>Base</Text>
              <Text style={[s.rangeCell, s.rangeHeadText]}>High</Text>
              <Text style={[s.rangeBar, s.rangeHeadText, { paddingTop: 0 }]}>In range</Text>
              <Text style={[s.rangeSource, s.rangeHeadText]}>Source</Text>
              <Text style={[s.rangeConf, s.rangeHeadText]}>Conf.</Text>
            </View>
            {data.ranges.map((r, i) => {
              const pos = basePosition(r);
              // The track is the column less its right padding (9% of the
              // 524pt row is 47pt); the dot is centred on the base's point.
              const track = 39;
              return (
                <View
                  key={i}
                  style={i % 2 === 1 ? [s.rangeRow, s.rangeRowAlt] : s.rangeRow}
                >
                  <Text style={s.rangeLabel}>{r.label}</Text>
                  <Text style={s.rangeCell}>{r.low}</Text>
                  <Text style={s.rangeCellBase}>{r.base}</Text>
                  <Text style={s.rangeCell}>{r.high}</Text>
                  <View style={s.rangeBar}>
                    {pos != null ? (
                      <View style={[s.barTrack, { width: track }]}>
                        <View style={[s.barFill, { width: pos * track }]} />
                        <View
                          style={[
                            s.barDot,
                            {
                              left: pos * track - 3,
                              backgroundColor: pos > 0.7 ? C.caution : C.brand,
                            },
                          ]}
                        />
                      </View>
                    ) : null}
                  </View>
                  <Text style={s.rangeSource}>{r.source}</Text>
                  <Text style={[s.rangeConf, { color: RANGE_CONF_COLOR[r.confidence] ?? C.muted }]}>
                    {r.confidence}
                  </Text>
                </View>
              );
            })}

            {data.dealKillers.length > 0 && (
              <View style={s.killersRow}>
                {data.dealKillers.map((k, i) => (
                  <View key={i} style={s.killerCard}>
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
                <View style={s.sensRow}>
                  {data.sensitivity.map((sc, i) => (
                    <View key={i} style={s.sensCell}>
                      <Text style={s.sensScenario}>{sc.scenario}</Text>
                      {/* The call's dot, as the deal page's flip strip and
                          the shared screen draw it; the word still carries
                          the meaning on a grayscale print. */}
                      <View style={s.sensCallRow}>
                        <View
                          style={[s.sensDot, { backgroundColor: CALL_COLOR[sc.call] ?? C.ink }]}
                        />
                        <Text
                          style={[
                            s.sensCall,
                            { color: CALL_COLOR[sc.call] ?? C.ink, marginTop: 0 },
                          ]}
                        >
                          {sc.call}
                        </Text>
                      </View>
                      {sc.note ? <Text style={s.sensNote}>{sc.note}</Text> : null}
                    </View>
                  ))}
                </View>
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

        {data.overrides.length > 0 && (
          <Section title="Submarket checks overridden">
            {data.overrides.map((o, i) => (
              <View key={i} style={s.flagRow}>
                <Text style={s.flagTag}>Override</Text>
                <Text style={s.itemText}>{o}</Text>
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
          <View style={s.footerLeft}>
            {b?.footerText ? (
              <Text style={s.footerText}>{pdfSafe(b.footerText)}</Text>
            ) : null}
            <Text style={s.footerText}>
              First-pass screen, not investment advice. Verify flagged figures
              against source documents.
            </Text>
          </View>
          <Text style={s.footerText}>
            {b?.firmName ? pdfSafe(b.firmName) : "Underwrite Copilot"}
          </Text>
        </View>
        {branded ? (
          <Text style={s.poweredBy} fixed>
            Powered by Underwrite Copilot
          </Text>
        ) : null}
      </Page>
  );
}

function cap(str: string): string {
  return str ? str.charAt(0).toUpperCase() + str.slice(1) : str;
}
