// Regulation & benchmarks panel (server component). Evaluates the research
// layer's regulatory rules against THIS deal's jurisdiction + the default
// buyer profile, and compares deal metrics to seeded benchmarks. DB rows
// (migration 0023, once seeded) take precedence; the checked-in research
// JSONs are the base layer so the panel works with zero ops.
//
// Provenance is the product: every row shows source, as-of, and its
// verified/sourced status; unknowns render as open questions — a rule is
// never silently dropped for missing data.

import { signedInBenchmarkRows, signedInRuleRows } from "@/lib/research-read";
import {
  asOfLabel,
  evaluateRules,
  OPEN_QUESTION_LABELS,
  type Benchmark,
  type RegulatoryRule,
  type RuleEvaluation,
} from "@/lib/research";
import { researchAge, staleMark } from "@/lib/research-age";
import { DatedNotes } from "@/app/dated-notes";
import {
  benchmarksForDeal,
  buildSubject,
  fmtBenchValue,
  mergeBenchmarks,
  mergeRules,
  pricePerUnit,
  seedBenchmarks,
  seedRules,
} from "@/lib/research-data";
import { withArticle } from "@/lib/article";
import { FMR_BEDS, fmrEffectiveOf, fmrLabel, fmrToday, fmrWhen, readFmrMetric, type FmrBed } from "@/lib/fmr";
import { monthOf } from "@/lib/zori";
import { sectorStandings } from "@/lib/sector-leaderboard";
import { rankLabel } from "@/lib/rank";
import { linkOk } from "@/lib/link-audit";
import { coveredState, dataMetroForAddress, isDataMetro, metroForAddress } from "@/lib/market-match";
import { parsePct } from "@/lib/criteria";
import { capSpreadRead, leverageRead, SEEDED_RATE_BENCHMARK } from "@/lib/leverage";
import {
  benchmark30,
  datedLong,
  type DebtIndex,
  type RateSeed,
  type SurveyRate,
} from "@/lib/debt-index";
import { assetClassKey, assetWords } from "@/lib/asset-words";
import Link from "next/link";
import type { StructuredAddress } from "@/lib/address";
import type { DealPlacement } from "@/lib/market-county";

const OUTCOME_META: Record<
  RuleEvaluation["outcome"],
  { label: string; cls: string }
> = {
  exempt: { label: "Exempt", cls: "bg-emerald-500/10 text-emerald-600" },
  applies: { label: "Applies", cls: "bg-kill/10 text-kill" },
  possibly_applies: { label: "Possibly applies", cls: "bg-amber-500/10 text-amber-600" },
  not_applicable: { label: "Not applicable", cls: "bg-line/60 text-muted" },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  verified: { label: "verified", cls: "bg-emerald-500/10 text-emerald-600" },
  sourced: { label: "sourced", cls: "bg-brand/10 text-brand" },
  unverified_not_found: { label: "unverified", cls: "bg-amber-500/10 text-amber-600" },
};

/** A bedroom count as the panel says it. */
function bedLabel(bed: FmrBed): string {
  return bed === "0br" ? "studio" : bed.toUpperCase();
}

/** A metro's fair market rents for one fiscal year, read as ONE line — the
 *  bedroom row with one provenance link — rather than five rows naming the
 *  same source five times. The year is the rows' own (lib/fmr reads it out
 *  of the metric), so a row HUD's next year replaces is never relabelled. */
export type BenchItem =
  | { kind: "row"; b: Benchmark }
  | { kind: "fmr"; metro: string; fy: number; rows: { bed: FmrBed; b: Benchmark }[] };

export function benchItems(rows: readonly Benchmark[]): BenchItem[] {
  const items: BenchItem[] = [];
  for (const b of rows) {
    const f = readFmrMetric(b.metric);
    if (!f) {
      items.push({ kind: "row", b });
      continue;
    }
    const group = items.find(
      (i): i is Extract<BenchItem, { kind: "fmr" }> => i.kind === "fmr" && i.metro === b.metro && i.fy === f.fy,
    );
    if (group) group.rows.push({ bed: f.bed, b });
    else items.push({ kind: "fmr", metro: b.metro, fy: f.fy, rows: [{ bed: f.bed, b }] });
  }
  for (const i of items) if (i.kind === "fmr") i.rows.sort((x, y) => FMR_BEDS.indexOf(x.bed) - FMR_BEDS.indexOf(y.bed));
  return items;
}

