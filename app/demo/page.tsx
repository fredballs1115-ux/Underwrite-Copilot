import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/app/logo";
import { FREE_DEALS_LINE, DEEP_TOOLS } from "@/lib/marketing-constants";
import { sampleHeader } from "@/lib/sample-header";
import { liveDebtSeeds } from "@/lib/debt-index-read";
import { HOLD_MONTHS } from "@/lib/underwrite/inputs";
import { fmrToday } from "@/lib/fmr";
import { sampleTodayReads } from "@/lib/sample-stress-read";
import { ResearchPanelView } from "@/app/(app)/deals/[id]/research-panel";
import { SamplePublicRecord } from "@/app/(app)/deals/[id]/public-record-card";
import { SampleDealHero } from "@/app/sample-hero";
import { DemoSections } from "./sections";
import { sampleDemoData } from "./demo-data";
import { verdictCounts } from "@/lib/stress-test-words";
import { PlaceBand } from "@/app/place-band";
import { DataNotices } from "@/app/data-notices";

// ISR, five-minute window: without a revalidate this page is fully static
// and browsers may serve a year-stale copy under stale-while-revalidate —
// the same trap the homepage had. next.config expireTime caps the rest.
export const revalidate = 300;

export const metadata: Metadata = {
  title: "Sample test — one OM, its assumptions tested",
  description:
    "Browse a full Underwrite Copilot test: each assumption challenged, the broker's comps graded, a market check against dated figures, the verdict, buy-box fit score, live sensitivity sliders, reconciliation, financing & capital, and downloadable memo + Excel — on an illustrative sample deal.",
  alternates: { canonical: "/demo" },
  // Child `openGraph`/`twitter` REPLACE the root objects wholesale, so the
  // image and card type must be restated or shares lose their preview.
  openGraph: {
    title: "A complete CRE test, worked end to end",
    description:
      "Challenged assumptions, graded comps, a market check, the verdict, fit score, live sliders, and the model included — on an illustrative sample deal.",
    images: ["/opengraph-image"],
  },
  twitter: {
    card: "summary_large_image",
    title: "A complete CRE test, worked end to end",
    description:
      "Challenged assumptions, graded comps, a market check, the verdict, fit score, live sliders, and the model included — on an illustrative sample deal.",
    images: ["/opengraph-image"],
  },
};

/**
 * The signed-in sample deal's page, for a visitor: its header, its five
 * sections and its research panel, each built by the deal page's own
 * readers and drawn by the deal page's own components on the sample
 * fixture (app/(app)/deals/[id]/page.tsx, read top to bottom). Nothing on
 * it is typed for this page: the name, the call, the fit, the figures, the
 * rules and the benchmarks are the readers'. What needs an account — the
 * deal's state, its tasks, Ask, the decision log, adding data — is left off.
 */
export default async function DemoPage() {
  // Today, read once outside the render (an ISO day), and its noon for the
  // header, as the deal page reads the reader's noon.
  const today = fmrToday();
  // Today's figures for the market the live figures are read for, through
  // the deal page's own read (lib/model-vs-market-read): the demand card
  // and the model's assumptions against the published figures. A failed
  // read leaves both out rather than the page down.
  const reads = await sampleTodayReads();
  // Today's debt indices (lib/debt-index-read) for the research panel's
  // leverage check: the week's survey and the 10-year beside it.
  const debt = await liveDebtSeeds(HOLD_MONTHS);
  const { data, research } = sampleDemoData({ today, reads, debt });

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

      <main id="main" className="flex-1">
        {/* The sample deal's own city, from above: Center City, Philadelphia
            (USGS's overhead) — Brewerytown is two miles north-west of the
            frame. The overhead, not the market's photograph: the deal
            header right under the band draws that photograph, and a reader
            should never meet one picture twice in a row. */}
        <PlaceBand metro="philadelphia" width="max-w-5xl" eager picture="overhead">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              A complete test, worked end to end
            </h1>
            <span className="rounded-full bg-caution px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-white [text-shadow:none]">
              Illustrative sample
            </span>
          </div>
          <p className="mt-2 text-sm text-white">
            The product, on an invented deal in Philadelphia — not a real listing, not investment advice.
          </p>
        </PlaceBand>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-10">
          {/* The deal page's own header on the sample (lib/sample-header,
              app/sample-hero): its market photograph, the name, the call,
              the fit, the four figures and the tool row. */}
          <SampleDealHero
            header={sampleHeader(new Date(`${today}T12:00:00Z`))}
            titleAs="h2"
            stress={data.stressTest && data.stressTest.rows.length > 0 ? verdictCounts(data.stressTest) : null}
          />

          <DemoSections data={data} />

          {/* Under its sections, as the deal page draws them on the sample:
              the public-record card in the sample's place (its building is
              fictional, so no parcel is looked up — the card's own line,
              public-record-card `SamplePublicRecord`), then the research
              panel, on the sample's address and the checked-in rules and
              benchmarks. */}
          <section aria-labelledby="behind-this-screen" className="flex flex-col gap-2">
            <p id="behind-this-screen" className="text-xs font-medium uppercase tracking-wider text-muted">
              Behind this screen
            </p>
            <div className="space-y-4">
              <SamplePublicRecord />
              <ResearchPanelView {...research} />
            </div>
          </section>

          {/* What comes after the screen. Rendered from the SAME DEEP_TOOLS
              constant the homepage's grid uses, so the sample screen and the
              marketing page can never describe the product differently. */}
          <div className="mt-6 rounded-2xl border border-line bg-faint/60 p-6">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Past the screen
            </p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight">
              This sample is the triage. Four more tools pick up where it stops.
            </h2>
            <div className="mt-5 grid gap-3 sm:grid-cols-4">
              {DEEP_TOOLS.map((t) => (
                <div key={t.title} className="rounded-xl border border-line bg-surface p-4" title={t.blurb}>
                  <h3 className="text-sm font-semibold leading-snug">{t.title}</h3>
                  <p className="mt-1.5 text-[11px] uppercase tracking-wide text-muted">{t.where}</p>
                </div>
              ))}
            </div>
          </div>

          {/* The conversion moment — after they've seen the whole screen. */}
          <div className="mt-6 rounded-2xl bg-sidebar p-8 text-center">
            <h2 className="text-xl font-semibold tracking-tight text-white">
              Run this test on your own OM
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-white/70">
              {FREE_DEALS_LINE} · no card.
            </p>
            <Link
              href="/login?mode=signup"
              className="mt-5 inline-flex rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-strong transition-colors hover:bg-accent"
            >
              Get started free
            </Link>
          </div>
        </div>
      </main>

      <footer className="border-t border-line bg-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-muted">
          <span>Underwrite Copilot · sample data is illustrative only</span>
          <span className="flex flex-wrap gap-x-4 gap-y-2 whitespace-nowrap">
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
          {/* The demo draws FRED's and the BLS's figures (the leverage check,
              the demand card, the model's read) outside either shell, so its
              own footer carries the data providers' notices too
              (app/data-notices). */}
          <DataNotices className="basis-full" />
        </div>
      </footer>
    </div>
  );
}
