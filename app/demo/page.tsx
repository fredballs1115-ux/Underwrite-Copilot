import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/app/logo";
import { MarketsMarquee } from "@/app/markets-marquee";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { FREE_DEALS } from "@/lib/marketing-constants";
import { compareNoi, pickOmNoi } from "@/lib/actuals/analyze";
import { deriveUnderwriteInputs } from "@/lib/underwrite/inputs";
import { evaluateBuyBox, parsePct } from "@/lib/criteria";
import { leverageRead } from "@/lib/leverage";
import { seedBenchmarks } from "@/lib/research-data";
import { sampleLegal } from "@/lib/sample-legal";
import { scoreMandateFit } from "@/lib/mandate";
import type { ExtractedMetric } from "@/lib/anthropic/types";
import { DemoSections, type DemoData } from "./sections";
import { ModelSlideshow } from "./model-slideshow";
import { BrokerQuestions } from "./broker-questions";

// ISR, five-minute window: without a revalidate this page is fully static
// and browsers may serve a year-stale copy under stale-while-revalidate —
// the same trap the homepage had. next.config expireTime caps the rest.
export const revalidate = 300;

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

/** The deal page's Regulation & benchmarks panel for the sample deal —
 *  derived by lib/sample-legal through the real rules engine. Full-width
 *  presentation with provenance (source link, verified chip, as-of), the
 *  covered-market chip, and the dormancy explainer for event-keyed rules. */
