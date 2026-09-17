import type { Metadata } from "next";
import Link from "next/link";
import { PlaceBackdrop } from "@/app/place-band";
import { rateSeeds } from "@/lib/live-rates";
import { liveRates } from "@/lib/live-rates-read";
import { DealMathTools } from "./deal-math-tools";
import { RatesStrip } from "@/app/rates-strip";

export const metadata: Metadata = {
  title: "Deal math — Underwrite Copilot",
  description:
    "Thirty-nine calculators for a commercial deal: size a loan and see which test binds, run the loan over the hold and test the refinance, what a construction loan's interest reserve really costs once the draw is run month by month, whether a bridge loan's rate cap reaches its own covenant, what yield maintenance or defeasance costs to get out early, sources and uses, the capital stack with the cost of every layer against what the building earns, what a below-market lease is worth to end, which line of the zoning code a site actually runs into once floor area is measured gross, what the land can be worth, the LP/GP waterfall, what the sponsor's three fees take out of that split before the preferred return is reached, a pasted cash flow, the growth rate a price is quietly assuming, whether to hold it another year or sell it and what the answer costs when the cost of selling is charged to the wrong side, what you can pay and still earn what the equity needs, solved rather than scaled because the price is circular through the debt, which trailing window the memorandum chose and what that choice is worth at the stated cap, what a building with 95% of its doors full actually banks against market rent, what the reserve and the leasing capital below the NOI line do to the advertised cap, what the insurance line costs once it is your policy rather than the seller's and what one named-storm deductible retains, an OM's unit mix, when the income rolls and what a tenant's break option takes off the weighted average term, how long an empty building takes to fill and why a slower lease-up never shows up in the reserve, the site's density and floor area ratio, net effective rent, rentable against usable feet, depreciation and what recapture takes back, what a 1031 exchange actually defers, the operating-expense reconciliation with its gross-up, percentage rent and the natural breakpoint, what the property taxes become once the sale resets the assessment, what a leasehold is really worth when the ground lease ends, what a sale-leaseback's rent is really buying once it reverts to market, the settlement statement at closing, and the quick conversions. Runs in your browser; nothing is sent anywhere.",
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
export default async function ToolsPage() {
  const rates = await liveRates();
  const seeds = rateSeeds(rates);
  // Only the series that actually pre-fill a field are marked in the strip.
  // Today that is SOFR alone: the floating-rate card references it by name.
  // The 10-year is shown and not seeded — the prepayment card wants the
  // Treasury matched to the remaining term, and the 10-year would flatter it.
  const seeded = seeds.sofrPct !== null ? ["SOFR"] : [];

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

      <RatesStrip rates={rates} seeds={seeded} />

      <DealMathTools seeds={seeds} />

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
