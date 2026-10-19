import type { ReactNode } from "react";
import type { ScreenStageKey } from "@/lib/screen-stages";

// The screen's six stages as icons, named and ordered as the deal page's
// progress rail names them (lib/screen-stages, which a test holds to the
// rail): the first pass on the headline figures, then the extraction, the
// challenger, the broker comps, the market check and the verdict. The
// homepage's stage rail draws them, and so does every empty state that
// stands for one of the stages (EmptyState's `icon`). No "use client": a
// server page and a client section import the same elements.

function StageSvg({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
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

const STAGE_PATHS: Record<ScreenStageKey, ReactNode> = {
  signal: <path d="M13 2 4 14h7l-1 8 9-12h-7z" />,
  extract: (
    <>
      <path d="M6 2h9l5 5v15H6z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6M9 17h6" />
    </>
  ),
  challenge: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2" />
    </>
  ),
  comps: <path d="M4 20v-9M10 20V5M16 20v-6M2 20h20" />,
  market: (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ),
  verdict: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 4.5-5" />
    </>
  ),
};

/** One stage's icon at any size (`className` sets it; "h-5 w-5" by default),
 *  decorative (`aria-hidden`): the words beside it name the stage. */
export function StageIcon({ stage, className }: { stage: ScreenStageKey; className?: string }) {
  return <StageSvg className={className}>{STAGE_PATHS[stage]}</StageSvg>;
}

/** The six at the homepage rail's size, keyed by stage. */
export const STAGE_ICON: Record<ScreenStageKey, ReactNode> = {
  signal: <StageIcon stage="signal" />,
  extract: <StageIcon stage="extract" />,
  challenge: <StageIcon stage="challenge" />,
  comps: <StageIcon stage="comps" />,
  market: <StageIcon stage="market" />,
  verdict: <StageIcon stage="verdict" />,
};
