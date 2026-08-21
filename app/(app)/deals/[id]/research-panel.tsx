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
  buildSubject,
  mergeBenchmarks,
  pricePerUnit,
  seedBenchmarks,
  seedRules,
} from "@/lib/research-data";
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

/** Plain-English labels for condition keys surfaced as open questions. */
const UNKNOWN_LABELS: Record<string, string> = {
  building_permit_issued_on_or_before: "building permit year",
  building_permit_issued_after: "building permit year",
  built_before: "year built",
  exemption_registered_with_rad: "RAD exemption registration",
  units_gte: "unit count",
  units_lte: "unit count",
  municipality_adopted_etpa: "whether the municipality adopted ETPA",
  municipality_population_gte: "municipality population",
  occupancy: "owner-occupancy status",
};

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
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
      <span className={`rounded px-1.5 py-px font-medium ${meta.cls}`}>{meta.label}</span>
      {stale && (
        <span className="rounded bg-amber-500/10 px-1.5 py-px font-medium text-amber-600">
          stale · {asOf}
        </span>
      )}
      {!stale && <span>as of {asOf}</span>}
      {source && (
        <a
          href={source}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          source
        </a>
      )}
    </span>
  );
}

export async function ResearchPanel({
  address,
  sizeText,
  priceText,
  sectorFields,
}: {
  address: StructuredAddress | null;
  sizeText?: string | null;
  priceText?: string | null;
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

  const subject = buildSubject({ address, sizeText, sectorFields });
  const evals = address?.state ? evaluateRules(rules, subject) : [];
  const shown = evals.filter((e) => e.outcome !== "not_applicable");

  // vs-market: match the deal's metro benchmarks by city name.
  const city = (address?.city ?? "").toLowerCase();
  const metroBench = benchmarks.filter(
    (b) => b.metro && city && b.metro.toLowerCase().startsWith(city)
  );
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
          assumes natural-person buyer with no other units in this jurisdiction
        </span>
      </div>

      {!hasRegulation && (
        <p className="mt-2 text-sm text-muted">
          No rules on file for {address.city || address.county || address.state}
          {" — "}this means the research layer hasn&apos;t screened this
          jurisdiction yet, not that it&apos;s unregulated.
        </p>
      )}

      {hasRegulation && (
        <ul className="mt-3 space-y-3">
          {shown.map((e) => {
            const meta = OUTCOME_META[e.outcome];
            const open = [...new Set(e.unknowns.map((u) => UNKNOWN_LABELS[u] ?? u))];
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
                    To settle this: provide {open.join(", ")}.
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
                    {b.metric.replace(/_/g, " ")}
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
