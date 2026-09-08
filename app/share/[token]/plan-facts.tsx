import type { DealStrategy, PlanSummary } from "@/lib/deal-strategy";
import { planFacts } from "@/lib/plan-facts";

/**
 * The plan, on the shared screen. The person holding the link — a partner,
 * a lender — sees the stabilized NOI among the key terms; without this block
 * a $21M NOI beside a $20M price reads as a misprint. The same five figures
 * as the deal page's plan strip, one sentence on how to read them, nothing
 * editable. Renders nothing on a stabilized asset.
 */
export function SharePlan({
  strategy,
  plan,
}: {
  strategy: DealStrategy;
  plan: PlanSummary | null;
}) {
  if (!plan) return null;
  const kind = strategy.label.toLowerCase();
  return (
    <section
      aria-label="The plan"
      className="mt-6 rounded-2xl border border-brand/25 border-l-4 border-l-brand bg-brand/5 p-5 shadow-sm"
    >
      <h2 className="text-sm font-semibold tracking-tight">
        The plan
        <span className="ml-2 rounded-full bg-brand/10 px-2 py-px text-[11px] font-semibold text-brand">
          {strategy.label}
        </span>
      </h2>
      {strategy.summary && (
        <p className="mt-1 text-sm leading-relaxed text-muted">{strategy.summary}</p>
      )}
      <dl className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {planFacts(plan).map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs uppercase tracking-wider text-muted">{label}</dt>
            <dd className="mt-0.5 font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs leading-relaxed text-muted">
        {plan.timeline ? `Timeline as stated: ${plan.timeline}. ` : ""}A {kind} deal
        has no going-in cap: the stabilized NOI is the finished project&apos;s
        figure, judged on yield on total cost — never a cap rate on the{" "}
        {plan.priceLabel === "Land cost" ? "land" : "acquisition"} price.
      </p>
    </section>
  );
}
