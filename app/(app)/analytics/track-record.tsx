import { ACCOUNT_VACANCY_NOTE, DOCUMENT_DATE_RULE, TAX_INSURANCE_NOT_SCORED, recordCountsLine, recordLine, recordState, type AccountRecord } from "@/lib/track-record";

/**
 * The account's track record (2026-10-19): what the screens' challenges
 * came to once later evidence arrived — scored in lib/track-record, never
 * claimed. Three states, each in its own words: nothing scored yet (and
 * what it will be scored against), a few rows ("a start, not a record",
 * with no shares), and enough rows to say shares. One bar a key, the
 * screen-side rows against the OM-side ones on the key's own scale. Pure.
 */
export function TrackRecordSection({ record }: { record: AccountRecord }) {
  const state = recordState(record);
  const widest = Math.max(1, ...record.byKey.map((k) => k.screenSide + k.omSide + k.between));
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm" data-qa="track-record">
      <h2 className="text-sm font-semibold tracking-tight">Track record</h2>
      <p className="mt-0.5 text-xs text-muted" data-qa="track-record-counts">
        {recordCountsLine(record)}
      </p>
      <p className="mt-2 max-w-prose text-sm leading-relaxed" data-qa="track-record-line" data-state={state}>
        {recordLine(record)}
      </p>
      {record.byKey.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Scored rows by assumption">
          {record.byKey.map((k) => {
            const n = k.screenSide + k.omSide + k.between;
            const w = (c: number) => `${Math.round((c / widest) * 100)}%`;
            return (
              <li key={k.key} className="flex items-center gap-2 text-sm">
                <span className="w-40 shrink-0 truncate text-xs text-muted">{k.title}</span>
                <span className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-line" aria-hidden>
                  <span className="absolute inset-y-0 left-0 flex" style={{ width: w(n) }}>
                    {k.screenSide > 0 && <span data-bar="record-screen" className="h-full bg-pass" style={{ width: `${(k.screenSide / n) * 100}%` }} />}
                    {k.between > 0 && <span data-bar="record-between" className="h-full bg-muted/40" style={{ width: `${(k.between / n) * 100}%` }} />}
                    {k.omSide > 0 && <span data-bar="record-om" className="h-full bg-kill" style={{ width: `${(k.omSide / n) * 100}%` }} />}
                  </span>
                </span>
                <span className="w-28 shrink-0 text-right font-mono text-xs tabular-nums">
                  {k.screenSide} screen · {k.omSide} OM{k.between > 0 ? ` · ${k.between} between` : ""}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {record.byKey.length > 0 && (
        <p className="mt-2 text-[11px] text-muted">
          {`A bar a tested assumption: the rows that landed on the screen's side, between, and on the OM's.${
            state === "start" ? " No share is printed under three scored rows." : ""
          }`}
        </p>
      )}
      <p className="mt-2 max-w-prose text-[11px] text-muted" data-qa="track-record-documents">
        {`${DOCUMENT_DATE_RULE} ${TAX_INSURANCE_NOT_SCORED}`}
      </p>
      <p className="mt-1 max-w-prose text-[11px] text-muted" data-qa="track-record-vacancy">
        {ACCOUNT_VACANCY_NOTE}
      </p>
    </section>
  );
}
