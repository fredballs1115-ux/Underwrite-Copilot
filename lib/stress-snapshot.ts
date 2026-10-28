// The stress test as it stood at the verdict (2026-10-20, the owner's
// decision): the track record scores every stress-test ROW — the code's
// verdict and its evidence figure, holds included — so the rows are kept
// with the verdict they were struck for, in the verdict's own jsonb
// (`VerdictResult.stressSnapshot`, no migration), and ride into
// deals.prior_screen with it on a re-screen. Every surface rebuilds the test
// on read for TODAY's figures; this keeps what the call was reached on, so a
// later figure is scored against the test the screen made, never a rebuilt
// one. Pure.
//
// Its rules:
//   - one row a stress row, in the test's order, with the code's verdict,
//     the OM's figure and its validated page, and the ONE piece of evidence
//     that decided it — the row's own `decidedBy` (lib/stress-deciders, the
//     one figure its verdict was struck on), else, on a row built before that
//     field, the figure its re-run swapped in, else the first piece with a
//     figure;
//   - a piece judged on a yardstick of its own (a basis row's per-SF piece
//     beside a per-unit OM figure) is kept on that yardstick, the OM's figure
//     with it, so the two figures kept are always on one yardstick;
//   - the margin the row's own rule reads as "at" the evidence is kept beside
//     it (`threshold`), in the key's own terms: points for a percent, a share
//     of the OM's figure for a dollar figure — the verdict's ACTUAL tolerance
//     (`rowThreshold`): the survey's margin of error where a survey's figure
//     decided a vacancy (lib/stress-test's vacancy judge reads it off the
//     figure's own text, "6.2% ±2.2 pts", and holds a 6.0% inside it), else
//     the key's own (`snapshotThreshold`); a vacancy's never finer than one
//     door's share of the units the OM states (`doorShare`: 0.40 points on
//     248 units), the smallest move a vacancy can make, so a held 6.0% is
//     never a false hold at 6.1% (the second review, 2026-10-28). A later
//     figure is scored against the OM's by that margin (lib/track-record), so
//     a stretched row is right only where the later figure lands past it, and
//     a hold wrong only where the later figure lands past it on the buyer's
//     bad side;
//   - which way a figure moving is worse for the buyer is the key's own
//     (`worse`): a vacancy, an exit cap or a rate rising, an NOI, a rent
//     growth or a price (a trade under the ask) falling;
//   - a stored snapshot is read back through `readStressSnapshot`, which
//     refuses anything that is not one — a blank is null, never a hold;
//   - since 2026-10-28 (lib/stress-drift, what moved since the call) the
//     snapshot is version 2: it is stamped with the rules its verdicts were
//     struck by (`rules`, lib/stress-test-types `STRESS_RULES_V`), a row
//     whose evidence is its own `decidedBy` piece says so (`decided`), the
//     piece keeps its period as the panel said it (`period`), and the
//     headline's two cases are kept (`headline`). A version-1 snapshot,
//     kept before, reads without them and carries no rules version, so the
//     drift sets none of it against today's.

import { NOI_IN_LINE_BAND } from "@/lib/actuals/in-line-band";
import { BASIS_STRETCH_PCT, SAME, SAME_SHARE } from "@/lib/stress-test";
import { STRESS_KEYS, STRESS_RULES_V, type EvidenceKind, type StressKey, type StressTest, type StressVerdict } from "@/lib/stress-test-types";
import { evidencePeriod, liveHeadline } from "@/lib/stress-test-words";

/** The snapshot's shape version: a reader refuses one it does not know. 2
 *  (2026-10-28) carries the rules version, each row's `decided` and its
 *  piece's period, and the headline; 1 carries none of them. */
export const STRESS_SNAPSHOT_V = 2;
const READ_VERSIONS: readonly number[] = [1, 2];

