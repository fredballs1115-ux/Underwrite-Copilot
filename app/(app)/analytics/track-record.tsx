import {
  ACCOUNT_VACANCY_NOTE,
  BASE_RATE_WHY,
  CALIBRATION_NOTE,
  CAPTURE_TRACK,
  DECISION_SCORES,
  PURCHASE_IS_DECISION,
  DOCUMENT_DATE_RULE,
  NOT_YET_SCORABLE,
  RECORD_FLOOR,
  RESCREEN_RULE,
  SCORED_BY,
  TAX_INSURANCE_NOT_SCORED,
  TRADE_DATE_RULE,
  baseRateLine,
  calibrationCountsLine,
  capturedAt,
  recordCountsLine,
  recordLine,
  recordState,
  scorableGrid,
  type AccountRecord,
  type KeyRecord,
} from "@/lib/track-record";
import { Key, KeyItem, Tick } from "@/app/panel-parts";
import { ScorableGrid } from "../scorable-grid";

/** A key's counts, each its marker and tone: the bar's segments over the
 *  floor, the dots under it. */
const DOTS: readonly { count: "right" | "wrong" | "screenSide" | "between" | "omSide"; mark: string; tone: string }[] = [
  { count: "right", mark: "record-right", tone: "bg-pass" },
  { count: "wrong", mark: "record-wrong", tone: "bg-kill" },
  { count: "screenSide", mark: "record-screen", tone: "bg-pass/50" },
  { count: "between", mark: "record-between", tone: "bg-muted/40" },
  { count: "omSide", mark: "record-om", tone: "bg-kill/50" },
];

/**
 * The account's track record (2026-10-19; every stress-test row since
 * 2026-10-20): what the screens' stress tests came to once later evidence
 * arrived — each row a later figure can speak to right or wrong, holds
 * included (the rest named as not yet scorable), scored in
 * lib/track-record, never claimed. Three states, each in its own words:
 * nothing scored yet (and what it will be scored against), a few rows ("a
 * start, not a record", with no shares), and enough rows to say shares,
 * each with its count. One bar a key, the right rows against the wrong on
 * the key's own scale, an older screen's challenges beside them by side,
 * every count said in words beside the bar — and under the floor a dot a
 * scored row, never a bar, since a bar of two rows is a share by another
 * name. With nothing scored, what will score what (`ScorableGrid`). A row is
 * filed under the title the deal's card prints for it. Beside right and
 * wrong, display only (the owner's decision of 2026-10-21): the base rate —
 * how many scored rows, whatever their verdict, landed past the OM's figure
 * on the buyer's bad side, a share only from the floor — and where each
 * flagged row's later figure landed between the OM's figure and the
 * evidence's, a tick a row on one track, counted in words. Pure.
 */
