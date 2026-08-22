// Regulation & benchmarks panel (server component). Evaluates the research
// layer's regulatory rules against THIS deal's jurisdiction + the default
// buyer profile, and compares deal metrics to seeded benchmarks. DB rows
// (migration 0023, once seeded) take precedence; the checked-in research
// JSONs are the base layer so the panel works with zero ops.
//
// Provenance is the product: every row shows source, as-of, and its
// verified/sourced status; unknowns render as open questions — a rule is
// never silently dropped for missing data.

import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  evaluateRules,
  isStale,
  vsRange,
  type Benchmark,
  type RegulatoryRule,
  type RuleEvaluation,
} from "@/lib/research";
import {
  benchmarksForDeal,
  buildSubject,
  mergeBenchmarks,
  pricePerUnit,
  seedBenchmarks,
  seedRules,
} from "@/lib/research-data";
import { linkOk } from "@/lib/link-audit";
import { coveredState, metroForAddress } from "@/lib/market-match";
import Link from "next/link";
import type { StructuredAddress } from "@/lib/address";

const OUTCOME_META: Record<
  RuleEvaluation["outcome"],
  { label: string; cls: string }
> = {
  exempt: { label: "Exempt", cls: "bg-emerald-500/10 text-emerald-600" },
  applies: { label: "Applies", cls: "bg-red-500/10 text-red-600" },
  possibly_applies: { label: "Possibly applies", cls: "bg-amber-500/10 text-amber-600" },
  not_applicable: { label: "Not applicable", cls: "bg-line/60 text-muted" },
};

const STATUS_META: Record<string, { label: string; cls: string }> = {
  verified: { label: "verified", cls: "bg-emerald-500/10 text-emerald-600" },
  sourced: { label: "sourced", cls: "bg-brand/10 text-brand" },
  unverified_not_found: { label: "unverified", cls: "bg-amber-500/10 text-amber-600" },
};

/** Friendly names for benchmark metrics — raw keys like "hud_fmr_fy2026_0br"
 *  read like plumbing. Unknown metrics fall back to de-underscored text. */
function metricLabel(metric: string): string {
  const fmr = metric.match(/^hud_fmr_fy2026_(\w+)$/);
  if (fmr) {
    const br = fmr[1] === "0br" ? "studio" : fmr[1].toUpperCase();
    return `FY2026 fair market rent · ${br}`;
  }
  if (metric === "median_sale_price_2_4_unit") return "2–4 unit median sale";
  if (metric === "monthly_sales_2_4_unit") return "2–4 unit sales / month";
  if (metric === "active_listings_2_4_unit") return "2–4 unit active listings";
  if (metric === "pmms_30y_fixed") return "30-yr fixed (PMMS)";
  return metric.replace(/__/g, ": ").replace(/_/g, " ");
}

/** Plain-English labels for condition keys surfaced as open questions. */
const UNKNOWN_LABELS: Record<string, string> = {
  building_permit_issued_on_or_before: "building permit year",
  building_permit_issued_after: "building permit year",
  built_before: "year built",
  building_age_years_lt: "year built",
  exemption_registered_with_rad: "RAD exemption registration",
  units_gte: "unit count",
  units_lte: "unit count",
  municipality_adopted_etpa: "whether the municipality adopted ETPA",
  municipality_population_gte: "municipality population",
  occupancy: "current occupancy status",
  owner_occupied_with_units_lte: "whether you'll owner-occupy (and unit count)",
  owner_total_rental_units_in_state_lte: "total rental units you own in this state",
};

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

function SourceLink({
  source,
  asOf,
  status,
}: {
  source: string | null;
  asOf: string;
  status: string;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.sourced;
  const stale = isStale(asOf);
  // Audit gate: a link the audit script has verified DEAD renders as plain
  // text — the user never gets handed a clickable 404. Unaudited links render
  // normally (never audited ≠ dead).
  const audited = linkOk(source);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
      <span className={`rounded px-1.5 py-px font-medium ${meta.cls}`}>{meta.label}</span>
      {stale && (
        <span className="rounded bg-amber-500/10 px-1.5 py-px font-medium text-amber-600">
          stale · {asOf}
        </span>
      )}
      {!stale && <span>as of {asOf}</span>}
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
  yearBuilt,
  sectorFields,
}: {
  address: StructuredAddress | null;
  sizeText?: string | null;
  priceText?: string | null;
  /** parsed from the deal's extraction metrics (manual entry or OM) */
  yearBuilt?: number | null;
  sectorFields?: Record<string, string | number | boolean> | null;
}) {
  // DB first, seeds as fallback — a missing table (migration not yet run)
  // must degrade silently to the checked-in research layer.
  let rules: RegulatoryRule[] = seedRules();
  let benchmarks: Benchmark[] = seedBenchmarks();
  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: dbRules }, { data: dbBench }] = await Promise.all([
      supabase.from("regulatory_rules").select("*"),
      supabase.from("benchmarks").select("*"),
    ]);
    if (dbRules?.length) {
      const byId = new Map(rules.map((r) => [r.id, r]));
      for (const r of dbRules as unknown as RegulatoryRule[]) byId.set(r.id, r);
      rules = [...byId.values()];
    }
    if (dbBench?.length) {
      benchmarks = mergeBenchmarks(dbBench as unknown as Benchmark[]);
    }
  } catch {
    // seeds already loaded
  }

  const subject = buildSubject({ address, sizeText, yearBuilt, sectorFields });
  const evals = address?.state ? evaluateRules(rules, subject) : [];
  const shown = evals.filter((e) => e.outcome !== "not_applicable");
  const metro = address ? metroForAddress(address) : null;

  // vs-market: covered-market name first (a Brooklyn deal must find the
  // "New York City" FMR row), raw city as the fallback.
  const metroBench = benchmarksForDeal(benchmarks, address?.city, metro?.name);
  const ppu = pricePerUnit(priceText, sizeText);

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
      ) : (
        // Keyed off the MARKET match, not the state: a Pittsburgh or Roanoke
        // deal sits in a covered STATE but outside every covered market, and
        // must say so — statewide rules below still evaluate.
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
            const open = [...new Set(e.unknowns.map((u) => UNKNOWN_LABELS[u] ?? u))];
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
                  <SourceLink source={e.rule.source} asOf={e.rule.as_of} status={e.rule.status} />
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
            {metroBench.map((b) => {
              const cmp =
                ppu && b.metric === "median_sale_price_2_4_unit"
                  ? vsRange(ppu, b.low, b.high)
                  : null;
              return (
                <li
                  key={`${b.metro}|${b.metric}`}
                  className="flex flex-wrap items-baseline justify-between gap-2 text-sm"
                >
                  <span>
                    {metricLabel(b.metric)}
                    {": "}
                    <span className="font-mono tabular-nums">
                      {b.low === b.high
                        ? `$${(b.low ?? 0).toLocaleString()}`
                        : `$${(b.low ?? 0).toLocaleString()}–$${(b.high ?? 0).toLocaleString()}`}
                    </span>
                    {cmp && cmp !== "no_range" && (
                      <span
                        className={`ml-2 rounded px-1.5 py-px text-[11px] font-medium ${
                          cmp === "above"
                            ? "bg-red-500/10 text-red-600"
                            : cmp === "below"
                              ? "bg-emerald-500/10 text-emerald-600"
                              : "bg-line/60 text-muted"
                        }`}
                      >
                        deal {cmp} market
                      </span>
                    )}
                  </span>
                  <SourceLink source={b.source} asOf={b.as_of} status={b.status} />
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
