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
//     of the OM's figure for a dollar figure. A later figure is scored against
//     the OM's by that margin (lib/track-record), so a stretched row is right
//     only where the later figure lands past it, and a hold wrong only where
//     the later figure lands past it on the buyer's bad side;
//   - which way a figure moving is worse for the buyer is the key's own
//     (`worse`): a vacancy, an exit cap or a rate rising, an NOI, a rent
//     growth or a price (a trade under the ask) falling;
//   - a stored snapshot is read back through `readStressSnapshot`, which
//     refuses anything that is not one — a blank is null, never a hold.

import { NOI_IN_LINE_BAND } from "@/lib/actuals/in-line-band";
import { BASIS_STRETCH_PCT, SAME, SAME_SHARE } from "@/lib/stress-test";
import { STRESS_KEYS, type EvidenceKind, type StressKey, type StressTest, type StressVerdict } from "@/lib/stress-test-types";

/** The snapshot's shape version: a reader refuses one it does not know. */
export const STRESS_SNAPSHOT_V = 1;

export interface StressSnapshotEvidence {
  /** in the key's own unit (a percent as a percent, a dollar as a dollar) */
  value: number;
  /** "The deal's T-12", "Rental vacancy, metro area" */
  label: string;
  /** the day or period the figure is for, as the row carried it; null for a rule of thumb */
  asOf: string | null;
  kind: EvidenceKind;
  publisher: string;
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
   *  the OM's figure; null on a key nothing scores (insurance, other) */
  threshold: { value: number; unit: "pts" | "share" } | null;
  /** which way a figure moving is worse for the buyer */
  worse: "higher" | "lower";
}

export interface StressSnapshot {
  v: typeof STRESS_SNAPSHOT_V;
  /** the day the test's published figures were read (the test's `readOn`) */
  readOn: string;
  rows: StressSnapshotRow[];
}

/** Which way a figure moving is worse for the buyer, a key at a time. */
export const WORSE_WHEN: Record<StressKey, "higher" | "lower"> = {
  basis: "lower",
  exit_cap: "higher",
  debt: "higher",
  noi: "lower",
  vacancy: "higher",
  rent_growth: "lower",
  expense_growth: "higher",
  taxes: "higher",
  insurance: "higher",
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
      return { value: NOI_IN_LINE_BAND, unit: "share" };
    case "taxes":
    case "renovation_premium":
      return { value: SAME_SHARE, unit: "share" };
    case "basis":
      return { value: BASIS_STRETCH_PCT / 100, unit: "share" };
    default:
      return null;
  }
}

const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

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
      evidence: decider
        ? { value: decider.value as number, label: decider.label, asOf: decider.asOf ?? null, kind: decider.kind, publisher: decider.publisher }
        : null,
      per: own ? own.per : null,
      threshold: snapshotThreshold(r.key),
      worse: WORSE_WHEN[r.key],
    };
  });
  return { v: STRESS_SNAPSHOT_V, readOn: test.readOn, rows };
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
  const s = raw as { v?: unknown; readOn?: unknown; rows?: unknown };
  if (s.v !== STRESS_SNAPSHOT_V || !Array.isArray(s.rows)) return null;
  const rows: StressSnapshotRow[] = [];
  for (const x of s.rows as unknown[]) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    if (!STRESS_KEYS.includes(r.key as StressKey) || !VERDICTS.includes(r.verdict as StressVerdict) || !str(r.title)) continue;
    const key = r.key as StressKey;
    const e = r.evidence as Record<string, unknown> | null | undefined;
    const evidence =
      e && typeof e === "object" && finite(e.value) && str(e.label) && KINDS.includes(e.kind as EvidenceKind)
        ? { value: e.value, label: e.label, asOf: str(e.asOf) ? e.asOf : null, kind: e.kind as EvidenceKind, publisher: str(e.publisher) ? e.publisher : "" }
        : null;
    const t = r.threshold as { value?: unknown; unit?: unknown } | null | undefined;
    rows.push({
      key,
      title: r.title,
      verdict: r.verdict as StressVerdict,
      om: finite(r.om) ? r.om : null,
      page: finite(r.page) ? r.page : null,
      evidence,
      per: str(r.per) ? r.per : null,
      threshold: t && finite(t.value) && (t.unit === "pts" || t.unit === "share") ? { value: t.value, unit: t.unit } : null,
      worse: r.worse === "higher" || r.worse === "lower" ? r.worse : WORSE_WHEN[key],
    });
  }
  if (rows.length === 0) return null;
  return { v: STRESS_SNAPSHOT_V, readOn: str(s.readOn) ? s.readOn : "", rows };
}
