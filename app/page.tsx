import Link from "next/link";

// The landing page. This is a React Server Component (the default in the App
// Router): it renders to HTML on the server, ships zero JavaScript for this
// page, and never touches your API keys.

const STEPS = [
  {
    n: 1,
    title: "Extract & flag",
    body: "Pull every term out of the offering memorandum — price, NOI, cap rates, rents, financing — and flag the figures you must verify against the source.",
  },
  {
    n: 2,
    title: "Challenge the assumptions",
    body: "Red-team the pro forma the way an investment committee would, with the exact question to put to the broker for each challenge, plus a stress test.",
  },
  {
    n: 3,
    title: "Scrutinize the broker comps",
    body: "Pull the sale and lease comps out of the OM itself, rate whether each actually supports the price, and flag the cherry-picking — stale comps, only the best submarkets shown, weak trades omitted.",
  },
  {
    n: 4,
    title: "Reconcile your model",
    body: "Upload your own ARGUS export or Excel model and surface the gap between what the OM claims and what your underwriting says. The differentiator.",
  },
  {
    n: 5,
    title: "Sanity-check the market",
    body: "Are the rent and cap-rate assumptions even plausible? A gut-check against market norms — flagged clearly as rules-of-thumb, not pulled comps.",
  },
  {
    n: 6,
    title: "Get the verdict",
    body: "One screen synthesizing all of it: pass, caution, or kill — with the top risks and the next steps if you decide to pursue.",
  },
];

export default function Home() {
  return (
    <div className="flex flex-1 flex-col">
      {/* Top bar */}
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-sm font-semibold text-white">
              UC
            </div>
            <span className="font-semibold tracking-tight">
              Underwrite Copilot
            </span>
          </div>
          <Link
            href="/login"
            className="text-sm font-medium text-brand hover:text-brand-strong"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto w-full max-w-5xl flex-1 px-6">
        <section className="py-20 sm:py-28">
          <span className="inline-flex items-center gap-2 rounded-full bg-brand/10 px-3 py-1 text-xs font-medium text-brand">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Private beta
          </span>
          <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            Screen a CRE deal from every angle — in minutes, not a weekend.
          </h1>
          <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
            Underwrite Copilot doesn&apos;t just read an offering memorandum. It
            argues with it the way an investment committee would, reconciles it
            against your own model, and tells you whether the deal earns more of
            your time.
          </p>
          <p className="mt-6 text-sm text-muted">
            Built for the analysts and small acquisitions shops the enterprise
            tools don&apos;t serve.
          </p>
          <div className="mt-8">
            <Link
              href="/login"
              className="inline-flex items-center rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-strong"
            >
              Get started free
            </Link>
          </div>
        </section>

        {/* The six-step loop */}
        <section className="pb-20">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            The whole loop — one deal
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((s) => (
              <div
                key={s.n}
                className="rounded-xl border border-line bg-surface p-5"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-brand/10 text-sm font-semibold text-brand">
                  {s.n}
                </div>
                <h2 className="mt-3 font-medium">{s.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {s.body}
                </p>
              </div>
            ))}
            <div className="flex flex-col justify-center rounded-xl border border-dashed border-line p-5">
              <p className="text-sm leading-relaxed text-muted">
                Save your deals and return to them anytime. Accounts and saved
                history ship in v1, too.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-line">
        <div className="mx-auto max-w-5xl px-6 py-6">
          <p className="text-xs leading-relaxed text-muted">
            First-pass screen, not investment advice. Always verify flagged
            figures against source documents before acting.
          </p>
        </div>
      </footer>
    </div>
  );
}
