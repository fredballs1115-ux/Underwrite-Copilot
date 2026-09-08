import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "./logo";
import { Reveal, CountUp, DemoTabs } from "./landing-interactive";
import { ScreenRunStrip } from "./screen-run-strip";
import { ScrollProgress } from "./scroll-progress";
import type { Metadata } from "next";
import {
  SPREAD_LOW_IRR_PCT,
  SPREAD_HIGH_IRR_PCT,
  SPREAD_BPS,
  FIRST_READ_CLAIM,
  ANALYSIS_STAGES,
  DEAL_KILLERS,
  COMPS_JURISDICTIONS,
  PRICE_PRO_MONTHLY,
  PRICE_TEAM_BASE_MONTHLY,
  PRICE_TEAM_MEMBER_MONTHLY,
  FREE_DEALS,
  SAMPLE_COMP_PREMIUM_LINE,
} from "@/lib/marketing-constants";
// The Excel-preview rows are COMPUTED from the live engine on the sample
// model at render time — hardcoded copies of these figures are exactly what
// drifted (the page said 7.1% while the engine computed 6.9%).
import { computeModel } from "@/lib/model/compute";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { sampleLegal } from "@/lib/sample-legal";
import { seedRules } from "@/lib/research-data";
import { hoursSince } from "@/lib/research";
import { latestChange } from "@/lib/changelog";
import { StressBench } from "./landing-stress";
import metrosSeed from "@/data/research/metros.json";
import { MARKET_COUNT } from "./markets-marquee";
import { MarketsGallery } from "./markets-gallery";

// The research layer's scale, DERIVED from the same seeds the app evaluates
// — the homepage can never claim coverage the rules engine doesn't have.
// (Server component only: these pull the research JSONs, which must not ride
// into client bundles via marketing-constants.)
const RULE_COUNT = seedRules().length;
// The sample deal's legal read through the REAL rules engine — feeds the
// walkthrough widget's Regulation block.
const LEGAL = sampleLegal();
const WIRED_MARKETS = (metrosSeed.metros ?? [])
  .filter((m) => (m as { ingest_market?: string }).ingest_market)
  .map((m) => m.name);
// Deliberately FOCUSED coverage (per direction): FIFTEEN markets, full stop
// — the DMV core (one market, four jurisdiction entries) + the rest of the
// Mid-Atlantic + the biggest US markets. Research and website coverage stop
// at this list; outside it the screener says "unscreened", never guesses.
const MAJOR_MARKETS = (metrosSeed.metros ?? []).filter(
  (m) => (m as { region?: string }).region === "Major US markets"
);
const MAJOR_MARKET_COUNT = MAJOR_MARKETS.length;

// Title/description inherit the site defaults from the root layout;
// the canonical is declared per page so subpages never collapse to /.
export const metadata: Metadata = { alternates: { canonical: "/" } };

// ISR, five-minute window: the footer quotes the live steward stamp, and
// paired with next.config's expireTime this bounds cache staleness (browser
// SWR included) to ~10 minutes.
export const revalidate = 300;

// Landing page — a React Server Component (zero client JS, no secrets).
//
// The rule of this page, per the operator: words that can be a picture are a
// picture. Every section is one idea — an eyebrow, a headline of a few words,
// and the thing itself (the sample deal card, the six-stage rail, the
// verdict tabs, the live stress bench, the aerial gallery, the artifacts).
// No paragraph runs past a line; the long-form argument lives on /why.
// (Never claim "same answer every run" — LLM stages vary run to run, and the
// retrade diff would happily display that contradiction to a skeptic.)

function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {children}
    </svg>
  );
}

// The actual six-stage pipeline every OM runs through — a word or two each;
// the trace band under the rail shows what each stage produces.
const STAGES: { title: string; icon: ReactNode }[] = [
  {
    title: "Extract",
    icon: (
      <Icon>
        <path d="M6 2h9l5 5v15H6z" />
        <path d="M14 2v6h6" />
        <path d="M9 13h6M9 17h6" />
      </Icon>
    ),
  },
  {
    title: "Challenge",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4" />
        <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
      </Icon>
    ),
  },
  {
    title: "Comps",
    icon: (
      <Icon>
        <path d="M4 20v-9M10 20V5M16 20v-6M2 20h20" />
      </Icon>
    ),
  },
  {
    title: "Reconcile",
    icon: (
      <Icon>
        <path d="M12 4v16M5 20h14M6 8h12" />
        <path d="m6 8-3 6h6zM18 8l-3 6h6z" />
      </Icon>
    ),
  },
  {
    title: "Market",
    icon: (
      <Icon>
        <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </Icon>
    ),
  },
  {
    title: "Verdict",
    icon: (
      <Icon>
        <circle cx="12" cy="12" r="9" />
        <path d="m8.5 12 2.5 2.5 4.5-5" />
      </Icon>
    ),
  },
];

