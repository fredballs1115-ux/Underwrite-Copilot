import type { ReactNode } from "react";

/**
 * "How to read this screen" — shown only on the sample deal: the reading
 * order as three marked steps with one phrase each, and one line on what
 * the sample is. Each step opens its section where the page hands in its
 * navigation: they were drawn as white cards with icons that did nothing
 * when tapped (research pass 32). No state of its own.
 */
const STEPS: { title: string; hint: string; icon: ReactNode; to: string }[] = [
  {
    to: "verdict",
    title: "Verdict",
    hint: "The call, and where it flips",
    icon: <path d="M20 6 9 17l-5-5" />,
  },
  {
    to: "financials",
    title: "Financials",
    hint: "Terms, debt, the Excel model",
    icon: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18" />
        <path d="M9 4v16" />
      </>
    ),
  },
  {
    to: "challenger",
    title: "Deep dives",
    hint: "Challenges, comps, market, reconciler",
    icon: (
      <>
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </>
    ),
  },
];

export function SampleGuide({ onNavigate }: { onNavigate?: (key: string) => void } = {}) {
  return (
    <section className="rounded-2xl border border-brand/25 bg-brand/[0.04] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          How to read this screen
        </h2>
        <p className="text-xs text-muted">
          An invented deal on real Brewerytown rules and records.
        </p>
      </div>
      <ol className="mt-3 grid gap-2 sm:grid-cols-3">
        {STEPS.map((s) => {
          const body = (
            <>
              <span
                aria-hidden
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand/10 text-brand"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4"
                >
                  {s.icon}
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{s.title}</span>
                <span className="block truncate text-xs text-muted">{s.hint}</span>
              </span>
            </>
          );
          return (
            <li key={s.title}>
              {onNavigate ? (
                <button
                  type="button"
                  data-guide-step={s.to}
                  onClick={() => onNavigate(s.to)}
                  className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-brand/40 hover:bg-brand/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  {body}
                </button>
              ) : (
                <div className="flex items-center gap-3 px-3 py-2">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
