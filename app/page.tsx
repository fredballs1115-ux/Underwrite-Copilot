import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "./logo";
import { Reveal, CountUp, DemoTabs } from "./landing-interactive";
import type { Metadata } from "next";
import {
  SPREAD_LOW_IRR_PCT,
  SPREAD_HIGH_IRR_PCT,
  SPREAD_BPS,
  FIRST_READ_CLAIM,
  FULL_SCREEN_CLAIM,
  ANALYSIS_STAGES,
  DEAL_KILLERS,
  MEMO_PAGES,
  SLIDER_SWEEP_BPS,
  COMPS_JURISDICTIONS,
  PRICE_PRO_MONTHLY,
  PRICE_TEAM_BASE_MONTHLY,
  PRICE_TEAM_MEMBER_MONTHLY,
  FREE_DEALS,
  SAMPLE_RETRADE_DELTA,
  SAMPLE_RECONCILE_ROWS,
  SAMPLE_COMP_PREMIUM_LINE,
} from "@/lib/marketing-constants";
// The Excel-preview rows are COMPUTED from the live engine on the sample
// model at render time — hardcoded copies of these figures are exactly what
// drifted (the page said 7.1% while the engine computed 6.9%).
import { computeModel } from "@/lib/model/compute";
import { SAMPLE_DEAL } from "@/lib/sample-deal";
import { seedBenchmarks, seedRules } from "@/lib/research-data";
import { hoursSince } from "@/lib/research";
import { RegulationPlayground } from "./landing-regulation";
import { COVERAGE_LIVE, COVERAGE_DISCOVERY } from "@/lib/public-comps/core";

// Title/description inherit the site defaults from the root layout;
// the canonical is declared per page so subpages never collapse to /.
export const metadata: Metadata = { alternates: { canonical: "/" } };

// ISR, hourly: the proof strip quotes the newest FRED pull, and a shorter
// window keeps "the site didn't change" cache confusion to at most an hour.
export const revalidate = 3600;

// Landing page — a React Server Component (zero client JS, no secrets).
// The pitch is consistency: one method on every deal, with the work shown.
// (Never claim "same answer every run" — LLM stages vary run to run, and the
// retrade diff would happily display that contradiction to a skeptic.)

// The actual six-stage pipeline every OM runs through — not slogans.
const SCREEN = [
  {
    n: 1,
    title: "Extract the deal",
    body: "Terms, unit economics, and every broker assumption pulled off the OM as ranges — each one page-cited, never a lone hero number.",
  },
  {
    n: 2,
    title: "Challenge the assumptions",
    body: "Grilled in the order deals die: basis, exit, debt. The three deal-killers get stressed before anything else does.",
  },
  {
    n: 3,
    title: "Scrutinize the comps",
    body: "Every comp in the deck ranked for how hard it actually supports the price — stretched, leaning, or genuine support.",
  },
  {
    n: 4,
    title: "Reconcile against your model",
    body: "Optional, whenever you're ready: upload your own numbers and see every gap. Conflicts resolve openly — actuals beat pro forma, never silently merged.",
  },
  {
    n: 5,
    title: "Check the market",
    body: "Every assumption graded against typical ranges for the asset class — in-line, aggressive, or conservative — and labeled as rules-of-thumb to verify, never dressed up as pulled comps.",
  },
  {
    n: 6,
    title: "Get the verdict",
    body: "Go / Caution / No-go with the reasons attached — and where the call flips across the ranges, so you see the honest edges.",
  },
];

function PillarIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const PILLARS = [
  {
    title: "Deterministic math",
    body: "The cash-flow and return math is real code, not a language model guessing. Same inputs, same output, every run.",
    icon: (
      <PillarIcon>
        <rect x="4" y="2" width="16" height="20" rx="2" />
        <path d="M8 6h8" />
        <path d="M8 11h.01M12 11h.01M16 11h.01M8 15h.01M12 15h.01M16 15h.01M8 19h.01M12 19h.01M16 19h.01" />
      </PillarIcon>
    ),
  },
  {
    title: "Sourced ranges",
    body: "Every assumption is a range tied to where it came from — a comp, a market norm, or the OM page — never a lone hero number.",
    icon: (
      <PillarIcon>
        <path d="M4 8h10" />
        <circle cx="17" cy="8" r="2.5" />
        <path d="M20 16H10" />
        <circle cx="7" cy="16" r="2.5" />
      </PillarIcon>
    ),
  },
  {
    title: "One rubric, every deal",
    body: "Every OM runs the same gauntlet in the same order, and the verdict shows its work. Your rigor stops depending on who opened the model that day.",
    icon: (
      <PillarIcon>
        <path d="M3 12a9 9 0 0 1 15.6-6.2L21 8" />
        <path d="M21 3v5h-5" />
        <path d="M21 12a9 9 0 0 1-15.6 6.2L3 16" />
        <path d="M3 21v-5h5" />
      </PillarIcon>
    ),
  },
];