function LegalPanel() {
  const legal = sampleLegal();
  return (
    <section className="mt-8 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          Regulation &amp; benchmarks
        </h2>
        <span className="text-[11px] text-muted">
          assumes a natural-person buyer with no other units here — the same
          default the deal page declares
        </span>
      </div>
      {legal.metroName && (
        <Link
          href={legal.metroId ? `/market?metro=${legal.metroId}` : "/market"}
          className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand/5 px-2.5 py-1 text-[11px] font-medium text-brand outline-none transition-colors hover:bg-brand/10 focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
          Covered market: {legal.metroName} — open the market brief →
        </Link>
      )}
      <p className="mt-3 text-sm text-muted">
        Screened: {legal.screenedCount} rule
        {legal.screenedCount === 1 ? "" : "s"} on file for {legal.jurisdiction}{" "}
        —{" "}
        {legal.triggeredCount === 0
          ? "none triggered by this deal's facts. Rules that key off events (an eviction filing, a vacancy registration) stay dormant until those events."
          : `${legal.triggeredCount} triggered by this deal's facts.`}
      </p>
      <ul className="mt-3 space-y-3">
        {legal.rules.map((r) => (
          <li key={r.typeLabel} className="rounded-lg border border-line/70 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-line/60 px-1.5 py-px text-[11px] font-semibold text-muted">
                {r.outcomeLabel}
              </span>
              <span className="text-[11px] uppercase tracking-wide text-muted">
                {r.typeLabel}
              </span>
              <span className="ml-auto inline-flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                <span className="rounded bg-emerald-500/10 px-1.5 py-px font-medium text-emerald-600">
                  {r.status}
                </span>
                <span>as of {r.asOf}</span>
                {r.source && (
                  <a
                    href={r.source}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-dotted underline-offset-2 hover:text-ink"
                  >
                    source
                  </a>
                )}
              </span>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed">{r.effect}</p>
            {r.dormantNote && (
              <p className="mt-1 text-[12px] font-medium text-caution">
                {r.dormantNote}
              </p>
            )}
          </li>
        ))}
      </ul>
      {legal.stateFact && (
        <p className="mt-3 text-[12px] text-muted">
          Plain-state fact carried in the verified rule text: {legal.stateFact}
        </p>
      )}
    </section>
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

  // Leverage check on the SAMPLE — the same lib/leverage code path every
  // real deal page runs, against the same sourced PMMS snapshot, so the
  // demo can never show a check the product doesn't do.
  const pmmsRow = seedBenchmarks().find((b) => b.metric === "pmms_30y_fixed");
  const sampleCapPct = cap ? parsePct(cap) : null;
  const sampleLeverage =
    sampleCapPct != null && pmmsRow && typeof pmmsRow.low === "number"
      ? leverageRead(sampleCapPct, pmmsRow.low)
      : null;

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
              The Maddox at Brewerytown
            </h2>
            <span className="rounded-full bg-caution/15 px-2.5 py-1 text-[11px] font-medium text-caution">
              Caution
            </span>
          </div>
          <p className="mt-1 text-sm text-muted">
            {data.extraction.market || "Brewerytown, Philadelphia, PA"} ·{" "}
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

        {/* Regulation & benchmarks — the deal page's legal panel, run by the
            same engine on the sample's real Philadelphia jurisdiction. The
            sample's one rule happens to be dormant on a purchase, and the
            panel says so instead of hiding it — that honesty IS the demo. */}
        <LegalPanel />

        {/* Interactive: the challenger's real broker questions, revealed on
            click — the reader plays analyst before seeing the drafted ask. */}
        <BrokerQuestions />


        {/* The actual deliverables — a prospect can hold the export in their
            hands, not just look at a screenshot of it. Public fixture data. */}
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface p-5 shadow-card">
          <div>
            <h2 className="text-sm font-semibold tracking-tight">
              Take the deliverables with you
            </h2>
            <p className="mt-1 max-w-md text-sm text-muted">
              The one-page IC memo, the full multi-page report behind it, and
              the live-formula Excel model this screen produced — the same
              files a signed-in analyst exports.
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
              href="/api/demo/report"
              className="rounded-lg border border-line px-3.5 py-2 text-sm font-medium transition-colors hover:bg-faint"
            >
              Full report (PDF)
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

      {/* Same live band as the homepage — leads into the research-layer
          section below: these are the markets that layer covers. */}
      <MarketsMarquee />

      {/* The research layer — real rules + real data behind the sample's
          jurisdiction (site-polish 2). Everything here is genuine: the rule
          is verified against the statute, the FMR is the published FY2026
          figure, and signed-in samples pull live recorded sales. */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Behind this screen
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            The sample sits in a real submarket — and the rules are real too.
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded bg-kill/10 px-2 py-0.5 text-[11px] font-semibold text-kill">
                  Applies
                </span>
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  eviction procedure · Philadelphia
                </span>
                <span className="rounded bg-pass/10 px-1.5 py-px text-[10px] font-medium text-pass">
                  verified vs statute
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">
                Philadelphia Code § 9-811: before any eviction step, a landlord
                must enroll in the city&apos;s Eviction Diversion Program and
                participate in good faith for at least 30 days before filing.
                The screen prices that turnover delay in.
              </p>
              <a
                href="https://codelibrary.amlegal.com/codes/philadelphia/latest/philadelphia_pa/0-0-0-278160"
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 inline-block text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
              >
                read the statute
              </a>
            </div>
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted">
                Real benchmarks for this submarket
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                Philadelphia MSA FY2026 fair market rent:{" "}
                <span className="font-mono font-semibold tabular-nums">$1,810/mo</span>{" "}
                (2BR) · metro 2–4 unit median{" "}
                <span className="font-mono font-semibold tabular-nums">$363,500</span>{" "}
                (+6.9% YoY, May 2026) · recorded-sales comps pull automatically
                from the city&apos;s own OPA records the moment a deal has an
                address.
              </p>
              <p className="mt-2 text-[11px] text-muted">
                Signed-in sample screens run the live pull — real recorded
                sales around Brewerytown, source-linked row by row.
              </p>
            </div>
          </div>
          {sampleLeverage && pmmsRow && sampleCapPct != null && (
            <div className="mt-4 rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-wide text-muted">
                  Leverage check — computed, not opined
                </p>
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    sampleLeverage.tone === "negative"
                      ? "bg-kill/10 text-kill"
                      : sampleLeverage.tone === "thin"
                        ? "bg-caution/10 text-caution"
                        : "bg-pass/10 text-pass"
                  }`}
                >
                  {sampleLeverage.tone === "negative"
                    ? "negative leverage"
                    : sampleLeverage.tone === "thin"
                      ? "thin spread"
                      : "positive at benchmark"}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">
                {sampleLeverage.label} — going-in cap {sampleCapPct}% vs{" "}
                <span className="font-mono font-semibold tabular-nums">
                  {pmmsRow.low}%
                </span>{" "}
                30-yr fixed (as of {pmmsRow.as_of}). Every real deal gets this
                same arithmetic on its deal page, refreshed against the latest
                FRED pull.
              </p>
            </div>
          )}
          <p className="mt-4 text-xs text-muted">
            The deal above is illustrative; this panel is not — the rules,
            rents, and records are the product&apos;s actual research layer.
          </p>
        </div>
      </section>

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
            <Link href="/whats-new" className="transition-colors hover:text-ink">
              What&apos;s new
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
