import type { LaterSource, ScorableRow } from "@/lib/track-record";
import { RESCREEN_LINE, VACANCY_MEASURE_RULE } from "@/lib/track-record-words";

/**
 * What will score what (the track record's empty state): a row a
 * stress-test assumption, a column a kind of later evidence — a T-12, a rent
 * roll, your decision, a trade — and a mark where that kind can score the
 * row under the scorer as it stands (lib/track-record `scorableGrid`, which
 * runs the scorer itself, so the grid is never written by hand), blank where
 * nothing can. Drawn while nothing has arrived: on the deal page's card once
 * the deal has a verdict, and on /analytics while no row is scored. Pure,
 * and it takes plain data: the deal page draws it inside a client component.
 */

// The columns in lib/track-record's `SCORABLE_SOURCES` order (a test holds
// the two to each other); typed by the source, so none is left out.
const COLUMNS: readonly { source: LaterSource; label: string }[] = [
  { source: "t12", label: "T-12" },
  { source: "rent_roll", label: "Rent roll" },
  { source: "outcome", label: "Decision" },
  { source: "trade", label: "Trade" },
];

export function ScorableGrid({
  rows,
  className = "mt-3",
  rescreen = true,
}: {
  rows: readonly ScorableRow[];
  className?: string;
  /** the "upload, then re-screen" line, left off where no deal can be
   *  re-screened (the public methodology page) */
  rescreen?: boolean;
}) {
  if (rows.length === 0) return null;
  // A vacancy a document can score is scored in its own measure, said under
  // the grid: a mark in the T-12's column is an economic vacancy's alone.
  const vacancy = rows.find((r) => r.key === "vacancy");
  const vacancyByDocument = !!vacancy && (vacancy.by.t12 || vacancy.by.rent_roll);
  return (
    <div className={className} data-qa="scorable-grid">
      <table className="w-full max-w-md border-collapse text-xs">
        <caption className="pb-1 text-left text-[11px] font-medium uppercase tracking-wider text-muted">What will score what</caption>
        <thead>
          <tr>
            <th scope="col" className="py-1 pr-2 text-left font-normal text-muted">
              Assumption
            </th>
            {COLUMNS.map((c) => (
              <th key={c.source} scope="col" className="w-16 px-1 py-1 text-center font-medium text-muted">
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-t border-line" data-row={r.key}>
              <th scope="row" className="py-1 pr-2 text-left font-normal">
                {r.title}
              </th>
              {COLUMNS.map((c) => (
                <td key={c.source} className="px-1 py-1 text-center" data-scores={r.by[c.source] ? c.source : undefined}>
                  {r.by[c.source] ? (
                    <>
                      <span aria-hidden className="inline-block h-2 w-2 rounded-full bg-brand" />
                      <span className="sr-only">can score it</span>
                    </>
                  ) : (
                    <span className="sr-only">nothing</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {vacancyByDocument && (
        <p className="mt-2 text-xs text-muted" data-qa="scorable-grid-vacancy">
          {VACANCY_MEASURE_RULE}
        </p>
      )}
      {rescreen && (
        <p className="mt-2 text-xs font-medium" data-qa="scorable-grid-line">
          {RESCREEN_LINE}
        </p>
      )}
    </div>
  );
}