const STATS: { value: number; suffix: string; label: string }[] = [
  { value: ANALYSIS_STAGES, suffix: "", label: "analysis stages on every OM" },
  { value: DEAL_KILLERS, suffix: "", label: "deal-killers stressed first" },
  { value: 0, suffix: "", label: "black-box numbers — every figure carries its source" },
  { value: MEMO_PAGES, suffix: "", label: "page of memo for your IC" },
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

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
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

      <main className="flex-1">
        {/* Hero — dark navy with soft accent glows; the product is the visual. */}
        <section className="band-dark relative overflow-hidden text-white">
          {/* Ambient glows: pure CSS, no layout shift, subtle by design. */}
          <div
            aria-hidden
            className="pointer-events-none absolute -top-32 right-[-10%] h-[28rem] w-[28rem] rounded-full opacity-25 blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, #7fd6cc 0%, transparent 70%)",
            }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute bottom-[-8rem] left-[-6%] h-[22rem] w-[22rem] rounded-full opacity-15 blur-3xl"
            style={{
              background:
                "radial-gradient(closest-side, #7fd6cc 0%, transparent 70%)",
            }}
          />
          <div className="relative mx-auto max-w-6xl px-6 pb-14 pt-16 sm:pt-24">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-accent">
                  <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                  AI deal screening for CRE acquisitions
                </span>
                <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                  The OM lands Thursday.{" "}
                  <span className="relative inline-block whitespace-nowrap">
                    Offers are due Monday.
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
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70 max-sm:hidden">
                  Small shops see 10–15 OMs a week, spend 20–45 minutes on each
                  manual screen, and fully model one in ten. Copilot screens
                  the deal tonight: every figure extracted with its page cite,
                  broker comps stress-ranked, recorded sales pulled from the
                  county record, the rent-control call made at the address —
                  and a verdict scored 0–100 against your buy box before the
                  weekend starts.
                </p>
                <p className="mt-6 text-lg leading-relaxed text-white/70 sm:hidden">
                  10–15 OMs a week, 20–45 minutes each, one in ten modeled.
                  Copilot screens tonight: page-cited extraction, recorded
                  county sales, the rent-control call, a scored verdict.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/login?mode=signup"
                    className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-strong transition-colors hover:bg-accent"
                  >
                    Get started free
                  </Link>
                  <Link
                    href="#screen"
                    className="rounded-lg border border-white/25 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                  >
                    See how it works
                  </Link>
                </div>
                <p className="mt-5 max-w-xl text-sm leading-relaxed text-white/55">
                  Upload an OM → sourced ranges, the three deal-killers, and a
                  Go / Caution / No-go in {FULL_SCREEN_CLAIM}. First {FREE_DEALS} deals free · no
                  card.
                </p>
                <p className="mt-4 max-w-xl font-mono text-[11px] uppercase tracking-wider text-white/40">
                  price/door · going-in cap (T-12) · untrended YoC · DSCR ·
                  debt yield · loss-to-lease
                </p>
              </div>

              {/* Product preview */}
              <div>
                <DealPreview />
                <p className="mt-4 text-center text-[11px] text-white/55">
                  Illustrative sample deal — not a real listing.{" "}
                  <Link
                    href="/demo"
                    className="font-medium text-white/70 underline-offset-2 hover:text-white hover:underline"
                  >
                    Browse the full sample screen →
                  </Link>
                </p>
              </div>
            </div>

            {/* Stat strip — the screen, quantified. */}
            <dl className="mt-16 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-white/10 pt-8 sm:grid-cols-4">
              {STATS.map((st) => (
                <div key={st.label}>
                  <dt className="sr-only">{st.label}</dt>
                  <dd className="font-mono text-3xl font-semibold tabular-nums text-accent">
                    <CountUp value={st.value} suffix={st.suffix} />
                  </dd>
                  <dd className="mt-1 text-xs leading-relaxed text-white/60">
                    {st.label}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <ResearchTicker />
        <LiveProofStrip />

        {/* The problem */}
        <section id="problem" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              The hidden risk
            </p>
            <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Your best analyst is also your single point of failure.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Nobody&apos;s lying. They just pulled different numbers and called
              it judgment. That&apos;s not analysis — it&apos;s a coin flip with
              a spreadsheet attached, and it means your underwriting quality is
              whoever happened to open the model that day.
            </p>

            {/* The spread, drawn instead of described. Both ends are neutral
                on purpose: neither analyst is "right" — the spread is the
                problem. */}
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
                  className="absolute left-[10%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-ink/80 shadow"
                  aria-hidden
                />
                <span
                  className="absolute left-[90%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-ink/80 shadow"
                  aria-hidden
                />
              </div>
              <p className="mt-3 text-center text-xs text-muted">
                Same deal. Same afternoon. Same data room.
              </p>
            </div>

            </Reveal>
            <Reveal delay={60}>
              <div className="mt-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
                <p className="text-xs font-medium uppercase tracking-wider text-muted">
                  Four instant disqualifiers the screen stresses first
                </p>
                <ul className="mt-3 grid gap-x-8 gap-y-2 text-sm leading-relaxed text-muted sm:grid-cols-2">
                  {(
                    [
                      "Property taxes not reset to the sale price",
                      "OpEx ratio under ~30% of gross potential rent",
                      "Aggressive loss-to-lease and concession burn-off",
                      "Insurance still at the seller\u2019s legacy premium",
                    ] as const
                  ).map((d) => (
                    <li key={d} className="flex gap-2.5">
                      <span aria-hidden className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-kill/70" />
                      <span>{d}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Analyst B</span>
                  <span className="rounded-full bg-kill/10 px-2.5 py-1 text-xs font-medium text-kill">
                    Pass · {SPREAD_LOW_IRR_PCT}% IRR
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Conservative rents, flat exit, a real expense load.
                </p>
              </div>
              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Analyst A</span>
                  <span className="rounded-full bg-pass/10 px-2.5 py-1 text-xs font-medium text-pass">
                    Buy · {SPREAD_HIGH_IRR_PCT}% IRR
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Held the broker&apos;s rents, trended the exit cap down,
                  underweighted expenses.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Inside the screen — interactive walkthrough on sample data */}
        <section className="border-y border-line bg-faint">
          <div className="mx-auto grid max-w-6xl items-start gap-10 px-6 py-16 sm:py-20 lg:grid-cols-2">
            <Reveal>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                Inside the screen
              </p>
              <h2 className="mt-2 max-w-md text-2xl font-semibold tracking-tight sm:text-3xl">
                Click through what the verdict is built on.
              </h2>
              <p className="mt-3 max-w-md text-sm leading-relaxed text-muted">
                Every tab below is a real output shape from the product —
                ranges instead of hero numbers, the three deal-killers graded,
                the broker&apos;s own comps ranked, and a verdict that holds
                across scenarios. Shown here with illustrative sample data.
              </p>
              <Link
                href="/login?mode=signup"
                className="mt-6 inline-flex rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
              >
                Run it on a real OM
              </Link>
            </Reveal>
            <Reveal delay={120}>
              <DemoTabs />
            </Reveal>
          </div>
        </section>

        {/* The six-stage screen */}
        <section id="screen" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              The six-stage screen
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Our proof is public: a fully worked screen.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              A first read — headline numbers and buy-box fit — lands in about
              {FIRST_READ_CLAIM}, while the six deeper stages keep working.
            </p>
            <Reveal delay={60}>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {SCREEN.map((s) => (
                <div
                  key={s.n}
                  className="hover-lift relative overflow-hidden rounded-xl border border-line bg-surface p-5 shadow-card hover:border-brand/30"
                >
                  <span
                    aria-hidden
                    className="pointer-events-none absolute -top-3 right-2 font-mono text-[64px] font-bold leading-none text-brand/15"
                  >
                    {s.n}
                  </span>
                  <h3 className="border-b border-brand/10 pb-2.5 pr-12 font-medium">
                    {s.title}
                  </h3>
                  <p className="mt-2.5 text-sm leading-relaxed text-muted">
                    {s.body}
                  </p>
                </div>
              ))}
            </div>
            </Reveal>
            {/* Put the screen to work — full-width row under the grid. */}
            <Link
              href="/login?mode=signup"
              className="hover-lift group mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-sidebar px-5 py-4 text-white shadow-card"
            >
              <p className="text-sm leading-relaxed text-white/70">
                <span className="font-semibold text-white">
                  Watch it run on your own deal.
                </span>{" "}
                Upload an OM and the whole screen — ranges, deal-killers,
                verdict — comes back in {FULL_SCREEN_CLAIM}.
              </p>
              <p className="text-sm font-semibold text-accent transition-transform group-hover:translate-x-0.5">
                Screen a deal free →
              </p>
            </Link>
          </div>
        </section>

        {/* The toolkit — concrete feature callouts, all shipping today. */}
        <section id="toolkit" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <Reveal>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                The toolkit
              </p>
              <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
                Built around the numbers that decide deals.
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {(
                  [
                    [
                      "OM + rent roll + T-12, one model",
                      "Upload the actuals and the screen re-anchors itself — in-place occupancy, WALT, actual NOI — and flags where the OM's pro forma drifts from the trailing twelve.",
                    ],
                    [
                      "Drag the levers, watch it break",
                      `Exit cap across ±${SLIDER_SWEEP_BPS}bps, rent growth, vacancy — IRR, equity multiple, DSCR, and your mandate fit recompute on every tick of the slider. No re-screen, no waiting.`,
                    ],
                    [
                      "Your buy box, scored 0–100",
                      "Every deal reads PURSUE / WATCH / PASS against your mandate — cap floor, return targets, geographies, hard dealbreakers — from the first signal onward.",
                    ],
                    [
                      "Comps that pull themselves",
                      `Give a deal an address and recorded sales appear from government records — ${COMPS_JURISDICTIONS} today — with the median, the range, and where your price sits against them. Public records, never a licensed feed.`,
                    ],
                    [
                      "Financing & capital, sized",
                      "Max loan under LTV / DSCR / debt-yield with the binding constraint flagged — plus payments, rate moves, breakeven occupancy, and the capital plan.",
                    ],
                    [
                      "From verdict to to-do list",
                      "One click turns the verdict's next steps into assigned tasks with due dates — then the memo exports under your own firm's name and logo (Pro).",
                    ],
                    [
                      "Rent control, checked at the address",
                      "DC's exemptions, PG County's cap, Philadelphia's eviction diversion — the rules engine reads the deal's address and answers Exempt, Applies, or names the open question, statute linked.",
                    ],
                    [
                      "Rates that refresh themselves",
                      "The 10-Year, SOFR, the 30-year survey, and CRE delinquency land daily from FRED; a weekday intel sweep scores the news for your buy box and raises a red banner when a rent law moves.",
                    ],
                    [
                      "Market data with receipts",
                      "Every research-sourced figure is clickable — its source, its as-of date, and whether it's verified or merely sourced. Stale data wears a badge instead of hiding.",
                    ],
                  ] as const
                ).map(([title, body]) => (
                  <div
                    key={title}
                    className="hover-lift rounded-xl border border-line bg-surface p-5 shadow-card hover:border-brand/30"
                  >
                    <h3 className="border-b border-brand/10 pb-2.5 font-medium">
                      {title}
                    </h3>
                    <p className="mt-2.5 text-sm leading-relaxed text-muted">
                      {body}
                    </p>
                  </div>
                ))}
              </div>
            </Reveal>
            {/* The workflow around the analysis — every item real and live,
                pulled from the product audit, one line each. */}
            <Reveal delay={120}>
              <div className="mt-10 rounded-2xl border border-line bg-faint/60 p-6">
                <h3 className="text-sm font-semibold tracking-tight">
                  And the workflow around it
                </h3>
                <ul className="mt-4 grid gap-x-8 gap-y-2.5 text-sm leading-relaxed text-muted sm:grid-cols-2">
                  {(
                    [
                      [
                        "First signal in seconds",
                        "headline numbers and buy-box fit land while the six deeper stages keep working",
                      ],
                      [
                        "Click any number, open the page",
                        "every extracted figure carries its OM page — click through and verify at the source",
                      ],
                      [
                        "Ask the deal",
                        "question the OM in plain English; answers cite the pages they came from",
                      ],
                      [
                        "LOI draft in one click",
                        "a conservative non-binding letter (.docx) prefilled from the screen's figures",
                      ],
                      [
                        "A pipeline, not a folder",
                        "stages, offer deadlines, search, side-by-side compare, and meeting-ready Excel/CSV exports",
                      ],
                      [
                        "Your own market memory",
                        "cap-rate and basis ranges built from your past screens — private to your account",
                      ],
                      [
                        "Share a read-only link",
                        "send a partner the screen without an account; links expire and can be revoked",
                      ],
                      [
                        "Retrade watch",
                        "broker reissues the deck? Replace the OM and see exactly what moved since last screen",
                      ],
                    ] as const
                  ).map(([title, body]) => (
                    <li key={title} className="flex gap-2.5">
                      <span
                        aria-hidden
                        className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-brand"
                      />
                      <span>
                        <span className="font-medium text-ink">{title}</span>{" "}
                        — {body}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
            <p className="mt-4 text-center text-xs text-muted">
              Every tile above is live in the product today —{" "}
              <Link
                href="/demo"
                className="font-medium text-brand underline-offset-2 hover:underline"
              >
                see the screen itself on the sample deal →
              </Link>
            </p>
          </div>
        </section>

        {/* The rules engine, live — the differentiator, demonstrated. */}
        <section id="rules" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <Reveal>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                Try it right here
              </p>
              <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
                The rent-control engine, running live on this page.
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
                Four real scenarios, one click apart. Watch how entity title
                flips a DC rowhouse from exempt to rent-stabilized, and how the
                engine names the exact fact that would settle an open question.
              </p>
            </Reveal>
            <Reveal delay={80}>
              <div className="mt-8">
                <RegulationPlayground />
              </div>
            </Reveal>
            <Reveal delay={120}>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs">
                <span className="mr-1 text-muted">Recorded-sales comps:</span>
                {COVERAGE_LIVE.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-full bg-brand px-2.5 py-1 font-medium text-white"
                  >
                    {p.regionLabel}
                  </span>
                ))}
                {COVERAGE_DISCOVERY.map((p) => (
                  <span
                    key={p.id}
                    className="rounded-full border border-dashed border-line px-2.5 py-1 text-muted"
                    title="being wired — endpoint resolving"
                  >
                    {p.regionLabel}
                  </span>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        {/* The ground layer — the data floor under every screen: property DB,
            laws, the daily journal, and the steward that polices it all. */}
        <GroundLayerSection />

        {/* The artifacts — a bento of what you actually walk away with. */}
        <section className="border-y border-line bg-faint">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <Reveal>
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                The artifacts
              </p>
              <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
                What you walk away with.
              </h2>
            </Reveal>
            <Reveal delay={80}>
              <div className="mt-8 grid gap-4 lg:grid-cols-3">
                {/* Excel model — the flagship tile */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card lg:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold">
                      The Excel model, alive
                    </h3>
                    <span className="rounded-full bg-faint px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      Sample
                    </span>
                  </div>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
                    Not a static report — seven tabs of live formulas: annual
                    and monthly cash flow, a full debt schedule, and IRR
                    sensitivity matrices. Edit the tinted inputs and the whole
                    book recalculates.
                  </p>
                  <div className="mt-auto pt-4">
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
                </div>

                {/* Memo */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <h3 className="text-sm font-semibold">One-page IC memo</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    The verdict, the ranges, the deal-killers, and next steps —
                    exactly one page, ready to forward.
                  </p>
                  <div className="mt-auto pt-4">
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
                </div>

                {/* Comps */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <h3 className="text-sm font-semibold">Comps, graded</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    The broker&apos;s comps ranked by how hard they support the
                    price — plus a public-web search when the deck has none.
                  </p>
                  <div className="mt-auto space-y-1.5 pt-4 text-[10px]">
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

                {/* Reconcile */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <h3 className="text-sm font-semibold">
                    Your model vs the OM
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Upload your own underwriting and every gap gets called —
                    favorable, unfavorable, or noise.
                  </p>
                  <div className="mt-auto space-y-1.5 pt-4 font-mono text-[10px]">
                    {SAMPLE_RECONCILE_ROWS.map(([k, v, d]) => (
                      <div
                        key={k}
                        className="flex items-center justify-between gap-2 rounded-md border border-line px-2.5 py-1.5"
                      >
                        <span className="text-muted">{k}</span>
                        <span className="truncate text-muted">{v}</span>
                        <span className="font-semibold text-caution">{d}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Team */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <h3 className="text-sm font-semibold">One team, one pipeline</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Invite your team with a link — everyone screens into the
                    same pipeline, with the same verdicts. {PRICE_TEAM_MEMBER_MONTHLY} per added
                    member.
                  </p>
                  <div className="mt-auto flex items-center gap-3 pt-4">
                    <div className="flex -space-x-2">
                      {["A", "M", "J"].map((c, i) => (
                        <span
                          key={i}
                          className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-surface bg-brand/10 text-xs font-semibold text-brand"
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                    <span className="text-[10px] leading-tight text-muted">
                      same deals ·<br />
                      same screen
                    </span>
                  </div>
                </div>

                {/* Retrade watch */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <h3 className="text-sm font-semibold">Built for the retrade</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    Broker cut the price and reissued the deck? Replace the OM,
                    re-screen, and see exactly what moved — and whether the
                    verdict flips.
                  </p>
                  <div className="mt-auto space-y-1.5 pt-4">
                    <div className="flex items-center gap-1.5 text-[10px] font-semibold">
                      <span className="rounded-full bg-caution/10 px-2 py-0.5 text-caution">
                        Caution
                      </span>
                      <span aria-hidden className="text-muted">→</span>
                      <span className="rounded-full bg-pass/10 px-2 py-0.5 text-pass">
                        Go
                      </span>
                    </div>
                    <div className="flex items-center justify-between rounded-md border border-pass/25 bg-pass/[0.04] px-2.5 py-1.5 font-mono text-[10px]">
                      <span className="text-muted">Asking price</span>
                      <span className="font-semibold text-pass">{SAMPLE_RETRADE_DELTA}</span>
                    </div>
                  </div>
                </div>

                {/* Buy box */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card lg:col-span-2">
                  <h3 className="text-sm font-semibold">Your buy box, enforced</h3>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
                    Set your criteria once — asset classes, markets, max price,
                    minimum cap and IRR. Every screen is checked against them in
                    code, off-box deals get flagged within the first read, and
                    the verdict judges the fit out loud.
                  </p>
                  <div className="mt-auto flex flex-wrap gap-1.5 pt-4 text-[10px] font-medium">
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
                    <span className="ml-1 self-center text-muted">
                      …a deal can be well-underwritten and still be outside the
                      box. It says so.
                    </span>
                  </div>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Precision, not language — the differentiator gets the dark band. */}
        <section className="band-dark text-white">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <p className="text-xs font-medium uppercase tracking-wider text-accent/90">
              Why not just ChatGPT?
            </p>
            <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
              Underwriting is a precision problem, not a language problem.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/65">
              Raw LLMs give answers that look right. But a 10% drift reads
              perfectly fine in a sentence while it quietly kills the deal. So we
              put a deterministic workflow on top of the AI — one that shows its
              work.
            </p>
            <Reveal delay={60}>
            <div className="mt-10 grid gap-8 sm:grid-cols-3">
              {PILLARS.map((p) => (
                <div key={p.title}>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/12 text-accent ring-1 ring-white/20">
                    {p.icon}
                  </div>
                  <h3 className="mt-4 font-medium">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-white/65">
                    {p.body}
                  </p>
                </div>
              ))}
            </div>
            </Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-16 mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <Reveal>
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Pricing
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              Start free. Upgrade when the screen earns it.
            </h2>
          </Reveal>
          <Reveal delay={80}>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {/* Free */}
              <div className="shadow-card flex flex-col rounded-2xl border border-line bg-surface p-6">
                <p className="text-sm font-semibold">Free</p>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">$0</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  The full screen, on your next {FREE_DEALS} deals.
                </p>
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
                <p className="mt-1 text-sm text-muted">
                  Unlimited screening, plus the artifacts you hand to your IC.
                </p>
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
                <p className="mt-2.5 text-center text-xs text-muted">
                  Cancel anytime — your deals and exports stay yours.
                </p>
              </div>

              {/* Team */}
              <div className="shadow-card flex flex-col rounded-2xl border border-line bg-surface p-6">
                <p className="text-sm font-semibold">Team</p>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">{PRICE_TEAM_BASE_MONTHLY}</span>
                  <span className="text-sm text-muted">/month</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  Includes the owner, + {PRICE_TEAM_MEMBER_MONTHLY}/month per added member. One
                  shared pipeline for the whole shop.
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
            Billed monthly through Stripe · cancel anytime · no card required
            for Free.
          </p>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-y border-line bg-faint">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              FAQ
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
              The questions we&apos;d ask too.
            </h2>
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
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-white/65 sm:text-base">
              Make every analyst underwrite like your sharpest principal — the
              same rigor on every deal, no matter who&apos;s tired.
            </p>
            <div className="mt-8 flex justify-center">
              <Link
                href="/login?mode=signup"
                className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-strong transition-colors hover:bg-accent"
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
                <a href="#pricing" className="text-muted transition-colors hover:text-ink">
                  Pricing
                </a>
              </li>
              <li>
                <a href="#faq" className="text-muted transition-colors hover:text-ink">
                  FAQ
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

/** A stylized preview of the product's output — pure decoration. */
function DealPreview() {
  return (
    <div className="relative">
      {/* Glow + a second sheet behind, so the card reads as a stack. */}
      <div
        className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl border border-white/10 bg-white/[0.04]"
        aria-hidden
      />
      <div className="shadow-float relative rounded-2xl border border-line bg-surface p-5 text-ink">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium">The Maddox at Brewerytown</p>
            <p className="text-xs text-muted">
              Multifamily · 248 units · Brewerytown, Philadelphia
            </p>
          </div>
          <span className="rounded-full bg-caution/10 px-2.5 py-1 text-xs font-medium text-caution">
            Caution
          </span>
        </div>

        {/* Exit cap as a range, not a hero number */}
        <div className="mt-4 rounded-lg border border-line p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium">Exit cap</span>
            <span className="font-mono text-[11px] tabular-nums text-muted">
              range
            </span>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-md border border-line bg-line">
            {[
              { k: "Low", v: "5.25%", e: false },
              { k: "Base", v: "5.50%", e: true },
              { k: "High", v: "5.75%", e: false },
            ].map((c) => (
              <div
                key={c.k}
                className={`px-2.5 py-1.5 ${c.e ? "bg-brand/5" : "bg-surface"}`}
              >
                <p className="text-[10px] uppercase tracking-wide text-muted">
                  {c.k}
                </p>
                <p
                  className={`mt-0.5 font-mono tabular-nums ${
                    c.e
                      ? "text-sm font-semibold text-brand"
                      : "text-xs text-ink"
                  }`}
                >
                  {c.v}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">
            <span className="font-medium text-ink">Source:</span> submarket
            trades 5.25–5.75%; broker holds 5.25%.
          </p>
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

// ── Live proof strip (site-polish) ───────────────────────────────────────────
// Real numbers from the research layer, QUERIED at render time — the rates
// table and benchmark/rule counts come from the database when it's reachable
// (service client, read-only), and from the checked-in research seeds
// otherwise. Nothing here is typed-in marketing copy; if a value is missing
// it simply doesn't render.
async function LiveProofStrip() {
  let pmms: { value: number; asOf: string } | null = null;
  let benchCount = seedBenchmarks().length;
  let ruleCount = seedRules().length;
  let salesCount = 0;
  let journalTitle: string | null = null;
  try {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const admin = createSupabaseAdminClient();
    const [{ data: rate }, bench, rules, sales, { data: j }] = await Promise.all([
      admin
        .from("rates")
        .select("value, obs_date")
        .eq("series_id", "MORTGAGE30US")
        .order("obs_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("benchmarks").select("id", { count: "exact", head: true }),
      admin.from("regulatory_rules").select("id", { count: "exact", head: true }),
      admin.from("recorded_sales").select("id", { count: "exact", head: true }),
      admin
        .from("journal_entries")
        .select("title, status")
        .eq("status", "ok")
        .order("entry_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (rate) pmms = { value: Number(rate.value), asOf: String(rate.obs_date) };
    if (bench.count) benchCount = Math.max(benchCount, bench.count);
    if (rules.count) ruleCount = Math.max(ruleCount, rules.count);
    salesCount = sales.count ?? 0;
    journalTitle = (j?.title as string | null) ?? null;
  } catch {
    // no env / tables — seeds carry the strip
  }
  if (!pmms) {
    const seed = seedBenchmarks().find((b) => b.metric === "pmms_30y_fixed");
    if (seed?.low != null) pmms = { value: seed.low, asOf: seed.as_of };
  }
  const fmtDate = (iso: string) =>
    new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const items = [
    pmms && (
      <>
        30-yr fixed{" "}
        <span className="font-mono font-semibold tabular-nums">{pmms.value}%</span>{" "}
        <span className="text-muted">({fmtDate(pmms.asOf)}, FRED)</span>
      </>
    ),
    <>
      <span className="font-mono font-semibold tabular-nums">{benchCount}</span>{" "}
      sourced benchmarks across{" "}
      <span className="font-mono font-semibold tabular-nums">14</span> sectors
    </>,
    <>
      <span className="font-mono font-semibold tabular-nums">{ruleCount}</span>{" "}
      rent-control &amp; TOPA rules on file — every number carries its source
    </>,
    salesCount > 0 && (
      <>
        <span className="font-mono font-semibold tabular-nums">
          {salesCount.toLocaleString("en-US")}
        </span>{" "}
        deed-recorded sales in the comps database
      </>
    ),
    journalTitle && (
      <>
        today&apos;s journal: <span className="font-semibold">“{journalTitle}”</span>
      </>
    ),
  ].filter(Boolean);

  return (
    <div className="border-b border-line bg-faint/70">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-1.5 px-6 py-3 text-sm">
        {items.map((it, i) => (
          <span key={i} className="inline-flex items-center gap-2">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
            {it}
          </span>
        ))}
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
  return (
    <p className="mx-auto max-w-6xl px-6 py-4 text-xs text-muted">
      © 2026 Underwrite Copilot · page rendered {fmt(new Date())}
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

// ── The ground layer (national expansion) ────────────────────────────────────
// Four live-stat cards for the data floor: the ingested property database +
// Pull Comps, the laws reference, the Daily Journal, and the nightly steward.
// Every number is a live DB count or a code-derived fact; anything the DB
// can't attest yet renders an honest not-yet state instead of a placeholder.
interface JournalHead {
  entry_date: string;
  title: string;
  status: string;
}

async function GroundLayerSection() {
  let salesCount = 0;
  let propCount = 0;
  let ruleCount = seedRules().length;
  let journal: JournalHead | null = null;
  let stewardAt: string | null = null;
  let correctionCount = 0;
  try {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const admin = createSupabaseAdminClient();
    const [sales, props, rules, { data: j }, { data: run }, changes] = await Promise.all([
      admin.from("recorded_sales").select("id", { count: "exact", head: true }),
      admin.from("properties").select("id", { count: "exact", head: true }),
      admin.from("regulatory_rules").select("id", { count: "exact", head: true }),
      admin
        .from("journal_entries")
        .select("entry_date, title, status")
        .order("entry_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin
        .from("steward_runs")
        .select("finished_at, started_at")
        .not("finished_at", "is", null)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      admin.from("data_changelog").select("id", { count: "exact", head: true }),
    ]);
    salesCount = sales.count ?? 0;
    propCount = props.count ?? 0;
    if (rules.count) ruleCount = Math.max(ruleCount, rules.count);
    journal = (j as JournalHead | null) ?? null;
    stewardAt = (run?.finished_at as string | null) ?? null;
    correctionCount = changes.count ?? 0;
  } catch {
    // no env / tables — the not-yet states below stay honest
  }
  const num = (n: number) => n.toLocaleString("en-US");
  const fmtD = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });

  return (
    <section id="ground" className="scroll-mt-16 border-y border-line bg-faint">
      <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
        <Reveal>
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            The ground layer
          </p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
            It doesn&apos;t just read the broker&apos;s numbers. It stands on
            its own.
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
            Under every screen sits a data floor the broker didn&apos;t write:
            government parcel and deed records, landlord law encoded as logic,
            a daily sourced journal — and a nightly steward that re-verifies
            all of it while you sleep.
          </p>
        </Reveal>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Reveal>
            <div className="shadow-card h-full rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                Pull comps on any address
              </p>
              {salesCount > 0 ? (
                <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                  {num(salesCount)}
                  <span className="ml-2 text-sm font-normal text-muted">
                    deed-recorded sales ingested
                    {propCount > 0 && ` · ${num(propCount)} parcels`}
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed">
                  <span className="font-semibold">
                    Bulk county deed records, loading market by market
                  </span>{" "}
                  <span className="text-muted">— Philadelphia is wired first.</span>
                </p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Type an address, get the recorded sales around it — from
                government deed records, with a source link on every row.
                Live county APIs already cover {COMPS_JURISDICTIONS}; the
                property database extends it nationally. Single-family is
                excluded by design, and the screener runs the same pull
                against every deal automatically.
              </p>
            </div>
          </Reveal>
          <Reveal delay={40}>
            <div className="shadow-card h-full rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                The laws, as logic
              </p>
              <p className="mt-2 font-mono text-2xl font-semibold tabular-nums">
                {ruleCount}
                <span className="ml-2 text-sm font-normal text-muted">
                  machine-evaluable rules on file
                </span>
              </p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Rent control, TOPA, licensing, deposits, eviction — encoded as
                conditions with their exemption paths, statutory quotes, and
                sources. Browsable as a full reference in the app, evaluated
                automatically against every deal&apos;s address, and
                red-bannered the day a rule looks like it changed.
              </p>
            </div>
          </Reveal>
          <Reveal delay={80}>
            <div className="shadow-card h-full rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                The Daily Journal
              </p>
              {journal && journal.status === "ok" ? (
                <p className="mt-2 text-sm leading-relaxed">
                  <span className="font-semibold">“{journal.title}”</span>{" "}
                  <span className="text-muted">
                    — {fmtD(journal.entry_date)}&apos;s entry, in the app.
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed">
                  <span className="font-semibold">
                    A dated CRE brief, written every weekday morning.
                  </span>
                </p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Markets, deal flow, policy &amp; rates, then your markets —
                written from that morning&apos;s sourced sweep. Every claim
                carries its link, and a day the pipeline failed says so
                instead of pretending it was quiet.
              </p>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <div className="shadow-card h-full rounded-2xl border border-line bg-surface p-5">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">
                A steward that never sleeps
              </p>
              {stewardAt ? (
                <p className="mt-2 text-sm leading-relaxed">
                  <span className="font-semibold">
                    Data last verified {fmtD(stewardAt)}
                  </span>{" "}
                  <span className="text-muted">
                    {correctionCount > 0 &&
                      `· ${num(correctionCount)} corrections logged in the open`}
                  </span>
                </p>
              ) : (
                <p className="mt-2 text-sm leading-relaxed">
                  <span className="font-semibold">
                    Nightly re-verification, with a public changelog.
                  </span>
                </p>
              )}
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Every night it re-checks source links, feed freshness, and the
                oldest singly-sourced claims against the live web. A number
                that changed at the source gets corrected in the open —
                old, new, reason, evidence — never silently. If the steward
                itself stops, the site says so within 48 hours.
              </p>
            </div>
          </Reveal>
        </div>
        <Reveal delay={140}>
          <p className="mt-6 text-center text-sm text-muted">
            All of it is already wired into the{" "}
            <Link
              href="/demo"
              className="font-medium text-brand underline decoration-dotted underline-offset-2"
            >
              fully worked sample screen
            </Link>
            {" — "}including the recorded-sales read on the sample&apos;s own
            submarket.
          </p>
        </Reveal>
      </div>
    </section>
  );
}

// ── Research ticker (site-polish 2) ──────────────────────────────────────────
// A slow marquee of REAL figures from the research layer — the same seeds the
// market page renders with provenance. Content duplicated once for a seamless
// CSS loop; hover pauses; reduced-motion gets a static row.
function ResearchTicker() {
  const bench = seedBenchmarks();
  const pick = (metro: string, metric: string) =>
    bench.find((b) => b.metro === metro && b.metric === metric)?.low ?? null;
  const money = (n: number | null) =>
    n === null ? null : n >= 10000 ? `$${Math.round(n / 1000)}k` : `$${n.toLocaleString()}`;
  // Each candidate renders only when its number actually exists — a missing
  // seed drops the item rather than showing "—" or "$0".
  const pmmsVal = pick("", "pmms_30y_fixed");
  const dcFmr = pick("Washington DC area", "hud_fmr_fy2026_2br");
  const baltFmr = pick("Baltimore MD", "hud_fmr_fy2026_2br");
  const phillyMed = money(pick("Philadelphia, PA", "median_sale_price_2_4_unit"));
  const provMed = money(pick("Providence, RI", "median_sale_price_2_4_unit"));
  const items = (
    [
      pmmsVal !== null && ["30-yr fixed", `${pmmsVal}% · FRED`],
      phillyMed && ["Philadelphia 2–4 unit median", `${phillyMed} · +6.9% YoY`],
      ["Scranton", money(pick("Scranton, PA", "median_sale_price_2_4_unit"))],
      ["Albany", money(pick("Albany, NY", "median_sale_price_2_4_unit"))],
      provMed && ["Providence", `${provMed} · ~150 sales/mo`],
      dcFmr !== null && ["DC FY2026 2BR FMR", `$${dcFmr.toLocaleString()}/mo`],
      baltFmr !== null && ["Baltimore FY2026 2BR FMR", `$${baltFmr.toLocaleString()}/mo`],
      ["DC ≤4-unit natural-person exemption", "verified vs statute"],
      ["PG County cap", "lesser of 6% or CPI+3%"],
      ["Recorded-sales comps", COMPS_JURISDICTIONS],
    ] as const
  ).filter((it): it is [string, string] => Array.isArray(it) && !!it[1]);

  const row = (hidden: boolean) => (
    <div
      aria-hidden={hidden || undefined}
      className="flex shrink-0 items-center gap-10 pr-10"
    >
      {items.map(([k, v]) => (
        <span key={String(k)} className="inline-flex items-baseline gap-2 whitespace-nowrap text-sm">
          <span className="text-white/55">{k}</span>
          <span className="font-mono font-semibold tabular-nums text-accent">{v}</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="band-dark overflow-hidden border-t border-white/10 py-3 text-white">
      <div className="ticker-track flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
