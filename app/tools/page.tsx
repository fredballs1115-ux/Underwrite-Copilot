import type { Metadata } from "next";
import Link from "next/link";
import { PAGE_COLUMN_SIZES, PlaceBackdrop } from "@/app/place-band";
import { rateSeeds, treasuryForTerm } from "@/lib/live-rates";
import { liveRates } from "@/lib/live-rates-read";
import { publicMetadata } from "@/lib/page-meta";
import { SEED_MONTHS_REMAINING } from "@/lib/tools/prepayment";
import { DealMathTools } from "./deal-math-tools";
import { RatesStrip } from "@/app/rates-strip";

// The layout's template adds the site's name. The canonical is the bare
// page: a sizing travels as a link with its figures in the query string,
// and every such link is this one page. The jump index and the cards say
// what each calculator answers; the description is a search result's line.
export const metadata: Metadata = {
  ...publicMetadata({
    title: "Deal math",
    canonical: "/tools",
    description:
      "Forty-eight calculators for a commercial real estate deal: size the loan, test the refinance, run the LP/GP waterfall, value the land. No account needed.",
  }),
  // Those figures are in the page's own address, and a Referer header
  // would hand them to every request the page makes — a prefetch, a
  // chunk, a link out.
  referrer: "no-referrer",
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
        {/* Inside the page's 72rem column, so it asks for that width, not
            the screen's; and it opens the page, so it comes first. */}
        <PlaceBackdrop metro="chicago" height={420} sizes={PAGE_COLUMN_SIZES} eager />
        <div className="on-photo band-words relative w-full px-6 pb-8 pt-12 sm:px-10 sm:pb-10 sm:pt-16">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">
            Deal math
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            The numbers, before the deal
          </h1>
          <p className="mt-3 text-sm text-white">
            Runs in your browser, and nothing is saved. What you type stays in this page&apos;s link, so a sizing travels as a URL.
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