export interface StressSnapshotEvidence {
  /** in the key's own unit (a percent as a percent, a dollar as a dollar) */
  value: number;
  /** "The deal's T-12", "Rental vacancy, metro area" */
  label: string;
  /** the day or period the figure is for, as the row carried it; null for a rule of thumb */
  asOf: string | null;
  kind: EvidenceKind;
  publisher: string;
  /** the period the figure is for, said by its own cadence as the panel
   *  said it at the call (lib/stress-test-words `evidencePeriod`: "Aug
   *  2026", "Q2 2026"); absent with no date, and on a snapshot kept before
   *  it was carried */
  period?: string;
}

export interface StressSnapshotRow {
  key: StressKey;
  /** the row's own title ("Occupancy today", "Exit cap") */
  title: string;
  verdict: StressVerdict;
  /** the OM's figure on the evidence's yardstick, null where the OM states none */
  om: number | null;
  /** the OM's page, validated against the deck (lib/facts), else null */
  page: number | null;
  /** the evidence that decided the row; null on an unchecked row */
  evidence: StressSnapshotEvidence | null;
  /** the yardstick's word where the evidence was judged on one of its own ("/SF") */
  per: string | null;
  /** inside this of the OM's figure, a figure is AT it: points, or a share of
   *  the OM's figure; null on a key nothing scores (insurance, other). On a
   *  vacancy whose margin is one door's share of the units the OM states,
   *  `doors` is that count, so every surface says the doors beside the
   *  points */
  threshold: { value: number; unit: "pts" | "share"; doors?: number } | null;
  /** which way a figure moving is worse for the buyer */
  worse: "higher" | "lower";
  /** what the row's re-run measured at the verdict: the derived model's
   *  levered IRR, or — on a plan deal — the plan's yield on total cost
   *  (lib/stress-test-types `StressImpact.measure`); null where the row
   *  carried none. Absent on a snapshot kept before it was carried, read as
   *  unknown, never as a levered IRR */
  rerun?: "levered_irr" | "yield_on_cost" | null;
  /** "economic" where the OM's figure is an economic vacancy (dollars over
   *  gross potential rent), which only a T-12 of the same measure can score;
   *  absent, a figure counted by doors (lib/stress-test-types
   *  `StressRow.measure`) */
  measure?: "economic";
  /** on the operating-expense row, the lines its figures leave out (the
   *  taxes and the insurance where the OM stated each), so a later T-12 is
   *  scored on the same footing (lib/stress-test-types `StressRow.footing`);
   *  absent elsewhere, and on a row kept before it was carried */
  less?: ("taxes" | "insurance")[];
  /** true where `evidence` is the row's own deciding piece (`decidedBy`,
   *  lib/stress-deciders), the one figure its verdict was struck on; absent
   *  where it was a fallback, and on a snapshot kept before it was carried —
   *  such a row's figure is never set against a later one (lib/stress-drift) */
  decided?: true;
}

/** The headline's two cases at the call, in percent: the levered IRR, or on a
 *  plan deal the yield on total cost; null where that case did not solve. */
export interface StressSnapshotHeadline {
  measure: "levered_irr" | "yield_on_cost";
  om: number | null;
  evidence: number | null;
}

export interface StressSnapshot {
  /** the shape version it was kept under (`STRESS_SNAPSHOT_V` today) */
  v: 1 | 2;
  /** the rules its verdicts were struck by (lib/stress-test-types
   *  `STRESS_RULES_V`); absent on a version-1 snapshot, kept before it was
   *  stamped, whose rules are unknown */
  rules?: number;
  /** the day the test's published figures were read (the test's `readOn`) */
  readOn: string;
  rows: StressSnapshotRow[];
  /** the headline as it stood at the call; absent where the test struck none
   *  (or its re-runs were withheld), and on a snapshot kept before it was
   *  carried */
  headline?: StressSnapshotHeadline;
}

