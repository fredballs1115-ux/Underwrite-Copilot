import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import {
  buildComps,
  summarizeMarkets,
  fmtCapRange,
  fmtBasisRange,
  type MarketGroup,
} from "@/lib/market-memory";
import { mergeBenchmarks, seedBenchmarks, seedRules } from "@/lib/research-data";
import { linkOk } from "@/lib/link-audit";
import { looseValue, SECTORS } from "@/lib/research-sectors";
import { COVERAGE_DISCOVERY, COVERAGE_SUMMARY, PROVIDERS } from "@/lib/public-comps/core";
import metrosSeed from "@/data/research/metros.json";
import multifamilySeed from "@/data/research/multifamily.json";
import {
  sectorLeaderboard,
  type SnapBlock,
} from "@/lib/sector-leaderboard";
import { CopyCite } from "./copy-cite";
import {
  MarketCompare,
  type CompareMetro,
  type CompareSector,
} from "./market-compare";

// The compare tool's compact per-metro facts, derived once from the research
// layer — FMR row, rule count, comps-feed state. Serializable: it crosses the
// server → client boundary as props.
/** "By asset type" — the metro's sector fundamentals from the research
 *  layer's snapshot blocks: vacancy (a spread when trackers diverge — the
 *  divergence is shown, never averaged), asking rent, and cap-rate bands,
 *  each with its status chip and provenance note. Metros without a snapshot
 *  say so honestly. */
