// The sample deal's legal read, derived — NOT typed. Runs the same engine
// chain as the real deal page's Regulation & benchmarks panel (seedRules →
// buildSubject → evaluateRules → metroForAddress) against the sample deal's
// Philadelphia jurisdiction, and shapes the result for the marketing
// surfaces: the homepage sample screen, the hero's baby legal note, and
// /demo. One source, three surfaces — the numbers can never disagree with
// what a signed-in user sees on the real deal page.
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { evaluateRules, type RuleEvaluation } from "@/lib/research";
import { buildSubject, seedRules } from "@/lib/research-data";
import { metroForAddress } from "@/lib/market-match";

export type SampleLegalRule = {
  /** e.g. "eviction procedure · Philadelphia" */
  typeLabel: string;
  /** the real panel's outcome chip word for this evaluation */
  outcomeLabel: "Applies" | "Possibly applies" | "Exempt" | "Not applicable";
  /** why a non-triggered rule still matters: what event wakes it */
  dormantNote: string | null;
  /** full effect text (clamped by the consuming surface, not here) */
  effect: string;
  status: string;
  asOf: string;
  source: string | null;
};

export type SampleLegal = {
  metroId: string | null;
  metroName: string | null;
  jurisdiction: string;
  /** rules the engine evaluated for this jurisdiction (matched, any outcome) */
  screenedCount: number;
  /** rules that would render as cards on the real deal page (non-n/a) */
  triggeredCount: number;
  rules: SampleLegalRule[];
  /** a state-level plain fact carried inside the verified rule text, when the
   *  research layer states one (e.g. "Pennsylvania has no state or local rent
   *  control.") — extracted verbatim, never composed. Null when absent. */
  stateFact: string | null;
};

const OUTCOME_LABEL: Record<RuleEvaluation["outcome"], SampleLegalRule["outcomeLabel"]> = {
  applies: "Applies",
  possibly_applies: "Possibly applies",
  exempt: "Exempt",
  not_applicable: "Not applicable",
};

/** Rules that key off an event (an eviction filing, a vacancy registration)
 *  evaluate not-applicable on a purchase — the real panel explains they stay
 *  dormant until the event. Mirror that explainer per rule type. */
const DORMANT_NOTES: Record<string, string> = {
  eviction_procedure: "dormant until an eviction filing — not triggered by the purchase itself",
  vacancy_registration: "dormant until a unit registers vacant",
};

export function sampleLegal(): SampleLegal {
  const rules = seedRules();
  const subject = buildSubject({
    address: SAMPLE_DEAL.address,
    sizeText: "248 units",
    yearBuilt: null,
    sectorFields: null,
  });
  const evals = evaluateRules(rules, subject);
  const shown = evals.filter((e) => e.outcome !== "not_applicable");
  const metro = metroForAddress(SAMPLE_DEAL.address);

  const toRule = (e: RuleEvaluation): SampleLegalRule => ({
    typeLabel: `${e.rule.rule_type.replace(/_/g, " ")} · ${
      e.rule.jurisdiction_local ?? e.rule.jurisdiction_state
    }`,
    outcomeLabel: OUTCOME_LABEL[e.outcome],
    dormantNote:
      e.outcome === "not_applicable"
        ? (DORMANT_NOTES[e.rule.rule_type] ?? null)
        : null,
    effect: e.rule.effect,
    status: e.rule.status,
    asOf: e.rule.as_of,
    source: e.rule.source,
  });

  // Surface every jurisdiction-matched rule: the ones the real page shows as
  // cards first, then dormant ones — the sample's whole point is showing the
  // machinery, and Philadelphia's one rule happens to be dormant on purchase.
  const ordered = [...shown, ...evals.filter((e) => e.outcome === "not_applicable")];

  // Verbatim extraction only: the sentence must already exist in a rule's
  // verified effect text. Composing a paraphrase here would launder prose
  // into a "fact", so anything less than an exact match yields null.
  const stateFact =
    ordered
      .map((e) => e.rule.effect.match(/[^.]*no state or local rent control[^.]*\./i)?.[0]?.trim())
      .find((s): s is string => !!s) ?? null;

  return {
    metroId: metro?.id ?? null,
    metroName: metro?.name ?? null,
    jurisdiction:
      SAMPLE_DEAL.address.city || SAMPLE_DEAL.address.county || SAMPLE_DEAL.address.state,
    screenedCount: evals.length,
    triggeredCount: shown.length,
    rules: ordered.map(toRule),
    stateFact,
  };
}
