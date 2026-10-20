import type { ReactNode } from "react";
import { DealHero } from "@/app/(app)/deals/[id]/deal-hero";
import { HowChip } from "@/app/(app)/deals/[id]/figure-how";
import { DEAL_TOOL_TITLE, DealTool } from "@/app/(app)/deals/[id]/header-tools";
import { StressChip } from "@/app/(app)/deals/[id]/stress-chip";
import type { StressVerdict } from "@/lib/stress-test-types";
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
  stress = null,
  children,
}: {
  header: HeaderFacts;
  /** the tool row under the facts; the sample's public downloads by default */
  tools?: ReactNode;
  /** the name's heading level, an h2 under a page's own h1 */
  titleAs?: "h1" | "h2";
  /** the homepage's one flourish: the call stamps in on load (`stamp-in`,
   *  skipped under reduced motion) around the deal page's own chip */
  stamp?: boolean;
  /** the stress test's counts beside the call, as the deal page draws them
   *  (lib/stress-test-words `verdictCounts` on the page's own test) */
  stress?: Record<StressVerdict, number> | null;
  /** the panels under the header, as the deal page draws them on the
   *  sample (DealHero's own slot) */
  children?: ReactNode;
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
          {fit &&
            (fit.how ? (
              <HowChip how={fit.how} label={fit.label}>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${fit.cls}`} title={fit.note}>
                  {fit.label}
                </span>
              </HowChip>
            ) : (
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${fit.cls}`} title={fit.note}>
                {fit.label}
              </span>
            ))}
          <StressChip counts={stress} />
        </>
      }
      subtitle={header.subtitle}
      figures={header.figures}
      facts={header.facts}
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
    >
      {children}
    </DealHero>
  );
}

/** Said in each document's tooltip: the sample's copy is free, a deal of
 *  your own's is Pro — so the row wears no "Pro" mark on a download that
 *  costs nothing (audit C7, L10), and the homepage's artifact tiles, which
 *  describe the exports on a deal of your own, keep theirs. */
export const SAMPLE_DOWNLOAD_NOTE = "Free for the sample; Pro on a deal of your own.";

/** Said in the tooltip of an engine that works on a deal of your own. */
const ON_YOUR_OWN = " — on a deal of your own";

/**
 * The deal header's tools on the sample, drawn by the deal page's own
 * `DealTool` (app/(app)/deals/[id]/header-tools) in the signed-in sample's
 * order: the three documents — here the sample's own public downloads,
 * which are free, so they carry no "Pro" mark (their tooltips say a deal of
 * your own's are Pro, as the signed-in sample's carry none) — then the rent
 * roll engine and the valuations reconciler, which work on a deal of your
 * own, so they open the sign-up.
 */
export function SampleHeroTools() {
  return (
    <>
      <DealTool kind="memo" href="/api/demo/memo" title={`${DEAL_TOOL_TITLE.memo}. ${SAMPLE_DOWNLOAD_NOTE}`} />
      <DealTool kind="report" href="/api/demo/report" title={`${DEAL_TOOL_TITLE.report}. ${SAMPLE_DOWNLOAD_NOTE}`} />
      <DealTool kind="model" href="/api/demo/underwrite.xlsx" title={`${DEAL_TOOL_TITLE.model}. ${SAMPLE_DOWNLOAD_NOTE}`} />
      <DealTool kind="rentRoll" href="/login?mode=signup" title={`${DEAL_TOOL_TITLE.rentRoll}${ON_YOUR_OWN}`} page />
      <DealTool kind="valuations" href="/login?mode=signup" title={`${DEAL_TOOL_TITLE.valuations}${ON_YOUR_OWN}`} page />
    </>
  );
}
