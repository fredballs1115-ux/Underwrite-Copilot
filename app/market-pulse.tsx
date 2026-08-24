import Link from "next/link";
import metrosSeed from "@/data/research/metros.json";

// The pulse board — every covered market as a live tile: its FY2026 2BR
// fair-market rent, research status, and rules on file, straight off the
// research layer (the same metros.json the market briefs render). Tiles
// breathe on a staggered cycle (pure CSS; static under reduced motion) and
// every tile is a real link into its market brief. Nothing typed in: a
// metro without a confirmed FMR shows its gap honestly.
type PulseTile = {
  id: string;
  name: string;
  fmr2br: number | null;
  status: string | null;
  ruleCount: number;
};

const TILES: PulseTile[] = (metrosSeed.metros ?? []).map((m) => {
  const fmr = (m as { fmr_fy2026?: { "2br"?: number | null; status?: string } | null })
    .fmr_fy2026;
  return {
    id: m.id,
    name: m.name,
    fmr2br: typeof fmr?.["2br"] === "number" ? fmr["2br"] : null,
    status: fmr?.status ?? null,
    ruleCount: ((m as { rule_ids?: string[] }).rule_ids ?? []).length,
  };
});

const DOT: Record<string, string> = {
  verified: "bg-emerald-400",
  sourced: "bg-accent",
  unverified_not_found: "bg-amber-400",
};

export function MarketPulseBoard() {
  const priced = TILES.filter((t) => t.fmr2br != null).length;
  return (
    <section
      aria-label="Every covered market with its FY2026 fair market rent"
      className="band-dark border-y border-white/10 text-white"
    >
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">
            The board — {TILES.length} covered markets, live from the research
            layer
          </h2>
          <p className="text-xs text-white/45">
            {priced} priced with FY2026 HUD rents · dots mark verified /
            sourced / open gap · every tile opens its brief
          </p>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          {TILES.map((t, i) => (
            <Link
              key={t.id}
              href={`/market?metro=${t.id}`}
              style={{ "--i": i } as React.CSSProperties}
              className="pulse-tile group rounded-xl border border-white/10 bg-white/[0.04] p-3 outline-none transition-colors hover:border-accent/60 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <div className="flex items-center justify-between gap-1.5">
                <p className="truncate text-[11px] font-medium text-white/75 group-hover:text-white">
                  {t.name}
                </p>
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    DOT[t.status ?? ""] ?? "bg-white/25"
                  }`}
                />
              </div>
              {t.fmr2br != null ? (
                <p className="mt-1.5 font-mono text-base font-semibold tabular-nums text-white">
                  ${t.fmr2br.toLocaleString()}
                  <span className="ml-1 text-[9px] font-normal text-white/40">
                    2BR/mo
                  </span>
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] font-medium text-amber-300/80">
                  FMR gap — recorded
                </p>
              )}
              <p className="mt-1 text-[10px] text-white/40">
                {t.ruleCount} rule{t.ruleCount === 1 ? "" : "s"} on file
              </p>
            </Link>
          ))}
        </div>
        <p className="mt-4 text-[11px] text-white/40">
          FY2026 2BR fair-market rents from HUD&apos;s schedules and the
          authorities&apos; own sheets — sourced and statused per metro, gaps
          shown as gaps. Same file the market briefs and the deal benchmarks
          read.
        </p>
      </div>
    </section>
  );
}
