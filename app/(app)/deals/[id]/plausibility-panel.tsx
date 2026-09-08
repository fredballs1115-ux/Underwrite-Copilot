import type { DealStrategy, PlanSummary, PlausibilityFinding } from "@/lib/deal-strategy";
import { planFacts } from "@/lib/plan-facts";

/**
 * The plan, as the OM states it, for a deal that is not a stabilized asset:
 * the stabilized NOI the finished project is meant to earn, what it costs to
 * get there, and the yield on that total cost. Neutral by design — a $21M
 * stabilized NOI on a $20M shell is the plan, not a contradiction; whether
 * it is as conservative as the deck says is the challenger's job, and the
 * brief it receives carries these same figures.
 */
export function PlanStrip({
  strategy,
  plan,
}: {
  strategy: DealStrategy;
  plan: PlanSummary | null;
}) {
  if (!plan) return null;
  // The same five facts the shared screen shows — one source for both.
  const cells = planFacts(plan);
  return (
    <section
      aria-label="The plan"
      className="mt-4 rounded-xl border border-brand/25 border-l-4 border-l-brand bg-brand/5 px-4 py-3"
    >
      <p className="text-sm font-semibold">
        The plan
        <span className="ml-2 rounded-full bg-brand/10 px-2 py-px text-[11px] font-semibold text-brand">
          {strategy.label}
        </span>
      </p>
      {strategy.summary && (
        <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted">{strategy.summary}</p>
      )}
      <dl className="mt-2.5 flex flex-wrap gap-x-8 gap-y-2">
        {cells.map(([label, value]) => (
          <div key={label}>
            <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
            <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-2 text-xs leading-relaxed text-muted">
        {plan.timeline ? `Timeline as stated: ${plan.timeline}. ` : "Timeline to stabilization: not stated. "}
        The stabilized NOI is the finished project&apos;s figure, judged on yield
        on total cost — never on a cap rate against the acquisition price. The
        challenger below tests whether it is as conservative as the OM presents it.
      </p>
    </section>
  );
}

/**
 * "These figures can't all be true at once." Rendered directly under the
 * deal header, above every number built on the extraction, whenever the
 * pure plausibility check finds something: an NOI labelled as today's
 * income at or above the price, a stated cap that disagrees with NOI ÷
 * price, a per-unit basis no market trades at. Nothing to say → renders
 * nothing. A plan deal's stabilized pro forma never lands here.
 */
export function PlausibilityPanel({
  findings,
  strategy,
}: {
  findings: PlausibilityFinding[];
  strategy: DealStrategy;
}) {
  if (findings.length === 0) return null;
  const high = findings.some((f) => f.severity === "high");
  return (
    <section
      aria-label="Figures that do not tie"
      className={`mt-4 rounded-xl border border-l-4 px-4 py-3 ${
        high
          ? "border-kill/30 border-l-kill bg-kill/5"
          : "border-caution/30 border-l-caution bg-caution/5"
      }`}
    >
      <p className={`text-sm font-semibold ${high ? "text-kill" : "text-caution"}`}>
        {high ? "These figures can’t all be true at once" : "Figures worth a second look"}
      </p>
      <p className="mt-0.5 text-xs text-muted">
        Checked in code against the extracted terms
        {strategy.kind !== "unknown" ? ` for a ${strategy.label.toLowerCase()} deal` : ""} —
        before any return built on them is believed. Every step below was told the same.
      </p>
      <ul className="mt-2.5 space-y-2">
        {findings.map((f) => (
          <li key={f.code} className="text-sm leading-relaxed">
            <span className="font-medium">{f.title}.</span>{" "}
            <span className="text-muted">{f.detail}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
