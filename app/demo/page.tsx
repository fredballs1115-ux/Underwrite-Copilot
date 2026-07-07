import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/app/logo";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import type { ExtractedMetric } from "@/lib/anthropic/types";
import { DemoSections, type DemoData } from "./sections";
import { ModelSlideshow } from "./model-slideshow";

export const metadata: Metadata = {
  title: "Sample screen — a complete analysis, worked end to end",
  description:
    "Browse a full Underwrite Copilot screening: verdict, challenged assumptions, broker-comp scrutiny, market check, reconciliation, and a live stress panel — on an illustrative sample deal.",
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
  const data: DemoData = {
    extraction: SAMPLE_DEAL.extraction,
    challenges: SAMPLE_DEAL.challenges,
    comps: SAMPLE_DEAL.comps,
    reconciliation: SAMPLE_DEAL.reconciliation,
    market: SAMPLE_DEAL.market,
    verdict: SAMPLE_DEAL.verdict,
    model: SAMPLE_DEAL.model,
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
            its work. First 3 deals free, no card.
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