// Everything else the product does, as an icon and a few words. Each tile
// opens the surface that shows it working.
const FEATURES: { label: string; href: string; icon: ReactNode }[] = [
  {
    label: "OM + rent roll + T-12, one model",
    href: "/demo",
    icon: (
      <Icon>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M9 4v16" />
      </Icon>
    ),
  },
  {
    label: "Drag the levers, watch it break",
    href: "#stress",
    icon: (
      <Icon>
        <path d="M4 8h9M19 8h1M4 16h3M13 16h7" />
        <circle cx="16" cy="8" r="2.5" />
        <circle cx="10" cy="16" r="2.5" />
      </Icon>
    ),
  },
  {
    label: "Your buy box, scored 0–100",
    href: "/demo",
    icon: (
      <Icon>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="m8 12 3 3 5-6" />
      </Icon>
    ),
  },
  {
    label: "Comps from county records",
    href: "/market",
    icon: (
      <Icon>
        <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
        <path d="M9 10h6" />
      </Icon>
    ),
  },
  {
    label: "Financing, sized to the constraint",
    href: "/demo",
    icon: (
      <Icon>
        <path d="m3 10 9-6 9 6" />
        <path d="M5 10v9M10 10v9M14 10v9M19 10v9M3 19h18" />
      </Icon>
    ),
  },
  {
    label: "Verdict → assigned tasks",
    href: "/demo",
    icon: (
      <Icon>
        <path d="M10 6h11M10 12h11M10 18h11" />
        <path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" />
      </Icon>
    ),
  },
  {
    label: "Rent control, checked at the address",
    href: "/market",
    icon: (
      <Icon>
        <path d="m14 4 6 6M4 20l7-7M10 14l4 4" />
        <path d="m12 6 6 6-2 2-6-6z" />
      </Icon>
    ),
  },
  {
    label: "Every number carries its source",
    href: "/market",
    icon: (
      <Icon>
        <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
        <path d="M9 8h6M9 12h6" />
      </Icon>
    ),
  },
];

const STATS: { value: number; suffix: string; label: string }[] = [
  { value: ANALYSIS_STAGES, suffix: "", label: "analysis stages" },
  { value: DEAL_KILLERS, suffix: "", label: "deal-killers stressed first" },
  { value: MARKET_COUNT, suffix: "", label: "covered markets" },
  { value: 0, suffix: "", label: "black-box numbers" },
];

// Live-engine rows for the Excel-preview tile: the sample model recomputed
// at render, so the page can never disagree with what the workbook computes.
const XLSX_PREVIEW_ROWS: [string, string, string][] = (() => {
  const inputs = SAMPLE_DEAL.model.inputs;
  const irr = (over: Partial<typeof inputs>) => {
    const r = computeModel({ ...inputs, ...over }).returns.leveredIrrPct;
    return r == null ? "—" : `IRR ${r.toFixed(1)}%`;
  };
  return [
    ["Purchase price", `$${(inputs.purchasePrice / 1e6).toFixed(0)}M`, irr({})],
    ["Exit cap", `${inputs.exitCapPct.toFixed(2)}%`, irr({})],
    ["Exit cap (flexed)", "5.75%", irr({ exitCapPct: 5.75 })],
    ["Rent growth (flexed)", "2.5%", irr({ rentGrowthPct: 2.5 })],
  ];
})();

const FREE_FEATURES = [
  `${FREE_DEALS} deals, the full six-stage screen on each`,
  "Sourced ranges + the three deal-killers",
  "Recorded-sales comps + local rent-rule check by address",
  "Risk digest and side-by-side deal comparison",
  "Reconcile your own underwriting model",
];

