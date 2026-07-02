import Link from "next/link";

// Landing page — a React Server Component (zero client JS, no secrets).
// The pitch is consistency: same deal in, same answer out.

const SCREEN = [
  {
    n: 1,
    title: "Anchor on the address",
    body: "Start from the asset and its market — not the broker's narrative. The deck is an argument; the screen begins with the facts.",
  },
  {
    n: 2,
    title: "Ranges, not hero numbers",
    body: "Pull rent, expense load, and cap as low–base–high. A 10% drift hides inside a single number and reads fine in a sentence.",
  },
  {
    n: 3,
    title: "Stress the three deal-killers",
    body: "Basis, exit, debt — in that order, before anything else. The deal usually dies on one of the three, so look there first.",
  },
  {
    n: 4,
    title: "Show the work",
    body: "Every figure traces back to a named source. No black-box numbers, nothing you can't defend in front of an IC.",
  },
  {
    n: 5,
    title: "Go / No-Go before the model",
    body: "A reproducible verdict first. Open the spreadsheet only for the deals that have already earned the time.",
  },
];

const PILLARS = [
  {
    title: "Deterministic math",
    body: "The cash-flow and return math is real code, not a language model guessing. Same inputs, same output, every run.",
  },
  {
    title: "Sourced ranges",
    body: "Every assumption is a range tied to where it came from — a comp, a market norm, or the OM page — never a lone hero number.",
  },
  {
    title: "Reproducible verdict",
    body: "The same deal produces the same screen, whoever runs it. Your rigor stops depending on who opened the model that day.",
  },
];

