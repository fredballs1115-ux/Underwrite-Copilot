import Link from "next/link";
import type { ReactNode } from "react";
import { DealHero } from "@/app/(app)/deals/[id]/deal-hero";
import { photographerParts } from "@/lib/credit-parts";
import type { HeaderFacts } from "@/lib/sample-header";
import { SampleMarketPicture } from "./sample-market-picture";

/**
 * The sample deal's header on a public page: the deal page's own `DealHero`
 * (app/(app)/deals/[id]/deal-hero.tsx) on the facts lib/sample-header reads
 * through the deal page's readers, with the deal page's chips, its market
 * photograph as the deal page draws it, and its tool row. Nothing on it is
 * drawn for the public page alone.
 *
 * Server-rendered. What a visitor cannot reach is left off rather than
 * imitated: the deal's state (offers due, the stage, the menu) is the
 * reader's own, and the aerial and the map views are signed-in routes.
 */
export function SampleDealHero({
  header,
  tools = <SampleHeroTools />,
  titleAs = "h1",
  stamp = false,
}: {
  header: HeaderFacts;
  /** the tool row under the facts; the sample's public downloads by default */
  tools?: ReactNode;
  /** the name's heading level, an h2 under a page's own h1 */
  titleAs?: "h1" | "h2";
  /** the homepage's one flourish: the call stamps in on load (`stamp-in`,
   *  skipped under reduced motion) around the deal page's own chip */
  stamp?: boolean;
}) {
  const { pill, fit, market } = header;
  // The deal page's chips, class for class (page.tsx, `DealHero`'s chips).
  const call = pill ? (
    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${pill.cls}`} title={pill.note}>
      {pill.label}
    </span>
  ) : null;
  return (
    <DealHero
      title={header.title}
      titleAs={titleAs}
      chips={
        <>
          {call && stamp ? <span className="stamp-in inline-flex">{call}</span> : call}
          {fit && (
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${fit.cls}`} title={fit.note}>
              {fit.label}
            </span>
          )}
        </>
      }
      subtitle={header.subtitle}
      figures={header.figures}
      picture={
        market ? (
          <SampleMarketPicture
            label={header.pictureLabel}
            src={market.src}
            alt={`${market.place}: the market this deal is in, ${market.name}. No photograph of the building yet.`}
            market={market.name}
            credit={photographerParts(market.author, market.license, true)}
          />
        ) : null
      }
      actions={tools}
    />
  );
}

/** A tool in the deal header's row, in the deal page's own classes. */
export const HERO_TOOL =
  "flex items-center gap-1.5 rounded-lg border border-line bg-surface py-1.5 pl-2.5 pr-3 text-xs font-medium shadow-sm transition-colors hover:bg-faint";

function ToolIcon({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 text-muted"
      aria-hidden
    >
      {children}
    </svg>
  );
}

/** Said in each document's tooltip: the sample's copy is free, a deal of
 *  your own's is Pro — so the row wears no "Pro" mark on a download that
 *  costs nothing (audit C7, L10), and the homepage's artifact tiles, which
 *  describe the exports on a deal of your own, keep theirs. */
export const SAMPLE_DOWNLOAD_NOTE = "Free for the sample; Pro on a deal of your own.";

/**
 * The deal header's five tools on the sample: the three documents — here
 * the sample's own public downloads, which are free, so they carry no "Pro"
 * mark (their tooltips say a deal of your own's are Pro) — then the rent
 * roll engine and the valuations reconciler, which work on a deal of your
 * own, so they open the sign-up.
 */
export function SampleHeroTools() {
  return (
    <>
      <a href="/api/demo/memo" title={`One-page IC screening memo — verdict, buy-box fit, flags, next steps. ${SAMPLE_DOWNLOAD_NOTE}`} className={HERO_TOOL}>
        <ToolIcon>
          <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
          <path d="M15 2v5h5" />
          <path d="M10 12h4" />
          <path d="M10 16h4" />
        </ToolIcon>
        IC memo
      </a>
      <a
        href="/api/demo/report"
        title={`The full screening report — memo plus every term, challenge, comp, and market check. ${SAMPLE_DOWNLOAD_NOTE}`}
        className={HERO_TOOL}
      >
        <ToolIcon>
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </ToolIcon>
        Full report
      </a>
      <a
        href="/api/demo/underwrite.xlsx"
        title={`Institutional acquisition model (Excel) — live formulas; change the exit cap and levered IRR recalculates. ${SAMPLE_DOWNLOAD_NOTE}`}
        className={HERO_TOOL}
      >
        <ToolIcon>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
        </ToolIcon>
        Underwrite model
      </a>
      <Link
        href="/login?mode=signup"
        title="Rent roll engine — WALT, rollover, mark-to-market, and a live-formula Excel model — on a deal of your own"
        className={HERO_TOOL}
      >
        <ToolIcon>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M3 10h18M9 4v16" />
        </ToolIcon>
        Rent roll
      </Link>
      <Link
        href="/login?mode=signup"
        title="BOV reconciler — decompose the gap between two opinions of value — on a deal of your own"
        className={HERO_TOOL}
      >
        <ToolIcon>
          <path d="M12 3v18M5 8l7-5 7 5" />
          <path d="M3 12h6l-3 6-3-6zM15 12h6l-3 6-3-6z" />
        </ToolIcon>
        Valuations
      </Link>
    </>
  );
}
