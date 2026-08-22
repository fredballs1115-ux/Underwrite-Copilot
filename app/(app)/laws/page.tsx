import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { isStale, type RegulatoryRule } from "@/lib/research";
import { seedRules } from "@/lib/research-data";
import { linkOk } from "@/lib/link-audit";

export const metadata: Metadata = { title: "Laws" };
export const dynamic = "force-dynamic";

// Landlord/transaction law, browsable by jurisdiction — the same rule set the
// screener evaluates automatically against every deal's address. Each rule
// shows its applies/exempt conditions in plain English, the statutory quote
// when one is on file, and full provenance (source, as-of, verification
// status). DB rows take precedence; the checked-in research layer is the
// zero-ops base.

const STATUS_META: Record<string, { label: string; cls: string }> = {
  verified: { label: "verified", cls: "bg-emerald-500/10 text-emerald-600" },
  sourced: { label: "sourced", cls: "bg-brand/10 text-brand" },
  unverified_not_found: { label: "unverified", cls: "bg-amber-500/10 text-amber-600" },
};

const STATE_NAMES: Record<string, string> = {
  DC: "District of Columbia",
  MD: "Maryland",
  VA: "Virginia",
  PA: "Pennsylvania",
  NJ: "New Jersey",
  NY: "New York",
  CT: "Connecticut",
  DE: "Delaware",
  ME: "Maine",
  NH: "New Hampshire",
  VT: "Vermont",
  RI: "Rhode Island",
  MA: "Massachusetts",
  NC: "North Carolina",
  SC: "South Carolina",
  GA: "Georgia",
  FL: "Florida",
  CA: "California",
};

const deUnderscore = (s: string) => s.replace(/_/g, " ");

/** One condition key/value → a plain-English clause. Mirrors the evaluator's
 *  vocabulary in lib/research.ts — presentation only, no logic. */
function condText(key: string, want: unknown): string {
  if (key === "any_of" && Array.isArray(want)) {
    return want
      .map((w) =>
        Object.entries(w as Record<string, unknown>)
          .map(([k, v]) => condText(k, v))
          .join(" and ")
      )
      .join(", OR ");
  }
  if (key === "see_rule") return `see rule ${String(want)}`;
  if (key === "building_permit_issued_after")
    return `building permit issued after ${String(want).slice(0, 4)}`;
  if (key === "building_permit_issued_on_or_before")
    return `building permit issued on/before ${String(want).slice(0, 4)}`;
  if (key === "built_before") return `built before ${String(want).slice(0, 4)}`;
  if (key === "owner_form_any_of" && Array.isArray(want))
    return `owner is a ${want.map(String).map(deUnderscore).join(" / ")}`;
  if (key === "owner_occupied_with_units_lte")
    return `owner-occupied with ≤ ${String(want)} units`;
  const cmp = key.match(/^(.*)_(lte|gte|lt|gt)$/);
  if (cmp) {
    const sym = { lte: "≤", gte: "≥", lt: "<", gt: ">" }[cmp[2] as "lte"];
    return `${deUnderscore(cmp[1])} ${sym} ${String(want)}`;
  }
  if (want === true) return deUnderscore(key);
  if (want === false) return `not ${deUnderscore(key)}`;
  return `${deUnderscore(key)} = ${deUnderscore(String(want))}`;
}

function condList(conds: Record<string, unknown> | null): string | null {
  if (!conds || Object.keys(conds).length === 0) return null;
  return Object.entries(conds)
    .map(([k, v]) => condText(k, v))
    .join("; ");
}

