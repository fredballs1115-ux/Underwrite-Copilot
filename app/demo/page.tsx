import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/app/logo";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { FREE_DEALS } from "@/lib/marketing-constants";
import { compareNoi, pickOmNoi } from "@/lib/actuals/analyze";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { evaluateBuyBox } from "@/lib/criteria";
import { scoreMandateFit } from "@/lib/mandate";
import type { ExtractedMetric } from "@/lib/anthropic/types";
import { DemoSections, type DemoData } from "./sections";
import { ModelSlideshow } from "./model-slideshow";

export const metadata: Metadata = {
  title: "Sample screen — a complete analysis, worked end to end",
  description:
    "Browse a full Underwrite Copilot screening: verdict, buy-box fit score, live sensitivity sliders, challenged assumptions, graded comps, market check, reconciliation, financing & capital, and downloadable memo + Excel — on an illustrative sample deal.",
  alternates: { canonical: "/demo" },
  // Child `openGraph`/`twitter` REPLACE the root objects wholesale, so the
  // image and card type must be restated or shares lose their preview.
  openGraph: {
    title: "A complete CRE screen, worked end to end",
    description:
      "Verdict, fit score, live sliders, graded comps, market check, and a downloadable model — on an illustrative sample deal.",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "A complete CRE screen, worked end to end",
    description:
      "Verdict, fit score, live sliders, graded comps, market check, and a downloadable model — on an illustrative sample deal.",
    images: ["/opengraph-image"],
  },
};

// Same slot-picking the deal page's summary bar uses — the demo should read
// exactly like the product.
function findValue(
  metrics: ExtractedMetric[],
  include: RegExp,
  exclude?: RegExp,
): string | null {
  return (
    metrics.find((m) => include.test(m.label) && !(exclude && exclude.test(m.label)))
      ?.value ?? null
  );
}

