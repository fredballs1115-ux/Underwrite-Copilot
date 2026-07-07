import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "./logo";
import { Reveal, CountUp, DemoTabs } from "./landing-interactive";

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
    title: "Scrutinize the broker's comps",
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
    body: "Go / Caution / No-Go with the reasons attached — and where the call flips across the ranges, so you see the honest edges.",
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
  { value: 6, suffix: "", label: "analysis stages on every OM" },
  { value: 3, suffix: "", label: "deal-killers stressed first" },
  { value: 0, suffix: "", label: "black-box numbers — every figure carries its source" },
  { value: 1, suffix: "", label: "page of memo for your IC" },
];

const FREE_FEATURES = [
  "3 deals, the full six-stage screen on each",
  "Sourced ranges + the three deal-killers",
  "Risk digest and side-by-side deal comparison",
  "Reconcile your own underwriting model",
];

const PRO_FEATURES = [
  "Unlimited deals",
  "First-draft Excel model with IRR sensitivity",
  "One-page PDF screening memo",
  "Public-web comp search",
  "Everything in Free",
];

const FAQ: { q: string; a: string }[] = [
  {
    q: "What do I need to get started?",
    a: "Just an offering memorandum as a PDF. Upload it and the screen runs on its own — a first read with the headline numbers lands in about half a minute, then extraction, assumption challenges, comp scrutiny, market check, and a verdict. Add a rent roll, T-12, or loan terms later to deepen the model. You can also explore a fully-worked sample deal before uploading anything.",
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
    a: "Yes. Create a team, send teammates an invite link, and every deal anyone uploads lands in one shared pipeline — same screens, verdicts, models, and memos for everyone. The Team plan is $29 per seat per month, billed only for the seats you have, and it adjusts automatically as people join or leave.",
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
        "CRE deal screening that runs every offering memorandum through the same disciplined screen: sourced ranges, the three deal-killers, and a Go / No-Go that shows its work before you open a model.",
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
        { "@type": "Offer", name: "Pro", price: "39", priceCurrency: "USD" },
        {
          "@type": "Offer",
          name: "Team (per seat)",
          price: "29",
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
            <span className="truncate font-semibold tracking-tight">
              Underwrite Copilot
            </span>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {[
              ["#screen", "How it works"],
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
              className="whitespace-nowrap rounded-lg bg-white px-3.5 py-1.5 text-sm font-semibold text-brand-strong transition-colors hover:bg-mint"
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
        {/* Hero — deep teal, graph-paper grid, the product floating on it. */}
        <section className="band-dark relative overflow-hidden text-white">
          <div
            aria-hidden
            className="hero-drift pointer-events-none absolute -top-24 right-[8%] h-[26rem] w-[26rem] rounded-full bg-mint/10 blur-3xl"
          />
          <div className="relative mx-auto max-w-6xl px-6 pb-14 pt-16 sm:pt-24">
            <div className="grid items-center gap-12 lg:grid-cols-2">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-mint">
                  <span className="h-1.5 w-1.5 rounded-full bg-mint" />
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
                <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/70 max-sm:hidden">
                  Two analysts can take the same deal on the same afternoon and
                  land 800 bps apart — different rents, different exit caps,
                  different expense loads, all called &ldquo;judgment.&rdquo;
                  Underwrite Copilot runs every deal through the same
                  disciplined screen, so the answer depends on the deal — not
                  on who opened the model.
                </p>
                <p className="mt-6 text-lg leading-relaxed text-white/70 sm:hidden">
                  Two analysts, same OM, 800 bps apart. Copilot runs every deal
                  through the same six-stage screen — so the answer depends on
                  the deal, not the analyst.
                </p>
                <div className="mt-8 flex flex-wrap items-center gap-3">
                  <Link
                    href="/login?mode=signup"
                    className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-strong transition-colors hover:bg-mint"
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
                  Go / Caution / No-Go in minutes. First 3 deals free · no
                  card.
                </p>
              </div>

              {/* Product preview */}
              <div>
                <DealPreview />
                <p className="mt-4 text-center text-[11px] text-white/40">
                  Illustrative sample deal — not a real listing.
                </p>
              </div>
            </div>

            {/* Stat strip — the screen, quantified. */}
            <dl className="mt-16 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-white/10 pt-8 sm:grid-cols-4">
              {STATS.map((st) => (
                <div key={st.label}>
                  <dt className="sr-only">{st.label}</dt>
                  <dd className="font-mono text-3xl font-semibold tabular-nums text-mint">
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
                    6%
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    Analyst B · IRR · &ldquo;pass&rdquo;
                  </p>
                </div>
                <span className="mb-1 hidden rounded-full bg-caution/10 px-3 py-1 text-xs font-semibold text-caution sm:block">
                  800 bps apart
                </span>
                <div className="text-right">
                  <p className="font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
                    14%
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
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface p-5 shadow-card">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Analyst B</span>
                  <span className="rounded-full bg-kill/10 px-2.5 py-1 text-xs font-medium text-kill">
                    Pass · 6% IRR
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
                    Buy · 14% IRR
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
              What happens to every OM you upload.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              A first read — headline numbers and buy-box fit — lands in about
              half a minute, while the six deeper stages keep working.
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
                verdict — comes back in minutes.
              </p>
              <p className="text-sm font-semibold text-mint transition-transform group-hover:translate-x-0.5">
                Screen a deal free →
              </p>
            </Link>
          </div>
        </section>

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
                      First-draft Excel model, alive
                    </h3>
                    <span className="rounded-full bg-faint px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      Sample
                    </span>
                  </div>
                  <p className="mt-1 max-w-md text-xs leading-relaxed text-muted">
                    Not a static report — the workbook carries live formulas.
                    Edit the tinted inputs and IRR, equity multiple, and the
                    whole cash flow recalculate.
                  </p>
                  <div className="mt-auto pt-4">
                  <div className="overflow-hidden rounded-lg border border-line font-mono text-[11px]">
                    <div className="grid grid-cols-4 border-b border-line bg-faint px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted">
                      <span className="col-span-2">Input</span>
                      <span className="text-right">Value</span>
                      <span className="text-right">Effect</span>
                    </div>
                    {[
                      ["Purchase price", "$70.7M", "IRR 8.7%"],
                      ["Exit cap", "5.50%", "IRR 8.7%"],
                      ["Exit cap (flexed)", "5.75%", "IRR 7.1%"],
                      ["Rent growth (flexed)", "3.0%", "IRR 7.6%"],
                    ].map(([k, v, e], i) => (
                      <div
                        key={k}
                        className={`grid grid-cols-4 px-3 py-1.5 ${i >= 2 ? "bg-caution/5" : "bg-surface"}`}
                      >
                        <span className="col-span-2 text-muted">{k}</span>
                        <span
                          className={`text-right tabular-nums ${i !== 0 ? "bg-[#fdf6e7] px-1" : ""}`}
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
                      ["Preston Creek", "Genuine support", "text-pass bg-pass/10"],
                      ["Lakeline Commons", "Leans favorable", "text-caution bg-caution/10"],
                      ["Axis on Fifth", "Stretched", "text-kill bg-kill/10"],
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
                    {[
                      ["Exit cap", "you 5.75 · OM 5.25", "+50 bps"],
                      ["Yr-1 rents", "you $1.41k · OM $1.54k", "−8.4%"],
                    ].map(([k, v, d]) => (
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
                    same pipeline, with the same verdicts. $29/seat.
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
                      <span className="font-semibold text-pass">−$1.8M (−2.5%)</span>
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
            <p className="text-xs font-medium uppercase tracking-wider text-mint/90">
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
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/12 text-mint ring-1 ring-white/20">
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
                  The full screen, on your next three deals.
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
                  <span className="text-4xl font-semibold tracking-tight">$39</span>
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
                  <span className="text-4xl font-semibold tracking-tight">$29</span>
                  <span className="text-sm text-muted">/seat/month</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  One shared pipeline for the whole shop.
                </p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {[
                    "Everything in Pro, for every member",
                    "One shared pipeline — same deals, same verdicts",
                    "Invite teammates with a link",
                    "Billing follows your seat count automatically",
                    "3 shared deals free to try it",
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
            <p className="text-xs font-medium uppercase tracking-wider text-mint/90">
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
                className="rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-strong transition-colors hover:bg-mint"
              >
                Screen your first deal free
              </Link>
            </div>
            <p className="mt-4 text-xs text-white/50">
              First 3 deals free · no credit card
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
          <p className="mx-auto max-w-6xl px-6 py-4 text-xs text-muted">
            © 2026 Underwrite Copilot. A first-pass screen, not investment
            advice.
          </p>
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
      <div className="absolute -inset-8 -z-10 rounded-[3rem] bg-mint/15 blur-3xl" />
      <div
        className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl border border-white/10 bg-white/[0.04]"
        aria-hidden
      />
      <div className="shadow-float relative rounded-2xl border border-line bg-surface p-5 text-ink">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-sm font-medium">The Maddox at Highland Park</p>
            <p className="text-xs text-muted">
              Multifamily · 248 units · North Dallas
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
            $285k/unit is 12% above the last two comparable trades with no
            renovation premium to justify it.
          </p>
        </div>
      </div>
    </div>
  );
}
