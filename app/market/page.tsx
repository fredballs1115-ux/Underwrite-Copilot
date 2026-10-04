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
import { regionCountLabel } from "@/lib/market-count";
import { marketMeta, marketPageFor, sectorPageFor } from "@/lib/public-pages";
import { marketHeading, publicMetadata } from "@/lib/page-meta";
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
import {
  sectorLeaderboard,
  sectorStandings,
  type SnapBlock,
  type Standing,
} from "@/lib/sector-leaderboard";
import { blockCitations, rentOf, rentText, snapshotAge, snapshotReadOn } from "@/lib/tracker-read";
import { oldestDate, researchAge, staleMark } from "@/lib/research-age";
import { datedNotes } from "@/lib/dated-window";
import { DatedNotes } from "@/app/dated-notes";
import { SubmarketsPanel } from "./submarkets-panel";
import { CoverageBoardCell, FigureCredits, LeaderboardTable, StandingChip, coverageCell, type CoverageCell } from "./tracker-boards";
import { listSubmarkets } from "@/lib/market/store";
import type { Submarket } from "@/lib/market/types";
import { MarketCompare } from "./market-compare";
import { COMPARE_METROS } from "./compare-metros";
import { Fold } from "./fold";
import { RuleItem } from "./rule-item";
import { IntelItems, digestLine, type IntelItem } from "./intel-items";
import { SourceRef } from "./source-ref";
import { ExampleListings } from "./example-listings";
import { examplesFor } from "@/lib/example-listings";
import { FmrRow } from "./fmr-row";

/** "By asset type" — the metro's sector fundamentals from the research
 *  layer's snapshot blocks: vacancy (a spread when trackers diverge — the
 *  divergence is shown, never averaged), asking rent, and cap-rate bands,
 *  each with its status chip and provenance note, and each figure credited
 *  to its own house, area and period and linked to its own source
 *  (lib/tracker-read `blockCitations`) — the snapshot's day is the day the
 *  research was read, never the figures' date. Metros without a snapshot
 *  say so honestly. */