const PRO_FEATURES = [
  "Unlimited deals",
  "Excel models — first-draft + institutional underwrite.xlsx",
  "IC memo, full PDF report, and LOI draft",
  "Your firm's branding on memos, reports, workbooks & LOI",
  "Public-web comp search",
  "Everything in Free",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What do I need to get started?",
    a: `Just an offering memorandum as a PDF. Upload it and the screen runs on its own — a first read with the headline numbers lands in ${FIRST_READ_CLAIM}, then extraction, assumption challenges, comp scrutiny, market check, and a verdict. Add a rent roll, T-12, or loan terms later to deepen the model. You can also explore a fully-worked sample deal before uploading anything.`,
  },
  {
    q: "Where do the numbers come from?",
    a: "Every figure traces to a named source — an OM page, your rent roll, a market norm — and conflicting sources are reconciled openly (actuals beat pro forma), never silently merged. The return math is deterministic code, not a language model guessing at arithmetic.",
  },
  {
    q: "Which markets does it cover?",
    a: `${MARKET_COUNT} markets, deliberately: the DMV core (DC, Prince George's, Montgomery County, Northern Virginia), Baltimore, Richmond, Hampton Roads, Philadelphia (incl. Wilmington), Newark/Jersey City — and the ${MAJOR_MARKET_COUNT} biggest US metros: ${MAJOR_MARKETS.map((m) => m.name).join(", ")}. Each carries its rent rules (${RULE_COUNT} statute-linked, machine-evaluated at every address), market notes, and data coverage with sources. Outside those markets the screener says "unscreened — not unregulated" and stops; it never guesses. Recorded-sales comps run via county APIs in ${COMPS_JURISDICTIONS}, extended by the bulk property database (${WIRED_MARKETS.join(", ")} wired).`,
  },
  {
    q: "Why not just ask ChatGPT?",
    a: "Underwriting is a precision problem, not a language problem. A 10% drift reads perfectly fine in a sentence while it quietly kills the deal — so the cash-flow and return math here is deterministic code, every assumption is a sourced range, and every OM runs the same six stages in the same order. The AI reads documents; it never does the arithmetic.",
  },
  {
    q: "Are my documents private?",
    a: "Yes. Documents are stored in private storage with isolation enforced at the database level. Your deals are visible only to you — or to your teammates if you join a team — and your documents are never shared beyond that or resold.",
  },
  {
    q: "Is this investment advice?",
    a: "No. Underwrite Copilot is a first-pass screen that tells you whether a deal earns more of your time. Always verify flagged figures against source documents before acting.",
  },
  {
    q: "What's in the Excel model?",
    a: "A multi-tab first-draft workbook: deal summary with sources & uses and returns, an exit-cap × price IRR sensitivity grid, a year-by-year cash flow, every assumption with its source and confidence, and a conflicts sheet showing how disagreements between your documents were resolved.",
  },
  {
    q: "Can my team share one pipeline?",
    a: `Yes. Create a team, send teammates an invite link, and every deal anyone uploads lands in one shared pipeline — same screens, verdicts, models, and memos for everyone. The Team plan is ${PRICE_TEAM_BASE_MONTHLY} per month — which includes the account owner — plus ${PRICE_TEAM_MEMBER_MONTHLY} per month for each added member, on one subscription that adjusts automatically as people join or leave.`,
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Pro is a monthly subscription managed through Stripe — upgrade, downgrade, or cancel from the billing page whenever you like. The free tier stays free.",
  },
];

// Structured data so search engines understand the product and pricing.
const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: "Underwrite Copilot",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description:
        "CRE deal screening that runs every offering memorandum through the same disciplined screen: sourced ranges, the three deal-killers, and a Go / No-go that shows its work before you open a model.",
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
        { "@type": "Offer", name: "Pro", price: PRICE_PRO_MONTHLY.replace("$", ""), priceCurrency: "USD" },
        {
          "@type": "Offer",
          name: `Team (base includes the owner; each added member ${PRICE_TEAM_MEMBER_MONTHLY})`,
          price: PRICE_TEAM_BASE_MONTHLY.replace("$", ""),
          priceCurrency: "USD",
        },
      ],
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQ.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
  ],
};