/** One metro's fair market rent line: the year and the day it takes effect
 *  (read back out of the headline row's note) — or the day it ended, once
 *  it has (lib/fmr `fmrWhen`) — the bedroom row, and the headline
 *  two-bedroom row whose provenance the line shows — the rows of one year
 *  and one metro come from one source. */
export function fmrLine(
  item: Extract<BenchItem, { kind: "fmr" }>,
  today: string,
): { heading: string; figures: string; head: Benchmark; ended: boolean } {
  const head = (item.rows.find((r) => r.bed === "2br") ?? item.rows[0]).b;
  const when = fmrWhen({ fy: item.fy, effective: fmrEffectiveOf(head.note) }, today);
  return {
    heading: `${fmrLabel(item.fy)} fair market rent${when.text ? `, ${when.text}` : ""}`,
    figures: item.rows.map((r) => `${bedLabel(r.bed)} ${fmtBenchValue(r.b.metric, r.b.low, r.b.high)}`).join(" · "),
    head,
    ended: when.ended,
  };
}

/** Friendly names for benchmark metrics — raw keys read like plumbing.
 *  Unknown metrics fall back to de-underscored text. (A fair market rent is
 *  never one row here: `benchItems` reads a metro's as one line.) */
function metricLabel(metric: string): string {
  const snap = metric.match(/^(\w+?)_(vacancy_pct|asking_rent_psf|cap_rate_pct)$/);
  if (snap) {
    const sector = snap[1].replace(/_/g, " ");
    const what =
      snap[2] === "vacancy_pct"
        ? "vacancy"
        : snap[2] === "asking_rent_psf"
          ? "asking rent $/SF"
          : "cap rate";
    return `${sector} ${what}`;
  }
  if (metric === "monthly_sales_2_4_unit") return "2–4 unit sales / month";
  if (metric === "active_listings_2_4_unit") return "2–4 unit active listings";
  if (metric === "pmms_30y_fixed") return "30-yr fixed (PMMS)";
  return metric.replace(/__/g, ": ").replace(/_/g, " ");
}

/**
 * A benchmark row's name as the panel prints it. The 2–4 unit median is the
 * sale price of a whole property — a duplex, a triplex or a fourplex, never
 * one unit — for one month (the row's `as_of` is that month's last day, the
 * period the tracker states), so it is named as a property's and dated, and
 * set against nothing: the panel once called a deal "below market" by its
 * price per unit against it, which every Philadelphia deal priced under the
 * median a unit read (the research pass of 2026-09-30).
 */
export function benchRowLabel(b: Pick<Benchmark, "metric" | "as_of">): string {
  if (b.metric === "median_sale_price_2_4_unit") {
    const month = b.as_of ? monthOf(b.as_of) : "";
    return `Median sale price of a 2–4 unit property${month ? `, ${month}` : ""}`;
  }
  return metricLabel(b.metric);
}

// Where each covered metro's figure stands per sector across the covered
// markets (tightest vacancy first) — the same shared builder behind the
// market page's rankings, the briefs' chips, and the sample screen
// (lib/sector-leaderboard `sectorStandings`), so a deal's vs-market row can
// never disagree with them. Read for the day the panel renders: a figure
// over a year old is not ranked.
const TRACKED_SECTORS = ["office", "industrial", "multifamily", "retail"] as const;


/** Condition keys the Deal-facts panel can actually answer — only these earn
 *  the "answer in Deal facts" pointer (units come from the deal itself, and
 *  current-occupancy has no form field on purpose). */
const ANSWERABLE_IN_DEAL_FACTS = new Set([
  "built_before",
  "building_age_years_lt",
  "building_permit_issued_after",
  "building_permit_issued_on_or_before",
  "exemption_registered_with_rad",
  "owner_occupied_with_units_lte",
  "owner_total_rental_units_in_county_lte",
  "owner_total_rental_units_in_state_lte",
]);