export function TrackRecordSection({ record }: { record: AccountRecord }) {
  const state = recordState(record);
  const total = (k: KeyRecord) => k.right + k.wrong + k.screenSide + k.omSide + k.between;
  const widest = Math.max(1, ...record.byKey.map(total));
  const anyChallenges = record.challenges.scored > 0;
  const baseRate = baseRateLine(record);
  const calibration = calibrationCountsLine(record.capturedCounts);
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm" data-qa="track-record">
      <h2 className="text-sm font-semibold tracking-tight">Track record</h2>
      <p className="mt-0.5 text-xs text-muted" data-qa="track-record-counts">
        {recordCountsLine(record)}
      </p>
      <p className="mt-2 max-w-prose text-sm leading-relaxed" data-qa="track-record-line" data-state={state}>
        {recordLine(record)}
      </p>
      {state === "none" && <ScorableGrid rows={scorableGrid()} className="mt-4" />}
      {record.byKey.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Scored rows by assumption">
          {record.byKey.map((k) => {
            const n = total(k);
            const w = (c: number) => `${Math.round((c / widest) * 100)}%`;
            const seg = (c: number) => `${(c / n) * 100}%`;
            const words = [
              k.right + k.wrong > 0 ? `${k.right} right · ${k.wrong} wrong` : null,
              k.screenSide + k.omSide + k.between > 0 ? `${k.screenSide} screen · ${k.omSide} OM${k.between > 0 ? ` · ${k.between} between` : ""}` : null,
            ].filter(Boolean);
            return (
              <li key={`${k.key}-${k.title}`} className="flex items-center gap-2 text-sm">
                <span className="w-40 shrink-0 truncate text-xs text-muted">{k.title}</span>
                {n < RECORD_FLOOR ? (
                  // Under the floor a share bar would print a share by
                  // another name: one dot a scored row, in its tone.
                  <span className="flex flex-1 items-center gap-1" aria-hidden data-qa="record-dots">
                    {DOTS.flatMap((d) => Array.from({ length: k[d.count] }, (_, i) => <span key={`${d.mark}-${i}`} data-dot={d.mark} className={`h-2.5 w-2.5 rounded-full ${d.tone}`} />))}
                  </span>
                ) : (
                  <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                    <span className="absolute inset-y-0 left-0 flex" style={{ width: w(n) }}>
                      {DOTS.map((d) => (k[d.count] > 0 ? <span key={d.mark} data-bar={d.mark} className={`h-full ${d.tone}`} style={{ width: seg(k[d.count]) }} /> : null))}
                    </span>
                  </span>
                )}
                <span className="w-44 shrink-0 text-right font-mono text-xs tabular-nums">{words.join(" | ")}</span>
              </li>
            );
          })}
        </ul>
      )}
      {baseRate && (
        <div className="mt-4" data-qa="track-record-base-rate">
          <p className="max-w-prose text-sm leading-relaxed">{baseRate}</p>
          <p className="mt-0.5 max-w-prose text-[11px] text-muted">{BASE_RATE_WHY}</p>
        </div>
      )}
      {calibration && (
        <div className="mt-4" data-qa="track-record-calibration">
          <p className="max-w-prose text-sm leading-relaxed">{calibration}</p>
          <div className="relative mt-2 h-3 max-w-md rounded-full bg-faint" aria-hidden>
            <Tick at={`${CAPTURE_TRACK.om}%`} bar="calibration-om" />
            <Tick at={`${CAPTURE_TRACK.evidence}%`} bar="calibration-evidence" tone="border-ink/50" dashed />
            {record.calibration.map((c, i) => (
              <Tick key={`${c.key}-${i}`} at={`${capturedAt(c.captured.pct).at}%`} bar="calibration-row" tone="bg-brand/70" track="secondary" />
            ))}
          </div>
          <Key>
            <KeyItem mark="tick" tone="bg-ink">
              The OM&apos;s figure
            </KeyItem>
            <KeyItem mark="dashed" tone="border-ink/50">
              The evidence&apos;s
            </KeyItem>
            <KeyItem mark="tick" tone="bg-brand/70">
              A flagged row&apos;s later figure
            </KeyItem>
          </Key>
          <p className="mt-1 max-w-prose text-[11px] text-muted">{CALIBRATION_NOTE}</p>
        </div>
      )}
      {record.byKey.length > 0 && (
        <p className="mt-2 text-[11px] text-muted">
          {`A bar a tested assumption: the stress-test rows a later figure bore out (right) and did not (wrong)${
            anyChallenges ? ", then an older screen's challenges by the side the later figure landed on" : ""
          }. Under ${RECORD_FLOOR} scored rows an assumption draws a dot a row, never a bar.`}
        </p>
      )}
      <p className="mt-2 max-w-prose text-[11px] text-muted" data-qa="track-record-scored-by">
        {`${SCORED_BY} ${DECISION_SCORES} ${PURCHASE_IS_DECISION} ${NOT_YET_SCORABLE}`}
      </p>
      <p className="mt-1 max-w-prose text-[11px] text-muted" data-qa="track-record-documents">
        {`${DOCUMENT_DATE_RULE} ${TRADE_DATE_RULE} ${TAX_INSURANCE_NOT_SCORED}`}
      </p>
      <p className="mt-1 max-w-prose text-[11px] text-muted" data-qa="track-record-rescreen">
        {RESCREEN_RULE}
      </p>
      <p className="mt-1 max-w-prose text-[11px] text-muted" data-qa="track-record-vacancy">
        {ACCOUNT_VACANCY_NOTE}
      </p>
    </section>
  );
}