function ProvenanceRow({ rule }: { rule: RegulatoryRule }) {
  const meta = STATUS_META[rule.status] ?? STATUS_META.sourced;
  const stale = isStale(rule.as_of);
  const audited = linkOk(rule.source);
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
      <span className={`rounded px-1.5 py-px font-medium ${meta.cls}`}>{meta.label}</span>
      {stale ? (
        <span className="rounded bg-amber-500/10 px-1.5 py-px font-medium text-amber-600">
          stale · {rule.as_of}
        </span>
      ) : (
        <span>as of {rule.as_of}</span>
      )}
      {rule.source &&
        (audited === false ? (
          <span title={rule.source}>source on file — link unavailable</span>
        ) : (
          <a
            href={rule.source}
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

interface AlertRow {
  id: string;
  rule_id: string | null;
  headline: string;
  url: string | null;
  detected_at: string;
}

export default async function LawsPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/laws");
  const params = await searchParams;

  // DB first, seeds as fallback (same contract as the deal panel).
  let rules: RegulatoryRule[] = seedRules();
  let alerts: AlertRow[] = [];
  try {
    const supabase = await createSupabaseServerClient();
    const [{ data: dbRules }, { data: dbAlerts }] = await Promise.all([
      supabase.from("regulatory_rules").select("*"),
      supabase
        .from("regulatory_alerts")
        .select("id, rule_id, headline, url, detected_at")
        .order("detected_at", { ascending: false })
        .limit(5),
    ]);
    if (dbRules?.length) {
      const byId = new Map(rules.map((r) => [r.id, r]));
      for (const r of dbRules as unknown as RegulatoryRule[]) byId.set(r.id, r);
      rules = [...byId.values()];
    }
    alerts = (dbAlerts as AlertRow[] | null) ?? [];
  } catch {
    // seeds already loaded
  }

  const states = [...new Set(rules.map((r) => r.jurisdiction_state.toUpperCase()))];
  const CORE = ["DC", "MD", "VA"];
  states.sort((a, b) => {
    const ai = CORE.indexOf(a);
    const bi = CORE.indexOf(b);
    if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    return a.localeCompare(b);
  });

  const want = (params.state ?? "").toUpperCase().slice(0, 2);
  const active = states.includes(want) ? want : null;
  const shownStates = active ? [active] : states;
  const exemptionCount = rules.filter(
    (r) => r.exempt_if && Object.keys(r.exempt_if).length > 0
  ).length;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">
          The laws that decide these deals
        </h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          {rules.length} rules across {states.length} states — rent control,
          TOPA, licensing, deposits, eviction — with the exemption logic that
          matters to a small natural-person buyer. The screener runs every one
          of these against each deal&apos;s address automatically; this page is
          the full reference.
        </p>
        <p className="mt-1 text-[11px] text-muted">
          {exemptionCount} of {rules.length} rules carry an exemption path ·
          every rule shows its source, as-of date, and verification status ·
          the weekday intel job red-flags likely changes.
        </p>
      </header>

      {alerts.length > 0 && (
        <section className="rounded-xl border border-red-500/30 bg-red-500/5 p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-red-600">
            Recent rule-change flags
          </h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {alerts.map((a) => (
              <li key={a.id} className="leading-snug">
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-brand"
                  >
                    {a.headline}
                  </a>
                ) : (
                  a.headline
                )}
                <span className="ml-2 text-[11px] text-muted">
                  {a.detected_at.slice(0, 10)}
                  {a.rule_id ? ` · affects ${a.rule_id}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex flex-wrap gap-1.5 text-xs">
        <Link
          href="/laws"
          className={`rounded-full border px-2.5 py-1 transition-colors ${
            !active
              ? "border-brand bg-brand/10 text-brand"
              : "border-line text-muted hover:border-brand hover:text-brand"
          }`}
        >
          All states
        </Link>
        {states.map((s) => (
          <Link
            key={s}
            href={`/laws?state=${s}`}
            className={`rounded-full border px-2.5 py-1 transition-colors ${
              active === s
                ? "border-brand bg-brand/10 text-brand"
                : "border-line text-muted hover:border-brand hover:text-brand"
            }`}
          >
            {s}
          </Link>
        ))}
      </div>

      {shownStates.map((state) => {
        const stateRules = rules
          .filter((r) => r.jurisdiction_state.toUpperCase() === state)
          .sort((a, b) =>
            (a.jurisdiction_local ?? "").localeCompare(b.jurisdiction_local ?? "")
          );
        return (
          <section key={state}>
            <h2 className="text-sm font-semibold tracking-tight">
              {STATE_NAMES[state] ?? state}
              <span className="ml-2 text-[11px] font-normal text-muted">
                {stateRules.length} rule{stateRules.length === 1 ? "" : "s"}
              </span>
            </h2>
            <ul className="mt-2 space-y-2.5">
              {stateRules.map((r) => {
                const applies = condList(r.applies_if);
                const exempt = condList(r.exempt_if ?? null);
                return (
                  <li key={r.id} className="rounded-xl border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-faint px-1.5 py-px text-[11px] font-semibold uppercase tracking-wide text-ink/80">
                        {deUnderscore(r.rule_type)}
                      </span>
                      <span className="text-[11px] text-muted">
                        {r.jurisdiction_local ?? "statewide"}
                      </span>
                    </div>
                    <p className="mt-1.5 text-sm leading-relaxed">{r.effect}</p>
                    {applies && (
                      <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
                        <span className="font-medium text-ink/70">Applies when:</span>{" "}
                        {applies}
                      </p>
                    )}
                    {exempt ? (
                      <p className="mt-0.5 text-[12px] leading-relaxed text-emerald-700">
                        <span className="font-medium">Exempt when:</span> {exempt}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-[12px] text-muted">
                        No exemption path on file.
                      </p>
                    )}
                    {r.quote && (
                      <blockquote className="mt-2 border-l-2 border-line pl-3 text-[12px] italic leading-relaxed text-muted">
                        “{r.quote}”
                      </blockquote>
                    )}
                    <div className="mt-2">
                      <ProvenanceRow rule={r} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <p className="border-t border-line pt-3 text-[12px] text-muted">
        You never have to check this page before a deal — the{" "}
        <Link href="/deals" className="underline decoration-dotted underline-offset-2 hover:text-brand">
          screener
        </Link>{" "}
        evaluates every rule here against each deal&apos;s address and unit
        count automatically, and flags what it can&apos;t settle as open
        questions instead of guessing.
      </p>
    </div>
  );
}
