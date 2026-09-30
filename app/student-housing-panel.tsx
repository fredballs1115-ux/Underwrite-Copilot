import type { StudentHousingRead } from "@/lib/student-housing";

/**
 * A student building (#468) — the pure panel for `lib/student-housing`,
 * drawn by the deal page and the shared screen. Nothing on anything else.
 *
 * Two pictures, each with its words beside it so nothing rides on colour:
 *
 *   - THE PRE-LEASING: the share leased for the coming term on a track to
 *     100%, last year's share at the same point as a tick, and — on the
 *     deal page, which has the model — the occupancy the model runs at as a
 *     dashed line, so the beds still to sign are the gap between them.
 *   - THE TILES: the beds and a unit's, the price and the rent by the bed,
 *     the walk to campus, the parents' guarantees.
 *
 * The sentences are the reader's own (`sentences`) and the model's read
 * (`studentModelLine`, `meta.student.read`), so the page, the workbook and
 * the report say the same thing.
 */

const pct1 = (n: number) => `${Math.round(n * 10) / 10}%`;
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const clamp = (n: number) => `${Math.max(0, Math.min(100, n))}%`;

type Tone = "pass" | "caution" | "neutral";
const TONE: Record<Tone, string> = {
  pass: "border-pass/30 bg-pass/5 text-pass",
  caution: "border-caution/40 bg-caution/5 text-caution",
  neutral: "border-line bg-surface text-ink",
};

export function StudentHousingPanel({
  student,
  modelLine = "",
  modelOccupancyPct = null,
}: {
  student: StudentHousingRead | null;
  modelLine?: string;
  /** the occupancy the model runs at (100 less its vacancy), where the page
   *  has a model */
  modelOccupancyPct?: number | null;
}) {
  if (!student) return null;
  const r = student;
  const behind = r.pacePts != null && r.pacePts < 0;
  const short = r.preLeasedPct != null && modelOccupancyPct != null && r.preLeasedPct < modelOccupancyPct;
  const flagged = behind || short || r.walk?.pedestrian === false;

  const tiles: { key: string; label: string; value: string; sub: string; tone: Tone }[] = [];
  if (r.beds != null) {
    tiles.push({
      key: "beds",
      label: "Beds",
      value: r.beds.toLocaleString("en-US"),
      sub: r.units != null && r.units > 0 ? `${Math.round((r.beds / r.units) * 10) / 10} a unit` : "Leased by the bed",
      tone: "neutral",
    });
  }
  if (r.pricePerBed != null) tiles.push({ key: "price-bed", label: "Price a bed", value: usd(r.pricePerBed), sub: "At the asking price", tone: "neutral" });
  if (r.rentPerBed != null) tiles.push({ key: "rent-bed", label: "Rent a bed", value: usd(r.rentPerBed), sub: "A month, as stated", tone: "neutral" });
  if (r.walk) {
    tiles.push({
      key: "walk",
      label: "To campus",
      value: r.walk.pedestrian === true ? "Pedestrian" : r.walk.pedestrian === false ? "Drive-to" : "As stated",
      sub: r.walk.stated,
      tone: r.walk.pedestrian === true ? "pass" : r.walk.pedestrian === false ? "caution" : "neutral",
    });
  }
  if (r.guaranteesPct != null) tiles.push({ key: "guarantees", label: "Guaranteed", value: pct1(r.guaranteesPct), sub: "Of leases, by a parent", tone: "neutral" });

  return (
    <section
      aria-label="Student housing"
      data-qa="student-housing-panel"
      className={`mt-4 rounded-xl border border-l-4 px-4 py-3 ${flagged ? "border-caution/30 border-l-caution bg-caution/5" : "border-line border-l-pass bg-surface"}`}
    >
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className={`text-[11px] font-semibold uppercase tracking-wider ${flagged ? "text-caution" : "text-pass"}`}>Student housing</span>
        <span className="text-sm font-semibold">
          {r.preLeasedPct != null ? `Pre-leased ${pct1(r.preLeasedPct)}${r.term ? ` for ${r.term}` : ""}` : "Leased by the bed"}
        </span>
        {r.page && <span className="font-mono text-[10px] text-muted">{r.page}</span>}
      </p>

      {r.preLeasedPct != null && (
        <div className="mt-2 text-[11px]" data-qa="student-prelease">
          <div className="relative h-3 rounded-full bg-faint" aria-hidden>
            <div className={`h-full rounded-full ${behind || short ? "bg-caution/60" : "bg-pass/60"}`} data-bar="prelease" style={{ width: clamp(r.preLeasedPct) }} />
            {r.priorPct != null && (
              <div className="absolute -inset-y-1 w-0.5 rounded-full bg-ink" data-bar="prelease-prior" style={{ left: clamp(r.priorPct) }} />
            )}
            {modelOccupancyPct != null && (
              <div className="absolute -inset-y-1 border-l-2 border-dashed border-brand" data-bar="prelease-model" style={{ left: clamp(modelOccupancyPct) }} />
            )}
          </div>
          <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-muted">
            <li>{`${pct1(r.preLeasedPct)} signed${r.term ? ` for ${r.term}` : ""}`}</li>
            {r.priorPct != null && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-0.5 shrink-0 bg-ink" />
                {`Last year at this point: ${pct1(r.priorPct)}${r.pacePts != null ? ` (${r.pacePts >= 0 ? "+" : "−"}${Math.round(Math.abs(r.pacePts) * 10) / 10} pts)` : ""}`}
              </li>
            )}
            {modelOccupancyPct != null && (
              <li className="flex items-center gap-1.5">
                <span aria-hidden className="inline-block h-2.5 w-0 shrink-0 border-l-2 border-dashed border-brand" />
                {`The model runs at ${pct1(modelOccupancyPct)}`}
              </li>
            )}
          </ul>
        </div>
      )}

      {tiles.length > 0 && (
        <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5" data-qa="student-tiles">
          {tiles.map((t) => (
            <li key={t.key} className={`rounded-lg border px-2.5 py-2 ${TONE[t.tone]}`} data-student={t.key}>
              <span className="block text-[10px] font-semibold uppercase tracking-wider opacity-80">{t.label}</span>
              <span className="block text-sm font-semibold leading-tight">{t.value}</span>
              <span className="block text-[11px] leading-snug text-muted">{t.sub}</span>
            </li>
          ))}
        </ul>
      )}

      {r.sentences.length > 0 && <p className="mt-2 text-sm leading-relaxed">{r.sentences[0]}</p>}
      {r.sentences.length > 1 && (
        <details className="group mt-1 text-sm leading-relaxed">
          <summary className="cursor-pointer text-xs font-semibold text-brand hover:underline">
            <span className="group-open:hidden">{`Read the rest (${r.sentences.length - 1} more)`}</span>
            <span className="hidden group-open:inline">Less</span>
          </summary>
          <p className="mt-1">{r.sentences.slice(1).join(" ")}</p>
        </details>
      )}
      {modelLine && <p className="mt-2 text-xs leading-relaxed text-muted">{modelLine}</p>}
    </section>
  );
}