const FREE_FEATURES = [
  "3 deals, the full six-step screen on each",
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
    a: "Just an offering memorandum as a PDF. Upload it and the six-step screen runs on its own — extraction, assumption challenges, comp scrutiny, market check, and a verdict. Add a rent roll, T-12, or loan terms later to deepen the model. You can also explore a fully-worked sample deal before uploading anything.",
  },
  {
    q: "Where do the numbers come from?",
    a: "Every figure traces to a named source — an OM page, your rent roll, a market norm — and conflicting sources are reconciled openly (actuals beat pro forma), never silently merged. The return math is deterministic code, not a language model guessing at arithmetic.",
  },
  {
    q: "Are my documents private?",
    a: "Yes. Documents are stored in private storage with per-user isolation enforced at the database level. Your deals are visible only to you, and your documents are never shared with other users or resold.",
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
        "CRE deal screening that runs every offering memorandum through the same disciplined screen: sourced ranges, the three deal-killers, and a reproducible Go / No-Go before you open a model.",
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
        {
          "@type": "Offer",
          name: "Pro",
          price: "79",
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
      {/* Nav */}
      <header className="sticky top-0 z-10 border-b border-line/80 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">
              UC
            </div>
            <span className="font-semibold tracking-tight">
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
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:text-ink"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-ink/80 hover:text-ink"
            >
              Sign in
            </Link>
            <Link
              href="/login"
              className="rounded-lg bg-brand px-3.5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-6 py-16 sm:py-24 lg:grid-cols-2">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-brand">
              <span className="h-1.5 w-1.5 rounded-full bg-brand" />
              Consistent underwriting, every deal
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Stop underwriting like a coin flip.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Two analysts can take the same deal on the same afternoon and land
              800 bps apart — different rents, different exit caps, different
              expense loads, all called &ldquo;judgment.&rdquo; Underwrite
              Copilot runs every deal through the same disciplined screen, so the
              answer depends on the deal — not on who opened the model.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
              >
                Get started free
              </Link>
              <Link
                href="#screen"
                className="rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-medium transition-colors hover:bg-faint"
              >
                See the screen
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted">
              Self-serve · upload a PDF · a reproducible Go / No-Go before you
              open a model.
            </p>
          </div>

          {/* Product preview */}
          <DealPreview />
        </section>

        {/* The problem */}
        <section id="problem" className="scroll-mt-16 border-y border-line bg-faint">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              The hidden risk
            </p>
            <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight">
              Your best analyst is also your single point of failure.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Nobody&apos;s lying. They just pulled different numbers and called
              it judgment. That&apos;s not analysis — it&apos;s a coin flip with
              a spreadsheet attached, and it means your underwriting quality is
              whoever happened to open the model that day.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-line bg-surface p-5">
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
              <div className="rounded-xl border border-line bg-surface p-5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">Analyst B</span>
                  <span className="rounded-full bg-kill/10 px-2.5 py-1 text-xs font-medium text-kill">
                    Pass · 6% IRR
                  </span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  Same deal, same afternoon — conservative rents, flat exit, a
                  real expense load.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* The 5-step screen */}
        <section id="screen" className="scroll-mt-16 mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            The 5-step screen
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Run this before anyone touches a model.
          </h2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SCREEN.map((s) => (
              <div
                key={s.n}
                className="rounded-xl border border-line bg-surface p-5 transition-shadow hover:shadow-md"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
                  {s.n}
                </div>
                <h3 className="mt-3 font-medium">{s.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Precision, not language */}
        <section className="border-y border-line bg-faint">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              Why not just ChatGPT?
            </p>
            <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight">
              Underwriting is a precision problem, not a language problem.
            </h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
              Raw LLMs give answers that look right. But a 10% drift reads
              perfectly fine in a sentence while it quietly kills the deal. So we
              put a deterministic workflow on top of the AI — one that shows its
              work.
            </p>
            <div className="mt-8 grid gap-8 sm:grid-cols-3">
              {PILLARS.map((p) => (
                <div key={p.title}>
                  <div className="h-px w-10 bg-brand" />
                  <h3 className="mt-4 font-medium">{p.title}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted">
                    {p.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="scroll-mt-16 mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            Pricing
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">
            Start free. Upgrade when the screen earns it.
          </h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:max-w-3xl">
            {/* Free */}
            <div className="shadow-card flex flex-col rounded-2xl border border-line bg-surface p-6">
              <p className="text-sm font-semibold">Free</p>
              <p className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">$0</span>
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
                href="/login"
                className="mt-6 rounded-lg border border-line px-4 py-2.5 text-center text-sm font-medium transition-colors hover:bg-faint"
              >
                Get started free
              </Link>
            </div>

            {/* Pro */}
            <div className="shadow-float relative flex flex-col rounded-2xl border-2 border-brand bg-surface p-6">
              <span className="absolute -top-3 left-6 rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-semibold text-white">
                For active pipelines
              </span>
              <p className="text-sm font-semibold">Pro</p>
              <p className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-semibold tracking-tight">$79</span>
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
                href="/login"
                className="mt-6 rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-brand-strong"
              >
                Start with Pro
              </Link>
            </div>
          </div>
          <p className="mt-5 text-xs text-muted">
            Cancel anytime · billed monthly through Stripe · no card required for
            Free.
          </p>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16 border-y border-line bg-faint">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              FAQ
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              The questions we&apos;d ask too.
            </h2>
            <div className="mt-8 max-w-3xl divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              {FAQ.map((f) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4 text-sm font-medium transition-colors hover:bg-faint [&::-webkit-details-marker]:hidden">
                    {f.q}
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
                  <p className="px-5 pb-4 text-sm leading-relaxed text-muted">
                    {f.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* CTA band */}
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <div className="flex flex-col items-start gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="max-w-xl text-xl font-semibold tracking-tight">
                Make every analyst underwrite like your sharpest principal.
              </h2>
              <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-muted">
                Same rigor on every deal, no matter who&apos;s tired. That&apos;s
                how a junior screens like a principal — and how you scale past
                your own desk.
              </p>
            </div>
            <Link
              href="/login"
              className="shrink-0 rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Get started free
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-8 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-sm font-medium">Underwrite Copilot</span>
          <p className="max-w-md text-xs leading-relaxed text-muted">
            First-pass screen, not investment advice. Always verify flagged
            figures against source documents before acting.
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
      <div className="absolute -inset-4 -z-10 rounded-3xl bg-brand/5 blur-2xl" />
      <div className="shadow-float rounded-2xl border border-line bg-surface p-5">
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
              { k: "Low", v: "5.00%", e: false },
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