const SECTOR_LABEL: Record<string, string> = {
  multifamily: "Multifamily",
  office: "Office",
  industrial: "Industrial",
  retail: "Retail",
};
function SectorSnapshotPanel({
  snapshot,
}: {
  snapshot: Record<string, unknown> | null;
}) {
  const entries = Object.entries(snapshot ?? {}).filter(
    (e): e is [string, SnapBlock] => e[0] !== "as_of" && typeof e[1] === "object",
  );
  const asOf = typeof snapshot?.as_of === "string" ? snapshot.as_of : null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        By asset type
        {asOf && (
          <span className="ml-1.5 font-normal normal-case tracking-normal">
            · fundamentals as of {asOf}
          </span>
        )}
      </p>
      {entries.length === 0 ? (
        <p className="mt-1.5 text-xs text-muted">
          Sector fundamentals for this metro queue in the next research batch
          — unscreened, never guessed.
        </p>
      ) : (
        <ul className="mt-2 space-y-2.5">
          {entries.map(([sector, b]) => {
            const vLow = b.vacancy_pct ?? b.vacancy_pct_low;
            const vHigh = b.vacancy_pct ?? b.vacancy_pct_high ?? vLow;
            const bits: string[] = [];
            if (typeof vLow === "number") {
              bits.push(
                vLow === vHigh
                  ? `vacancy ${vLow}%`
                  : `vacancy ${vLow}–${vHigh}%`,
              );
            }
            if (typeof b.asking_rent_psf === "number") {
              bits.push(
                `asking $${b.asking_rent_psf.toFixed(2)}/SF${b.rent_basis ? ` (${b.rent_basis})` : ""}`,
              );
            }
            if (
              typeof b.cap_rate_low_pct === "number" &&
              typeof b.cap_rate_high_pct === "number"
            ) {
              bits.push(`cap ${b.cap_rate_low_pct}–${b.cap_rate_high_pct}%`);
            }
            return (
              <li key={sector} className="rounded-lg border border-line/70 p-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold">
                    {SECTOR_LABEL[sector] ?? sector.replace(/_/g, " ")}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-ink">
                    {bits.length > 0 ? bits.join(" · ") : "figures pending"}
                  </span>
                  <span
                    className={`ml-auto rounded px-1.5 py-px text-[10px] font-medium ${
                      b.status === "verified"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-brand/10 text-brand"
                    }`}
                  >
                    {b.status ?? "sourced"}
                  </span>
                  {b.sources?.[0] && (
                    <a
                      href={b.sources[0]}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[10px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
                    >
                      source
                    </a>
                  )}
                </div>
                {b.note && (
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    {b.note}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const COMPARE_METROS: CompareMetro[] = (metrosSeed.metros ?? []).map((m) => {
  const fmr = (m as { fmr_fy2026?: CompareMetro["fmr"] | null }).fmr_fy2026 ?? {};
  const beds: CompareMetro["fmr"] = { status: fmr.status };
  for (const k of ["0br", "1br", "2br", "3br"] as const) {
    const v = fmr[k];
    if (typeof v === "number") beds[k] = v;
  }
  // Sector fundamentals for the compare table, from the same snapshot blocks
  // the "By asset type" panel renders — nulls simply produce no entry.
  const snap = (m as { sector_snapshot?: Record<string, unknown> | null })
    .sector_snapshot;
  let sectors: CompareMetro["sectors"];
  if (snap) {
    sectors = {};
    for (const sec of ["office", "industrial", "multifamily", "retail"] as const) {
      const blk = snap[sec] as
        | {
            vacancy_pct?: number | null;
            vacancy_pct_low?: number | null;
            vacancy_pct_high?: number | null;
            asking_rent_psf?: number | null;
            cap_rate_low_pct?: number | null;
            cap_rate_high_pct?: number | null;
          }
        | undefined;
      if (!blk) continue;
      const s: CompareSector = {};
      const vLow = blk.vacancy_pct ?? blk.vacancy_pct_low;
      const vHigh = blk.vacancy_pct ?? blk.vacancy_pct_high ?? vLow;
      if (typeof vLow === "number") {
        s.vLow = vLow;
        if (typeof vHigh === "number") s.vHigh = vHigh;
      }
      if (typeof blk.asking_rent_psf === "number") s.rent = blk.asking_rent_psf;
      if (
        typeof blk.cap_rate_low_pct === "number" &&
        typeof blk.cap_rate_high_pct === "number"
      ) {
        s.capLow = blk.cap_rate_low_pct;
        s.capHigh = blk.cap_rate_high_pct;
      }
      if (Object.keys(s).length > 0) sectors[sec] = s;
    }
  }
  return {
    id: m.id,
    name: m.name,
    region: (m as { region?: string }).region ?? "More markets",
    fmr: beds,
    sectors,
    ruleCount: ((m as { rule_ids?: string[] }).rule_ids ?? []).length,
    compsLive:
      typeof m.comps_provider === "string" && m.comps_provider !== "discovery",
  };
});

export const metadata: Metadata = { title: "Market data" };

const CALL_META: Record<string, { label: string; cls: string }> = {
  pass: { label: "Go", cls: "text-pass" },
  caution: { label: "Caution", cls: "text-caution" },
  pass_on: { label: "No-go", cls: "text-kill" },
};

export default async function MarketDataPage({
  searchParams,
}: {
  searchParams?: Promise<{ metro?: string; sector?: string }>;
}) {
  const { metro: metroParam, sector: sectorParam } = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();

  // Own-account only (Feature 6): the deals THIS user created — never a
  // teammate's, never another account's. RLS also allows team deals, so the
  // explicit user_id filter is what keeps this memory private to the buyer.
  const { data, error } = user
    ? await supabase
        .from("deals")
        .select("id, name, asset_class, created_at, is_sample, verdict, extraction")
        .eq("user_id", user.id)
        .not("extraction", "is", null)
        .order("created_at", { ascending: false })
        .limit(500)
    : { data: null, error: null };

  const groups = data
    ? summarizeMarkets(buildComps(data as Parameters<typeof buildComps>[0]))
    : [];
  const totalScreens = groups.reduce((n, g) => n + g.count, 0);

  return (
    <div className="space-y-6">
      {user ? (
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your market data</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            What your own past screens say about the markets you work — going-in
            caps and basis, grouped by market and asset class. Built only from the
            deals you&apos;ve screened; private to your account, never shared with
            your team.
          </p>
        </div>
      ) : (
        // Anonymous visitors land here from the homepage/why/demo marquee —
        // lead with the research layer itself, not "your" data they don't
        // have yet. The signed-in memory blocks below are user-gated.
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            The covered markets
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            The research layer behind every screen — rules on file, published
            FMRs, live benchmarks, and recorded-sales coverage across the
            covered markets. Sign in and your own screens build a private comp
            memory on top of it.
          </p>
        </div>
      )}

      {!user ? null : error && /relation|does not exist|schema/i.test(error.message) ? (
        <p className="rounded-lg bg-caution/10 px-3 py-2 text-sm text-caution">
          Screen a deal or two and your market history builds up here.
        </p>
      ) : error ? (
        <p className="rounded-lg bg-kill/10 px-3 py-2 text-sm text-kill">
          Couldn&apos;t load your market data just now — please refresh in a
          moment.
        </p>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-12 text-center">
          <p className="text-sm font-medium">No market data yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Each deal you screen leaves its going-in cap and basis behind. Once
            you&apos;ve screened a few in the same market, your own comp history
            shows up here.
          </p>
          <Link
            href="/deals"
            className="mt-4 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Go to your pipeline
          </Link>
        </div>
      ) : (
        <>
          <p className="text-xs text-muted">
            {totalScreens} screen{totalScreens === 1 ? "" : "s"} across{" "}
            {groups.length} market{groups.length === 1 ? "" : "s"}.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <MarketCard key={`${g.assetClass}|${g.marketKey}`} g={g} />
            ))}
          </div>
        </>
      )}

      <MetroExplorer selected={metroParam} />
      {/* Side-by-side: any two covered markets on one shared dollar scale,
          straight off the research layer. */}
      <MarketCompare metros={COMPARE_METROS} />
      <MidAtlanticTable />
      <SectorExplorer selected={sectorParam} />
      <RatesStrip />
      <IntelDigestCard />
    </div>
  );
}

// ── Mid-Atlantic market table (research build) ───────────────────────────────
// The seeded + DB-merged benchmarks as one table: 2-4 unit medians, monthly
// sales, and active listings per metro, plus the DC-area FY2026 FMR row —
// visible from day one (it doesn't depend on the user's own screens), every
// row with provenance. Recorded-sales COVERAGE for auto-comps is stated
// from the provider registry so it can't drift.
async function MidAtlanticTable() {
  const supabase = await createSupabaseServerClient();
  let benchmarks = seedBenchmarks();
  try {
    const { data } = await supabase.from("benchmarks").select("*");
    if (data?.length) benchmarks = mergeBenchmarks(data as never);
  } catch {
    // seeds stand
  }
  const mf = benchmarks.filter((b) => b.sector === "multifamily" && b.metro);
  // Covered markets ONLY (per the 15-market scope): benchmark rows for
  // metros outside the covered list exist in the research seeds but are not
  // displayed. EXACT city-name equality — a first-token match let "New
  // Haven" leak through via "New York City"'s "new".
  const coveredCities = new Set(
    (metrosSeed.metros ?? []).map((m) => m.name.split(",")[0].trim().toLowerCase())
  );
  const metros = [...new Set(mf.map((b) => b.metro))].filter(
    (m) =>
      m !== "Washington DC area" &&
      coveredCities.has(m.split(",")[0].trim().toLowerCase())
  );
  const get = (metro: string, metric: string) =>
    mf.find((b) => b.metro === metro && b.metric === metric);
  const fmr = mf.filter((b) => b.metro === "Washington DC area");
  const priceRows = metros
    .map((m) => ({ metro: m, price: get(m, "median_sale_price_2_4_unit"), sales: get(m, "monthly_sales_2_4_unit"), listings: get(m, "active_listings_2_4_unit") }))
    .filter((r) => r.price)
    .sort((a, b) => (a.price!.low ?? 0) - (b.price!.low ?? 0));
  if (priceRows.length === 0) return null;

  const money = (n: number | null) => (n === null ? "—" : `$${Math.round(n / 1000)}k`);
  const range = (b: { low: number | null; high: number | null } | undefined) =>
    !b || b.low === null
      ? "—"
      : b.low === b.high
        ? `${b.low}`
        : `${b.low}–${b.high}`;

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Mid-Atlantic 2–4 unit market
        </h2>
        <span className="text-[11px] text-muted">
          {priceRows[0].price!.as_of} · Redfin public dataset
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3 font-medium">Metro</th>
              <th className="py-1.5 pr-3 font-medium">Median sale (2–4 unit)</th>
              <th className="py-1.5 pr-3 font-medium">Sales / mo</th>
              <th className="py-1.5 pr-3 font-medium">Active</th>
              <th className="py-1.5 font-medium">Note</th>
            </tr>
          </thead>
          <tbody>
            {priceRows.map((r) => (
              <tr key={r.metro} className="border-b border-line/60">
                <td className="py-1.5 pr-3 font-medium">{r.metro}</td>
                <td className="py-1.5 pr-3 font-mono tabular-nums">{money(r.price!.low)}</td>
                <td className="py-1.5 pr-3 font-mono tabular-nums">{range(r.sales)}</td>
                <td className="py-1.5 pr-3 font-mono tabular-nums">{range(r.listings)}</td>
                <td className="py-1.5 text-xs text-muted">
                  {(r.price!.note ?? "").split(";")[0]}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fmr.length > 0 && (
        <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
          DC-area FY2026 HUD fair-market rents:{" "}
          {fmr
            .map(
              (b) =>
                `${b.metric.replace("hud_fmr_fy2026_", "").toUpperCase()} $${(b.low ?? 0).toLocaleString()}`
            )
            .join(" · ")}{" "}
          <span className="text-[11px]">(sourced; verify against the HUD schedule)</span>
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-muted">
        Recorded-sales comps auto-pull live in {COVERAGE_SUMMARY}
        {COVERAGE_DISCOVERY.length > 0 && (
          <>
            {"; being wired: "}
            {COVERAGE_DISCOVERY.map((p) => p.regionLabel).join(", ")}
          </>
        )}
        . Every figure above carries its source and as-of date in the research
        layer; stale rows badge themselves on deal screens.
      </p>
    </section>
  );
}

// ── Metro explorer (site-polish) ─────────────────────────────────────────────
// The research showroom: pick a metro, see what the research layer actually
// holds for it — FMR benchmarks, market notes, the regulatory rules in force
// (statute-linked, status-labeled), comps availability, and example
// properties. Server-rendered; selection is a query param, so it's linkable.
// The buyer's geography first, then the biggest markets — a deliberately
// FOCUSED list (per direction: the Mid-Atlantic home region + the 12 major
// US markets, never a 50-state sprawl). Each area is its own distinct block;
// metros missing a region stamp fall into "More markets" instead of
// vanishing. The rules engine still evaluates ANY US address — focus is
// about presentation, not blind spots.
const REGION_ORDER = [
  "DMV core",
  "Mid-Atlantic",
  "Major US markets",
  "More markets",
] as const;

async function MetroExplorer({ selected }: { selected?: string }) {
  const metros = metrosSeed.metros ?? [];
  const active =
    metros.find((m) => m.id === selected) ?? metros[0];
  if (!active) return null;
  const rules = seedRules().filter((r) =>
    (active.rule_ids as string[] | undefined)?.includes(r.id)
  );
  // Live property-DB stock counts for metros whose bulk pipeline is wired —
  // real rows replace hand-entered stats; zero rows renders nothing rather
  // than a hollow "0".
  const ingestMarket = (active as { ingest_market?: string }).ingest_market;
  let stock: { parcels: number; sales: number } | null = null;
  if (ingestMarket) {
    try {
      const supabase = await createSupabaseServerClient();
      const [p, s] = await Promise.all([
        supabase
          .from("properties")
          .select("id", { count: "exact", head: true })
          .eq("market", ingestMarket),
        supabase
          .from("recorded_sales")
          .select("id", { count: "exact", head: true })
          .eq("market", ingestMarket),
      ]);
      if ((p.count ?? 0) > 0 || (s.count ?? 0) > 0) {
        stock = { parcels: p.count ?? 0, sales: s.count ?? 0 };
      }
    } catch {
      // migration 0028 not run — no line
    }
  }
  const fmr = active.fmr_fy2026 as {
    "0br"?: number | null;
    "1br"?: number | null;
    "2br"?: number | null;
    "3br"?: number | null;
    range?: [number, number];
    status?: string;
    note?: string;
    sources?: string[];
  } | null;
  // Full bedroom row where the research carries one (LA's Federal-Register
  // revision, SF's housing-authority sheet, Newark's NJ-Treasury table) —
  // 2BR stays the emphasized headline everywhere.
  const fmrBeds = (["0br", "1br", "2br", "3br"] as const)
    .map((k) => ({ label: k.toUpperCase(), value: fmr?.[k] }))
    .filter((b): b is { label: string; value: number } => typeof b.value === "number");
  const providers = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));
  const compsLine =
    active.comps_provider === null
      ? "No live sales feed wired for this metro yet — its bulk public-record sources are documented in ingestion_sources.md and load through the property database."
      : active.comps_provider === "discovery"
        ? "Recorded-sales comps staged in discovery mode — the health check resolves the endpoints."
        : `Recorded-sales comps LIVE via ${providers[active.comps_provider as string]?.name ?? active.comps_provider}.`;
  // Explicit metro-id → research-metro mapping: name-prefix matching missed
  // the DMV entry (its metro string is "DMV core (DC / PG County MD / NoVA)")
  // for the three DMV metros.
  const EXAMPLE_METRO: Record<string, string> = {
    dc: "DMV core",
    pg_county: "DMV core",
    montgomery_county: "DMV core",
    nova: "DMV core",
    philadelphia: "Philadelphia",
    baltimore: "Baltimore",
  };
  const wanted = EXAMPLE_METRO[active.id];
  const examples = wanted
    ? ((multifamilySeed.top_east_coast_metros ?? []).find((m) =>
        m.metro.toLowerCase().startsWith(wanted.toLowerCase())
      )?.example_properties ?? [])
    : [];
  const noteStatus = (active.market_notes as { status?: string } | null)?.status ?? "sourced";
  const noteMeta =
    noteStatus === "verified"
      ? "bg-emerald-500/10 text-emerald-600"
      : "bg-brand/10 text-brand";

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold tracking-tight">Metro explorer</h2>
      <p className="mt-1 text-xs text-muted">
        Your home region plus the{" "}
        {metros.filter((m) => (m as { region?: string }).region === "Major US markets").length}{" "}
        biggest US markets — a deliberately focused list, each area in its own
        place. Pick a metro for its rules, rents, and data coverage.
      </p>
      <div className="mt-3 space-y-3">
        {REGION_ORDER.map((region) => {
          const group = metros.filter(
            (m) => ((m as { region?: string }).region ?? "More markets") === region
          );
          if (group.length === 0) return null;
          return (
            <div key={region}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
                {region}
                <span className="ml-1.5 font-normal normal-case tracking-normal">
                  · {group.length} metro{group.length === 1 ? "" : "s"}
                </span>
              </h3>
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {group.map((m) => (
                  <Link
                    key={m.id}
                    href={`/market?metro=${m.id}`}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      m.id === active.id
                        ? "border-brand bg-brand text-white"
                        : "border-line text-muted hover:border-brand hover:text-brand"
                    }`}
                  >
                    {m.name}
                  </Link>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-4 space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">
          {(active as { region?: string }).region ?? "More markets"} ·{" "}
          <span className="font-normal normal-case tracking-normal text-muted">
            {active.name}
          </span>
        </p>
        <p className="text-sm leading-relaxed">
          {(active.market_notes as { value?: string } | null)?.value}
          <span className={`ml-2 rounded px-1.5 py-px align-middle text-[10px] font-medium ${noteMeta}`}>
            {noteStatus}
          </span>
        </p>

        <SectorSnapshotPanel
          snapshot={
            (active as {
              sector_snapshot?: Record<string, unknown> | null;
            }).sector_snapshot ?? null
          }
        />

        {typeof fmr?.["2br"] === "number" ? (
          <div className="text-sm">
            <span className="text-[11px] uppercase tracking-wide text-muted">
              FY2026 fair market rent
            </span>{" "}
            {fmrBeds.map((b, i) => (
              <span key={b.label}>
                {i > 0 && <span className="text-muted"> · </span>}
                <span className="text-muted">{b.label}</span>{" "}
                <span
                  className={`font-mono tabular-nums ${
                    b.label === "2BR" ? "font-semibold" : "text-muted"
                  }`}
                >
                  ${b.value.toLocaleString()}
                </span>
              </span>
            ))}
            <span className="text-muted">/mo</span>
            <span
              className={`ml-2 rounded px-1.5 py-px align-middle text-[10px] font-medium ${
                fmr.status === "verified"
                  ? "bg-emerald-500/10 text-emerald-600"
                  : "bg-brand/10 text-brand"
              }`}
            >
              {fmr.status ?? "sourced"}
            </span>
            {fmr.range && (
              <span className="text-xs text-muted">
                {" "}
                (payment-standard range ${fmr.range[0].toLocaleString()}–$
                {fmr.range[1].toLocaleString()})
              </span>
            )}
            {fmr.sources?.[0] && (
              <a
                href={fmr.sources[0]}
                target="_blank"
                rel="noreferrer"
                className="ml-2 text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
              >
                source
              </a>
            )}
            {/* Bedroom ladder, drawn — widths scale to the real dollars in
                the row above (aria-hidden: the numbers already read as text). */}
            {fmrBeds.length >= 2 && (
              <div className="mt-2 max-w-md space-y-1" aria-hidden>
                {fmrBeds.map((b) => {
                  const max = Math.max(...fmrBeds.map((x) => x.value));
                  const w = Math.max(8, Math.round((b.value / max) * 100));
                  return (
                    <div key={b.label} className="flex items-center gap-2">
                      <span className="w-7 shrink-0 text-[10px] font-medium text-muted">
                        {b.label}
                      </span>
                      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-faint">
                        <div
                          className={`h-full rounded-full transition-[width] duration-500 ${
                            b.label === "2BR" ? "bg-brand" : "bg-brand/40"
                          }`}
                          style={{ width: `${w}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right font-mono text-[10px] tabular-nums text-muted">
                        ${b.value.toLocaleString()}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <CopyCite
              text={`${active.name} — FY2026 2BR fair market rent $${fmr["2br"].toLocaleString()}/mo (${fmr.status ?? "sourced"}${fmr.sources?.[0] ? `; source: ${fmr.sources[0]}` : ""}) · via Underwrite Copilot market brief`}
            />
            {fmr.note && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted">
                {fmr.note}
              </p>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted">
            FY2026 FMR for this metro: not yet confirmed —{" "}
            {fmr?.note ?? "queued in the research gaps."}
          </p>
        )}

        <div>
          <h3 className="text-[11px] uppercase tracking-wide text-muted">
            Rules in force here
          </h3>
          {rules.length === 0 ? (
            <p className="mt-1 text-sm text-muted">
              No rules on file for this metro — that means unscreened, not
              unregulated.
            </p>
          ) : (
            <ul className="mt-2 space-y-2">
              {rules.map((r) => (
                <li key={r.id} className="text-sm leading-snug">
                  <span
                    className={`mr-2 rounded px-1.5 py-px text-[10px] font-medium ${
                      r.status === "verified"
                        ? "bg-emerald-500/10 text-emerald-600"
                        : r.status === "sourced"
                          ? "bg-brand/10 text-brand"
                          : "bg-amber-500/10 text-amber-600"
                    }`}
                  >
                    {r.status}
                  </span>
                  {r.effect.split(". ")[0]}.
                  {r.source && (
                    <a
                      href={r.source}
                      target="_blank"
                      rel="noreferrer"
                      className="ml-1.5 text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
                    >
                      statute
                    </a>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        {stock && (
          <p className="text-sm">
            <span className="text-[11px] uppercase tracking-wide text-muted">
              Property database
            </span>{" "}
            <span className="font-mono font-semibold tabular-nums">
              {stock.parcels.toLocaleString()}
            </span>{" "}
            investable parcels ·{" "}
            <span className="font-mono font-semibold tabular-nums">
              {stock.sales.toLocaleString()}
            </span>{" "}
            deed-recorded sales
            <span className="ml-1.5 text-[11px] text-muted">
              — live counts from ingested government records; single-family
              excluded at ingestion
            </span>
          </p>
        )}

        <p className="text-xs text-muted">{compsLine}</p>

        <Link
          href="/deals?new=metro"
          className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          Screen a deal in {active.name} →
        </Link>

        {examples.length > 0 && (
          <div>
            <h3 className="text-[11px] uppercase tracking-wide text-muted">
              Example properties from the research
            </h3>
            <ul className="mt-2 space-y-1.5">
              {examples.map((e) => (
                <li key={e.address} className="text-sm">
                  <span className="font-medium">{e.address}</span>
                  {typeof e.price === "number" && (
                    <span className="ml-2 font-mono tabular-nums">
                      ${e.price.toLocaleString()}
                    </span>
                  )}
                  <span className="ml-2 text-xs text-muted">
                    {e.metric} — {e.note}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Sector leaderboard (cross-metro) ─────────────────────────────────────────
// The same snapshot blocks the metro tiles render, flipped the other way: one
// asset class at a time, every covered market with a numeric read, ranked
// tightest to loosest — built by the shared lib/sector-leaderboard helper
// (the homepage sector-lens strip derives from the same function). Only the
// four snapshot-tracked classes produce rows; other sector tabs render the
// research doc alone.
function SectorLeaderboard({ sector }: { sector: string }) {
  const { rows, heldOpen } = sectorLeaderboard(sector);
  if (rows.length === 0 && heldOpen.length === 0) return null;
  const label = SECTOR_LABEL[sector] ?? sector;
  const anyRent = rows.some((r) => r.rent !== null);
  const anyCap = rows.some((r) => r.capLow !== null);
  const band = (lo: number, hi: number | null) =>
    hi === null || hi === lo ? `${lo}%` : `${lo}–${hi}%`;
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {label} across the covered markets
        </h3>
        <span className="text-[11px] text-muted">
          ranked tightest to loosest · vintages vary by print — each metro page
          declares them
        </span>
      </div>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[440px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-2 font-medium">#</th>
              <th className="py-1.5 pr-3 font-medium">Market</th>
              <th className="py-1.5 pr-3 font-medium">Vacancy</th>
              {anyRent && <th className="py-1.5 pr-3 font-medium">Asking $/SF</th>}
              {anyCap && <th className="py-1.5 pr-3 font-medium">Cap range</th>}
              <th className="py-1.5 font-medium">Src</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              // Sorted with every vacancy-ranked row first, so index = rank.
              return (
                <tr key={r.id} className="border-b border-line/60">
                  <td className="py-1.5 pr-2 font-mono text-[11px] tabular-nums text-muted">
                    {r.vLow !== null ? i + 1 : "—"}
                  </td>
                  <td className="py-1.5 pr-3">
                    <Link
                      href={`/market?metro=${r.id}`}
                      className="text-xs font-medium underline decoration-dotted underline-offset-2 hover:text-brand"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-xs tabular-nums">
                    {r.vLow !== null ? band(r.vLow, r.vHigh) : "level open"}
                  </td>
                  {anyRent && (
                    <td
                      className="py-1.5 pr-3 font-mono text-xs tabular-nums"
                      title={r.rentBasis ?? undefined}
                    >
                      {r.rent !== null ? `$${r.rent.toFixed(2)}` : "—"}
                    </td>
                  )}
                  {anyCap && (
                    <td className="py-1.5 pr-3 font-mono text-xs tabular-nums">
                      {r.capLow !== null && r.capHigh !== null
                        ? band(r.capLow, r.capHigh)
                        : "—"}
                    </td>
                  )}
                  <td className="py-1.5 text-[11px] text-muted">
                    {r.source && linkOk(r.source) !== false ? (
                      <a
                        href={r.source}
                        target="_blank"
                        rel="noreferrer"
                        className="underline decoration-dotted underline-offset-2 hover:text-ink"
                      >
                        source
                      </a>
                    ) : (
                      "on file"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {heldOpen.length > 0 && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          Direction on file, numeric level held open: {heldOpen.join(" · ")} —
          the metro pages carry the sourced notes.
        </p>
      )}
    </div>
  );
}

// ── Sector explorer (every asset type) ──────────────────────────────────────
// The full research file for EVERY asset class, rendered: cycle position,
// cap-rate ranges (ranges, never single numbers), supply/demand, debt terms,
// the small-investor verdict, and the named gaps — provenance throughout.
// SFR appears as an asset-class OVERVIEW here while staying excluded from
// multifamily sales aggregates (an overview is not a row in 2-4 unit math).
function SectorExplorer({ selected }: { selected?: string }) {
  const active = SECTORS.find((x) => x.id === selected) ?? SECTORS[0];
  const doc = active.doc;
  const ranges = (doc.cap_rate_ranges ?? []).filter(
    (r) => typeof r.low === "number" && typeof r.high === "number"
  );
  const unpriced = (doc.cap_rate_ranges ?? []).filter(
    (r) => typeof r.low !== "number" || typeof r.high !== "number"
  );
  const supply = looseValue(doc.supply_demand) ??
    looseValue((doc.supply_demand as Record<string, unknown> | undefined)?.nova_scarcity) ??
    null;
  const debt = looseValue(doc.debt_terms) ??
    looseValue((doc.debt_terms as Record<string, unknown> | undefined)?.conventional_investor_2_4) ??
    null;
  const verdict = doc.small_investor_verdict;
  const cycleStatus = doc.cycle_position?.status ?? "sourced";
  const statusCls = (st: string | undefined) =>
    st === "verified"
      ? "bg-pass/10 text-pass"
      : st === "unverified_not_found"
        ? "bg-caution/10 text-caution"
        : "bg-brand/10 text-brand";

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Every asset class, researched
        </h2>
        <span className="text-[11px] text-muted">
          as of {doc.as_of ?? "2026-08-21"} · ranges, never single numbers
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SECTORS.map((x) => (
          <Link
            key={x.id}
            href={`/market?sector=${x.id}`}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              x.id === active.id
                ? "border-brand bg-brand text-white"
                : "border-line text-muted hover:border-brand hover:text-brand"
            }`}
          >
            {x.label}
          </Link>
        ))}
      </div>

      <div className="mt-4 space-y-4">
        {doc.cycle_position?.summary && (
          <p className="text-sm leading-relaxed">
            {doc.cycle_position.summary}
            <span
              className={`ml-2 rounded px-1.5 py-px align-middle text-[10px] font-medium ${statusCls(cycleStatus)}`}
            >
              {cycleStatus}
            </span>
            {doc.cycle_position.sources?.[0] &&
              linkOk(doc.cycle_position.sources[0]) !== false && (
                <a
                  href={doc.cycle_position.sources[0]}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-1.5 text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
                >
                  source
                </a>
              )}
          </p>
        )}

        {ranges.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
                  <th className="py-1.5 pr-3 font-medium">Tier</th>
                  <th className="py-1.5 pr-3 font-medium">Cap-rate range</th>
                  <th className="py-1.5 font-medium">Provenance</th>
                </tr>
              </thead>
              <tbody>
                {ranges.map((r) => (
                  <tr key={r.tier} className="border-b border-line/60">
                    <td className="py-1.5 pr-3 text-xs">{r.tier}</td>
                    <td className="py-1.5 pr-3 font-mono tabular-nums">
                      {r.low === r.high
                        ? `${((r.low ?? 0) * 100).toFixed(2).replace(/\.?0+$/, "")}%`
                        : `${((r.low ?? 0) * 100).toFixed(2).replace(/\.?0+$/, "")}%–${((r.high ?? 0) * 100).toFixed(2).replace(/\.?0+$/, "")}%`}
                    </td>
                    <td className="py-1.5 text-[11px] text-muted">
                      {r.status ?? "sourced"}
                      {r.sources?.[0] && linkOk(r.sources[0]) !== false && (
                        <>
                          {" · "}
                          <a
                            href={r.sources[0]}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-dotted underline-offset-2 hover:text-ink"
                          >
                            source
                          </a>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {unpriced.length > 0 && (
          <p className="text-[11px] text-muted">
            {unpriced.length} tier{unpriced.length === 1 ? "" : "s"} without a
            confirmable range — shown as gaps, never estimated:{" "}
            {unpriced.map((r) => r.tier).filter(Boolean).join("; ")}.
          </p>
        )}

        <SectorLeaderboard sector={active.id} />

        {(supply || debt) && (
          <div className="grid gap-3 sm:grid-cols-2">
            {supply && (
              <div className="rounded-lg border border-line/70 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  Supply &amp; demand
                </p>
                <p className="mt-1 text-sm leading-relaxed">{supply}</p>
              </div>
            )}
            {debt && (
              <div className="rounded-lg border border-line/70 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  Debt terms
                </p>
                <p className="mt-1 text-sm leading-relaxed">{debt}</p>
              </div>
            )}
          </div>
        )}

        {verdict && (
          <div className="rounded-xl border border-brand/25 bg-brand/[0.04] p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-semibold ${
                  verdict.accessible ? "bg-pass/10 text-pass" : "bg-kill/10 text-kill"
                }`}
              >
                {verdict.accessible ? "Accessible at $1–2M" : "Not accessible direct"}
              </span>
              <span className="text-[11px] uppercase tracking-wide text-muted">
                small-investor verdict
              </span>
            </div>
            {verdict.entry_vehicle && (
              <p className="mt-1.5 text-sm font-medium">{verdict.entry_vehicle}</p>
            )}
            {verdict.reasoning && (
              <p className="mt-1 text-sm leading-relaxed text-muted">{verdict.reasoning}</p>
            )}
          </div>
        )}

        {(doc.gaps?.length ?? 0) > 0 && (
          <p className="text-[11px] leading-relaxed text-muted">
            Named gaps: {doc.gaps!.join(" · ")}
          </p>
        )}
      </div>
    </section>
  );
}

// ── Live rates (research build) ───────────────────────────────────────────────
// Newest observation per FRED series from the rates table (daily cron);
// falls back to the checked-in PMMS snapshot so the strip is never empty.
async function RatesStrip() {
  const supabase = await createSupabaseServerClient();
  let rows: { series_id: string; obs_date: string; value: number; label: string | null }[] = [];
  try {
    const { data } = await supabase
      .from("rates")
      .select("series_id, obs_date, value, label")
      .order("obs_date", { ascending: false })
      .limit(40);
    const newest = new Map<string, (typeof rows)[number]>();
    for (const r of (data as typeof rows | null) ?? []) {
      if (!newest.has(r.series_id)) newest.set(r.series_id, r);
    }
    rows = [...newest.values()];
  } catch {
    // 0023 not migrated — fall through to the snapshot
  }
  if (rows.length === 0) {
    const pmms = seedBenchmarks().find((b) => b.metric === "pmms_30y_fixed");
    if (pmms?.low != null) {
      rows = [
        {
          series_id: "MORTGAGE30US",
          obs_date: pmms.as_of,
          value: pmms.low,
          label: "Freddie Mac PMMS 30-Year Fixed",
        },
      ];
    }
  }
  if (rows.length === 0) return null;

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold tracking-tight">Rates</h2>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        {rows.map((r) => (
          <div key={r.series_id}>
            <p className="text-[11px] uppercase tracking-wide text-muted">
              {r.label ?? r.series_id}
            </p>
            <p className="mt-0.5 font-mono text-base font-semibold tabular-nums">
              {r.value}%{" "}
              <a
                href={`https://fred.stlouisfed.org/series/${r.series_id}`}
                target="_blank"
                rel="noreferrer"
                className="text-[11px] font-normal text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
              >
                {r.series_id} · as of {r.obs_date}
              </a>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        FRED, pulled daily by the rates cron; the screen&apos;s debt assumptions
        read these instead of hardcoded numbers.
      </p>
    </section>
  );
}

// ── Daily intel digest (research build) ──────────────────────────────────────
interface DigestHead {
  digest_date: string;
  item_count: number;
}

async function IntelDigestCard() {
  const supabase = await createSupabaseServerClient();
  let digest: DigestHead | null = null;
  let items: {
    url: string;
    title: string;
    source: string | null;
    relevance: number | null;
    action: string | null;
  }[] = [];
  try {
    const [{ data: d }, { data: it }] = await Promise.all([
      supabase
        .from("market_intel_digests")
        .select("digest_date, item_count")
        .order("digest_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("market_intel_items")
        .select("url, title, source, relevance, action")
        .gte("relevance", 6)
        .order("created_at", { ascending: false })
        .limit(6),
    ]);
    digest = (d as DigestHead | null) ?? null;
    items = (it as typeof items | null) ?? [];
  } catch {
    // 0024 not migrated — render the setup note below
  }

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Daily intel</h2>
        {digest && (
          <span className="text-[11px] text-muted">
            latest digest {digest.digest_date} · {digest.item_count} notable
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          The weekday intel job hasn&apos;t landed anything notable yet. It
          watches rent-regulation news for your jurisdictions plus rates, tax,
          and HUD policy, scores each item for your buy box, and flags likely
          rule changes as red banners.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {items.map((it) => (
            <li key={it.url} className="text-sm leading-snug">
              <span className="mr-2 rounded bg-faint px-1.5 py-px font-mono text-[11px] tabular-nums text-muted">
                {it.relevance}/10
              </span>
              <a
                href={it.url}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-brand"
              >
                {it.title}
              </a>
              {it.source && <span className="ml-1 text-xs text-muted">({it.source})</span>}
              {it.action && (
                <p className="ml-12 mt-0.5 text-xs text-muted">→ {it.action}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function MarketCard({ g }: { g: MarketGroup }) {
  const calls = (
    [
      ["pass", g.calls.pass],
      ["caution", g.calls.caution],
      ["pass_on", g.calls.pass_on],
    ] as const
  ).filter(([, n]) => n > 0);

  return (
    <section className="shadow-card flex flex-col rounded-2xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold tracking-tight">
            {g.market}
          </h2>
          <p className="mt-0.5 text-xs capitalize text-muted">{g.assetClass}</p>
        </div>
        <span className="shrink-0 rounded-full bg-faint px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted">
          {g.count} screen{g.count === 1 ? "" : "s"}
        </span>
      </div>

      <dl className="mt-4 space-y-2.5">
        <Stat label="Going-in cap" value={g.cap ? fmtCapRange(g.cap) : null} />
        <Stat
          label={g.perUnit?.basis === "sf" ? "Basis / SF" : "Basis / unit"}
          value={g.perUnit ? fmtBasisRange(g.perUnit) : null}
        />
      </dl>

      {calls.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-3 text-xs">
          {calls.map(([key, n]) => (
            <span key={key} className={CALL_META[key].cls}>
              <span className="font-mono tabular-nums">{n}</span> {CALL_META[key].label}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">
        {value ?? <span className="text-line">—</span>}
      </dd>
    </div>
  );
}
