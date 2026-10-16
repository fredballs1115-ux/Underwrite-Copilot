import type { Metadata } from "next";
import Link from "next/link";
import { LogoMark } from "@/app/logo";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { FREE_DEALS_LINE, DEEP_TOOLS } from "@/lib/marketing-constants";
import { findGoingInCap, parsePct } from "@/lib/criteria";
import { benchmark30, datedLong } from "@/lib/debt-index";
import { liveDebtSeeds } from "@/lib/debt-index-read";
import { HOLD_MONTHS } from "@/lib/underwrite/inputs";
import { metroFmr, seedBenchmarks, seedRules, twoToFourMedian } from "@/lib/research-data";
import { fmrLabel, fmrToday, fmrWhen } from "@/lib/fmr";
import { monthOf } from "@/lib/zori";
import { rankLabel } from "@/lib/rank";
import { sectorStandings } from "@/lib/sector-leaderboard";
import { blockCitations, houseShort, snapshotAge } from "@/lib/tracker-read";
import { researchAge, staleMark } from "@/lib/research-age";
import metrosSeed from "@/data/research/metros.json";
import { sampleLegal } from "@/lib/sample-legal";
import { LegalPanel } from "./legal-panel";
import { sampleHeader } from "@/lib/sample-header";
import { SampleDealHero } from "@/app/sample-hero";
import { DemoSections } from "./sections";
import { sampleDemoData, samplePlacement } from "./demo-data";
import { SampleLeverageCard } from "./leverage-card";
import { todayReads, type TodayReads } from "@/lib/model-vs-market-read";
import { PlaceBand } from "@/app/place-band";
import { DataNotices } from "@/app/data-notices";
import { linkOk } from "@/lib/link-audit";

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

