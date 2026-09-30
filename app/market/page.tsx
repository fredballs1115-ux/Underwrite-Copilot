import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import { MarketBand } from "@/app/place-band";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import {
  basisLabel,
  buildComps,
  summarizeMarkets,
  fmtCapRange,
  explorerLeads,
  fmtBasisRange,
  marketsIn,
  type MarketGroup,
} from "@/lib/market-memory";
import { RatesStrip } from "@/app/rates-strip";
import { liveMetricRates, liveMetroRates, liveRates } from "@/lib/live-rates-read";
import type { LiveRate } from "@/lib/live-rates";
import { sectorPayrollMetric } from "@/lib/live-market-brief";
import { SectorJobsRank } from "./sector-jobs-rank";
import { BOARD_METRICS, SectorJobsBoard } from "./sector-jobs-board";
import { SurveyVacancyBoard } from "./survey-vacancy-board";
import { DATA_METROS } from "@/lib/market-match";
import { marketMeta, marketPageFor, sectorPageFor } from "@/lib/public-pages";
import { marketHeading, publicMetadata } from "@/lib/page-meta";
import { heatShade } from "./heat-shade";
import { MetroLive } from "./metro-live";
import { ReadOnlyMetroView } from "./read-only-metro";
import { LessorRentLine } from "./lessor-rent-line";
import { SectorJobsLine } from "./sector-jobs-line";
import { liveZori, liveZoriAll } from "@/lib/zori-read";
import type { ZoriRead } from "@/lib/zori";
import { RentBoard } from "./rent-board";
import { ZoriLine } from "./zori-line";
import { liveRealtor } from "@/lib/realtor-read";
import { RealtorLine } from "./realtor-line";
import { mergeBenchmarks, seedBenchmarks, seedRules } from "@/lib/research-data";
import { DC_AREA_METRO, FMR_BEDS, fmrEffectiveOf, fmrLabel, fmrOf, fmrTwoBed, fmrWhen, readFmrMetric } from "@/lib/fmr";
import { datedLong } from "@/lib/debt-index";
import { asOfLabel } from "@/lib/research";
import { linkOk } from "@/lib/link-audit";
import { assetClassLabel } from "@/lib/asset-class";
import { looseValue, SECTORS } from "@/lib/research-sectors";
import { COVERAGE_DISCOVERY, COVERAGE_SUMMARY, PROVIDERS, compsFeedLive } from "@/lib/public-comps/core";
import metrosSeed from "@/data/research/metros.json";
import multifamilySeed from "@/data/research/multifamily.json";
import {
  sectorLeaderboard,
  type SnapBlock,
} from "@/lib/sector-leaderboard";
import { SubmarketsPanel } from "./submarkets-panel";
import { listSubmarkets } from "@/lib/market/store";
import type { Submarket } from "@/lib/market/types";
import { MarketCompare } from "./market-compare";
import { COMPARE_METROS } from "./compare-metros";
import { Fold } from "./fold";
import { FmrRow } from "./fmr-row";

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
// Where each metro sits in its sector's cross-metro ranking (tightest first),
// keyed sector → metro id — same shared builder the leaderboard table and the
// homepage lens render, so a brief's chip can never disagree with the table.
// Metros without a numeric vacancy for a sector simply have no rank entry.
const SECTOR_RANKS: Record<
  string,
  Record<string, { rank: number; total: number }>
