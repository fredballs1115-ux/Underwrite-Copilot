import type { DealRecord, Landing, ScoredRow } from "@/lib/track-record";

/**
 * What came after the screen (the track record, 2026-10-19): the deal's own
 * later evidence — a T-12 or rent roll added after the verdict, the
 * decision, a reported trade — and each stored challenge set against it,
 * saying which side the later figure landed on. Pure: the record is scored
 * in lib/track-record and handed in as data. Drawn only where something
 * arrived after the screen; a deal with nothing after it draws nothing,
 * since there is nothing to score and nothing to claim.
 */
export function TrackRecordCard({ record }: { record: DealRecord | null }) {
  if (!record || record.evidence.length === 0) return null;
  const scored = record.rows.filter((r) => r.landing !== "unscored");
  const unscored = record.rows.filter((r) => r.landing === "unscored");
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm" data-qa="track-record">
      <h2 className="text-sm font-semibold tracking-tight">What came after the screen</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-muted">
        {record.screenedOn ? `Screened ${record.screenedOn}. ` : ""}
        Each challenge is scored only against what arrived after the verdict — a document the screen read is not evidence of it.
      </p>
      <ul className="mt-3 space-y-1 text-xs text-muted" data-qa="track-record-evidence">
        {record.evidence.map((e) => (
          <li key={`${e.source}-${e.at}`} className="flex gap-2">
            <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
            <span>{e.label}</span>
          </li>
        ))}
      </ul>

      {scored.length > 0 ? (
        <ul className="mt-4 space-y-3" data-qa="track-record-rows">
          {scored.map((r, i) => (
            <RowView key={`${r.key}-${i}`} row={r} />
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm leading-relaxed" data-qa="track-record-none">
          Nothing that arrived speaks to a challenge with figures of its own, so no row is scored.
        </p>
      )}

      {unscored.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-medium text-muted">
            {unscored.length} challenge{unscored.length === 1 ? "" : "s"} not scored
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

const LANDING_WORD: Record<Exclude<Landing, "unscored">, string> = {
  screen_side: "Screen's side",
  om_side: "OM's side",
  between: "Between",
};

const LANDING_TONE: Record<Exclude<Landing, "unscored">, string> = {
  screen_side: "border-pass/40 bg-pass/10 text-pass",
  om_side: "border-kill/40 bg-kill/10 text-kill",
  between: "border-line bg-faint text-muted",
};

function RowView({ row }: { row: ScoredRow }) {
  const landing = row.landing as Exclude<Landing, "unscored">;
  return (
    <li className="rounded-xl border border-line bg-faint p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{row.title}</p>
        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${LANDING_TONE[landing]}`} data-landing={landing}>
          {LANDING_WORD[landing]}
        </span>
      </div>
      {row.figures && (
        <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
          <Figure label="OM" value={row.figures.om} />
          <Figure label="Screen" value={row.figures.alt} />
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