const SECTOR_LABEL: Record<string, string> = {
  multifamily: "Multifamily",
  office: "Office",
  industrial: "Industrial",
  retail: "Retail",
};
// Where each metro's figure stands in its sector's cross-metro ranking
// (tightest first), keyed sector → metro id — the same shared builder the
// leaderboard table and the coverage board read (lib/sector-leaderboard
// `sectorStandings`), so a brief's chip can never disagree with the table.
// A figure the sources do not let the ranking place — undated, over a year
// old, a narrower stock, a spread of two reads — has a standing with its
// reason and no rank; a metro with no vacancy figure has none.
const TRACKED_SECTORS = ["office", "industrial", "multifamily", "retail"] as const;
function SectorSnapshotPanel({
  snapshot,
  today,
  metroId,
  standings = {},
  national = [],
  metroRates = [],
}: {
  snapshot: Record<string, unknown> | null;
  /** the day the page is read (an ISO day): past the research rule's limit
   *  the day the research was read is said with its age and marked stale */
  today: string;
  metroId?: string;
  /** each tracked sector's standings (`sectorStandings`), read for the day */
  standings?: Record<string, Record<string, Standing>>;
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
  // The day the research sweep read the blocks — never the figures' own
  // date, which each figure's credit line states — and, past the research
  // rule's limit (lib/research-age), its age and the stale mark: the
  // figures still show.
  const readOn = snapshotReadOn(snapshot);
  const stale = staleMark(snapshotAge(snapshot, today));
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        By asset type
        {readOn && (
          <span className="ml-1.5 font-normal normal-case tracking-normal">
            {`· research read ${datedLong(readOn)}`}
            {stale && (
              <span className="text-caution" data-qa="research-stale">
                {` (${stale})`}
              </span>
            )}
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
            // A band as the file states it, never a point made of one.
            const rent = rentOf(b);
            if (rent) {
              bits.push(`asking ${rentText(rent)}/SF${b.rent_basis ? ` (${b.rent_basis})` : ""}`);
            }
            if (
              typeof b.cap_rate_low_pct === "number" &&
              typeof b.cap_rate_high_pct === "number"
            ) {
              bits.push(
                b.cap_rate_low_pct === b.cap_rate_high_pct
                  ? `cap ${b.cap_rate_low_pct}%`
                  : `cap ${b.cap_rate_low_pct}–${b.cap_rate_high_pct}%`,
              );
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
                  {metroId && standings[sector]?.[metroId] && (
                    <StandingChip sector={sector} metroId={metroId} standing={standings[sector][metroId]} />
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
                </div>
                <FigureCredits figures={blockCitations(b)} />
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
  const tableStale = staleMark(researchAge(priceRows[0].price!.as_of, todayIso()));

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
          {`${priceRows[0].price!.as_of} · Redfin public dataset`}
          {/* The month's figures are dated its last day; past the research
              rule's limit (lib/research-age) the date says its age and that
              it is stale — the deal page's rows say the same of these rows. */}
          {tableStale && (
            <span className="text-caution" data-qa="research-stale">
              {` (${tableStale})`}
            </span>
          )}
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
                {`· ${regionCountLabel(region, group.length)}`}
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
  // The research's example listings for this market: each with the day the
  // research saw it listed and its source, and only where it is in this
  // market (lib/example-listings) — the DMV block's Dumfries, Virginia duplex
  // is Northern Virginia's, never Maryland's.
  const examples = examplesFor(active.id);
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
        <div>
          <p className="text-sm leading-relaxed">
            {(active.market_notes as { value?: string } | null)?.value}
            <span className={`ml-2 rounded px-1.5 py-px align-middle text-[10px] font-medium ${noteMeta}`}>
              {noteStatus}
            </span>
          </p>
          {/* A window the note states its figure for, ended — or a date it
              gives, come — said under the note, which stays as written
              (lib/dated-window). */}
          <DatedNotes
            notes={datedNotes((active.market_notes as { value?: string } | null)?.value, todayIso())}
            className="mt-1"
          />
        </div>

        <SectorSnapshotPanel
          snapshot={
            (active as {
              sector_snapshot?: Record<string, unknown> | null;
            }).sector_snapshot ?? null
          }
          today={todayIso()}
          metroId={active.id}
          standings={sectorStandings(TRACKED_SECTORS, todayIso())}
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
                <RuleItem key={r.id} rule={r} today={todayIso()} />
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

        <ExampleListings examples={examples} today={todayIso()} />
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
const HEAT_SECTORS = TRACKED_SECTORS;

/**
 * The days the research sweep read the covered markets' snapshots, as the
 * boards say them — "read Aug 25, 2026", or the span where they differ —
 * never the figures' own date (each figure is a house's print of its own
 * period, which the cell's title and the metro brief say); and, past the
 * research rule's limit on `today` (lib/research-age), the oldest read's age
 * and the stale mark. The coverage board and the sector leaderboard read
 * this one helper.
 */
function snapshotsRead(today: string): { asOf: string; stale: string | null } {
  const days = [
    ...new Set(
      (metrosSeed.metros ?? [])
        .map((m) => snapshotReadOn((m as { sector_snapshot?: unknown }).sector_snapshot))
        .filter((d): d is string => d !== null),
    ),
  ].sort();
  const asOf =
    days.length === 0
      ? "undated"
      : days.length === 1
        ? `read ${datedLong(days[0])}`
        : `read ${datedLong(days[0])} to ${datedLong(days[days.length - 1])}`;
  const mark = staleMark(researchAge(oldestDate(days), today));
  return { asOf, stale: mark ? (days.length > 1 ? `the oldest ${mark}` : mark) : null };
}

function SectorHeatGrid() {
  // Each market's standing per sector drives its cell: the figure and its own
  // period always, the shade only where the column ranks it — the shared
  // builder the leaderboard, the rank chips, and /demo read.
  const standings = sectorStandings(HEAT_SECTORS, todayIso());
  const cells = new Map<string, CoverageCell>();
  for (const sec of HEAT_SECTORS) {
    const marketsIn = Object.entries(standings[sec] ?? {});
    for (const [id, st] of marketsIn) cells.set(`${sec}|${id}`, coverageCell(st, st.total));
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
  const filled = cells.size;
  const rankedCells = [...cells.values()].filter((c) => c.t !== null).length;
  const total = metros.length * HEAT_SECTORS.length;
  const { asOf: boardAsOf, stale: boardStale } = snapshotsRead(todayIso());

  return (
    <section className="shadow-card rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          The whole board — vacancy by market and asset class
        </h2>
        <span className="text-[11px] text-muted">
          {`Research ${boardAsOf}`}
          {boardStale && (
            <span className="text-caution" data-qa="research-stale">
              {` (${boardStale})`}
            </span>
          )}
          {` · ${filled} of ${total} cells carry a numeric read, ${rankedCells} of them ranked · shaded within each column, so office compares to office`}
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
                      {HEAT_SECTORS.map((s) => (
                        <td key={s} className="px-1 py-1">
                          <CoverageBoardCell sector={s} cell={cells.get(`${s}|${m.id}`) ?? null} />
                        </td>
                      ))}
                    </tr>
                  ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted">
        Sourced figures, each with its own period; a band is shown as a band;
        a dashed cell is a figure the column does not rank (undated, over a
        year old, a narrower stock or a spread of two reads); a dash is a
        recorded gap, explained in the metro brief.
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
  // One row per distinct figure, ranked where the sources let the ranking
  // place it, read for today (lib/sector-leaderboard).
  const { rows, ranked, heldOpen } = sectorLeaderboard(sector, todayIso());
  if (rows.length === 0 && heldOpen.length === 0) return null;
  // Past the research rule's limit the table still ranks and shows its
  // figures, and says the day they were read, its age and that it is stale.
  const research = snapshotsRead(todayIso());
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
  return (
    <div>
      <LeaderboardTable
        sector={sector}
        rows={rows}
        ranked={ranked}
        heldOpen={heldOpen}
        stale={research.stale ? `research ${research.asOf} (${research.stale})` : null}
      />
      {payrollMetric && payrolls.length > 0 && (
        <SectorJobsRank
          metric={payrollMetric}
          markets={rows.flatMap((r) => r.markets)}
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
  // The day the sector's research was read, and past the research rule's
  // limit (lib/research-age) its age and the stale mark beside it.
  const docAsOf = typeof doc.as_of === "string" && /^\d{4}-\d{2}-\d{2}$/.test(doc.as_of) ? doc.as_of : null;
  const docStale = staleMark(researchAge(docAsOf, todayIso()));
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
        {/* The day the research was read — not any figure's own date — and
            what the table holds: a tier's cap as its source states it, a
            range or one figure. "Ranges, never single numbers" sat above
            6% and 6.2% (the research pass of 2026-10-01). */}
        <span className="text-[11px] text-muted">
          {docAsOf ? `research read ${datedLong(docAsOf)}` : asOfLabel(doc.as_of)}
          {docStale && (
            <span className="text-caution" data-qa="research-stale">
              {` (${docStale})`}
            </span>
          )}
          {" · each tier's cap as its source states it, a range or one figure"}
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
            <SourceRef source={doc.cycle_position.sources?.[0]} className="ml-1.5 text-[11px] text-muted" />
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
                      {r.sources?.[0] && (
                        <>
                          {" · "}
                          <SourceRef source={r.sources[0]} />
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
  let items: IntelItem[] = [];
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
        .select("url, title, source, relevance, action, published_at, created_at")
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
            {digestLine(digest)}
          </span>
        )}
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          Nothing notable from the weekday intel job yet.
        </p>
      ) : (
        <IntelItems items={items} />
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