export function SourceLink({
  source,
  asOf,
  status,
  today,
  yearEnded,
  readOn,
}: {
  source: string | null;
  asOf: string;
  status: string;
  /** the day the panel is read (an ISO day), for the research rule's age */
  today: string;
  /** a figure that holds for a fiscal year (a fair market rent): its
   *  freshness is the year's — true once the year has ended — never the
   *  research rule's days since it was read, which would call a year in
   *  force stale */
  yearEnded?: boolean;
  /** `asOf` is the day the research was read, not the figure's date (a
   *  research-tracker row, whose own period rides in its citation) */
  readOn?: boolean;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.sourced;
  // The research rule (lib/research-age): past its limit the date is shown
  // with its age and marked stale, never hidden. A figure whose file states
  // no date is undated — flagged in the stale tone, but never given a date
  // it does not have.
  const age = researchAge(asOf, today);
  const undated = age.asOf === null;
  const stale = yearEnded === undefined ? undated || age.stale : yearEnded;
  const dated = readOn ? `read ${asOf}` : asOfLabel(asOf);
  // Audit gate: a link the audit script has verified DEAD renders as plain
  // text — the user never gets handed a clickable 404. Unaudited links render
  // normally (never audited ≠ dead).
  const audited = linkOk(source);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
      <span className={`rounded px-1.5 py-px font-medium ${meta.cls}`}>{meta.label}</span>
      {stale && (
        <span className="rounded bg-amber-500/10 px-1.5 py-px font-medium text-amber-600" data-qa="research-stale">
          {yearEnded ? "year ended" : undated ? "undated" : `${dated} · ${staleMark(age)}`}
        </span>
      )}
      {!stale && <span>{dated}</span>}
      {source &&
        (audited === false ? (
          <span title={source}>source on file — link unavailable</span>
        ) : (
          <a
            href={source}
            target="_blank"
            rel="noreferrer"
            className="underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            source
          </a>
        ))}
    </span>
  );
}

