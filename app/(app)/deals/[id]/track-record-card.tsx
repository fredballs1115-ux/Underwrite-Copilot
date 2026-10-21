import type { DealRecord, Landing, ScoredRow } from "@/lib/track-record";
import { CARD_SCOPE, NOT_YET_SCORABLE, OUTCOME_WORD, TAX_INSURANCE_NOT_SCORED, dealRecordLine } from "@/lib/track-record-words";
import { ScorableGrid } from "../../scorable-grid";

/**
 * What came after the screen (the track record, 2026-10-19; every stress-test
 * row since 2026-10-20): the deal's own later evidence — a T-12 or rent roll
 * added after the verdict, the decision, a reported trade — and each row of
 * the stress test as it stood at the verdict, holds included, set against
 * it where a later figure can speak to it: right or wrong, said in words
 * (the rows nothing can score yet named, `NOT_YET_SCORABLE`). A screen whose test was not kept has
 * its challenges scored instead, by which side the later figure landed on,
 * and the card says the rows were not snapshotted. Pure: the record is
 * scored in lib/track-record and handed in as data. Where nothing has
 * arrived after the screen, a deal with a verdict draws what will score what
 * (`ScorableGrid`, the scorer's own rules on this deal) and claims nothing;
 * a deal with no verdict stamp draws nothing.
 */
export function TrackRecordCard({ record }: { record: DealRecord | null }) {
  if (!record) return null;
  // Nothing arrived after the screen (and nothing uploaded after it was
  // refused for its own date): what will score what, once there is a
  // verdict to score against.
  if (record.evidence.length === 0 && !record.refusedLater) {
    if (!record.screenedAt || !record.scorable?.length) return null;
    return (
      <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm" data-qa="track-record" data-state="waiting">
        <h2 className="text-sm font-semibold tracking-tight">What came after the screen</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted">
          {record.screenedOn ? `Screened ${record.screenedOn}. Nothing has arrived since, so no row is scored yet.` : "Nothing has arrived since the screen, so no row is scored yet."}
        </p>
        <ScorableGrid rows={record.scorable} />
        {record.notScored.length > 0 && (
          <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted" data-qa="track-record-not-scored">
            {record.notScored.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}
      </section>
    );
  }
  const scored = record.rows.filter((r) => r.landing !== "unscored");
  const unscored = record.rows.filter((r) => r.landing === "unscored");
  const taxOrInsurance = record.rows.some((r) => r.key === "taxes" || r.key === "insurance");
  const summary = dealRecordLine(record);
  const allTest = record.rows.length > 0 && record.rows.every((r) => r.fromTest);
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm" data-qa="track-record">
      <h2 className="text-sm font-semibold tracking-tight">What came after the screen</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">
        {record.screenedOn ? `Screened ${record.screenedOn}. ` : ""}
        {CARD_SCOPE}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-muted" data-qa="track-record-not-scorable">
        {NOT_YET_SCORABLE}
      </p>
      {(record.snapshotNotes ?? []).map((line) => (
        <p key={line} className="mt-1 text-xs leading-relaxed text-muted" data-qa="track-record-not-snapshotted">
          {line}
        </p>
      ))}
      {taxOrInsurance && (
        <p className="mt-1 text-xs leading-relaxed text-muted" data-qa="track-record-tax-insurance">
          {TAX_INSURANCE_NOT_SCORED}
        </p>
      )}
      {record.evidence.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-muted" data-qa="track-record-evidence">
          {record.evidence.map((e) => (
            <li key={`${e.source}-${e.at}`} className="flex gap-2">
              <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
              <span>{e.label}</span>
            </li>
          ))}
        </ul>
      )}

      {summary && (
        <p className="mt-3 text-sm leading-relaxed" data-qa="track-record-summary">
          {summary}
        </p>
      )}

      {scored.length > 0 ? (
        <ul className="mt-4 space-y-3" data-qa="track-record-rows">
          {scored.map((r, i) => (
            <RowView key={`${r.key}-${i}`} row={r} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm leading-relaxed" data-qa="track-record-none">
          {allTest
            ? "Nothing that arrived speaks to a row of the stress test with a figure of its own, so no row is scored."
            : "Nothing that arrived speaks to a challenge with figures of its own, so no row is scored."}
        </p>
      )}

      {unscored.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted">
            {unscored.length} {allTest ? `row${unscored.length === 1 ? "" : "s"}` : `challenge${unscored.length === 1 ? "" : "s"}`} not scored
          </summary>
          <ul className="mt-2 space-y-1 text-xs leading-relaxed text-muted">
            {unscored.map((r, i) => (
              <li key={`${r.key}-${i}`}>{r.text}</li>
            ))}
          </ul>
        </details>
      )}

      {record.notScored.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted" data-qa="track-record-not-scored">
          {record.notScored.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Scored = Exclude<Landing, "unscored">;

const LANDING_WORD: Record<"screen_side" | "om_side" | "between", string> = {
  screen_side: "Screen's side",
  om_side: "OM's side",
  between: "Between",
};

// A decision is a direction, in no share: its badge is neutral, never the
// green or red of a figure borne out or not.
const DECISION_TONE = "border-line bg-faint text-muted";

const LANDING_TONE: Record<Scored, string> = {
  right: "border-pass/40 bg-pass/10 text-pass",
  wrong: "border-kill/40 bg-kill/10 text-kill",
  screen_side: "border-pass/40 bg-pass/10 text-pass",
  om_side: "border-kill/40 bg-kill/10 text-kill",
  between: "border-line bg-faint text-muted",
};

/** The badge's words: the outcome, a decision's direction, or a challenge's side. */
function badgeWord(row: ScoredRow): string {
  const landing = row.landing as Scored;
  if (row.fromTest && row.decision) return landing === "right" ? "A decision on the test's side" : "A decision against the hold";
  if (row.fromTest && row.outcome) return OUTCOME_WORD[row.outcome];
  if (landing === "right" || landing === "wrong") return landing === "right" ? "Right" : "Wrong";
  return LANDING_WORD[landing];
}

function RowView({ row }: { row: ScoredRow }) {
  const landing = row.landing as Scored;
  return (
    <li className="rounded-xl border border-line bg-faint p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {row.title}
          {row.fromTest && row.verdict ? <span className="ml-1.5 text-xs font-normal text-muted">{`· the test's verdict: ${row.verdict}`}</span> : null}
        </p>
        <span
          className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${row.decision ? DECISION_TONE : LANDING_TONE[landing]}`}
          data-landing={landing}
          data-outcome={row.outcome ?? undefined}
          data-decision={row.decision ? "" : undefined}
        >
          {badgeWord(row)}
        </span>
      </div>
      {row.figures && (
        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <Figure label="OM" value={row.figures.om} />
          <Figure label={row.fromTest ? "Evidence" : "Screen"} value={row.figures.alt} />
          <Figure label="Later" value={row.figures.later} />
        </dl>
      )}
      <p className="mt-2 text-xs leading-relaxed text-muted">{row.text}</p>
    </li>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[10px] font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd className="font-mono tabular-nums">{value}</dd>
    </div>
  );
}