/** One section's header: an eyebrow and a headline of a few words. */
function SectionHead({
  eyebrow,
  title,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  dark?: boolean;
}) {
  return (
    <div>
      <p
        className={`text-xs font-medium uppercase tracking-wider ${dark ? "text-accent/90" : "text-muted"}`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
    </div>
  );
}

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      {/* Hairline reading-progress bar over everything (accent, so it reads
          on the dark hero and the light body alike). */}
      <ScrollProgress />
      {/* Nav — dark, so it reads as one piece with the hero. */}
      <header className="sticky top-0 z-10 border-b border-white/10 bg-sidebar text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3.5">
          {/* min-w-0 + truncate: on narrow phones the wordmark gives way
              instead of colliding with the CTA (the logo always stays). */}
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="h-8 w-8 shrink-0" />
            <span className="font-semibold tracking-tight max-[360px]:hidden">
              Underwrite Copilot
            </span>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {[
              ["#screen", "How it works"],
              ["/demo", "Sample screen"],
              ["#pricing", "Pricing"],
              ["#faq", "FAQ"],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-white/70 transition-colors hover:text-white"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="hidden whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-white/80 transition-colors hover:text-white sm:block"
            >
              Sign in
            </Link>
            <Link
              href="/login?mode=signup"
              className="whitespace-nowrap rounded-lg bg-white px-3.5 py-1.5 text-sm font-semibold text-brand-strong transition-colors hover:bg-accent"
            >
              Get started
            </Link>
            {/* Mobile section menu — native disclosure, zero JS. */}
            <details className="relative md:hidden">
              <summary
                aria-label="Menu"
                className="flex h-9 w-9 cursor-pointer list-none items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 [&::-webkit-details-marker]:hidden"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  className="h-5 w-5"
                  aria-hidden
                >
                  <path d="M4 7h16" />
                  <path d="M4 12h16" />
                  <path d="M4 17h16" />
                </svg>
              </summary>
              <nav className="shadow-float absolute right-0 top-11 z-20 w-48 rounded-xl border border-white/10 bg-sidebar p-1.5">
                {[
                  ["#screen", "How it works"],
                  ["/demo", "Sample screen"],
                  ["#pricing", "Pricing"],
                  ["#faq", "FAQ"],
                ].map(([href, label]) => (
                  <a
                    key={href}
                    href={href}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                  >
                    {label}
                  </a>
                ))}
                <Link
                  href="/login"
                  className="mt-1 block rounded-lg border-t border-white/10 px-3 py-2 pt-3 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white sm:hidden"
                >
                  Sign in
                </Link>
              </nav>
            </details>
          </div>
        </div>
      </header>

      <main id="main" className="flex-1">
        {/* Hero — dark navy with soft accent glows; the product is the visual. */}
        <section className="band-dark relative overflow-hidden text-white">
          {/* Ambient glows: pure CSS, no layout shift, subtle by design. */}
          <div
            aria-hidden
            className="glow-drift pointer-events-none absolute -top-32 right-[-10%] h-[28rem] w-[28rem] rounded-full opacity-25 blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, #7fd6cc 0%, transparent 70%)",
            }}
          />
          <div
            aria-hidden
            className="glow-drift-2 pointer-events-none absolute bottom-[-8rem] left-[-6%] h-[22rem] w-[22rem] rounded-full opacity-15 blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, #7fd6cc 0%, transparent 70%)",
            }}
          />
          <div className="relative mx-auto max-w-6xl px-6 pb-14 pt-16 sm:pt-24">
            {/* grid-cols-1 matters (same as the walkthrough section): the
                implicit mobile track is `auto` and cannot shrink below the
                sample card's intrinsic width, which pushed the whole hero
                wider than small phones — masked by the section's
                overflow-hidden, so the page didn't scroll, it just clipped. */}
            <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  AI deal screening for CRE acquisitions
                </span>
                <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                  Stop underwriting like a{" "}
                  <span className="relative inline-block whitespace-nowrap">
                    coin flip.
                    <svg
                      viewBox="0 0 220 12"
                      preserveAspectRatio="none"
                      className="absolute -bottom-2 inset-x-0 h-3 w-full"
                      aria-hidden
                    >
                      <path
                        d="M3 9c40-6 84-7 112-4s72 5 102-3"
                        fill="none"
                        stroke="#7fd6cc"
                        strokeWidth="4"
                        strokeLinecap="round"
                        opacity="0.75"
                      />
                    </svg>
                  </span>
                </h1>
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70">
                  Upload the OM. Every figure sourced, the three deal-killers stressed, a Go / Caution / No-go — in minutes.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/login?mode=signup"
                    className="cta-breathe rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-strong transition-colors hover:bg-accent"
                  >
                    Get started free
                  </Link>
                  <Link
                    href="/demo"
                    className="rounded-lg border border-white/25 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                  >
                    See a full screen
                  </Link>
                </div>
                <p className="mt-4 text-xs text-white/55">First {FREE_DEALS} deals free · no card</p>
              </div>

              {/* Product preview */}
              <div>
                <DealPreview />
                <p className="mt-4 text-center text-[11px] text-white/55">
                  Illustrative sample deal ·{" "}
                  <Link
                    href="/demo"
                    className="font-medium text-white/70 underline-offset-2 hover:text-white hover:underline"
                  >
                    open the whole screen →
                  </Link>
                </p>
              </div>
            </div>

            {/* Stat strip — the screen, quantified, two words each. */}
            <dl className="mt-16 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-white/10 pt-8 sm:grid-cols-4">
              {STATS.map((st) => (
                <div key={st.label}>
                  <dt className="sr-only">{st.label}</dt>
                  <dd className="font-mono text-3xl font-semibold tabular-nums text-accent">
                    <CountUp value={st.value} suffix={st.suffix} />
                  </dd>
                  <dd className="mt-1 text-xs text-white/60">{st.label}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        {/* The problem, drawn: two analysts, one deal, the spread between
            them. Both ends are neutral on purpose — the spread is the problem. */}
        <section id="problem" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <SectionHead eyebrow="The problem" title={`Same deal, same data room, ${SPREAD_BPS} bps apart.`} />
            <Reveal>
              <div className="shadow-card mt-8 rounded-2xl border border-line bg-surface p-6">
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
                      {SPREAD_LOW_IRR_PCT}%
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Analyst B · IRR · &ldquo;pass&rdquo;
                    </p>
                  </div>
                  <span className="mb-1 hidden rounded-full bg-caution/10 px-3 py-1 text-xs font-semibold text-caution sm:block">
                    {SPREAD_BPS} bps apart
                  </span>
                  <div className="text-right">
                    <p className="font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
                      {SPREAD_HIGH_IRR_PCT}%
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Analyst A · IRR · &ldquo;buy&rdquo;
                    </p>
                  </div>
                </div>
                <div className="relative mt-4 h-2 rounded-full bg-faint">
                  <span
                    className="absolute inset-y-0 left-[10%] right-[10%] rounded-full bg-caution/25"
                    aria-hidden
                  />
                  <span
                    className="spread-dot-l absolute left-[10%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-ink/80 shadow"
                    aria-hidden
                  />
                  <span
                    className="spread-dot-r absolute left-[90%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-ink/80 shadow"
                    aria-hidden
                  />
                </div>
                <p className="mt-3 text-center text-xs text-muted">
                  Same deal. Same afternoon. Same data room. One method fixes that.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* The six-stage screen — a rail of icons, then the trace of it running. */}
        <section id="screen" className="scroll-mt-16 border-t border-line bg-faint">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <SectionHead eyebrow="How it works" title="Six stages, same order, every OM." />
            <Reveal delay={60}>
              <ol className="stage-rail mt-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
                {STAGES.map((s, i) => (
                  <li
                    key={s.title}
                    style={{ "--i": i } as React.CSSProperties}
                    className="hover-lift stage-cycle relative flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-3 py-5 text-center shadow-card"
                  >
                    <span className="absolute left-2.5 top-2 font-mono text-[11px] tabular-nums text-muted">
                      {i + 1}
                    </span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                      {s.icon}
                    </span>
                    <span className="text-sm font-medium">{s.title}</span>
                  </li>
                ))}
              </ol>
            </Reveal>
          </div>
        </section>
        <ScreenRunStrip />

        {/* Inside the screen — the deal page's own sections, in miniature. */}
        <section className="border-b border-line">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 px-6 py-16 sm:py-20 lg:grid-cols-[1fr_1.4fr]">
            <Reveal>
              <SectionHead eyebrow="The verdict" title="Click through what it's built on." />
              <Link
                href="/login?mode=signup"
                className="mt-6 inline-flex rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
              >
                Run it on a real OM
              </Link>
            </Reveal>
            <Reveal delay={120}>
              <DemoTabs legal={LEGAL} />
            </Reveal>
          </div>
        </section>

        {/* Break it yourself — the deterministic engine, live in the browser. */}
        <section id="stress" className="band-dark scroll-mt-16 text-white">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <Reveal>
              <SectionHead eyebrow="Try the engine" title="Break it yourself." dark />
            </Reveal>
            <Reveal delay={80}>
              <div className="mt-8">
                <StressBench />
              </div>
            </Reveal>
          </div>
        </section>

        {/* The covered markets, photographed. */}
        <MarketsGallery />

        {/* The artifacts — what you actually walk away with, shown. */}
        <section className="border-y border-line bg-faint">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <Reveal>
              <SectionHead eyebrow="The artifacts" title="What you walk away with." />
            </Reveal>
            <Reveal delay={80}>
              <div className="mt-8 grid gap-4 lg:grid-cols-3">
                {/* Excel model — the flagship tile */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card lg:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">Excel model, live formulas</h3>
                    <span className="rounded-full bg-faint px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      Sample
                    </span>
                  </div>
                  <div className="mt-4">
                    <div className="overflow-hidden rounded-lg border border-line font-mono text-[11px]">
                      <div className="grid grid-cols-4 border-b border-line bg-faint px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted">
                        <span className="col-span-2">Input</span>
                        <span className="text-right">Value</span>
                        <span className="text-right">Effect</span>
                      </div>
                      {XLSX_PREVIEW_ROWS.map(([k, v, e], i) => (
                        <div
                          key={k}
                          className={`grid grid-cols-4 px-3 py-1.5 ${i >= 2 ? "bg-caution/5" : "bg-surface"}`}
                        >
                          <span className="col-span-2 text-muted">{k}</span>
                          <span
                            className={`text-right tabular-nums ${i !== 0 ? "bg-caution/10 px-1" : ""}`}
                          >
                            {v}
                          </span>
                          <span className="text-right tabular-nums">{e}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <a
                    href="/api/demo/underwrite.xlsx"
                    className="mt-3 inline-block text-[11px] font-medium text-brand underline-offset-2 hover:underline"
                  >
                    Download the sample workbook →
                  </a>
                </div>

                {/* Memo */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <h3 className="text-sm font-semibold">One-page IC memo</h3>
                  <div className="mt-4 flex-1">
                    <div className="rounded-lg border border-line bg-paper p-3">
                      <div className="flex items-center justify-between">
                        <div className="h-2 w-20 rounded bg-ink/70" />
                        <span className="rounded-full bg-caution/10 px-2 py-0.5 text-[9px] font-semibold text-caution">
                          Caution
                        </span>
                      </div>
                      <div className="mt-2.5 space-y-1.5">
                        <div className="h-1.5 w-full rounded bg-line" />
                        <div className="h-1.5 w-5/6 rounded bg-line" />
                        <div className="h-1.5 w-full rounded bg-line" />
                        <div className="h-1.5 w-2/3 rounded bg-line" />
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-1.5">
                        <div className="h-8 rounded bg-faint" />
                        <div className="h-8 rounded bg-faint" />
                      </div>
                    </div>
                  </div>
                  <a
                    href="/api/demo/memo"
                    className="mt-3 inline-block text-[11px] font-medium text-brand underline-offset-2 hover:underline"
                  >
                    Download the sample memo →
                  </a>
                </div>

                {/* Comps */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <h3 className="text-sm font-semibold">Comps, graded</h3>
                  <div className="mt-4 space-y-1.5 text-[10px]">
                    {[
                      ["The Brixton", "Supports", "text-pass bg-pass/10"],
                      ["Parkside", "Leans favorable", "text-caution bg-caution/10"],
                      ["Vue at Legacy", "Stretched", "text-kill bg-kill/10"],
                    ].map(([n, r, c]) => (
                      <div
                        key={n}
                        className="flex items-center justify-between rounded-md border border-line px-2.5 py-1.5"
                      >
                        <span className="font-medium">{n}</span>
                        <span className={`rounded-full px-1.5 py-0.5 font-medium ${c}`}>
                          {r}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Buy box */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card lg:col-span-2">
                  <h3 className="text-sm font-semibold">Your buy box, checked in code</h3>
                  <div className="mt-4 flex flex-wrap gap-1.5 text-[10px] font-medium">
                    {(
                      [
                        ["✓", "Market", "text-pass border-line"],
                        ["✓", "Price", "text-pass border-line"],
                        ["✓", "Asset class", "text-pass border-line"],
                        ["✕", "Going-in cap", "text-kill border-kill/30 bg-kill/[0.04]"],
                      ] as const
                    ).map(([mark, label, cls]) => (
                      <span
                        key={label}
                        className={`flex items-center gap-1 rounded-md border px-2 py-1 ${cls}`}
                      >
                        <span aria-hidden>{mark}</span>
                        <span className="text-ink">{label}</span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Everything else, as icons. */}
        <section id="toolkit" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <Reveal>
              <SectionHead eyebrow="Also in the box" title="Everything else, at a glance." />
            </Reveal>
            <Reveal delay={80}>
              <ul className="feature-grid mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {FEATURES.map((f) => (
                  <li key={f.label}>
                    <Link
                      href={f.href}
                      className="hover-lift flex h-full flex-col items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-card transition-colors hover:border-brand/30"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                        {f.icon}
                      </span>
                      <span className="text-sm font-medium leading-snug">{f.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-16 border-t border-line">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <Reveal>
            <SectionHead eyebrow="Pricing" title="Start free. Upgrade when the screen earns it." />
          </Reveal>
          <Reveal delay={80}>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {/* Free */}
              <div className="shadow-card flex flex-col rounded-2xl border border-line bg-surface p-6">
                <p className="text-sm font-semibold">Free</p>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">$0</span>
                </p>
                <p className="mt-1 text-sm text-muted">The full screen on your next {FREE_DEALS} deals.</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {FREE_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-faint text-[10px] font-bold text-muted">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login?mode=signup"
                  className="mt-6 rounded-lg border border-line px-4 py-2.5 text-center text-sm font-medium transition-colors hover:bg-faint"
                >
                  Get started free
                </Link>
              </div>

              {/* Pro */}
              <div className="shadow-float relative flex flex-col rounded-2xl border-2 border-brand bg-surface bg-gradient-to-b from-brand/[0.05] via-transparent to-transparent p-6">
                <span className="absolute -top-3 left-6 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-white">
                  For active pipelines
                </span>
                <p className="text-sm font-semibold">Pro</p>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">{PRICE_PRO_MONTHLY}</span>
                  <span className="text-sm text-muted">/month</span>
                </p>
                <p className="mt-1 text-sm text-muted">Unlimited screens, plus the exports for your IC.</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {PRO_FEATURES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-pass/15 text-[10px] font-bold text-pass">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login?mode=signup"
                  className="mt-6 rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-brand-strong"
                >
                  Start with Pro
                </Link>
                <p className="mt-2.5 text-center text-xs text-muted">Cancel anytime — your deals and exports stay yours.</p>
              </div>

              {/* Team */}
              <div className="shadow-card flex flex-col rounded-2xl border border-line bg-surface p-6">
                <p className="text-sm font-semibold">Team</p>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">{PRICE_TEAM_BASE_MONTHLY}</span>
                  <span className="text-sm text-muted">/month</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  Includes the owner, + {PRICE_TEAM_MEMBER_MONTHLY}/month per added member.
                </p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {[
                    "Everything in Pro, for every member",
                    "One shared pipeline — same deals, same verdicts",
                    "Invite teammates with a link",
                    "Billing follows your seat count automatically",
                    `${FREE_DEALS} shared deals free to try it`,
                  ].map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-brand/10 text-[10px] font-bold text-brand">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                <Link
                  href="/login?mode=signup"
                  className="mt-6 rounded-lg border border-brand/40 px-4 py-2.5 text-center text-sm font-medium text-brand transition-colors hover:bg-brand/5"
                >
                  Start a team
                </Link>
              </div>
            </div>
          </Reveal>
          <p className="mt-5 text-center text-xs text-muted">
            Billed monthly through Stripe · cancel anytime · no card required for Free.
          </p>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-y border-line bg-faint">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <SectionHead eyebrow="FAQ" title="The questions we'd ask too." />
            <div className="mx-auto mt-8 max-w-3xl divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              {FAQ.map((f, i) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer items-center gap-3 px-5 py-4 text-sm font-medium transition-colors hover:bg-faint [&::-webkit-details-marker]:hidden">
                    <span className="font-mono text-xs tabular-nums text-brand/50">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="flex-1">{f.q}</span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
                      aria-hidden
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </summary>
                  <p className="pb-4 pl-[3.1rem] pr-5 text-sm leading-relaxed text-muted">
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Closing CTA — bookends the dark hero. */}
        <section className="band-dark text-white">
          <div className="mx-auto max-w-6xl px-6 py-16 text-center sm:py-20">
            <p className="text-xs font-medium uppercase tracking-wider text-accent/90">
              The whole point
            </p>
            <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Every deal gets your sharpest screen.
            </h2>
            <div className="mt-8 flex justify-center">
              <Link
                href="/login?mode=signup"
                className="cta-breathe rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-strong transition-colors hover:bg-accent"
              >
                Screen your first deal free
              </Link>
            </div>
            <p className="mt-4 text-xs text-white/50">
              First {FREE_DEALS} deals free · no credit card
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <LogoMark className="h-7 w-7" />
              <span className="text-sm font-semibold tracking-tight">
                Underwrite Copilot
              </span>
            </div>
            <p className="mt-3 max-w-xs text-xs leading-relaxed text-muted">
              First-pass screen, not investment advice. Always verify flagged
              figures against source documents before acting.
            </p>
          </div>
          <nav aria-label="Product">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Product
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <a href="#screen" className="text-muted transition-colors hover:text-ink">
                  How it works
                </a>
              </li>
              <li>
                <Link href="/why" className="text-muted transition-colors hover:text-ink">
                  Why Underwrite Copilot
                </Link>
              </li>
              <li>
                <Link href="/demo" className="text-muted transition-colors hover:text-ink">
                  Sample screen
                </Link>
              </li>
              <li>
                <Link href="/market" className="text-muted transition-colors hover:text-ink">
                  Market data
                </Link>
              </li>
              <li>
                <Link href="/whats-new" className="text-muted transition-colors hover:text-ink">
                  What&apos;s new
                </Link>
              </li>
              <li>
                <a href="#pricing" className="text-muted transition-colors hover:text-ink">
                  Pricing
                </a>
              </li>
              <li>
                <Link href="/login" className="text-muted transition-colors hover:text-ink">
                  Sign in
                </Link>
              </li>
            </ul>
          </nav>
          <nav aria-label="Legal">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Legal &amp; support
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li>
                <Link href="/terms" className="text-muted transition-colors hover:text-ink">
                  Terms of service
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-muted transition-colors hover:text-ink">
                  Privacy policy
                </Link>
              </li>
              <li>
                <Link href="/security" className="text-muted transition-colors hover:text-ink">
                  Security
                </Link>
              </li>
              <li>
                <a
                  href="mailto:underwritecopilot.support@gmail.com"
                  className="text-muted transition-colors hover:text-ink"
                >
                  underwritecopilot.support@gmail.com
                </a>
              </li>
            </ul>
          </nav>
        </div>
        <div className="border-t border-line">
          <FooterTrustLine />
        </div>
      </footer>
    </div>
  );
}

/** A faithful miniature of the REAL deal page's summary bar — name + verdict
 *  + buy-box chips, the address line, exactly four figures, and the artifact
 *  row (IC memo / Full report / Underwrite model), plus the top deal-killer.
 *  Figures derive from the sample fixture through the live engine, so this
 *  card can never drift from what the product actually renders. */
function DealPreview() {
  const inputs = SAMPLE_DEAL.model.inputs;
  const r = computeModel(inputs).returns;
  const verdictWord =
    SAMPLE_DEAL.verdict.verdict === "pass"
      ? "Go"
      : SAMPLE_DEAL.verdict.verdict === "pass_on"
        ? "No-go"
        : "Caution";
  return (
    <div className="relative">
      {/* Glow + a second sheet behind, so the card reads as a stack. */}
      <div
        className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl border border-white/10 bg-white/[0.04]"
        aria-hidden
      />
      <div className="shadow-float relative rounded-2xl border border-line bg-surface p-5 text-ink">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold tracking-tight">
            The Maddox at Brewerytown
          </p>
          <span className="stamp-in rounded-full bg-caution/10 px-2.5 py-0.5 text-xs font-semibold text-caution ring-1 ring-caution/30">
            {verdictWord}
          </span>
          <span className="rounded-full bg-caution/10 px-2 py-0.5 text-[10px] font-semibold text-caution">
            WATCH
          </span>
        </div>
        <p className="mt-0.5 text-xs text-muted">
          Brewerytown, Philadelphia · Multifamily · {inputs.units} units
        </p>

        <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 border-y border-line py-3">
          {(
            [
              ["Price", `$${(inputs.purchasePrice / 1e6).toFixed(0)}M`],
              ["Size", `${inputs.units} units`],
              ["Going-in cap", `${r.goingInCapPct.toFixed(2)}%`],
              // The real deal header carries a fourth figure now — the deal's
              // strategy — and the sample mirrors the real page or it lies.
              ["Deal type", "Stabilized"],
            ] as const
          ).map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] uppercase tracking-wide text-muted">
                {k}
              </dt>
              <dd className="mt-0.5 font-mono text-sm font-semibold tabular-nums">
                {v}
              </dd>
            </div>
          ))}
        </dl>

        {/* The real header's artifact row, in miniature. */}
        <div className="mt-3 flex flex-wrap gap-1.5" aria-hidden>
          {["IC memo", "Full report", "Underwrite model"].map((a) => (
            <span
              key={a}
              className="flex items-center gap-1 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-medium shadow-sm"
            >
              {a}
              <span className="rounded-full bg-brand/10 px-1.5 py-px text-[9px] font-semibold text-brand">
                Pro
              </span>
            </span>
          ))}
        </div>

        <div className="mt-3 rounded-lg border border-line border-l-4 border-l-kill bg-paper p-3">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-muted">1</span>
            <span className="text-xs font-medium">Basis</span>
            <span className="ml-auto rounded-full bg-kill/10 px-2 py-0.5 text-[10px] font-medium uppercase text-kill">
              Deal-killer
            </span>
          </div>
          <p className="mt-1.5 text-xs leading-relaxed text-muted">
            {SAMPLE_COMP_PREMIUM_LINE}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Footer trust line ────────────────────────────────────────────────────────
// "page rendered" catches stale deploys; "data last verified" is the nightly
// steward's public heartbeat. No steward run yet → the claim simply doesn't
// render (we never assert a verification that hasn't happened), and a run
// older than 48h renders as a visible warning, not a quiet omission.
async function FooterTrustLine() {
  let verifiedAt: string | null = null;
  try {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("steward_runs")
      .select("finished_at")
      .not("finished_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    verifiedAt = (data?.finished_at as string | null) ?? null;
  } catch {
    // table absent — render without the marker
  }
  const overdue = verifiedAt !== null && hoursSince(verifiedAt) > 48;
  const fmt = (t: string | Date) =>
    new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  // Same checked-in changelog the app's What's-new card renders — the
  // homepage can never claim an improvement the app doesn't ship.
  const latest = latestChange();
  // Render exposes the deployed commit at build time — the footer names it,
  // so "is the site actually on the latest code" is answerable by comparing
  // this stamp to the repo's main tip. Absent locally; omitted then.
  const buildSha = (process.env.RENDER_GIT_COMMIT ?? "").slice(0, 7);
  return (
    <p className="mx-auto max-w-6xl px-6 py-4 text-xs text-muted">
      © 2026 Underwrite Copilot · page rendered {fmt(new Date())}
      {buildSha && (
        <>
          {" · build "}
          <a
            href={`https://github.com/fredballs1115-ux/Underwrite-Copilot/commit/${buildSha}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            {buildSha}
          </a>
        </>
      )}
      {latest && (
        <>
          {" "}
          · latest improvement:{" "}
          <Link
            href="/whats-new"
            className="underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            {latest.title}
          </Link>{" "}
          ({fmt(`${latest.date}T00:00:00Z`)})
        </>
      )}
      {verifiedAt && !overdue && <> · data last verified {fmt(verifiedAt)} by the nightly steward</>}
      {verifiedAt && overdue && (
        <>
          {" · "}
          <span className="text-caution">
            data verification overdue (last ran {fmt(verifiedAt)})
          </span>
        </>
      )}
      . A first-pass screen, not investment advice.
    </p>
  );
}
