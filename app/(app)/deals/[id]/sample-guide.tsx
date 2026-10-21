import type { MouseEvent, ReactNode } from "react";
import { STRESS_TEST_ANCHOR } from "./stress-chip";

/**
 * "How to read this screen" — shown only on the sample deal: the reading
 * order as marked steps with one phrase each, and one line on what the
 * sample is. The stress test leads, since it is the product: the guide sits
 * on the Overview just above its panel, so that step scrolls to the panel
 * (`STRESS_TEST_ANCHOR`) and hands it the focus, as the header's chip's
 * jump does. Each other step opens its section where the
 * page hands in its navigation: they were drawn as white cards with icons
 * that did nothing when tapped (research pass 32). No state of its own.
 */
type Step = { title: string; hint: string; icon: ReactNode };

const STRESS_STEP: Step = {
  title: "The stress test",
  hint: "Each key assumption against its evidence",
  icon: (
    <>
      <path d="M4 20V10" />
      <path d="M10 20V4" />
      <path d="M16 20v-7" />
      <path d="M3 20h18" />
    </>
  ),
};

const STEPS: (Step & { to: string })[] = [
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

/** The panel sits just below: scroll to it and hand it the focus, so a
 *  keyboard carries on from the panel (its wrapper is `tabIndex={-1}`). */
function jumpToStressTest(e: MouseEvent<HTMLButtonElement>) {
  const panel = document.getElementById(STRESS_TEST_ANCHOR);
  if (!panel) return;
  e.preventDefault();
  panel.scrollIntoView({ block: "start" });
  panel.focus({ preventScroll: true });
}

const STEP_CARD =
  "flex h-full w-full items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2 text-left transition-colors hover:border-brand/40 hover:bg-brand/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";

function StepBody({ step }: { step: Step }) {
  return (
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
          {step.icon}
        </svg>
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{step.title}</span>
        <span className="block text-pretty text-xs text-muted">{step.hint}</span>
      </span>
    </>
  );
}

export function SampleGuide({
  onNavigate,
  stressTest = true,
}: {
  onNavigate?: (key: string) => void;
  /** the stress test's panel is drawn on this Overview, so its step has a
   *  target — the sample always has one, so a caller that says nothing
   *  gets the step */
  stressTest?: boolean;
} = {}) {
  return (
    <section className="rounded-2xl border border-brand/25 bg-brand/[0.04] px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">
          How to read this screen
        </h2>
        {/* The building is invented, so it has no photograph: the header
            leads with the one its market is known by, captioned "Market
            photo" — said here, so a first reader does not take the skyline
            for the building or a missing photograph for a broken one. No
            parcel or owner is looked up for it (lib/public-record-subject),
            so the line claims the rules and the market's figures, never
            records. */}
        <p className="text-xs text-ink/75">
          An invented building with fictional comps, read against Philadelphia’s real rules and market figures; the photo is its market’s.
        </p>
      </div>
      {/* Two steps a row from sm, all of them in one row once the column
          is wide enough that each hint keeps to a line or two. */}
      <ol className={`mt-3 grid gap-2 sm:grid-cols-2 ${stressTest ? "xl:grid-cols-4" : "xl:grid-cols-3"}`}>
        {stressTest && (
          <li className="min-w-0">
            {/* A button, not a "#stress-test" link: a caller that draws the
                guide before its panel's data has arrived (the homepage's
                walkthrough) would hand the page a link to an id it lacks. */}
            <button type="button" data-guide-step={STRESS_TEST_ANCHOR} onClick={jumpToStressTest} className={STEP_CARD}>
              <StepBody step={STRESS_STEP} />
            </button>
          </li>
        )}
        {STEPS.map((s) => (
          // min-w-0: a grid item holds its widest line, so at 320px the
          // cards spilled past the column (research pass 33). The hint
          // wraps rather than truncates: at 1280 a third of the column
          // had cut it to an ellipsis.
          <li key={s.title} className="min-w-0">
            {onNavigate ? (
              <button type="button" data-guide-step={s.to} onClick={() => onNavigate(s.to)} className={STEP_CARD}>
                <StepBody step={s} />
              </button>
            ) : (
              <div className="flex items-center gap-3 px-3 py-2">
                <StepBody step={s} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