export default function DemoPage() {
  // Everything below is computed by the SAME functions the logged-in app
  // runs — evaluateBuyBox, scoreMandateFit, deriveUnderwriteInputs — over
  // the sample fixture, so the demo can never drift from the product.
  const omNoi = pickOmNoi(SAMPLE_DEAL.extraction.metrics)?.noi ?? null;
  const derived = deriveUnderwriteInputs(
    SAMPLE_DEAL.extraction,
    SAMPLE_DEAL.name,
    {
      rentRoll: {
        summary: SAMPLE_DEAL.rentRoll.summary,
        asOf: SAMPLE_DEAL.rentRoll.as_of_date,
      },
      t12: {
        summary: SAMPLE_DEAL.t12.summary,
        periodEnd: SAMPLE_DEAL.t12.period_end_date,
      },
    },
  );
  const checkSource = {
    assetClass: SAMPLE_DEAL.extraction.assetClass,
    market: SAMPLE_DEAL.extraction.market,
    metrics: SAMPLE_DEAL.extraction.metrics,
  };

  const data: DemoData = {
    extraction: SAMPLE_DEAL.extraction,
    challenges: SAMPLE_DEAL.challenges,
    comps: SAMPLE_DEAL.comps,
    reconciliation: SAMPLE_DEAL.reconciliation,
    market: SAMPLE_DEAL.market,
    verdict: SAMPLE_DEAL.verdict,
    model: SAMPLE_DEAL.model,
    actuals: {
      rentRoll: {
        asOf: SAMPLE_DEAL.rentRoll.as_of_date,
        summary: SAMPLE_DEAL.rentRoll.summary,
      },
      t12: {
        periodEnd: SAMPLE_DEAL.t12.period_end_date,
        summary: SAMPLE_DEAL.t12.summary,
      },
      // The OM's pro forma NOI vs the T-12 actual — same pure comparator
      // the app uses, fed from the same extraction metric.
      noiComparison:
        omNoi != null
          ? compareNoi(omNoi, SAMPLE_DEAL.t12.summary.noi!)
          : null,
    },
    buyBox: {
      checks: evaluateBuyBox(
        SAMPLE_DEAL.asset_class,
        checkSource,
        SAMPLE_DEMO_BOX,
      ),
      mandate: scoreMandateFit(
        SAMPLE_DEAL.asset_class,
        checkSource,
        SAMPLE_DEMO_BOX,
      ),
      scope: "personal",
      provisional: false,
      hasBox: true,
    },
    playground: {
      inputs: derived.inputs,
      dealAssetClass: SAMPLE_DEAL.asset_class,
      checkSource,
      box: SAMPLE_DEMO_BOX,
    },
    underwrite: derived.inputs,
  };
  const metrics = data.extraction.metrics;
  const price = findValue(
    metrics,
    /purchase price|asking price|\bprice\b/i,
    /unit|\/sf|per sf|per unit|psf/i,
  );
  const sfValue = findValue(
    metrics,
    /\b(total sf|square (foot|feet|footage)|sq\.? ?ft|rentable|nra|gla|building size|\bsf\b)/i,
    /price|\$|per|\/|psf/i,
  );
  const unitValue = findValue(metrics, /\bunits?\b|unit count/i, /price|\$|per|\//i);
  // A bare unit count ("248") reads wrong in a Size slot — say what it counts.
  const size =
    sfValue ??
    (unitValue
      ? /^[\d,]+$/.test(unitValue.trim())
        ? `${unitValue.trim()} units`
        : unitValue
      : null);
  const cap =
    findValue(metrics, /going[- ]?in cap/i) ??
    findValue(metrics, /\bcap rate\b/i, /exit|terminal|reversion/i);

  return (
    <div className="flex flex-1 flex-col bg-canvas">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-6 py-4">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2.5 transition-opacity hover:opacity-80"
          >
            <LogoMark className="h-8 w-8 shrink-0" />
            <span className="truncate font-semibold tracking-tight">
              Underwrite Copilot
            </span>
          </Link>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="hidden whitespace-nowrap rounded-lg px-3.5 py-1.5 text-sm font-medium text-muted transition-colors hover:text-ink sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/login?mode=signup"
              className="whitespace-nowrap rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Get started free
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            A complete screen, worked end to end
          </h1>
          <span className="rounded-full bg-caution/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-caution">
            Illustrative sample
          </span>
        </div>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
          This is the product surface on an invented deal — every section
          below is exactly what a screen looks like, from the verdict down to
          the live stress panel. Not a real listing, and not investment
          advice. Your own deals run from a real OM.
        </p>

        {/* Summary bar — mirrors the in-app deal page. */}
        <div className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="text-xl font-semibold tracking-tight">
              The Maddox at Highland Park
            </h2>
            <span className="rounded-full bg-caution/15 px-2.5 py-1 text-[11px] font-medium text-caution">
              Caution
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {data.extraction.market || "North Dallas, TX"} ·{" "}
            <span className="capitalize">multifamily</span>
          </p>
          <dl className="mt-4 grid grid-cols-1 gap-3 border-t border-line pt-4 sm:grid-cols-3">
            {[
              ["Price", price],
              ["Size", size],
              ["Going-in cap", cap],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0">
                <dt className="text-[11px] uppercase tracking-wide text-muted">
                  {label}
                </dt>
                <dd className="mt-1 truncate font-mono text-base font-semibold leading-none tabular-nums">
                  {value ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mt-8">
          <DemoSections data={data} />
        </div>

        {/* The actual deliverables — a prospect can hold the export in their
            hands, not just look at a screenshot of it. Public fixture data. */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Take the deliverables with you
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted">
              The one-page IC memo and the live-formula Excel model this
              screen produced — the same files a signed-in analyst exports.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/demo/memo"
              className="rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Sample IC memo (PDF)
            </a>
            <a
              href="/api/demo/underwrite.xlsx"
              className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:bg-faint"
            >
              Sample model (.xlsx)
            </a>
          </div>
        </div>

        {/* The model, worked through as a slideshow — the artifact that
            makes the screen concrete. */}
        <div className="mt-10">
          <ModelSlideshow model={data.model} />
        </div>

        {/* The conversion moment — after they've seen the whole screen. */}
        <div className="mt-12 rounded-2xl bg-sidebar p-8 text-center">
          <h2 className="text-xl font-semibold tracking-tight text-white">
            Run this screen on your own OM
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-white/70">
            Upload an offering memorandum and get the same six-stage read —
            sourced ranges, challenged assumptions, and a verdict that shows
            its work. First {FREE_DEALS} deals free, no card.
          </p>
          <Link
            href="/login?mode=signup"
            className="mt-5 inline-flex rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-strong transition-colors hover:bg-accent"
          >
            Get started free
          </Link>
        </div>
      </main>

      <footer className="border-t border-line bg-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted">
          <span>Underwrite Copilot · sample data is illustrative only</span>
          <span className="flex gap-4">
            <Link href="/terms" className="transition-colors hover:text-ink">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-ink">
              Privacy
            </Link>
            <Link href="/security" className="transition-colors hover:text-ink">
              Security
            </Link>
            <Link href="/" className="transition-colors hover:text-ink">
              Home
            </Link>
          </span>
        </div>
      </footer>
    </div>
  );
}