/** Which way a figure moving is worse for the buyer, a key at a time. */
export const WORSE_WHEN: Record<StressKey, "higher" | "lower"> = {
  basis: "lower",
  exit_cap: "higher",
  debt: "higher",
  noi: "lower",
  vacancy: "higher",
  rent_growth: "lower",
  market_rent: "lower",
  expense_growth: "higher",
  taxes: "higher",
  insurance: "higher",
  opex: "higher",
  renovation_premium: "lower",
  other: "higher",
};

/**
 * The margin inside which the row's own rule (lib/stress-test) reads the OM's
 * figure as at the evidence, in the key's own terms: a percent key's `SAME`
 * (0.05 pts); the NOI's in-line band (5%); a tax bill's and a premium's
 * `SAME_SHARE` (2%); a basis's stretch line (5% over). Insurance and the
 * challenger's other points carry none: no figure decides them.
 */
export function snapshotThreshold(key: StressKey): StressSnapshotRow["threshold"] {
  switch (key) {
    case "vacancy":
    case "rent_growth":
    case "expense_growth":
    case "exit_cap":
    case "debt":
      return { value: SAME, unit: "pts" };
    case "noi":
    case "opex":
      return { value: NOI_IN_LINE_BAND, unit: "share" };
    case "taxes":
    case "renovation_premium":
      return { value: SAME_SHARE, unit: "share" };
    case "basis":
    case "market_rent":
      return { value: BASIS_STRETCH_PCT / 100, unit: "share" };
    default:
      return null;
  }
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** A survey's margin of error, read off its figure's own text ("6.2% ±2.2
 *  pts (Q2 2026)") exactly as lib/stress-test's vacancy judge reads it
 *  (`moeOf`); null where the text states none. */
function marginOfError(text: string): number | null {
  const m = text.match(/±\s*(\d+(?:\.\d+)?)\s*pts?/);
  return m && finite(Number(m[1])) ? Number(m[1]) : null;
}

/** One door's share of a count of units, in points: the smallest move a
 *  vacancy counted by doors can make (one door empty or let), and in dollars
 *  the smallest economic one (one door's rent of the gross potential rent).
 *  Null where no whole count of one or more is stated. */
export function doorShare(doors: number | null | undefined): number | null {
  return doors != null && Number.isInteger(doors) && doors >= 1 ? 100 / doors : null;
}

/**
 * The tolerance the row's own verdict was struck by, kept so a later figure
 * is scored by the margin the verdict drew, never a stricter one. On a
 * vacancy decided by a published figure that states its margin of error
 * (the Census survey's metro figure), the verdict held the OM's figure
 * anywhere inside that margin (lib/stress-test `judge`'s tolerance), so the
 * margin is the row's; on every other row, the key's own
 * (`snapshotThreshold`) — the judges of the rent growth, the expense growth,
 * the exit cap and the debt strike at `SAME`, the NOI, the basis, a tax bill
 * and a premium at their own lines. A vacancy's margin is never finer than
 * one door's share of the units the OM states (`doors`, the row's own count;
 * in doors or in dollars alike): a 0.05-point margin on 248 units is a
 * tenth of one door, so a held 6.0% read a false hold at 6.1%.
 */
export function rowThreshold(key: StressKey, decider: { kind: EvidenceKind; text: string } | null, doors?: number | null): StressSnapshotRow["threshold"] {
  const base: StressSnapshotRow["threshold"] =
    key === "vacancy" && decider?.kind === "published" && marginOfError(decider.text) != null
      ? { value: marginOfError(decider.text)!, unit: "pts" }
      : snapshotThreshold(key);
  const door = key === "vacancy" ? doorShare(doors) : null;
  if (base && base.unit === "pts" && door != null && door > base.value + 1e-9) return { value: door, unit: "pts", doors: doors! };
  return base;
}

/** The stress test as it stood at the verdict; null with no test or no rows. */
export function stressSnapshotOf(test: StressTest | null | undefined): StressSnapshot | null {
  if (!test || test.rows.length === 0) return null;
  const rows = test.rows.map((r): StressSnapshotRow => {
    const picked =
      r.verdict === "unchecked"
        ? null
        : r.decidedBy != null
          ? r.evidence[r.decidedBy]
          : r.impact
            ? r.evidence[r.impact.evidenceIndex]
            : r.evidence.find((e) => e.value != null);
    const decider = picked && finite(picked.value) ? picked : null;
    const own = decider?.ownYardstick && finite(decider.ownYardstick.om) ? decider.ownYardstick : null;
    const om = own ? own.om : finite(r.omSays.value) ? r.omSays.value : null;
    return {
      key: r.key,
      title: r.title,
      verdict: r.verdict,
      om,
      page: finite(r.omSays.page) ? r.omSays.page : null,
      evidence: decider ? keptEvidence(decider) : null,
      // A market rent's yardstick, "/mo" or "/SF", so a later rent roll is
      // read on the same one.
      per: own ? own.per : (r.yardstick ?? null),
      threshold: rowThreshold(r.key, decider, r.doors),
      worse: WORSE_WHEN[r.key],
      rerun: r.impact ? (r.impact.measure === "yield_on_cost" ? "yield_on_cost" : "levered_irr") : null,
      ...(r.measure === "economic" ? { measure: "economic" as const } : {}),
      ...(r.footing ? { less: [...r.footing.less] } : {}),
      ...(decider && r.decidedBy != null && picked === r.evidence[r.decidedBy] ? { decided: true as const } : {}),
    };
  });
  const h = liveHeadline(test);
  const headline: StressSnapshotHeadline | null = h
    ? h.measure === "yield_on_cost"
      ? { measure: "yield_on_cost", om: finiteOrNull(h.omYocPct), evidence: finiteOrNull(h.evidenceYocPct) }
      : { measure: "levered_irr", om: finiteOrNull(h.omIrrPct), evidence: finiteOrNull(h.evidenceIrrPct) }
    : null;
  return { v: STRESS_SNAPSHOT_V, rules: STRESS_RULES_V, readOn: test.readOn, rows, ...(headline ? { headline } : {}) };
}

const finiteOrNull = (n: unknown): number | null => (finite(n) ? n : null);

/** The deciding piece as kept: its figure, whose it is, and its period as the
 *  panel said it. */
function keptEvidence(e: StressTest["rows"][number]["evidence"][number]): StressSnapshotEvidence {
  const period = evidencePeriod(e)?.said;
  return {
    value: e.value as number,
    label: e.label,
    asOf: e.asOf ?? null,
    kind: e.kind,
    publisher: e.publisher,
    ...(period ? { period } : {}),
  };
}

const VERDICTS: readonly StressVerdict[] = ["holds", "stretched", "unsupported", "unchecked"];
const KINDS: readonly EvidenceKind[] = ["published", "document", "rule_of_thumb", "om_internal"];
const str = (v: unknown): v is string => typeof v === "string";

/**
 * A stored snapshot read back (the verdict's `stressSnapshot`, or the prior
 * screen's), or null where there is none or what is stored is not one. A row
 * that does not read is dropped, never guessed at.
 */
export function readStressSnapshot(raw: unknown): StressSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as { v?: unknown; rules?: unknown; readOn?: unknown; rows?: unknown };
  if (typeof s.v !== "number" || !READ_VERSIONS.includes(s.v) || !Array.isArray(s.rows)) return null;
  const v = s.v as 1 | 2;
  const rows: StressSnapshotRow[] = [];
  for (const x of s.rows as unknown[]) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    if (!STRESS_KEYS.includes(r.key as StressKey) || !VERDICTS.includes(r.verdict as StressVerdict) || !str(r.title)) continue;
    const key = r.key as StressKey;
    const e = r.evidence as Record<string, unknown> | null | undefined;
    const evidence =
      e && typeof e === "object" && finite(e.value) && str(e.label) && KINDS.includes(e.kind as EvidenceKind)
        ? {
            value: e.value,
            label: e.label,
            asOf: str(e.asOf) ? e.asOf : null,
            kind: e.kind as EvidenceKind,
            publisher: str(e.publisher) ? e.publisher : "",
            ...(str(e.period) && e.period ? { period: e.period } : {}),
          }
        : null;
    const t = r.threshold as { value?: unknown; unit?: unknown; doors?: unknown } | null | undefined;
    rows.push({
      key,
      title: r.title,
      verdict: r.verdict as StressVerdict,
      om: finite(r.om) ? r.om : null,
      page: finite(r.page) ? r.page : null,
      evidence,
      per: str(r.per) ? r.per : null,
      threshold:
        t && finite(t.value) && (t.unit === "pts" || t.unit === "share")
          ? { value: t.value, unit: t.unit, ...(t.unit === "pts" && finite(t.doors) && doorShare(t.doors) != null ? { doors: t.doors } : {}) }
          : null,
      worse: r.worse === "higher" || r.worse === "lower" ? r.worse : WORSE_WHEN[key],
      // Kept only as one of its two words or a stored null; anything else,
      // or a snapshot kept before it was carried, is left absent (unknown).
      ...(r.rerun === "levered_irr" || r.rerun === "yield_on_cost" || r.rerun === null ? { rerun: r.rerun } : {}),
      ...(r.measure === "economic" ? { measure: "economic" as const } : {}),
      ...(Array.isArray(r.less) ? { less: (r.less as unknown[]).filter((x): x is "taxes" | "insurance" => x === "taxes" || x === "insurance") } : {}),
      // Carried from version 2 on: a version-1 row's mark is not one.
      ...(v >= 2 && r.decided === true && evidence ? { decided: true as const } : {}),
    });
  }
  if (rows.length === 0) return null;
  const h = (raw as { headline?: unknown }).headline as Record<string, unknown> | null | undefined;
  const headline: StressSnapshotHeadline | null =
    h && typeof h === "object" && (h.measure === "levered_irr" || h.measure === "yield_on_cost")
      ? { measure: h.measure, om: finiteOrNull(h.om), evidence: finiteOrNull(h.evidence) }
      : null;
  const rules = v >= 2 && finite(s.rules) && Number.isInteger(s.rules) ? s.rules : null;
  return { v, ...(rules != null ? { rules } : {}), readOn: str(s.readOn) ? s.readOn : "", rows, ...(v >= 2 && headline ? { headline } : {}) };
}

