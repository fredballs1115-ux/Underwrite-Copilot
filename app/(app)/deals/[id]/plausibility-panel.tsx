import type { DealStrategy, PlausibilityFinding } from "@/lib/deal-strategy";

/**
 * "These figures can't all be true at once." Rendered directly under the
 * deal header, above every number built on the extraction, whenever the
 * pure plausibility check finds something: an NOI at or above the price, a
 * stated cap that disagrees with NOI ÷ price, a per-unit basis no market
 * trades at. Nothing to say → renders nothing.
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
