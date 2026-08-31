import Link from "next/link";
import metrosSeed from "@/data/research/metros.json";
import { MARKET_COUNT } from "@/app/markets-marquee";
import { seedBenchmarks } from "@/lib/research-data";
import {
  sectorLeaderboard,
  type SnapBlock,
} from "@/lib/sector-leaderboard";

// The pulse board — every covered market as a live tile that ROTATES through
// its real asset-class reads: office, industrial, multifamily, and retail
// where the research carries them (vacancy, asking rent, cap band), straight
// off the same metros.json the market briefs render. Pure CSS crossfade,
// staggered per tile; reduced motion pins each tile to its first face.
// Nothing typed in: a metro shows only the sectors it actually has, and a
// screen reader gets every face as one static sentence.
type PulseFace = { label: string; value: string };
type PulseTile = {
  id: string;
  name: string;
  faces: PulseFace[];
  status: string | null;
  ruleCount: number;
};

const FACE_LABEL: Record<string, string> = {
  office: "Office",
  industrial: "Industrial",
  multifamily: "Multifamily",
  retail: "Retail",
};

function faceValue(b: SnapBlock): string | null {
  const lo = b.vacancy_pct ?? b.vacancy_pct_low;
  const hi = b.vacancy_pct ?? b.vacancy_pct_high ?? lo;
  const bits: string[] = [];
  if (typeof lo === "number")
    bits.push(lo === hi ? `${lo}% vac` : `${lo}–${hi}% vac`);
  if (typeof b.asking_rent_psf === "number")
    bits.push(`$${b.asking_rent_psf.toFixed(2)}/SF`);
  if (
    typeof b.cap_rate_low_pct === "number" &&
    typeof b.cap_rate_high_pct === "number"
  )
    bits.push(
      b.cap_rate_low_pct === b.cap_rate_high_pct
        ? `cap ${b.cap_rate_low_pct}%`
        : `cap ${b.cap_rate_low_pct}–${b.cap_rate_high_pct}%`,
    );
  return bits.length > 0 ? bits.join(" · ") : null;
}

const TILES: PulseTile[] = (metrosSeed.metros ?? []).map((m) => {
  const fmr = (m as { fmr_fy2026?: { status?: string } | null }).fmr_fy2026;
  const snap = (m as { sector_snapshot?: Record<string, unknown> | null })
    .sector_snapshot;
  const faces: PulseFace[] = [];
  for (const sector of ["office", "industrial", "multifamily", "retail"]) {
    const blk = snap?.[sector];
    if (typeof blk !== "object" || blk == null) continue;
    const value = faceValue(blk as SnapBlock);
    if (value) faces.push({ label: FACE_LABEL[sector], value });
  }
  return {
    id: m.id,
    name: m.name,
    faces,
    status: fmr?.status ?? null,
    ruleCount: ((m as { rule_ids?: string[] }).rule_ids ?? []).length,
  };
});

const DOT: Record<string, string> = {
  verified: "bg-emerald-400",
  sourced: "bg-accent",
  unverified_not_found: "bg-amber-400",
};

// The credibility strip is DERIVED: a curated label map of primary-document
// hosts, shown only for hosts that actually appear in the research file's
// source URLs right now. Aggregators never make this list; if a primary
// source drops out of the data, its chip drops out of the strip.
const PRIMARY_HOSTS: Record<string, string> = {
  "huduser.gov": "HUD (huduser.gov)",
  "govinfo.gov": "Federal Register",
  "dchousing.org": "DC Housing Authority",
  "sfha.org": "SF Housing Authority",
  "nj.gov": "NJ Treasury",
};
const FOUND_PRIMARY: string[] = (() => {
  const found = new Set<string>();
  for (const m of metrosSeed.metros ?? []) {
    const sources =
      (m as { fmr_fy2026?: { sources?: string[] } | null }).fmr_fy2026?.sources ?? [];
    for (const s of sources) {
      try {
        const host = new URL(s).hostname.replace(/^www\./, "");
        for (const key of Object.keys(PRIMARY_HOSTS)) {
          if (host === key || host.endsWith(`.${key}`)) found.add(key);
        }
      } catch {
        // non-URL source string — skip
      }
    }
  }
  return Object.keys(PRIMARY_HOSTS).filter((k) => found.has(k));
})();
// Sourced sector figures (office/industrial/multifamily/retail vacancy,
// rents, caps) flowing out of the metros' snapshot blocks — counted, not typed.
const SECTOR_FIGURES = seedBenchmarks().filter((b) =>
  /^(office|industrial|multifamily|retail)_(vacancy_pct|asking_rent_psf|cap_rate_pct)$/.test(
    b.metric,
  ),
).length;

const HAS_FRED = seedBenchmarks().some((b) =>
  (b.source ?? "").toLowerCase().includes("fred"),
);