export async function ResearchPanel({
  address,
  sizeText,
  priceText,
  capText,
  capWithheld = null,
  yearBuilt,
  sectorFields,
  assetClass,
  planLabel,
  rateSeed = null,
  tenYear = null,
  survey30 = null,
  placement,
  census = null,
}: {
  address: StructuredAddress | null;
  /** what the Census geocoder read at the building (the deal's site flags,
   *  #452): its incorporated place and county, which decide whether a
   *  city's or a county's rules reach it; null before the lookup answers */
  census?: { place?: { name: string } | null; county?: { name: string } | null } | null;
  /** where the page placed the deal (lib/market-county's `placeDeal`): its
   *  briefed market, a metro area whose figures are read, and how — the
   *  address matchers answer where it is not given */
  placement?: Pick<DealPlacement, "briefed" | "read" | "placedBy"> | null;
  sizeText?: string | null;
  priceText?: string | null;
  /** the deal's going-in cap as displayed (e.g. "5.8%") — for the leverage check */
  capText?: string | null;
  /** "note" where the deal's price is a loan's: the collateral's income
   *  over it is a cap nobody earns (lib/compare-interest `noteCapSlot`), so
   *  the leverage check does not run and says why; "position" where it is a
   *  preferred equity position's, which buys a rate and a redemption, never
   *  a slice of the building — the same rule, its own reason */
  capWithheld?: "note" | "position" | null;
  /** the screening rate the model was seeded with off today's curve
   *  (lib/debt-index): the index a fact, the class spread an assumption,
   *  the note naming both — the leverage check reads the cap against it */
  rateSeed?: RateSeed | null;
  /** today's 10-year Treasury, the benchmark a cap spread is quoted over */
  tenYear?: DebtIndex | null;
  /** the week's 30-year mortgage survey off the same read — the leverage
   *  check's benchmark; the research layer's snapshot serves where null */
  survey30?: SurveyRate | null;
  /** the strategy label when the deal is a plan (Conversion, Development …):
   *  with no going-in cap to spread against debt, the leverage check says
   *  why instead of going silent */
  planLabel?: string | null;
  /** parsed from the deal's extraction metrics (manual entry or OM) */
  yearBuilt?: number | null;
  sectorFields?: Record<string, string | number | boolean> | null;
  /** the deal's asset class — same-sector benchmark rows sort first */
  assetClass?: string | null;
}) {
  // Today, for a fair market rent's year (ended or not) and every research
  // date's age (lib/research-age) — read once here.
  const today = fmrToday();
  const standings = sectorStandings(TRACKED_SECTORS, today);
  // The checked-in research layer, with the database's rows merged in — a
  // missing table (migration not yet run) degrades silently to the files.
  // A rule's words are always the file's (mergeRules: nothing else writes
  // them); a benchmark's figures may be the steward's correction.
  // One cached read serves every signed-in reader (lib/research-read): the
  // deal page is signed in, and the tables are granted to every signed-in
  // reader alike; each view had read both whole tables again.
  let rules: RegulatoryRule[] = seedRules();
  let benchmarks: Benchmark[] = seedBenchmarks();
  const [dbRules, dbBench] = await Promise.all([signedInRuleRows(), signedInBenchmarkRows()]);
  if (dbRules?.length) rules = mergeRules(dbRules);
  if (dbBench?.length) benchmarks = mergeBenchmarks(dbBench);

  // What the deal IS decides which rules can reach it (lib/asset-words): an
  // office or a hotel is commercial property to the rent-control regimes;
  // a class nothing has read yet keeps the rules' questions open.
  const words = assetWords(assetClass);
  const subject = buildSubject({
    address,
    census,
    sizeText,
    yearBuilt,
    sectorFields,
    residential: assetClassKey(assetClass) ? words.residential : undefined,
    // A rule's own stated window or effective date is read on this day
    // (lib/dated-window): each evaluation says what has ended.
    today,
  });
  const evals = address?.state ? evaluateRules(rules, subject) : [];
  const shown = evals.filter((e) => e.outcome !== "not_applicable");
  const metro = placement ? placement.briefed : address ? metroForAddress(address) : null;
  // A metro area the site reads without a brief: its published figures are
  // under the market check, and the honest sentence here says that is all.
  // So is a metro area the deal's county alone placed it in (#447): the
  // metro area's figures are read, and its market's brief covers the places
  // its keywords name.
  const dataMetro = placement ? placement.read : address && !metro ? dataMetroForAddress(address) : null;
  const placedBy = placement?.placedBy ?? null;

  // vs-market: covered-market name first (a Brooklyn deal must find the
  // "New York City" FMR row), raw city as the fallback. Same-sector rows
  // (office_vacancy_pct on an office deal) sort ahead of the cross-sector
  // context — stable, so within each group the research order holds.
  const dealSector = words.researchSector;
  const metroBench = benchmarksForDeal(
    benchmarks,
    address?.city,
    metro?.name,
  ).sort((a, b) => {
    if (!dealSector) return 0;
    // FMR and 2-4-unit rows are residential — own-sector for multifamily deals.
    const own = (m: string) =>
      m.startsWith(`${dealSector}_`) ||
      (dealSector === "multifamily" &&
        (m.startsWith("hud_fmr_") || m.includes("2_4_unit")))
        ? 0
        : 1;
    return own(a.metric) - own(b.metric);
  });
  const ppu = pricePerUnit(priceText, sizeText);

  // Leverage check (deterministic code, not a model call): the going-in cap
  // against the week's 30-yr fixed — the survey off the same cached rates
  // read the model's seed and the 10-year come from (lib/debt-index), else
  // the benchmark row's checked-in snapshot, the source saying which.
  const capPct = capText ? parsePct(capText) : null;
  const bench30 =
    capPct != null
      ? benchmark30(survey30, benchmarks.find((b) => b.metric === "pmms_30y_fixed"))
      : null;
  const leverage =
    capPct != null && bench30 ? leverageRead(capPct, bench30.value) : null;
  // Against today's curve (lib/debt-index): the cap's spread over the
  // 10-year, a fact with a date; and leverage at the index plus the class
  // spread the model was seeded with — the index a fact, the spread an
  // assumption, both named in the seed's own note.
  const capSpread = capPct != null && tenYear ? capSpreadRead(capPct, tenYear.pct) : null;
  const seededLeverage =
    capPct != null && rateSeed ? leverageRead(capPct, rateSeed.pct, SEEDED_RATE_BENCHMARK) : null;

  const hasRegulation = shown.length > 0;
  const hasBenchmarks = metroBench.length > 0;
  if (!address?.state) {
    return (
      <section className="rounded-xl border border-line bg-surface p-4">
        <h2 className="text-sm font-semibold">Regulation &amp; benchmarks</h2>
        <p className="mt-1 text-sm text-muted">
          Add a property address to auto-check rent control, TOPA, and licensing
          rules against this deal. No address — no rules on file.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Regulation &amp; benchmarks</h2>
        <span className="text-[11px] text-muted">
          assumes a natural-person buyer with no other units here unless your
          Deal facts say otherwise
        </span>
      </div>

      {/* Covered-market chip: one click from the deal to its market brief —
          rules, rents, and data coverage in one place. Outside the covered
          list the honest sentence renders instead. */}
      {metro ? (
        <Link
          href={`/market?metro=${metro.id}`}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 text-[11px] font-medium text-brand outline-none transition-colors hover:bg-brand/10 focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
          Covered market: {metro.name} — open the market brief →
        </Link>
      ) : dataMetro ? (
        // A metro the site reads but does not brief — Pittsburgh, Phoenix,
        // Houston: the market check reads its published figures (jobs,
        // permits, prices, rents, vacancy) and nothing else is on file for it.
        <p className="mt-2 text-[11px] text-muted">
          {placedBy
            ? isDataMetro(dataMetro.id)
              ? `${placedBy.county} lies in the ${placedBy.area} metro area, which the site reads but does not brief — its published figures sit under the market check; no brief, comps pull or tracker here`
              : `${placedBy.county} lies in the ${placedBy.area} metro area, so the market check reads the ${dataMetro.name} market's published figures — its brief, comps pull and tracker cover the places the market names, and this address names none of them`
            : `${dataMetro.name} is read, not briefed — its published figures sit under the market check; no brief, comps pull or tracker here`}
          {coveredState(address.state)
            ? "; statewide rules still evaluate below."
            : "."}{" "}
          <Link
            href="/market"
            className="underline decoration-dotted underline-offset-2 hover:text-brand"
          >
            See the briefed markets
          </Link>
        </p>
      ) : (
        // Keyed off the MARKET match, not the state: a Roanoke or Harrisburg
        // deal sits in a covered STATE but outside every covered market and
        // every metro the site reads, and must say so — statewide rules
        // below still evaluate.
        <p className="mt-2 text-[11px] text-muted">
          Not in a covered market — market-level coverage here is unscreened,
          not unregulated
          {coveredState(address.state)
            ? "; statewide rules still evaluate below."
            : "."}{" "}
          <Link
            href="/market"
            className="underline decoration-dotted underline-offset-2 hover:text-brand"
          >
            See covered markets
          </Link>
        </p>
      )}

      {/* Leverage check — the 1989 lesson as arithmetic. One-sided honesty:
          the PMMS benchmark is an owner-occupier rate, so negative here is
          certainly negative in practice, while positive still needs a real
          investor quote. */}
      {leverage && bench30 && capPct != null && (
        <div className="mt-3 rounded-lg border border-line bg-faint/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold">Leverage check</p>
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                leverage.tone === "negative"
                  ? "bg-kill/10 text-kill"
                  : leverage.tone === "thin"
                    ? "bg-amber-500/10 text-amber-600"
                    : "bg-emerald-500/10 text-emerald-600"
              }`}
            >
              {leverage.tone === "negative"
                ? "negative leverage"
                : leverage.tone === "thin"
                  ? "thin spread"
                  : "positive at benchmark"}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {leverage.label} — going-in cap {capPct}% vs {bench30.value}% (
            {bench30.source}, {asOfLabel(bench30.asOf, bench30.live ? undefined : today)}). The benchmark is an
            owner-occupier rate; investor debt usually prices above it, so a
            thin spread here is thinner in practice.
          </p>
          {(capSpread || seededLeverage) && (
            <div className="mt-2 border-t border-line/60 pt-2" data-qa="leverage-today">
              {capSpread && tenYear && (
                <p className="text-xs leading-relaxed text-muted">
                  {`Against the latest curve: the cap is ${capSpread.label} (${tenYear.pct.toFixed(2)}% on ${datedLong(tenYear.asOf)}, FRED).`}
                </p>
              )}
              {seededLeverage && rateSeed && (
                <p
                  className={`mt-1 text-xs leading-relaxed ${
                    seededLeverage.tone === "negative"
                      ? "text-kill"
                      : seededLeverage.tone === "thin"
                        ? "text-amber-600"
                        : "text-emerald-600"
                  }`}
                >
                  {`${seededLeverage.label} (${rateSeed.pct.toFixed(2)}%): ${rateSeed.note}.`}
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {/* A note: its price is a loan's, and the collateral's income over it
          is a cap nobody earns — there is no buyer's cap to spread against
          debt. Say so rather than leaving a gap. */}
      {capPct == null && capWithheld === "note" && (
        <div className="mt-3 rounded-lg border border-line bg-faint/60 p-3" data-qa="leverage-note">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold">Leverage check</p>
            <span className="rounded-full bg-faint px-2 py-0.5 text-[11px] font-medium text-muted">
              n/a on a note
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            The price is a loan&apos;s, not the building&apos;s: the collateral&apos;s income over it
            is a cap nobody earns, so there is no cap of the buyer&apos;s to spread against debt. The
            note is read by its yield to maturity at its price, not by a cap rate.
          </p>
        </div>
      )}
      {/* A preferred equity position: its price buys a rate and a
          redemption in the owning entity, never a slice of the building, so
          the building's income over it is a cap nobody earns either. */}
      {capPct == null && capWithheld === "position" && (
        <div className="mt-3 rounded-lg border border-line bg-faint/60 p-3" data-qa="leverage-position">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold">Leverage check</p>
            <span className="rounded-full bg-faint px-2 py-0.5 text-[11px] font-medium text-muted">
              n/a on a preferred equity position
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            {
              "The price is a position's, not the building's: it buys a preferred return and a redemption in the owning entity, never a slice of the building, so the building's income over it is a cap nobody earns, and there is no cap of the buyer's to spread against debt. The position is read by its yield to redemption at its price, and by where its last dollar sits on the stated value, not by a cap rate."
            }
          </p>
        </div>
      )}
      {/* A plan deal with no going-in cap: a dark building has nothing to
          spread against debt yet. Say so rather than leaving a gap. */}
      {capPct == null && !capWithheld && planLabel && (
        <div className="mt-3 rounded-lg border border-line bg-faint/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold">Leverage check</p>
            <span className="rounded-full bg-faint px-2 py-0.5 text-[11px] font-medium text-muted">
              n/a on {withArticle(planLabel.toLowerCase())}
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            No going-in cap to spread against debt until the works are done; the
            plan is judged on yield on total cost (the stressed grid under the
            plan strip) and its debt is sized to cost.
          </p>
        </div>
      )}

      {!hasRegulation &&
        (evals.length > 0 ? (
          // Rules exist for this jurisdiction — they evaluated and none bite
          // this deal. Saying "not screened" here would be false: the sample
          // deal's Philadelphia sits exactly in this state (its eviction-
          // diversion mandate keys off a filing, not a purchase).
          <p className="mt-2 text-sm text-muted">
            Screened: {evals.length} rule{evals.length === 1 ? "" : "s"} on
            file for {address.city || address.county || address.state} — none
            triggered by this deal&apos;s facts. Rules that key off events (an
            eviction filing, a vacancy registration) stay dormant until those
            events.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            No rules on file for{" "}
            {address.city || address.county || address.state}
            {" — "}this means the research layer hasn&apos;t screened this
            jurisdiction yet, not that it&apos;s unregulated.
          </p>
        ))}

      {hasRegulation && (
        <ul className="mt-3 space-y-3">
          {shown.map((e) => {
            const meta = OUTCOME_META[e.outcome];
            const open = [...new Set(e.unknowns.map((u) => OPEN_QUESTION_LABELS[u] ?? u))];
            const answerable = e.unknowns.some((u) => ANSWERABLE_IN_DEAL_FACTS.has(u));
            return (
              <li key={e.rule.id} className="rounded-lg border border-line/70 p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-1.5 py-px text-[11px] font-semibold ${meta.cls}`}>
                    {meta.label}
                  </span>
                  <span className="text-[11px] uppercase tracking-wide text-muted">
                    {e.rule.rule_type.replace(/_/g, " ")}
                    {e.rule.jurisdiction_local ? ` · ${e.rule.jurisdiction_local}` : ` · ${e.rule.jurisdiction_state}`}
                  </span>
                </div>
                <p className="mt-1.5 text-sm leading-relaxed">{e.rule.effect}</p>
                {/* The rule's text as written, and — once a window it states
                    its figure for has ended, or a date it gives has come —
                    that sentence beneath it (lib/dated-window). */}
                <DatedNotes notes={e.dated} className="mt-1" />
                {open.length > 0 && (
                  <p className="mt-1 text-[12px] text-amber-600">
                    To settle this: provide {open.join(", ")}.{" "}
                    {answerable && (
                      <a
                        href="#deal-facts"
                        className="font-medium underline decoration-dotted underline-offset-2 hover:text-amber-700"
                      >
                        Answer in Deal facts ↑
                      </a>
                    )}
                  </p>
                )}
                <div className="mt-1.5">
                  <SourceLink source={e.rule.source} asOf={e.rule.as_of} status={e.rule.status} today={today} />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {hasBenchmarks && (
        <div className="mt-4 border-t border-line pt-3">
          <h3 className="text-[11px] uppercase tracking-wide text-muted">
            vs. market{ppu ? ` — this deal ≈ $${ppu.toLocaleString()}/unit` : ""}
          </h3>
          <ul className="mt-2 space-y-2">
            {benchItems(metroBench).map((item) => {
              if (item.kind === "fmr") {
                const line = fmrLine(item, today);
                return (
                  <li
                    key={`${item.metro}|fmr`}
                    className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                  >
                    <span>
                      {`${line.heading}: `}
                      <span className="font-mono tabular-nums">{line.figures}</span>
                    </span>
                    <SourceLink source={line.head.source} asOf={line.head.as_of} status={line.head.status} today={today} yearEnded={line.ended} />
                  </li>
                );
              }
              const b = item.b;
              // Vacancy rows also say where this metro sits in its sector's
              // cross-metro ranking — same builder as the market page.
              const vac = b.metric.match(/^(\w+?)_vacancy_pct$/);
              const standing = vac && metro ? standings[vac[1]]?.[metro.id] : undefined;
              const rank =
                standing && standing.rank !== null
                  ? { label: rankLabel({ rank: standing.rank, tied: standing.tied }), total: standing.total }
                  : undefined;
              return (
                <li
                  key={`${b.metro}|${b.metric}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                >
                  <span>
                    {benchRowLabel(b)}
                    {": "}
                    <span className="font-mono tabular-nums">
                      {fmtBenchValue(b.metric, b.low, b.high)}
                    </span>
                    {rank && vac && (
                      <Link
                        href={`/market?sector=${vac[1]}`}
                        title={`rank across covered markets, tightest first${standing && standing.row.markets.length > 1 ? ` — one figure${standing.row.sharedArea ? ` for ${standing.row.sharedArea}` : ""}, read by ${standing.row.markets.map((m) => m.name).join(", ")}` : ""}`}
                        className="ml-2 rounded-full border border-line px-1.5 py-px text-[11px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
                      >
                        {`${rank.label} of ${rank.total}`}
                      </Link>
                    )}
                    {/* A research-tracker figure's own house, area and
                        period (lib/tracker-read) — the row's date is the
                        day the research was read, not the figure's. */}
                    {b.cite && (
                      <span className="block text-[11px] text-muted" data-qa="bench-cite">
                        {b.cite}
                      </span>
                    )}
                  </span>
                  <SourceLink source={b.source} asOf={b.as_of} status={b.status} today={today} readOn={!!b.cite} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
