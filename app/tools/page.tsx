import type { Metadata } from "next";
import Link from "next/link";
import { PlaceBackdrop } from "@/app/place-band";
import { rateSeeds, treasuryForTerm } from "@/lib/live-rates";
import { liveRates } from "@/lib/live-rates-read";
import { SEED_MONTHS_REMAINING } from "@/lib/tools/prepayment";
import { DealMathTools } from "./deal-math-tools";
import { RatesStrip } from "@/app/rates-strip";

export const metadata: Metadata = {
  title: "Deal math — Underwrite Copilot",
  description:
    "Forty-eight calculators for a commercial deal: size a loan and see which test binds, run the loan over the hold and test the refinance, what a construction loan's interest reserve really costs once the draw is run month by month, whether a bridge loan's rate cap reaches its own covenant, what an interest rate swap is worth to get out of once rates have moved the way nobody stress-tested, what yield maintenance or defeasance costs to get out early, what it is worth to step into the loan somebody else signed once the smaller balance's cost in equity is netted against the coupon's benefit, sources and uses, the capital stack with the cost of every layer against what the building earns, what a below-market lease is worth to end, which line of the zoning code a site actually runs into once floor area is measured gross, the rent a new building would need before anyone competes with yours, what the land can be worth, what the entitlement period costs to wait through and whether to option the land instead of buying it, the LP/GP waterfall, what the sponsor's three fees take out of that split before the preferred return is reached, a pasted cash flow, the growth rate a price is quietly assuming, whether to hold it another year or sell it and what the answer costs when the cost of selling is charged to the wrong side, what you can pay and still earn what the equity needs, solved rather than scaled because the price is circular through the debt, which trailing window the memorandum chose and what that choice is worth at the stated cap, what a building with 95% of its doors full actually banks against market rent, what a value-add renovation program really returns once the quoted premium is split from the gap to a better building and the pace is set by turnover rather than ambition, what the reserve and the leasing capital below the NOI line do to the advertised cap, what the insurance line costs once it is your policy rather than the seller's and what one named-storm deductible retains, an OM's unit mix, what a hotel actually earns once the penetration index is taken apart into rate and occupancy and the FF&E reserve is charged against revenue rather than NOI, when the income rolls and what a tenant's break option takes off the weighted average term, how long an empty building takes to fill and why a slower lease-up never shows up in the reserve, the site's density and floor area ratio, why an audited statement's rent is never the rent the building collected and which way the error runs, net effective rent, rentable against usable feet, depreciation and what recapture takes back, what a 1031 exchange actually defers, the operating-expense reconciliation with its gross-up, percentage rent and the natural breakpoint, the self-storage rate increase with the move-out response it breaks even at and the runway each one spends, a sales comparison grid where the adjustments are signed from the comp and the three ways of getting one wrong are priced against each other, what the property taxes become once the sale resets the assessment, what a leasehold is really worth when the ground lease ends, what a sale-leaseback's rent is really buying once it reverts to market, the settlement statement at closing, and the quick conversions. Runs in your browser; nothing is sent anywhere.",
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
  // Only the series that actually pre-fill a field are marked in the strip:
  // SOFR, which the floating-rate card references by name, and the Treasury
  // tenor nearest the prepayment card's remaining term — the 2-year on the
  // worked example, never the 10-year, which would flatter the penalty.
  const tenor = treasuryForTerm(seeds.curve, SEED_MONTHS_REMAINING);
  const seeded = [
    ...(seeds.sofrPct !== null ? ["SOFR"] : []),
    ...(tenor ? [tenor.id] : []),
  ];

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
