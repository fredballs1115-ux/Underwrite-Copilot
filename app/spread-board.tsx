import Link from "next/link";
import metrosSeed from "@/data/research/metros.json";

// The spread board — the three widest tracker divergences in the research
// file, drawn as ranges. Derived, not typed: every card comes from a metro's
// sector_snapshot where two named houses publish different vacancy figures
// for the same market. If the data changes, the board changes; if divergence
// disappears, the board disappears. Extends the problem section's point:
// it isn't just your analysts — the professional trackers don't agree
// either, and averaging the disagreement away is how bad deals get bought.

type SnapBlock = {
  vacancy_pct?: number | null;
  vacancy_pct_low?: number | null;
  vacancy_pct_high?: number | null;
};

const SECTOR_LABEL: Record<string, string> = {
  multifamily: "Multifamily",
  office: "Office",
  industrial: "Industrial",
};

type SpreadRow = {
  metroId: string;
  metroName: string;
  sector: string;
  low: number;
  high: number;
};

const SPREADS: SpreadRow[] = (metrosSeed.metros ?? [])
  .flatMap((m) => {
    const snap = (m as { sector_snapshot?: Record<string, unknown> | null })
      .sector_snapshot;
    if (!snap) return [];
    return Object.entries(snap).flatMap(([sector, blk]) => {
      if (sector === "as_of" || typeof blk !== "object" || blk == null)
        return [];
      const b = blk as SnapBlock;
      const low = b.vacancy_pct ?? b.vacancy_pct_low;
      const high = b.vacancy_pct ?? b.vacancy_pct_high;
      if (typeof low !== "number" || typeof high !== "number" || high <= low)
        return [];
      return [
        {
          metroId: m.id,
          metroName: m.name,
          sector,
          low,
          high,
        },
      ];
    });
  })
  .sort((a, b) => b.high - b.low - (a.high - a.low))
  .slice(0, 3);

const AXIS_MAX = Math.max(...SPREADS.map((s) => s.high), 1);

export function SpreadBoard() {
  if (SPREADS.length === 0) return null;
  return (
    <section aria-label="Where the market trackers disagree">
      <div className="mx-auto max-w-6xl px-6 pb-16 sm:pb-20">
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                It is not just your analysts
              </p>
              <h3 className="mt-2 text-xl font-semibold tracking-tight sm:text-2xl">
                The trackers disagree too. We carry the spread.
              </h3>
            </div>
            <Link
              href="/market"
              className="text-sm font-medium text-brand underline-offset-2 hover:underline"
            >
              See every market&apos;s read →
            </Link>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
            These are real vacancy figures for the same market in the same
            quarter, from named research houses counting different ways —
            direct, total, or available space. Most tools quietly pick one.
            The screen shows the spread with the basis named, because the gap
            itself is information.
          </p>

          <ul className="mt-6 space-y-4">
            {SPREADS.map((s) => {
              const l = (s.low / AXIS_MAX) * 100;
              const r = (s.high / AXIS_MAX) * 100;
              return (
                <li key={`${s.metroId}-${s.sector}`}>
                  <Link
                    href={`/market?metro=${s.metroId}`}
                    className="group block rounded-xl border border-line/70 p-4 transition-colors hover:border-brand/40 hover:bg-faint/60"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-sm font-medium">
                        {s.metroName}
                        <span className="ml-2 text-xs text-muted">
                          {SECTOR_LABEL[s.sector] ?? s.sector} vacancy
                        </span>
                      </p>
                      <p className="font-mono text-sm font-semibold tabular-nums">
                        {s.low}%{" "}
                        <span className="text-muted">to</span> {s.high}%
                        <span className="ml-2 rounded bg-caution/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-caution">
                          {(s.high - s.low).toFixed(1)} pts apart
                        </span>
                      </p>
                    </div>
                    <div
                      aria-hidden
                      className="relative mt-2.5 h-1.5 rounded-full bg-faint"
                    >
                      <span
                        className="absolute inset-y-0 rounded-full bg-caution/30 transition-colors group-hover:bg-caution/45"
                        style={{ left: `${l}%`, width: `${r - l}%` }}
                      />
                      <span
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink/70"
                        style={{ left: `${l}%` }}
                      />
                      <span
                        className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface bg-ink/70"
                        style={{ left: `${r}%` }}
                      />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-4 text-[11px] text-muted">
            Drawn live from the research file — sourced figures only, spreads
            shown rather than averaged, the basis for each in the metro brief.
          </p>
        </div>
      </div>
    </section>
  );
}
