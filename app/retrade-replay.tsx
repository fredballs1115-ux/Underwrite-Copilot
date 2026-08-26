import Link from "next/link";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { SAMPLE_RETRADE_DELTA } from "@/lib/marketing-constants";

// The retrade, replayed — a looping CSS story of the product's retrade flow
// on the sample deal: deck v1 at the ask with its Caution, the price struck
// and reissued lower, and the verdict stamping over to Go. Prices derive
// from the sample fixture and the canonical retrade constant (the same pair
// the retrade feature card cites); nothing here is typed in fresh. The
// animated card is aria-hidden with a static sentence for screen readers;
// reduced motion shows the final state.
const OLD_M = SAMPLE_DEAL.model.inputs.purchasePrice / 1e6;
// The delta's dollar figure, parsed from the one canonical string — if the
// constant's format ever changes, the new-price line drops out rather than
// showing an invented number.
const DELTA_M = (() => {
  const m = SAMPLE_RETRADE_DELTA.match(/\$([\d.]+)M/);
  return m ? Number(m[1]) : null;
})();
const NEW_M = DELTA_M != null ? OLD_M - DELTA_M : null;

export function RetradeReplay() {
  return (
    <section aria-label="The retrade flow, replayed on the sample deal">
      <div className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Built for the retrade
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Broker cut the price? Watch the verdict flip.
            </h2>
          </div>
          <Link
            href="/demo"
            className="text-sm font-medium text-brand underline-offset-2 hover:underline"
          >
            See the worked sample →
          </Link>
        </div>

        <div
          aria-hidden
          className="mx-auto mt-8 max-w-md rounded-2xl border border-line bg-surface p-5 shadow-card"
        >
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">
                Deck v1 · original ask
              </p>
              <p className="relative mt-0.5 inline-block font-mono text-xl font-semibold tabular-nums">
                ${OLD_M.toFixed(1)}M
                <span className="rt-strike absolute left-0 top-1/2 h-0.5 w-full bg-kill/70" />
              </p>
            </div>
            <span className="rt-caution rounded-full bg-caution/10 px-3 py-1 text-xs font-semibold text-caution ring-1 ring-caution/30">
              Caution
            </span>
          </div>

          <div className="rt-new mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-muted">
                Deck v2 · reissued
              </p>
              <p className="mt-0.5 font-mono text-xl font-semibold tabular-nums text-ink">
                {NEW_M != null ? `$${NEW_M.toFixed(1)}M` : "lower ask"}
                <span className="ml-2 rounded bg-pass/10 px-1.5 py-0.5 font-sans text-[10px] font-semibold text-pass">
                  {SAMPLE_RETRADE_DELTA}
                </span>
              </p>
            </div>
            <span className="rt-go rounded-full bg-pass/10 px-3 py-1 text-xs font-semibold text-pass ring-1 ring-pass/30">
              Go
            </span>
          </div>

          <p className="rt-new mt-3 text-[11px] leading-relaxed text-muted">
            Replace the OM, re-screen in one click — every delta called, the
            verdict re-argued from the new basis.
          </p>
        </div>

        <p className="sr-only">
          When the broker reissues the deck at a lower price, replace the OM
          and re-screen: the sample deal&apos;s Caution flips to Go at{" "}
          {SAMPLE_RETRADE_DELTA}, with every changed number called out.
        </p>
        <p className="mt-4 text-center text-[11px] text-muted">
          Illustrative sample retrade — the same one-click re-screen every
          real deal gets, priors kept.
        </p>
      </div>
    </section>
  );
}