/** The deal-killer card's label where the call cites the engine's figures. */
export const BREAKS_IF = "Breaks if:";
/** The same card's label where it may not: the verdict step's own words,
 *  which can carry a return it estimated rather than one the engine ran. */
export const BREAKS_IF_ESTIMATE = "Breaks if (the screen's estimate):";

/**
 * Whether the call was reached on the engine's own re-runs: the snapshot
 * its verdict kept has a row past its evidence (stretched or unsupported)
 * that carried a re-run — the rows the verdict's brief cites by figure
 * (lib/anthropic/pipeline `screenStressTest`; a row that holds or is
 * unchecked draws none). A verdict saved before the stress test, a snapshot
 * kept before `rerun` was carried, or one whose rows re-ran nothing, is not.
 */
export function callCitesEngine(stored: unknown): boolean {
  const snapshot = readStressSnapshot(stored);
  return !!snapshot && snapshot.rows.some((r) => r.rerun != null && (r.verdict === "stretched" || r.verdict === "unsupported"));
}

/**
 * The deal-killer card's label, on the memo, the report's "The call, in
 * full" and the shared screen alike: "Breaks if:" only where the call cites
 * the engine's figures (`callCitesEngine` on the verdict's `stressSnapshot`),
 * else "Breaks if (the screen's estimate):". The sample's call is written by
 * hand on its own stress test (lib/sample-figures.test.ts holds its exit
 * card to the engine's re-run), so `sample` is read as citing it.
 */
export function breaksIfLabel(stored: unknown, sample = false): string {
  return sample || callCitesEngine(stored) ? BREAKS_IF : BREAKS_IF_ESTIMATE;
}
