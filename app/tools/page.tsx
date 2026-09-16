import type { Metadata } from "next";
import Link from "next/link";
import { PlaceBackdrop } from "@/app/place-band";
import { DealMathTools } from "./deal-math-tools";

export const metadata: Metadata = {
  title: "Deal math — Underwrite Copilot",
  description:
    "Size a loan against LTV, DSCR and debt yield and see which one binds. Cap rate, price and NOI. Yield on cost against the exit cap. One rent said four ways. Runs in your browser; nothing is sent anywhere.",
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
      <section className="relative overflow-hidden rounded-2xl text-white">
        <PlaceBackdrop metro="chicago" height={420} opacity="opacity-40" />
        <div className="relative px-6 py-10 sm:px-10 sm:py-12">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-accent">
            Deal math
          </p>
          <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
            The numbers, before the deal
          </h1>
          <p className="mt-3 max-w-xl text-sm text-white/75">
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
          These four take numbers you already have. Upload the offering memorandum
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