export default async function DemoPage() {
  // Today, read once outside the render: a fair market rent's year, the
  // rankings' year-old rule and every research date's age (lib/research-age).
  const today = fmrToday();
  // Today's figures for the market the live figures are read for, through
  // the deal page's own read (lib/model-vs-market-read): the market check's
  // demand card and the model's assumptions against the published figures.
  // A failed read leaves both out rather than the page down.
  let reads: TodayReads | null = null;
  try {
    reads = await todayReads(samplePlacement().live);
  } catch (err) {
    console.warn("sample live figures unavailable:", err instanceof Error ? err.message : err);
  }
  // The shared going-in cap reader, as the deal page and the buy box use it.
  const cap = findGoingInCap(SAMPLE_DEAL.extraction.metrics)?.value ?? null;

  // Leverage check on the SAMPLE — the same lib/leverage code path every
  // real deal page runs, on the same benchmark read (lib/debt-index): the
  // week's 30-year survey off the rates table, the research layer's
  // snapshot only where the table has nothing (named as the snapshot), and
  // today's 10-year beside it — so the demo can never show a check the
  // product doesn't do, nor an August figure as this week's. The page is
  // ISR, so the read is at most its window behind the table.
  const debt = await liveDebtSeeds(HOLD_MONTHS);
  const bench30 = benchmark30(
    debt.survey30,
    seedBenchmarks().find((b) => b.metric === "pmms_30y_fixed"),
  );
  const sampleCapPct = cap ? parsePct(cap) : null;
  // The sample deal as the signed-in sample deal's page hands it to its
  // sections, each part through the deal page's own readers (./demo-data).
  const { data } = sampleDemoData({ today, reads, debt });

  // The sample's metro through the sector-fundamentals generator — the same
  // rows deal pages benchmark against. Formats a band or a point honestly.
  const phillyRows = seedBenchmarks().filter((b) =>
    b.metro.startsWith("Philadelphia"),
  );
  // The 2–4 unit median with the month it is for and its change, read from
  // the research file (Redfin's single-month median) rather than typed here.
  const phillyMedian = twoToFourMedian("philadelphia_pa");
  // Past the research rule's limit from its month's last day, the month
  // keeps its place with its age and the stale mark (lib/research-age).
  const phillyMedianStale = phillyMedian ? staleMark(researchAge(phillyMedian.asOf, today)) : null;
  // The § 9-811 card's rule, read from the rules file rather than typed: its
  // status and its date are the file's, and past the research rule's limit
  // the date carries its age and the stale mark (research pass 43, L7).
  const evictionRule = seedRules().find((r) => r.id === "pa-philadelphia-eviction-diversion") ?? null;
  const evictionStale = evictionRule ? staleMark(researchAge(evictionRule.as_of, today)) : null;
  // HUD's two-bedroom fair market rent with the fiscal year its research
  // block names (lib/fmr), never a figure or a year typed on the page.
  const phillyFmr = metroFmr("philadelphia");
  const phillyFmr2br = phillyFmr?.rents["2br"] ?? null;
  // Past the fiscal year's last day the figure says its year ended.
  const phillyFmrWhen = phillyFmr ? fmrWhen(phillyFmr, today) : null;
  const band = (metric: string): string | null => {
    const r = phillyRows.find((b) => b.metric === metric);
    if (!r || typeof r.low !== "number") return null;
    return r.high !== r.low ? `${r.low}–${r.high}%` : `${r.low}%`;
  };
  // Each figure's own period in view and its whole credit as its title —
  // who published it, for what area and when (lib/tracker-read), the way
  // the homepage's band and gallery and /market's panel credit the same
  // figures; "undated" where the research states no period.
  const phillySnapshot = (metrosSeed.metros ?? []).find((m) => m.id === "philadelphia")?.sector_snapshot as
    | Record<string, unknown>
    | undefined;
  // The tracker's figures still show past the research rule's limit; the
  // line then says the day they were read, their age and that they are stale.
  const phillyTrackerAge = snapshotAge(phillySnapshot, today);
  const phillyTrackerStale = staleMark(phillyTrackerAge);
  const credit = (sector: string, label: "Vacancy" | "Rent") => {
    const fig = blockCitations(phillySnapshot?.[sector]).find((f) => f.label === label);
    // Who published the figure comes first, in words a phone shows (research
    // pass 31, C5: the house had been in the title alone), then the narrower
    // stock it covers ("Class A space, Q2 2026"), so a Class A rent never
    // reads as the market's, then its period.
    return {
      cited: [houseShort(fig?.read ?? { house: null }), fig?.read.slice, fig?.read.period ?? "undated"]
        .filter(Boolean)
        .join(", "),
      title: fig?.words,
    };
  };
  const phillySectors = {
    office: band("office_vacancy_pct"),
    industrial: band("industrial_vacancy_pct"),
    industrialRent: phillyRows.find(
      (b) => b.metric === "industrial_asking_rent_psf",
    )?.low,
    multifamily: band("multifamily_vacancy_pct"),
    // Renders nothing today — Philadelphia retail is a recorded gap — but
    // the line picks it up the moment a sourced figure lands in the seed.
    retail: band("retail_vacancy_pct"),
  };
  // Where each Philadelphia read sits across the covered markets — the same
  // shared leaderboard builder behind the market page's rankings and rank
  // chips (lib/sector-leaderboard), so the sample screen can never disagree
  // with them. A figure the ranking cannot place (a spread of two reads,
  // undated, over a year old) says why rather than taking a rank; a sector
  // with no numeric vacancy (retail's held-open level) gets nothing.
  const standings = sectorStandings(["office", "industrial", "multifamily", "retail"], today);
  const phillyRank = (sector: string): string | null => {
    const s = standings[sector]?.["philadelphia"];
    if (!s) return null;
    return s.rank !== null ? `${rankLabel({ rank: s.rank, tied: s.tied })} of ${s.total}` : `not ranked: ${s.reason}`;
  };
  const phillyRanks = {
    office: phillyRank("office"),
    industrial: phillyRank("industrial"),
    multifamily: phillyRank("multifamily"),
    retail: phillyRank("retail"),
  };

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
            — Brewerytown is two miles north-west of the frame. */}
        <PlaceBand metro="philadelphia" width="max-w-5xl" eager>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              A complete screen, worked end to end
            </h1>
            <span className="rounded-full bg-caution/20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide text-caution">
              Illustrative sample
            </span>
          </div>
          <p className="mt-2 text-sm text-white">
            The product, on an invented deal in Philadelphia — not a real listing, not investment advice.
          </p>
        </PlaceBand>
        <div className="mx-auto w-full max-w-5xl px-6 py-10">
          {/* The deal page's own header on the sample (lib/sample-header,
              app/sample-hero): its market photograph, the name, the call,
              the fit, the four figures and the tool row, as the homepage
              draws it — read on the page's day. */}
          <SampleDealHero header={sampleHeader(new Date(`${today}T12:00:00Z`))} titleAs="h2" />

          {/* The deal page's five sections on the sample, in its own
              section bar and its own order (./sections). */}
          <div className="mt-6">
            <DemoSections data={data} />
          </div>

          {/* Regulation & benchmarks — the deal page's legal panel, run by the
              same engine on the sample's real Philadelphia jurisdiction. The
              sample's one rule happens to be dormant on a purchase, and the
              panel says so instead of hiding it — that honesty IS the demo. */}
          <LegalPanel legal={sampleLegal(today)} />

          {/* What comes after the screen. Rendered from the SAME DEEP_TOOLS
              constant the homepage's grid uses, so the sample screen and the
              marketing page can never describe the product differently. */}
          <div className="mt-12 rounded-2xl border border-line bg-faint/60 p-6">
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
          <div className="mt-12 rounded-2xl bg-sidebar p-8 text-center">
            <h2 className="text-xl font-semibold tracking-tight text-white">
              Run this screen on your own OM
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

      {/* The research layer — real rules + real data behind the sample's
          jurisdiction (site-polish 2). Everything here is genuine: the rule
          is verified against the statute, the FMR is HUD's published figure
          for the fiscal year its research block names, and signed-in
          samples pull live recorded sales. */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-5xl px-6 py-12">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Behind this screen
          </p>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">
            A real submarket, real rules.
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {evictionRule && (
            <div className="rounded-xl border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center gap-2">
                {/* Dormant, as the rules panel below evaluates it: the rule
                    keys off an eviction filing, never the purchase. */}
                <span className="rounded bg-caution/10 px-2 py-0.5 text-[11px] font-semibold text-caution">
                  Dormant until an eviction
                </span>
                <span className="text-[11px] uppercase tracking-wide text-muted">
                  eviction procedure · Philadelphia
                </span>
                <span
                  className={`rounded px-1.5 py-px text-[10px] font-medium ${evictionRule.status === "verified" ? "bg-pass/10 text-pass" : "bg-faint text-muted"}`}
                >
                  {evictionRule.status === "verified" ? "verified vs statute" : evictionRule.status.replace(/_/g, " ")}
                </span>
                <span className="text-[10px] text-muted">
                  {`as of ${datedLong(evictionRule.as_of)}`}
                  {evictionStale && (
                    <span className="text-caution" data-qa="research-stale">{` (${evictionStale})`}</span>
                  )}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed">
                Philadelphia Code § 9-811: 30 days in the Eviction Diversion Program before any filing — a month to add to any eviction the owner files.
              </p>
              {evictionRule.source && (
                <a
                  href={evictionRule.source}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-block text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
                >
                  read the statute
                </a>
              )}
            </div>
            )}
            <div className="rounded-xl border border-line bg-surface p-4">
              <p className="text-[11px] uppercase tracking-wide text-muted">
                Published benchmarks · wider than the submarket
              </p>
              <dl className="mt-2 grid grid-cols-2 gap-3">
                {phillyFmr && phillyFmr2br !== null && (
                  <div>
                    <dt className="text-[11px] text-muted">{`${fmrLabel(phillyFmr.fy)} 2BR fair market rent${phillyFmrWhen?.ended ? `, ${phillyFmrWhen.text}` : ""}`}</dt>
                    <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                      {`$${phillyFmr2br.toLocaleString("en-US")}/mo`}
                    </dd>
                    {/* HUD's area is four states wide, not the city's: named, since the
                        box's heading can only say the figures are wider than the submarket. */}
                    <dd className="mt-0.5 text-[10px] leading-snug text-muted">{phillyFmr.area}</dd>
                  </div>
                )}
                {phillyMedian && (
                  <div>
                    <dt className="text-[11px] text-muted">
                      {`2–4 unit median, ${monthOf(phillyMedian.asOf)}${phillyMedian.yoy ? ` · ${phillyMedian.yoy} YoY` : ""}`}
                      {phillyMedianStale && (
                        <span className="text-caution" data-qa="research-stale">{` (${phillyMedianStale})`}</span>
                      )}
                    </dt>
                    <dd className="mt-0.5 font-mono text-base font-semibold tabular-nums">
                      {`$${phillyMedian.price.toLocaleString("en-US")}`}
                    </dd>
                    {/* Redfin's figure, credited to Redfin and linked to the
                        page the research file cites for it (research pass
                        31, C4: it had printed with no source at all). */}
                    {phillyMedian.sourceHref && (
                      <dd className="mt-0.5 text-[10px] leading-snug text-muted" data-qa="redfin-credit">
                        {linkOk(phillyMedian.sourceHref) !== false ? (
                          <a
                            href={phillyMedian.sourceHref}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-dotted underline-offset-2 hover:text-ink"
                          >
                            Redfin public dataset
                          </a>
                        ) : (
                          "Redfin public dataset"
                        )}
                      </dd>
                    )}
                  </div>
                )}
              </dl>
              <p className="mt-2 text-[11px] text-muted">
                Signed in, recorded sales around Brewerytown pull from the city&apos;s OPA records, source-linked.
              </p>
              {(phillySectors.office || phillySectors.multifamily) && (
                <p className="mt-2 border-t border-line/60 pt-2 text-[11px] leading-relaxed text-muted">
                  Philadelphia by asset type
                  {phillyTrackerStale && phillyTrackerAge.asOf && (
                    <span className="text-caution" data-qa="research-stale">
                      {` (research read ${datedLong(phillyTrackerAge.asOf)}; ${phillyTrackerStale})`}
                    </span>
                  )}
                  {": "}
                  {phillySectors.office && (
                    <>
                      office vacancy{" "}
                      <span className="font-mono tabular-nums text-ink" title={credit("office", "Vacancy").title}>
                        {phillySectors.office}
                      </span>
                      {` (${[credit("office", "Vacancy").cited, phillyRanks.office].filter(Boolean).join(", ")})`}
                    </>
                  )}
                  {phillySectors.industrial && (
                    <>
                      {" · "}industrial{" "}
                      <span className="font-mono tabular-nums text-ink" title={credit("industrial", "Vacancy").title}>
                        {phillySectors.industrial}
                      </span>
                      {` (${[credit("industrial", "Vacancy").cited, phillyRanks.industrial].filter(Boolean).join(", ")})`}
                      {typeof phillySectors.industrialRent === "number" && (
                        <>
                          {" at "}
                          <span className="font-mono tabular-nums text-ink" title={credit("industrial", "Rent").title}>
                            ${phillySectors.industrialRent.toFixed(2)}/SF
                          </span>
                          {` (${credit("industrial", "Rent").cited})`}
                        </>
                      )}
                    </>
                  )}
                  {phillySectors.multifamily && (
                    <>
                      {" · "}multifamily{" "}
                      <span className="font-mono tabular-nums text-ink" title={credit("multifamily", "Vacancy").title}>
                        {phillySectors.multifamily}
                      </span>
                      {` (${[credit("multifamily", "Vacancy").cited, phillyRanks.multifamily].filter(Boolean).join(", ")})`}
                    </>
                  )}
                  {phillySectors.retail && (
                    <>
                      {" · "}retail{" "}
                      <span className="font-mono tabular-nums text-ink" title={credit("retail", "Vacancy").title}>
                        {phillySectors.retail}
                      </span>
                      {` (${[credit("retail", "Vacancy").cited, phillyRanks.retail].filter(Boolean).join(", ")})`}
                    </>
                  )}{" "}
                  — ranges are tracker spreads, never averaged; ranks run
                  tightest first across the covered markets.{" "}
                  <Link
                    href="/market?metro=philadelphia"
                    className="font-medium text-brand underline-offset-2 hover:underline"
                  >
                    Full brief →
                  </Link>
                </p>
              )}
            </div>
          </div>
          <SampleLeverageCard capPct={sampleCapPct} bench30={bench30} tenYear={debt.tenYear} today={today} />
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
          {/* The demo draws FRED's figures (the leverage and demand cards)
              outside either shell, so its own footer carries the data
              providers' notices too (app/data-notices). */}
          <DataNotices className="basis-full" />
        </div>
      </footer>
    </div>
  );
}