// The sector lens — the tightest market on file per asset class, derived from
// the same shared leaderboard builder the market page ranks with. Bands stay
// bands; the count is how many covered markets carry a numeric vacancy read
// for that class. Each chip opens the full ranking on the market page.
const SECTOR_LENS = (
  ["office", "industrial", "multifamily", "retail"] as const
).flatMap((sec) => {
  const ranked = sectorLeaderboard(sec).rows.filter((r) => r.vLow !== null);
  const top = ranked[0];
  if (!top || top.vLow === null) return [];
  const hi = top.vHigh ?? top.vLow;
  return [
    {
      sec,
      label: FACE_LABEL[sec],
      name: top.name,
      band: top.vLow === hi ? `${top.vLow}%` : `${top.vLow}–${hi}%`,
      count: ranked.length,
    },
  ];
});

export function MarketPulseBoard() {
  return (
    <section
      aria-label="Every covered market rotating through its asset-class reads"
      className="band-dark border-y border-white/10 text-white"
    >
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          {/* Tiles are per JURISDICTION, markets are what a buyer counts:
              DC, PG, Montgomery and NoVA are four tiles inside one DMV-core
              market. Saying "18 covered markets" here contradicted the
              15-market scope stated everywhere else on this very page, so
              both numbers are named and both are derived. */}
          <h2 className="text-lg font-semibold tracking-tight">
            The board — {TILES.length} jurisdiction tiles across{" "}
            {MARKET_COUNT} covered markets, live from the research layer
          </h2>
          <p className="text-xs text-white/45">
            every tile rotates its office / industrial / multifamily / retail
            read ·{" "}
            <span className="text-white/60">{SECTOR_FIGURES}</span> sourced
            sector figures · every tile opens its brief
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
              {t.faces.length > 0 ? (
                <>
                  <div aria-hidden className="relative mt-1.5 h-[2.35rem]">
                    {t.faces.map((f, fi) => (
                      <div
                        key={f.label}
                        style={{ "--f": fi } as React.CSSProperties}
                        className={`pulse-face pulse-face-${t.faces.length} absolute inset-x-0 top-0`}
                      >
                        <p className="text-[9px] font-semibold uppercase tracking-wider text-accent/80">
                          {f.label}
                        </p>
                        <p className="truncate font-mono text-[13px] font-semibold tabular-nums text-white">
                          {f.value}
                        </p>
                      </div>
                    ))}
                  </div>
                  <p className="sr-only">
                    {t.faces.map((f) => `${f.label}: ${f.value}`).join("; ")}
                  </p>
                </>
              ) : (
                <p className="mt-1.5 text-[11px] font-medium text-amber-300/80">
                  sector reads queued
                </p>
              )}
              <p className="mt-1 text-[10px] text-white/40">
                {t.ruleCount} rule{t.ruleCount === 1 ? "" : "s"} on file
              </p>
            </Link>
          ))}
        </div>
        {SECTOR_LENS.length > 0 && (
          <div className="mt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                The sector lens — tightest on file per asset class
              </p>
              <p className="text-[10px] text-white/35">
                each opens the full ranking
              </p>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {SECTOR_LENS.map((s) => (
                <Link
                  key={s.sec}
                  href={`/market?sector=${s.sec}`}
                  className="group rounded-xl border border-white/10 bg-white/[0.04] p-3 outline-none transition-colors hover:border-accent/60 hover:bg-white/[0.08] focus-visible:ring-2 focus-visible:ring-accent/60"
                >
                  <div className="flex items-baseline justify-between gap-1.5">
                    <p className="text-[9px] font-semibold uppercase tracking-wider text-accent/80">
                      {s.label}
                    </p>
                    <p className="text-[9px] text-white/40 group-hover:text-white/60">
                      {s.count} ranked →
                    </p>
                  </div>
                  <p className="mt-1 truncate text-[11px] font-medium text-white/75 group-hover:text-white">
                    {s.name}
                  </p>
                  <p className="font-mono text-[13px] font-semibold tabular-nums text-white">
                    {s.band}
                    <span className="ml-1 text-[10px] font-normal text-white/45">
                      vac
                    </span>
                  </p>
                </Link>
              ))}
            </div>
          </div>
        )}
        {(FOUND_PRIMARY.length > 0 || HAS_FRED) && (
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
              Primary documents on file:
            </span>
            {FOUND_PRIMARY.map((k) => (
              <span
                key={k}
                className="rounded-full border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-white/70"
              >
                {PRIMARY_HOSTS[k]}
              </span>
            ))}
            {HAS_FRED && (
              <span className="rounded-full border border-white/15 bg-white/[0.03] px-2.5 py-1 text-[10px] font-medium text-white/70">
                FRED (rates)
              </span>
            )}
          </div>
        )}
        <p className="mt-4 text-[11px] text-white/40">
          Office, industrial, multifamily, and retail reads from named research
          houses — vacancy, asking rents, and cap bands, spreads shown when
          trackers diverge, gaps recorded rather than guessed. Dots mark each
          metro&apos;s FMR record: verified / sourced / open gap. Same file the
          market briefs and the deal benchmarks read.
        </p>
      </div>
    </section>
  );
}
