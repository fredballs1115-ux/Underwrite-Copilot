import Link from "next/link";

// Landing page — a React Server Component (zero client JS, no secrets).

const STEPS = [
  {
    n: 1,
    title: "Extract & flag",
    body: "Every term out of the OM — price, NOI, caps, rents, financing — with the forward-looking figures flagged to verify against source.",
  },
  {
    n: 2,
    title: "Challenge the assumptions",
    body: "Red-team the pro forma like an investment committee, with the exact question to put to the broker for each challenge, plus a stress test.",
  },
  {
    n: 3,
    title: "Scrutinize the broker comps",
    body: "Pull the sale and lease comps out of the OM itself and flag the cherry-picking — stale comps, only the best submarkets, weak trades omitted.",
  },
  {
    n: 4,
    title: "Reconcile your model",
    body: "Upload your ARGUS export or Excel model and surface the gap between what the OM claims and what your underwriting says.",
  },
  {
    n: 5,
    title: "Sanity-check the market",
    body: "Are the rent and cap assumptions even plausible? A gut-check against market norms — clearly rules-of-thumb, not pulled comps.",
  },
  {
    n: 6,
    title: "Get the verdict",
    body: "One screen synthesizing all of it: pass, caution, or kill — with the top risks and the next steps if you pursue.",
  },
];

const DIFFERENTIATORS = [
  {
    title: "It argues with the deal",
    body: "Extraction tools read the OM. Underwrite Copilot red-teams it — the way the sharpest person in your IC would.",
  },
  {
    title: "It reconciles your model",
    body: "Upload your own numbers and see exactly where the OM and your underwriting diverge. That gap is where deals live or die.",
  },
  {
    title: "No data licensing",
    body: "Comp scrutiny reads the comps out of the OM itself — so it's instant and self-serve, not gated behind an enterprise data deal.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
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
              For analysts, not enterprises
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
              Screen a CRE deal from every angle — in minutes, not a weekend.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Underwrite Copilot doesn&apos;t just read an offering memorandum.
              It argues with it the way an investment committee would,
              reconciles it against your own model, and tells you whether the
              deal earns more of your time.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
              >
                Get started free
              </Link>
              <Link
                href="#loop"
                className="rounded-lg border border-line bg-surface px-5 py-2.5 text-sm font-medium transition-colors hover:bg-faint"
              >
                See how it works
              </Link>
            </div>
            <p className="mt-5 text-sm text-muted">
              Self-serve · upload a PDF · first-pass screen in one place.
            </p>
          </div>

          {/* Product preview */}
          <DealPreview />
        </section>

        {/* The loop */}
        <section id="loop" className="border-y border-line bg-faint">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <p className="text-xs font-medium uppercase tracking-wider text-muted">
              The whole loop — one deal
            </p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight">
              Six passes over the same offering memorandum.
            </h2>
            <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {STEPS.map((s) => (
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
          </div>
        </section>

        {/* Why different */}
        <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <h2 className="max-w-2xl text-2xl font-semibold tracking-tight">
            The part the enterprise tools skip.
          </h2>
          <div className="mt-8 grid gap-8 sm:grid-cols-3">
            {DIFFERENTIATORS.map((d) => (
              <div key={d.title}>
                <div className="h-px w-10 bg-brand" />
                <h3 className="mt-4 font-medium">{d.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {d.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* CTA band */}
        <section className="border-t border-line bg-faint">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-5 px-6 py-14 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">
                Put your next OM through it.
              </h2>
              <p className="mt-1 text-sm text-muted">
                Create an account and screen your first deal in minutes.
              </p>
            </div>
            <Link
              href="/login"
              className="rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
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
      <div className="rounded-2xl border border-line bg-surface p-5 shadow-xl shadow-brand/5">
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

        <div className="mt-4 grid grid-cols-3 gap-2">
          {[
            { k: "Going-in cap", v: "5.45%", flag: false },
            { k: "Pro forma cap", v: "6.75%", flag: true },
            { k: "Exit cap", v: "5.25%", flag: true },
          ].map((m) => (
            <div key={m.k} className="rounded-lg bg-faint px-2.5 py-2">
              <p className="text-[11px] text-muted">
                {m.k}
                {m.flag && <span className="ml-0.5 text-caution">⚑</span>}
              </p>
              <p className="mt-0.5 font-mono text-sm font-medium tabular-nums">
                {m.v}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-lg border border-line border-l-4 border-l-kill bg-paper p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Exit cap compression</span>
            <span className="ml-auto rounded-full bg-kill/10 px-2 py-0.5 text-[10px] font-medium uppercase text-kill">
              High
            </span>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            20 bps of compression vs. going-in, with no thesis for it.
          </p>
          <p className="mt-1.5 text-xs leading-relaxed">
            <span className="font-medium">Ask the broker:</span>{" "}
            <span className="text-muted">
              what supports a 5.25% exit in year five?
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
