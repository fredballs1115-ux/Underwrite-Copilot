import type { Metadata } from "next";
import Link from "next/link";
import { PlaceBackdrop } from "@/app/place-band";
import { DealMathTools } from "./deal-math-tools";

export const metadata: Metadata = {
  title: "Deal math — Underwrite Copilot",
  description:
    "Fifteen calculators for a commercial deal: size a loan and see which test binds, run the loan over the hold and test the refinance, sources and uses, what the land can be worth, the LP/GP waterfall, a pasted cash flow, an OM's unit mix, the site's density and floor area ratio, net effective rent, rentable against usable feet, and the quick conversions. Runs in your browser; nothing is sent anywhere.",
};

/**
 * The page that keeps an analyst from opening a spreadsheet.
 *
 * Everything else here needs a deal: an offering memorandum to read, a model
 * to reconcile against, a pipeline to sit in. This needs nothing. It is the
 * arithmetic that happens on the phone call before any of that — "eight and
 * a quarter, what does that size to" — and an analyst who leaves to answer
 * it has left the site.
 *
 * Public on purpose. A calculator behind a login is a calculator nobody
 * reaches for, and it is the honest version of a demo: the same math the
 * screening engine runs, with nothing withheld.
 */
export default function ToolsPage() {
  return (
    <div className="space-y-8">
      <section className="relative flex min-h-[15rem] items-end overflow-hidden rounded-2xl text-white sm:min-h-[18rem]">
        <PlaceBackdrop metro="chicago" height={420} />
        <div className="on-photo band-words relative w-full px-6 pb-8 pt-12 sm:px-10 sm:pb-10 sm:pt-16">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">
            Deal math
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            The numbers, before the deal
          </h1>
          <p className="mt-3 text-sm text-white">
            Runs in your browser. Nothing is sent anywhere, nothing is stored.
          </p>
        </div>
      </section>

      <DealMathTools />

      <section className="rounded-2xl border border-line bg-white p-6">
        <h2 className="text-lg font-semibold tracking-tight">
          When the deal is real
        </h2>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          These take numbers you already have. Upload the offering memorandum
          and the same engine reads them out of it, argues with them, checks the
          broker&apos;s comps against the market, and reconciles it all against your
          own model.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/demo"
            className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            See a screened deal
          </Link>
          <Link
            href="/market"
            className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:border-brand hover:text-brand"
          >
            Covered markets
          </Link>
        </div>
      </section>
    </div>
  );
}
