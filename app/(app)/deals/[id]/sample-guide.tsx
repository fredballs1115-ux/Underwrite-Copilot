/**
 * "How to read this screen" — shown only on the sample deal, so a first-time
 * user knows the intended reading order before they wander. Static, no state.
 */
export function SampleGuide() {
  return (
    <section className="rounded-2xl border border-brand/25 bg-brand/[0.04] p-5">
      <h2 className="text-sm font-semibold tracking-tight">
        How to read this screen
      </h2>
      <ol className="mt-2.5 grid gap-3 text-sm leading-relaxed text-muted sm:grid-cols-3">
        <li>
          <span className="font-medium text-ink">1 · Verdict first.</span> The
          Go / Caution / No-go call, the reason, and where it flips across
          conservative → sponsor numbers. The buy-box chips say how it fits
          your mandate.
        </li>
        <li>
          <span className="font-medium text-ink">2 · Financials.</span> Every
          extracted term with its source page, then FINANCING &amp; CAPITAL —
          debt sizing, rate sensitivity, the capital plan — and the Excel
          model.
        </li>
        <li>
          <span className="font-medium text-ink">3 · Deep dives.</span>{" "}
          Challenged assumptions, comps (graded, and on the map), the market
          check, and the OM-vs-actuals reconciliation.
        </li>
      </ol>
      <p className="mt-3 border-t border-brand/10 pt-2.5 text-xs text-muted">
        This deal is illustrative — no real property or firm. Drag the
        sensitivity sliders below: returns and mandate fit recompute live, and
        the PROPERTY ACTUALS card shows the rent roll and T-12 the screen
        reconciled against the OM.
      </p>
    </section>
  );
}
