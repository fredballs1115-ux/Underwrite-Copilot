"use client";

import { useState } from "react";
import { evaluateRules, type RuleSubject } from "@/lib/research";
import { seedRules } from "@/lib/research-data";

// The rules engine, live on the landing page (site-polish 2). This is the
// PRODUCTION evaluator — the same lib/research.ts code that runs on real
// deals — executing in the visitor's browser against the researched rule
// set. Nothing staged: change the scenario, the tri-state engine recomputes.

interface Scenario {
  id: string;
  label: string;
  blurb: string;
  subject: RuleSubject;
}

const BASE: Partial<RuleSubject> = {
  property_type: "rental_housing",
  transaction: "sale_of_rental_housing_accommodation",
};

const SCENARIOS: Scenario[] = [
  {
    id: "dc-personal",
    label: "DC rowhouse · your own name",
    blurb: "A 1922 four-unit rowhouse, bought personally, no other DC rentals.",
    subject: {
      ...BASE,
      state: "DC",
      locality: ["Washington"],
      units: 4,
      building_permit_year: 1922,
      owner_is_natural_person: true,
      owner_natural_persons: 1,
      owner_other_rental_units_in_dc: 0,
    },
  },
  {
    id: "dc-llc",
    label: "Same rowhouse · through an LLC",
    blurb: "Identical building — the only change is entity title.",
    subject: {
      ...BASE,
      state: "DC",
      locality: ["Washington"],
      units: 4,
      building_permit_year: 1922,
      owner_is_natural_person: false,
      owner_other_rental_units_in_dc: 0,
    },
  },
  {
    id: "pg-fourplex",
    label: "PG County fourplex · out-of-state buyer",
    blurb: "A Hyattsville fourplex; you live in Virginia and own 4 county units.",
    subject: {
      ...BASE,
      state: "MD",
      locality: ["Hyattsville", "Prince George's County"],
      units: 4,
      owner_form: "natural_person",
      owner_total_rental_units_in_county: 4,
      owner_domiciled_in_county: false,
    },
  },
  {
    id: "philly-triplex",
    label: "Philadelphia triplex · tenanted",
    blurb: "An occupied Brewerytown triplex you'd reposition after closing.",
    subject: {
      ...BASE,
      state: "PA",
      locality: ["Philadelphia"],
      units: 3,
      property_type: "residential_rental",
      action: "eviction",
    },
  },
  {
    id: "jc-fourplex",
    label: "Jersey City fourplex · any owner",
    blurb: "A 1961 four-unit near Journal Square — no owner-occupancy required.",
    subject: {
      ...BASE,
      state: "NJ",
      locality: ["Jersey City"],
      units: 4,
      built_year: 1961,
    },
  },
  {
    id: "la-fourplex",
    label: "LA fourplex · built 1965",
    blurb: "A Mid-City fourplex in your own name — two regimes stack here.",
    subject: {
      ...BASE,
      state: "CA",
      locality: ["Los Angeles"],
      units: 4,
      built_year: 1965,
      owner_is_natural_person: true,
    },
  },
  {
    id: "chi-housshack",
    label: "Chicago three-flat · you live in unit 1",
    blurb: "An owner-occupied Logan Square three-flat — the house-hack case.",
    subject: {
      ...BASE,
      state: "IL",
      locality: ["Chicago"],
      units: 3,
      occupancy: "owner_occupied",
    },
  },
];

/** Scenario count, exported so the section copy can never drift from the
 *  chips actually rendered. */
export const SCENARIO_COUNT = SCENARIOS.length;

const OUTCOME_META: Record<string, { label: string; cls: string }> = {
  exempt: { label: "Exempt", cls: "bg-pass/10 text-pass" },
  applies: { label: "Applies", cls: "bg-kill/10 text-kill" },
  possibly_applies: { label: "Open question", cls: "bg-caution/10 text-caution" },
};

const UNKNOWN_LABELS: Record<string, string> = {
  exemption_registered_with_rad: "register the exemption with RAD",
  building_permit_issued_on_or_before: "confirm the permit year",
  building_permit_issued_after: "confirm the permit year",
  owner_occupied_with_units_lte: "confirm owner-occupancy",
  owner_total_rental_units_in_state_lte: "confirm your statewide unit count",
};

export function RegulationPlayground() {
  const [active, setActive] = useState(SCENARIOS[0]);
  const evals = evaluateRules(seedRules(), active.subject)
    .filter((e) => e.outcome !== "not_applicable")
    .slice(0, 3);

  return (
    <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActive(s)}
            className={`rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors ${
              s.id === active.id
                ? "border-brand bg-brand text-white"
                : "border-line text-muted hover:border-brand hover:text-brand"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-sm text-muted">{active.blurb}</p>

      <ul className="mt-4 space-y-3">
        {evals.map((e) => {
          const meta = OUTCOME_META[e.outcome];
          const open = [...new Set(e.unknowns.map((u) => UNKNOWN_LABELS[u] ?? null))].filter(
            Boolean
          );
          return (
            <li key={e.rule.id} className="rounded-xl border border-line/70 p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded px-2 py-0.5 text-[11px] font-semibold ${meta.cls}`}>
                  {meta.label}
                </span>
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  {e.rule.rule_type.replace(/_/g, " ")}
                </span>
                {e.rule.status === "verified" && (
                  <span className="rounded bg-pass/10 px-1.5 py-px text-[10px] font-medium text-pass">
                    verified vs statute
                  </span>
                )}
              </div>
              <p className="mt-1.5 text-sm leading-relaxed">
                {e.rule.effect.split(". ").slice(0, 2).join(". ")}
                {e.rule.effect.includes(". ") ? "." : ""}
              </p>
              {open.length > 0 && (
                <p className="mt-1 text-[12px] text-caution">To settle it: {open.join("; ")}.</p>
              )}
              {e.rule.source && (
                <a
                  href={e.rule.source}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
                >
                  read the statute
                </a>
              )}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        This is the production rules engine — the same code that evaluates your
        deals — running right here against the researched rule set. Missing
        facts surface as open questions, never silent passes.
      </p>
    </div>
  );
}