> = Object.fromEntries(
  ["office", "industrial", "multifamily", "retail"].map((sec) => {
    const ranked = sectorLeaderboard(sec).rows.filter((r) => r.vLow !== null);
    return [
      sec,
      Object.fromEntries(
        ranked.map((r, i) => [r.id, { rank: i + 1, total: ranked.length }]),
      ),
    ];
  }),
);
function SectorSnapshotPanel({
  snapshot,
  metroId,
  national = [],
  metroRates = [],
}: {
  snapshot: Record<string, unknown> | null;
  metroId?: string;
  /** the national rates table (`liveRates`), for each commercial sector's
   *  lessor rent index line — the nation's figure, said so, under the
   *  metro's tracker fundamentals */
  national?: readonly LiveRate[];
  /** the metro's own rows (`liveMetroRates`), for each commercial sector's
   *  payrolls line — the metro's figure in the sector that fills its kind
   *  of building, the one the market check reads for a deal of that kind */
  metroRates?: readonly LiveRate[];
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
          Sector fundamentals not yet researched for this metro.
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
                  {metroId && SECTOR_RANKS[sector]?.[metroId] && (
                    <Link
                      href={`/market?sector=${sector}`}
                      prefetch={false}
                      title={`rank among covered-market ${SECTOR_LABEL[sector] ?? sector} vacancy reads, tightest first`}
                      className="rounded-full border border-line px-1.5 py-px text-[10px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
                    >
                      #{SECTOR_RANKS[sector][metroId].rank} of{" "}
                      {SECTOR_RANKS[sector][metroId].total}
                    </Link>
                  )}
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
                <SectorJobsLine rates={metroRates} sector={sector} />
                <LessorRentLine national={national} sector={sector} />
                {b.note && (
                  <Fold
                    text={b.note}
                    className="mt-1 text-[11px] leading-relaxed text-muted"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Each metro and sector page names itself (#430): its own title, what it
// holds, and itself as canonical — forty-odd pages had gone out as one.
export async function generateMetadata({
  searchParams,
}: {
  searchParams?: Promise<{ metro?: string; sector?: string }>;
}): Promise<Metadata> {
  const { metro, sector } = (await searchParams) ?? {};
  // A child's openGraph and twitter REPLACE the root's wholesale, so the
  // preview's title, description and picture are all stated — a shared
  // market page had gone out under the homepage's title and card (#436).
  // The one helper every public page states its own through.
  return publicMetadata(marketMeta(marketPageFor(metro), sectorPageFor(sector)));
}

const CALL_META: Record<string, { label: string; cls: string }> = {
  pass: { label: "Go", cls: "text-pass" },
  caution: { label: "Caution", cls: "text-caution" },
  pass_on: { label: "No-go", cls: "text-kill" },
};

export default async function MarketDataPage({
  searchParams,
}: {
  searchParams?: Promise<{ metro?: string; sector?: string; submarketError?: string }>;
}) {
  const {
    metro: metroParam,
    sector: sectorParam,
    submarketError,
  } = (await searchParams) ?? {};
  const pageMetro = marketPageFor(metroParam);
  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();

  // Own-account only (Feature 6): the deals THIS user created — never a
  // teammate's, never another account's. RLS also allows team deals, so the
  // explicit user_id filter is what keeps this memory private to the buyer.
  // The reader's own submarkets are read beside it: the page puts the
  // covered markets first for a reader with neither.
  const [{ data, error }, submarkets] = user
    ? await Promise.all([
        supabase
          .from("deals")
          .select("id, name, asset_class, created_at, is_sample, verdict, extraction")
          .eq("user_id", user.id)
          .not("extraction", "is", null)
          .order("created_at", { ascending: false })
          .limit(500),
        // Migration 0033 not applied yet: the table is missing, the list
        // is empty, and a create attempt says so itself.
        listSubmarkets(supabase, user.id).catch((): Submarket[] => []),
      ])
    : [{ data: null, error: null }, [] as Submarket[]];

  const groups = data
    ? summarizeMarkets(buildComps(data as Parameters<typeof buildComps>[0]))
    : [];
  const totalScreens = groups.reduce((n, g) => n + g.count, 0);
  // A card is one market × one asset class; the line counts the markets.
  const marketCount = marketsIn(groups);
  // A reader with no screens on file and no submarkets came for the covered
  // markets ("Browse the covered markets →"): the explorer leads, and the
  // two empty states follow it rather than pushing it below the fold.
  const explorerFirst = explorerLeads({
    signedIn: !!user,
    memoryFailed: !!error,
    groups: groups.length,
    submarkets: submarkets.length,
  });
  const explorer = <MetroExplorer selected={metroParam} />;

  return (
    <div className="space-y-6">
      {user ? (
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your market data</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Going-in caps and basis from your own screens, by market and asset
            class. Private to you.
          </p>
        </div>
      ) : (
        // Anonymous visitors land here from the homepage/why/demo marquee —
        // lead with the research layer itself, not "your" data they don't
        // have yet. The signed-in memory blocks below are user-gated.
        // A metro's own page (`?metro=`, one of forty-odd a search engine
        // reads apart) names the metro in its one h1, as its title does; the
        // band further down keeps its h3, as every section of /market does.
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">
            {marketHeading(pageMetro)}
          </h1>
          {/* A metro area read without a brief has no rules, fair market
              rents or sales coverage; its own view says what it holds. */}
          {pageMetro && !pageMetro.briefed ? null : (
            <p className="mt-1 max-w-2xl text-sm text-muted">
              Rules, FMRs, benchmarks and sales coverage for the covered markets.
            </p>
          )}
        </div>
      )}

      {explorerFirst ? explorer : null}

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
          {/* The memory keeps only the screens that left a cap or a basis
              behind (lib/market-memory `buildComps`), so that is what the
              count says it counts. */}
          <p className="text-xs text-muted">
            {totalScreens} screen{totalScreens === 1 ? "" : "s"} with a cap or basis on file, across{" "}
            {marketCount} market{marketCount === 1 ? "" : "s"}.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((g) => (
              <MarketCard key={`${g.assetClass}|${g.marketKey}`} g={g} />
            ))}
          </div>
        </>
      )}

      {/* The user's own submarkets — supply, rent trend and vacancy from their
          own market exports, checked against deal assumptions. Part of the
          market picture, so it lives here rather than in a section of its own;
          /submarkets redirects to this anchor. */}
      {user ? <SubmarketsPanel submarkets={submarkets} errorCode={submarketError} /> : null}

      {explorerFirst ? null : explorer}
      {/* Side-by-side: any two covered markets on one shared dollar scale,
          straight off the research layer. */}
      <MarketCompare metros={COMPARE_METROS} today={todayIso()} />
      {/* The research layer at a glance — every market × every asset class. */}
      <SectorHeatGrid />
      {/* The same board over the demand side: every metro area × every
          sector's payrolls against a year ago, live from FRED. */}
      <SectorJobsBoardLive />
      <SurveyVacancyBoardLive />
      <RentBoardLive />
      <MidAtlanticTable />
      <SectorExplorer selected={sectorParam} />
      <LiveRatesStrip />
      <IntelDigestCard />
    </div>
  );
}

// ── Mid-Atlantic market table (research build) ───────────────────────────────
// The seeded + DB-merged benchmarks as one table: 2-4 unit medians, monthly
// sales, and active listings per metro, plus the DC area's fair market rents
// (the newest fiscal year on file, named from the rows' own metric) —
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
      m !== DC_AREA_METRO &&
      coveredCities.has(m.split(",")[0].trim().toLowerCase())
  );
  const get = (metro: string, metric: string) =>
    mf.find((b) => b.metro === metro && b.metric === metric);
  // The Washington area's fair market rents, bedroom by bedroom, each read
  // through lib/fmr's metric reader — one fiscal year, since the merge keeps
  // only the newest — so the line names the year its rows are for.
  const dcFmr = mf
    .flatMap((b) => {
      const m = readFmrMetric(b.metric);
      return b.metro === DC_AREA_METRO && m && typeof b.low === "number" ? [{ b, low: b.low, ...m }] : [];
    })
    .sort((x, y) => FMR_BEDS.indexOf(x.bed) - FMR_BEDS.indexOf(y.bed));
  const dcEffective = fmrEffectiveOf(dcFmr[0]?.b.note);
  // The year's day it took effect — or, past its last day, that it ended.
  const dcWhen = dcFmr.length > 0 ? fmrWhen({ fy: dcFmr[0].fy, effective: dcEffective }, todayIso()) : null;
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
      {dcFmr.length > 0 && (
        <p className="mt-3 border-t border-line pt-2 text-xs text-muted">
          {`DC-area ${fmrLabel(dcFmr[0].fy)} HUD fair market rents${dcWhen?.text ? `, ${dcWhen.text}` : ""}: `}
          {dcFmr.map((r) => `${r.bed.toUpperCase()} $${r.low.toLocaleString("en-US")}`).join(" · ")}{" "}
          <span className="text-[11px]">
            {`(${dcFmr[0].b.status})`}
            {dcFmr[0].b.source && linkOk(dcFmr[0].b.source) !== false && (
              <>
                {" "}
                <a
                  href={dcFmr[0].b.source}
                  target="_blank"
                  rel="noreferrer"
                  className="underline decoration-dotted underline-offset-2 hover:text-ink"
                >
                  source
                </a>
              </>
            )}
          </span>
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
        . Every figure carries its source and as-of date.
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

function MetroChips({ active }: { active: string }) {
  const metros = metrosSeed.metros ?? [];
  const chip = (id: string, name: string) => (
    <Link
      key={id}
      href={`/market?metro=${id}`}
      prefetch={false}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        id === active
          ? "border-brand bg-brand text-white"
          : "border-line text-muted hover:border-brand hover:text-brand"
      }`}
    >
      {name}
    </Link>
  );
  const readOnlyOpen = DATA_METROS.some((m) => m.id === active);
  return (
    <div className="mt-3 space-y-3">
      {REGION_ORDER.map((region) => {
        const group = metros.filter(
          (m) => ((m as { region?: string }).region ?? "More markets") === region
        );
        if (group.length === 0) return null;
        return (
          <div key={region}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              {region}{" "}
              <span className="ml-1 font-normal normal-case tracking-normal">
                · {group.length} metro{group.length === 1 ? "" : "s"}
              </span>
            </h3>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{group.map((m) => chip(m.id, m.name))}</div>
          </div>
        );
      })}
      {/* The metro areas read without a brief (#404), folded: the same
          live figures, none of the research, and a row of twenty-six chips
          is a wall rather than a directory. Open where one is the page. */}
      <details open={readOnlyOpen || undefined} className="group">
        <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-wider text-muted [&::-webkit-details-marker]:hidden">
          Read without a brief{" "}
          <span className="ml-1 font-normal normal-case tracking-normal">
            {`· ${DATA_METROS.length} metro areas with live figures and no research note — `}
            <span className="underline decoration-dotted underline-offset-2 group-open:hidden">show</span>
            <span className="hidden underline decoration-dotted underline-offset-2 group-open:inline">hide</span>
          </span>
        </summary>
        <div className="mt-1.5 flex flex-wrap gap-1.5">{DATA_METROS.map((m) => chip(m.id, m.name))}</div>
      </details>
    </div>
  );
}

/** Today as an ISO day — read here, outside the render, since it reads the
 *  clock; the fair market rent row says a year past its end has ended. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

async function MetroExplorer({ selected }: { selected?: string }) {
  const metros = metrosSeed.metros ?? [];
  // A metro area read without a brief (#404) gets its own page body: the
  // same live pictures, none of the research a briefed market carries.
  const readOnly = metros.some((m) => m.id === selected) ? null : (DATA_METROS.find((m) => m.id === selected) ?? null);
  if (readOnly) {
    const [rates, zori, realtor] = await Promise.all([
      liveMetroRates(readOnly.id),
      liveZori(readOnly.name),
      liveRealtor(readOnly.name),
    ]);
    return (
      <section id="explorer" className="shadow-card scroll-mt-6 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-sm font-semibold tracking-tight">Metro explorer</h2>
        <MetroChips active={readOnly.id} />
        <ReadOnlyMetroView metro={readOnly} rates={rates} zori={zori} realtor={realtor} />
      </section>
    );
  }
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
  const stockRead = async (): Promise<{ parcels: number; sales: number } | null> => {
    if (!ingestMarket) return null;
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
      return (p.count ?? 0) > 0 || (s.count ?? 0) > 0 ? { parcels: p.count ?? 0, sales: s.count ?? 0 } : null;
    } catch {
      // migration 0028 not run — no line
      return null;
    }
  };
  // None of the reads waits on another, so they run together — one read's
  // wall clock, not five, as the read-only branch above already does.
  const [stock, live, national, zori, realtor] = await Promise.all([
    stockRead(),
    // The metro's own figures, live from FRED — its unemployment, jobs,
    // permits and house prices, read the way the rates strip is and cached
    // per metro. A metro FRED does not publish for gets no panel.
    liveMetroRates(active.id),
    // The national table too (the strip's own cached read): each commercial
    // sector's lessor rent index rides under its tracker fundamentals.
    liveRates(),
    // What landlords are asking this month (Zillow's index, monthly), beside
    // HUD's two-bedroom fair market rent — two different measures, both shown.
    liveZori(active.name),
    // The for-sale market this month (Realtor.com's inventory, monthly) —
    // the demand side an apartment underwrite is quietly assuming.
    liveRealtor(active.name),
  ]);
  // HUD's fair market rent through the one reader (lib/fmr): the fiscal
  // year, the day it takes effect and HUD's name for the area are the
  // block's own, so the row cannot print one year's rents as another's.
  const fmr = fmrOf(active);
  const providers = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));
  // "Live" only where the provider registry runs the feed (compsFeedLive): a
  // provider documented and waiting on its fields is said as that.
  const compsProvider = providers[active.comps_provider as string] ?? null;
  const compsLine =
    active.comps_provider === null
      ? "No live sales feed for this metro yet."
      : active.comps_provider === "discovery"
        ? "Recorded-sales comps staged in discovery mode — the health check resolves the endpoints."
        : compsFeedLive(active.comps_provider)
          ? `Recorded-sales comps LIVE via ${compsProvider?.name ?? active.comps_provider}.`
          : `Recorded-sales comps: ${compsProvider?.name ?? active.comps_provider} is documented, not yet wired.`;
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
    <section id="explorer" className="shadow-card scroll-mt-6 rounded-2xl border border-line bg-surface p-5">
      <h2 className="text-sm font-semibold tracking-tight">Metro explorer</h2>
      <MetroChips active={active.id} />

      <div className="mt-4 space-y-4">
        {/* The brief opens on the market itself — its own skyline where one
            is verified, its USGS frame otherwise (app/place-band); a metro
            with neither keeps the flat band. */}
        <MarketBand
          metro={active.id}
          eyebrow={(active as { region?: string }).region ?? "More markets"}
          name={active.name}
          eager
        />
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
          metroId={active.id}
          national={national}
          metroRates={live}
        />

        <FmrRow name={active.name} fmr={fmr} today={todayIso()} />

        <ZoriLine z={zori} fmr2br={fmrTwoBed(fmr)} today={todayIso()} />

        <RealtorLine r={realtor} />

        <MetroLive rates={live} metroId={active.id} metroName={active.name} />

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
                  {r.effect.split(". ")[0].replace(/\.\s*$/, "")}.
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
                    <>
                      {" "}
                      <span className="ml-1 font-mono tabular-nums">
                        ${e.price.toLocaleString()}
                      </span>
                    </>
                  )}{" "}
                  <span className="ml-1 text-xs text-muted">
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

// ── Coverage heat grid (every metro × every asset class) ─────────────────────
// The whole research layer in one table: 18 metro entries down, four asset
// classes across, each cell the metro's vacancy read for that class. Shading
// is computed WITHIN each column — office compares to office, never to
// industrial, because a 5% industrial market and a 5% office market are not
// the same news. Cells with no numeric read render as gaps and say why, so
// the grid shows coverage honestly rather than implying completeness.
const HEAT_SECTORS = ["office", "industrial", "multifamily", "retail"] as const;

function SectorHeatGrid() {
  // Rank position per (sector, metro) drives the shade; the shared builder is
  // the same one the leaderboard, the rank chips, and /demo read.
  const ranks = new Map<string, { t: number; label: string }>();
  for (const sec of HEAT_SECTORS) {
    const rows = sectorLeaderboard(sec).rows.filter((r) => r.vLow !== null);
    rows.forEach((r, i) => {
      const hi = r.vHigh ?? r.vLow!;
      ranks.set(`${sec}|${r.id}`, {
        // 0 = tightest in this column, 1 = loosest.
        t: rows.length > 1 ? i / (rows.length - 1) : 0,
        label: r.vLow === hi ? `${r.vLow}` : `${r.vLow}–${hi}`,
      });
    });
  }
  const metros = (metrosSeed.metros ?? []) as {
    id: string;
    name: string;
    region?: string;
  }[];
  const regions: string[] = [];
  for (const m of metros) {
    const r = m.region ?? "More markets";
    if (!regions.includes(r)) regions.push(r);
  }
  const filled = ranks.size;
  const total = metros.length * HEAT_SECTORS.length;
  // The snapshots' own dates: the board is dated research, a quarter's
  // prints, and says as of when — one date, or the span where they differ.
  const snapDates = [
    ...new Set(
      (metrosSeed.metros ?? [])
        .map((m) => (m as { sector_snapshot?: { as_of?: unknown } | null }).sector_snapshot?.as_of)
        .filter((d): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)),
    ),
  ].sort();
  const boardAsOf =
    snapDates.length === 0
      ? "undated"
      : snapDates.length === 1
        ? `as of ${datedLong(snapDates[0])}`
        : `as of ${datedLong(snapDates[0])} to ${datedLong(snapDates[snapDates.length - 1])}`;
  // Emerald (tight) → amber (loose), low alpha so the figure stays readable
  // — the one shade every board on this page uses (app/market/heat-shade).
  const shade = heatShade;

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          The whole board — vacancy by market and asset class
        </h2>
        <span className="text-[11px] text-muted">
          {`Research ${boardAsOf} · ${filled} of ${total} cells carry a numeric read · shaded within each column, so office compares to office`}
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-3 font-medium">Market</th>
              {HEAT_SECTORS.map((s) => (
                <th key={s} className="py-1.5 pr-3 text-center font-medium">
                  <Link
                    href={`/market?sector=${s}`}
                    prefetch={false}
                    className="transition-colors hover:text-brand"
                  >
                    {SECTOR_LABEL[s]} %
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {regions.map((region) => (
              <Fragment key={region}>
                <tr>
                  <td
                    colSpan={HEAT_SECTORS.length + 1}
                    className="pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted"
                  >
                    {region}
                  </td>
                </tr>
                {metros
                  .filter((m) => (m.region ?? "More markets") === region)
                  .map((m) => (
                    <tr key={m.id} className="border-b border-line/60">
                      <td className="py-1.5 pr-3">
                        <Link
                          href={`/market?metro=${m.id}`}
                          prefetch={false}
                          className="text-xs font-medium underline decoration-dotted underline-offset-2 hover:text-brand"
                        >
                          {m.name}
                        </Link>
                      </td>
                      {HEAT_SECTORS.map((s) => {
                        const cell = ranks.get(`${s}|${m.id}`);
                        return (
                          <td key={s} className="px-1 py-1">
                            {cell ? (
                              <div
                                className="rounded-md px-1.5 py-1 text-center font-mono text-xs tabular-nums text-ink"
                                style={{ backgroundColor: shade(cell.t) }}
                                title={`${SECTOR_LABEL[s]} vacancy — shaded by rank within this column, tightest first`}
                              >
                                {cell.label}
                              </div>
                            ) : (
                              <div
                                className="rounded-md border border-dashed border-line/70 px-1.5 py-1 text-center text-[11px] text-muted"
                                title="No numeric level on file for this market and asset class — a recorded gap, never estimated."
                              >
                                —
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Sourced figures; a band is shown as a band; a dash is a recorded gap,
        explained in the metro brief.
      </p>
    </section>
  );
}

// ── Payroll growth board (every metro area × every sector) ──────────────────
// Six cached reads, one a metric across the metros; a failed read leaves the
// board out rather than half-drawn, and the pure board draws nothing until
// a pull has written a fresh row.
async function SectorJobsBoardLive() {
  const rates: Partial<Record<(typeof BOARD_METRICS)[number], LiveRate[]>> = {};
  try {
    const reads = await Promise.all(BOARD_METRICS.map((metric) => liveMetricRates(metric)));
    BOARD_METRICS.forEach((metric, i) => {
      rates[metric] = reads[i];
    });
  } catch (err) {
    console.warn("payroll board read failed:", err instanceof Error ? err.message : err);
    return null;
  }
  // The briefed markets by region, then the metro areas read without a
  // brief as one block of their own (#403) — the same series, ranked in
  // the same columns, no market page behind the name.
  const markets = [
    ...(metrosSeed.metros ?? []).map((m) => ({
      id: m.id,
      name: m.name,
      region: (m as { region?: string }).region,
    })),
    ...DATA_METROS.map((m) => ({ id: m.id, name: m.name, region: "Read without a brief", briefed: false })),
  ];
  return <SectorJobsBoard markets={markets} rates={rates} />;
}

// ── Survey vacancy board (every metro area the site reads) ──────────────────
// One cached read across the metros and the strip's own for the national
// rate; a failed read leaves the board out rather than half-drawn.
async function SurveyVacancyBoardLive() {
  let rates: LiveRate[];
  let us: LiveRate | null = null;
  try {
    const [r, national] = await Promise.all([liveMetricRates("rental_vacancy_msa"), liveRates()]);
    rates = r;
    us = national.find((x) => x.meta.id === "RRVRUSQ156N") ?? null;
  } catch (err) {
    console.warn("survey vacancy board read failed:", err instanceof Error ? err.message : err);
    return null;
  }
  const markets = [
    ...(metrosSeed.metros ?? []).map((m) => ({ id: m.id, name: m.name })),
    ...DATA_METROS.map((m) => ({ id: m.id, name: m.name, briefed: false })),
  ];
  return <SurveyVacancyBoard markets={markets} rates={rates} us={us} />;
}

// ── Rent board (every metro area the site reads, one Zillow read) ──────────
async function RentBoardLive() {
  const markets = [
    ...(metrosSeed.metros ?? []).map((m) => ({ id: m.id, name: m.name })),
    ...DATA_METROS.map((m) => ({ id: m.id, name: m.name, briefed: false })),
  ];
  let reads: Map<string, ZoriRead | null>;
  try {
    reads = await liveZoriAll(markets.map((m) => m.name));
  } catch (err) {
    console.warn("rent board read failed:", err instanceof Error ? err.message : err);
    return null;
  }
  return <RentBoard markets={markets} reads={reads} />;
}

// ── Sector leaderboard (cross-metro) ─────────────────────────────────────────
// The same snapshot blocks the metro tiles render, flipped the other way: one
// asset class at a time, every covered market with a numeric read, ranked
// tightest to loosest — built by the shared lib/sector-leaderboard helper
// (the homepage sector-lens strip derives from the same function). Only the
// four snapshot-tracked classes produce rows; other sector tabs render the
// research doc alone.
async function SectorLeaderboard({ sector }: { sector: string }) {
  const { rows, heldOpen } = sectorLeaderboard(sector);
  if (rows.length === 0 && heldOpen.length === 0) return null;
  const label = SECTOR_LABEL[sector] ?? sector;
  // The demand side, live: the same markets ranked by their payrolls in the
  // sector that fills this kind of building (all payrolls for apartments),
  // one cached read of that metric across the metros. A failed read leaves
  // the vacancy table as it was.
  const payrollMetric = sectorPayrollMetric(sector);
  let payrolls: LiveRate[] = [];
  if (payrollMetric) {
    try {
      payrolls = await liveMetricRates(payrollMetric);
    } catch (err) {
      console.warn("sector payrolls read failed:", err instanceof Error ? err.message : err);
    }
  }
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
                      prefetch={false}
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
      {payrollMetric && payrolls.length > 0 && (
        <SectorJobsRank
          metric={payrollMetric}
          markets={rows.map((r) => ({ id: r.id, name: r.name }))}
          rates={payrolls}
        />
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
          {`${asOfLabel(doc.as_of)} · ranges, never single numbers`}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SECTORS.map((x) => (
          <Link
            key={x.id}
            href={`/market?sector=${x.id}`}
            prefetch={false}
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
                <Fold text={supply} className="mt-1 text-sm leading-relaxed" />
              </div>
            )}
            {debt && (
              <div className="rounded-lg border border-line/70 p-3">
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  Debt terms
                </p>
                <Fold text={debt} className="mt-1 text-sm leading-relaxed" />
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
              <Fold
                text={verdict.reasoning}
                className="mt-1 text-sm leading-relaxed text-muted"
              />
            )}
          </div>
        )}

        {(doc.gaps?.length ?? 0) > 0 && (
          <details className="text-[11px] leading-relaxed text-muted">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
              Named gaps · {doc.gaps!.length}{" "}
              <span className="font-medium text-brand">show</span>
            </summary>
            <p className="mt-1">{doc.gaps!.join(" · ")}</p>
          </details>
        )}
      </div>
    </section>
  );
}

// ── Live rates (research build) ───────────────────────────────────────────────
//
// The shared strip (app/rates-strip.tsx), fed by the shared read. This page
// had its own copy, and that copy had a bug this page could not see: it went
// through the request-scoped Supabase client, migration 0023 grants `select`
// on `rates` `to authenticated`, and /market is PUBLIC. So a signed-in
// visitor saw four live rates and everyone else silently got the checked-in
// PMMS snapshot — one figure, dated whenever it was committed — with nothing
// on the page to say which of the two they were looking at.
//
// The service-role read has no such split, and the strip renders nothing at
// all when it comes back empty, which is the honest version of "never empty".
async function LiveRatesStrip() {
  const rates = await liveRates();
  // Nothing on this page pre-fills a field from them, so no series is marked.
  return <RatesStrip rates={rates} />;
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
        <h2 className="text-sm font-semibold tracking-tight">Weekday intel</h2>
        {digest && (
          <span className="text-[11px] text-muted">
            latest digest {digest.digest_date} · {digest.item_count} notable
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Nothing notable from the weekday intel job yet.
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
          <p className="mt-0.5 text-xs text-muted">{assetClassLabel(g.assetClass)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-faint px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted">
          {g.count} screen{g.count === 1 ? "" : "s"}
        </span>
      </div>

      <dl className="mt-4 space-y-2.5">
        <Stat label="Going-in cap" value={g.cap ? fmtCapRange(g.cap) : null} />
        <Stat label={basisLabel(g)} value={g.perUnit ? fmtBasisRange(g.perUnit) : null} />
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
