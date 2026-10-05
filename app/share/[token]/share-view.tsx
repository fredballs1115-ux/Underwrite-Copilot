import Link from "next/link";
import { placedByClause } from "@/lib/placed-by";
import { firstSentence } from "@/lib/first-sentence";
import { screenedOn, type BehindWhy } from "@/lib/screen-run";
import { liveReadFailedLine } from "@/lib/market-read-failed";
import { basePosition, rangeInOrder } from "@/lib/verdict-range";
import type {
  BrokerCompsResult,
  ExtractionResult,
  FirstSignal,
  MarketResult,
  VerdictCall,
  VerdictResult,
  VerdictScenario,
} from "@/lib/anthropic/types";
import { assetClassLabel } from "@/lib/asset-class";
import { countNounOf, screenYearOf } from "@/lib/criteria";
import { askingPriceOf, inferStrategy, planSummary, planWithBasisChecked } from "@/lib/deal-strategy";
import { dealTypeLabel, interestOf, readInterest } from "@/lib/interest";
import { assumableLine, readAssumable } from "@/lib/assumable-debt";
import { sellerFinancingDocLine } from "@/lib/seller-financing";
import { InterestPanel } from "@/app/interest-panel";
import { AffordablePanel } from "@/app/affordable-panel";
import { readAffordable } from "@/lib/affordable";
import { RegulationPanel } from "@/app/regulation-panel";
import type { RegulationRead } from "@/lib/rent-regulation";
import { SingleTenantPanel } from "@/app/single-tenant-panel";
import { readSingleTenant } from "@/lib/single-tenant";
import { HotelPanel } from "@/app/hotel-panel";
import { StudentHousingPanel } from "@/app/student-housing-panel";
import { readStudentHousing } from "@/lib/student-housing";
import { ManufacturedHousingPanel } from "@/app/manufactured-housing-panel";
import { readManufacturedHousing } from "@/lib/manufactured-housing";
import { SelfStoragePanel } from "@/app/self-storage-panel";
import { readSelfStorage } from "@/lib/self-storage";
import { ForwardPanel } from "@/app/forward-panel";
import { readForwardPurchase } from "@/lib/forward-purchase";
import { MixedUsePanel } from "@/app/mixed-use-panel";
import { readMixedUse } from "@/lib/mixed-use";
import { GoingConcernPanel } from "@/app/going-concern-panel";
import { readGoingConcern } from "@/lib/going-concern";
import { CondoPanel } from "@/app/condo-panel";
import { readCondo } from "@/lib/condo";
import { SandwichPanel } from "@/app/sandwich-panel";
import { readSandwichLease } from "@/lib/sandwich-lease";
import { SalePanel } from "@/app/sale-panel";
import { RosterPanel } from "@/app/roster-panel";
import { readRoster } from "@/lib/tenant-roster";
import { ValueAddPanel } from "@/app/value-add-panel";
import { readValueAdd } from "@/lib/value-add";
import { TaxAbatementPanel } from "@/app/tax-abatement-panel";
import { SiteReportsPanel } from "@/app/site-reports-panel";
import { readTaxAbatement } from "@/lib/tax-abatement";
import { readSiteReports } from "@/lib/site-reports";
import { readSale } from "@/lib/sale-terms";
import { readHotelDeal } from "@/lib/hotel-deal";
import { keyTermRows } from "@/lib/key-terms";
import { readPortfolio } from "@/lib/portfolio";
import { PortfolioCard } from "@/app/portfolio-card";
import { SharePlan } from "./plan-facts";
import { SharePicture, type SharePictureSource } from "./share-picture";

/**
 * The read-only shared screen, as pure markup. `page.tsx` is the loader: it
 * checks the token, the link's expiry and revocation and the sender's
 * access, then hands this view the deal row. Nothing here reads a clock or
 * a database, so the render tests draw it on the deal fixtures and the
 * phone walk can reach the one signed-out surface it could not before.
 *
 * Deliberately excluded: documents, notes, the buyer's buy box, and
 * anything editable — this is the page an analyst forwards to a partner or
 * lender. The box has no section here, but the call's reason and risks are
 * the verdict's own words, and the verdict is handed the box, so they can
 * name where the deal misses it; the share control says so before a link
 * is made (research pass 39).
 */
export interface ShareViewProps {
  dealName: string;
  assetClass: string | null;
  /** the link's expiry, ISO */
  expiresAt: string;
  /** the sender's latest screen has not rewritten the verdict: it failed
   *  before reaching it, is still running toward it, or stopped making
   *  progress on the way (lib/screen-run) */
  verdictStale: boolean;
  /** why, when it is stale: a failed run, a re-screen in progress, or one
   *  that stalled — never said to be running */
  staleWhy?: BehindWhy;
  /** the comp and market reads the latest screen has not rewritten either —
   *  the previous screen's, beside this run's terms */
  staleReads?: ReadonlyArray<"comps" | "market">;
  /** the building (#434): its own photograph where the deal has one, then
   *  the aerial — each a token-scoped route with its credit — and the
   *  place they picture; null when there is neither */
  picture: { sources: SharePictureSource[]; place: string } | null;
  extraction: ExtractionResult | null;
  /** the deal's first signal, which the sender's deal page reads beside the
   *  extraction to infer the deal's kind; absent on a row screened before it */
  firstSignal?: FirstSignal | null;
  comps: BrokerCompsResult | null;
  market: MarketResult | null;
  verdict: VerdictResult;
  /** FEMA's flood zone at the building, one line (lib/site-flags
   *  `floodShortLine`, #426); null for minimal hazard, no digital map or a
   *  lookup that has not answered */
  floodLine?: string | null;
  /** the rent rules that reach the building (lib/rent-regulation), read by
   *  the loader through `regulationForDeal` on its UTC day; absent or null
   *  where no rule reaches it and the memorandum names no regime */
  regulation?: RegulationRead | null;
  /** the loader's day, an ISO day: today's tick on a rent allowance's
   *  period — the view itself reads no clock */
  today?: string | null;
}

// A range's confidence, in the deal page's colours (RANGE_CONF there).
const RANGE_CONF: Record<string, { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-pass/10 text-pass" },
  medium: { label: "Med", cls: "bg-caution/10 text-caution" },
  low: { label: "Low", cls: "bg-kill/10 text-kill" },
};

// The deal page's verdict hero, reduced to its mark: the disc, the word and
// the rail in the call's colour.
const VERDICT_META: Record<
  VerdictCall,
  { label: string; cls: string; border: string; disc: string; dot: string }
> = {
  pass: { label: "Go", cls: "text-pass", border: "border-pass", disc: "bg-pass/10 text-pass", dot: "bg-pass" },
  caution: {
    label: "Caution",
    cls: "text-caution",
    border: "border-caution",
    disc: "bg-caution/10 text-caution",
    dot: "bg-caution",
  },
  pass_on: { label: "No-go", cls: "text-kill", border: "border-kill", disc: "bg-kill/15 text-kill", dot: "bg-kill" },
};
const UNKNOWN_VERDICT = {
  label: "Screened",
  cls: "text-ink",
  border: "border-line",
  disc: "bg-faint text-muted",
  dot: "bg-muted",
};

// The deal header's call pill (VERDICT_PILL on the deal page), colour for
// colour, with its words above: the chip that says the call beside the
// title. A call the header draws no pill for draws no chip.
const CALL_PILL: Record<VerdictCall, string> = {
  pass: "bg-pass/10 text-pass",
  caution: "bg-caution/10 text-caution",
  pass_on: "bg-kill/15 text-kill",
};

const LEVER_LABEL: Record<string, string> = { basis: "Basis", exit: "Exit", debt: "Debt" };
const SCENARIO_LABEL: Record<VerdictScenario["scenario"], string> = {
  conservative: "Conservative",
  base: "Base",
  sponsor: "Sponsor",
};
const SCENARIO_ORDER: VerdictScenario["scenario"][] = ["conservative", "base", "sponsor"];

function VerdictIcon({ call, className }: { call: VerdictCall | null; className?: string }) {
  const common = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2.25,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  if (call === "pass") {
    return (
      <svg {...common}>
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
    );
  }
  if (call === "pass_on") {
    return (
      <svg {...common}>
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    );
  }
  if (call === "caution") {
    return (
      <svg {...common}>
        <path d="M12 3.5L2.5 20h19L12 3.5z" />
        <path d="M12 9.5v4.5" />
        <path d="M12 17.25h.01" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <circle cx="12" cy="12" r="8.5" />
    </svg>
  );
}

/** A first sentence in the open, the rest one click away (the Market data
 *  page's fold). The whole text stays in the HTML. The first sentence is
 *  lib/first-sentence's, which never ends at an abbreviation ("D.C.") or
 *  inside parentheses. */
function Fold({ text, className = "" }: { text: string; className?: string }) {
  const { first, rest } = firstSentence(text);
  if (!rest) return <p className={className}>{text}</p>;
  return (
    <details className={className}>
      <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {first} <span className="text-[11px] font-medium text-brand">more</span>
      </summary>
      <p className="mt-1">{rest}</p>
    </details>
  );
}

export function Expired({ reason }: { reason: string }) {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-6 text-center">
      <p className="text-sm font-semibold tracking-tight">Underwrite Copilot</p>
      <h1 className="mt-4 text-2xl font-semibold tracking-tight">
        This link isn&rsquo;t available
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">{reason}</p>
      <Link
        href="/"
        className="mt-6 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
      >
        What is Underwrite Copilot?
      </Link>
    </main>
  );
}

function FlipDots({ scenarios }: { scenarios: VerdictScenario[] }) {
  const ordered = [...scenarios].sort(
    (a, b) => SCENARIO_ORDER.indexOf(a.scenario) - SCENARIO_ORDER.indexOf(b.scenario),
  );
  if (ordered.length === 0) return null;
  return (
    <ol
      aria-label="The call across the range"
      className="mt-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-0"
    >
      {ordered.map((s, i) => {
        const meta = VERDICT_META[s.call] ?? UNKNOWN_VERDICT;
        return (
          <li key={s.scenario} className="flex items-center sm:flex-1">
            {i > 0 && <span aria-hidden className="hidden h-px flex-1 bg-line sm:block" />}
            <span
              className="flex items-center gap-1.5 text-xs"
              title={s.note}
            >
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
              <span className="text-muted">{SCENARIO_LABEL[s.scenario] ?? s.scenario}</span>
              <span className={`font-semibold ${meta.cls}`}>{meta.label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** "14 published figures", "1 published figure". */
const figureCount = (n: number): string => `${n} published ${n === 1 ? "figure" : "figures"}`;

/** Whose the figures are: the last `national` of them are the nation's
 *  (the debt market, lessor rents, the insurance index, CRE prices), so a
 *  block ending in the 10-year is never called "each the metro's". */
function splitOf(b: { lines: string[]; national?: number }, local: string, each: string, none: string): string {
  const nat = Math.min(Math.max(b.national ?? 0, 0), b.lines.length);
  return nat > 0 ? `${b.lines.length - nat} ${local} and ${nat} the nation's, ${none}` : each;
}

/** Every line the nation's: none of the market's own figures was current,
 *  said so rather than "for the state of …" over the nation's lines. */
const noneOwnOf = (b: { lines: string[]; national?: number }): boolean => b.lines.length > 0 && (b.national ?? 0) >= b.lines.length;

/** Why the call on file is the previous completed screen's — one sentence
 *  for each way the sender's latest run did not reach it, said by the
 *  verdict below and carried by the call's chip beside the title. */
function previousCallNote(why: BehindWhy): string {
  return why === "running"
    ? "From the previous completed screen — the sender is re-screening this deal, and this call is replaced when the run reaches its verdict."
    : why === "stalled"
      ? "From the previous completed screen — the sender’s latest run of this deal stopped before it finished."
      : "From the previous completed screen — the sender’s latest run of this deal did not finish.";
}

/** A read the sender's latest screen has not rewritten: the previous
 *  screen's, beside this run's terms, and said so. */
function PreviousRead({ why }: { why: BehindWhy }) {
  return (
    <p className="mt-1 text-xs text-caution" data-qa="previous-read">
      {why === "running"
        ? "From the previous screen — the sender\u2019s re-screen has not reached it yet."
        : why === "stalled"
          ? "From the previous screen — the sender\u2019s latest run stopped before it."
          : "From the previous screen — the sender\u2019s latest run did not reach it."}
    </p>
  );
}

export function ShareView({
  dealName,
  assetClass,
  expiresAt,
  verdictStale,
  staleWhy = "failed",
  staleReads = [],
  picture,
  extraction,
  firstSignal = null,
  comps,
  market,
  verdict,
  floodLine = null,
  regulation = null,
  today = null,
}: ShareViewProps) {
  const vmeta = VERDICT_META[verdict.verdict] ?? UNKNOWN_VERDICT;
  const call: VerdictCall | null = VERDICT_META[verdict.verdict] ? verdict.verdict : null;
  // The day the call was written ("Sep 12, 2026"), or none for a call saved
  // before the pipeline dated one.
  const on = screenedOn(verdict.generatedAt);

  const screen = verdict.screen;
  // The deal's kind first — a partner reading "$21M stabilized NOI" beside a
  // $20M price needs to know it is a conversion's finished-project figure.
  // The sender's deal page reads it from the extraction and the first
  // signal, and so does this screen.
  const safeExtraction = extraction
    ? { ...extraction, metrics: extraction.metrics ?? [] }
    : null;
  const strategy = inferStrategy(safeExtraction, firstSignal);
  const plan = planWithBasisChecked(safeExtraction, strategy, planSummary(safeExtraction, strategy));
  // The deal-defining rows first, as the memo orders them (lib/key-terms.ts).
  // Its price row is read against the year the screen read the memorandum.
  const metrics = keyTermRows(safeExtraction?.metrics ?? [], strategy.kind, screenYearOf(safeExtraction), 8, interestOf(safeExtraction).kind);
  // The seller's loan offered for assumption (#419), as the memorandum
  // states it — the pricing against today's rate needs the model, which a
  // shared screen does not carry.
  const assumable = readAssumable(safeExtraction, null);
  // A note the seller offers to carry, as stated (#462) — on a note, the
  // financing of its purchase, said as that: the memo's one line.
  const sellerNoteLine = sellerFinancingDocLine(safeExtraction);
  // Read in numeric order (lib/verdict-range): a verdict stored when the
  // conservative end came first can hold its larger figure as "low".
  const ranges = (screen?.ranges ?? []).slice(0, 6).map(rangeInOrder);
  const killers = (screen?.dealKillers ?? []).slice(0, 3);
  // One OM, several properties (#411): the deal page's own card, read by
  // the same reader, so a partner sees what is being bought property by
  // property; nothing for a single property.
  const portfolio = readPortfolio(safeExtraction);

  return (
    <main id="main" className="mx-auto max-w-3xl px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm font-semibold tracking-tight">
          Underwrite Copilot
        </p>
        <p className="text-xs text-muted">
          Shared read-only screen · expires{" "}
          {new Date(expiresAt).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            timeZone: "UTC",
          })}
        </p>
      </header>

      {/* The call beside the name (research pass 36): the deal-kind panels
          and the building's picture come before the verdict below — up to
          eight phone screens of them — and the partner or lender the call is
          for had read every one before it. The deal header's own pill, its
          words and colours, with the day it was written; drawn dashed and
          said to be the previous screen's wherever the verdict below says
          so, never as current. */}
      <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">{dealName}</h1>
        {call && (
          <p data-qa="share-call" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span
              className={`rounded-full px-2.5 py-0.5 font-semibold ${CALL_PILL[call]}${verdictStale ? " border border-dashed border-current" : ""}`}
              title={verdictStale ? previousCallNote(staleWhy) : undefined}
            >
              <span className="sr-only">First-pass verdict: </span>
              {vmeta.label}
            </span>
            {verdictStale ? (
              <span className="text-caution">{on ? `From the previous screen, ${on}` : "From the previous screen"}</span>
            ) : on ? (
              <span className="text-muted">{`Screened ${on}`}</span>
            ) : null}
          </p>
        )}
      </div>
      <p className="mt-1 text-sm text-muted">
        {[
          extraction?.market,
          assetClassLabel(assetClass),
          // Whose strategy it is on a note or a leased fee, as the sender's
          // page header says it (lib/interest `dealTypeLabel`).
          strategy.kind !== "unknown" ? dealTypeLabel(strategy.label, safeExtraction) : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </p>

      {/* What is being sold (#414) — a note, a share, a leasehold changes
          what every figure below means; nothing for a plain fee simple.
          Read on the loader's day, as the panels below are: a note's yield
          to maturity and a position's to redemption run from it. */}
      <InterestPanel
        interest={readInterest(safeExtraction, askingPriceOf(safeExtraction), today ? new Date(`${today}T12:00:00Z`) : undefined)}
      />

      {/* A sandwich position (lib/sandwich-lease): the sublease income
          against the master rent, its cover and the master lease's term —
          the model's hold and read need the model, which the sender's deal
          page carries. Read on the loader's day. */}
      <SandwichPanel sandwich={readSandwichLease(safeExtraction, today ? new Date(`${today}T12:00:00Z`) : undefined)} />

      {/* How it is sold (#456): the starting bid, the premium on top, the
          reserve and the deadline — or who is selling, and as-is. */}
      <SalePanel sale={readSale(safeExtraction)} />

      {/* A forward purchase (lib/forward-purchase): the price at delivery,
          the clock to it and to the outside date, the deposit and the yield
          at delivery — the model's exit cap beside it needs the model, which
          the sender's deal page carries. Read on the loader's day. */}
      <ForwardPanel
        forward={readForwardPurchase(safeExtraction, today ? new Date(`${today}T12:00:00Z`) : undefined, strategy)}
        today={today}
      />

      {/* An operating business on its real estate (lib/going-concern): the
          operator's earnings against its rent, the split and the contracts. */}
      <GoingConcernPanel goingConcern={readGoingConcern(safeExtraction, today ? new Date(`${today}T12:00:00Z`) : undefined)} />

      {/* A covenant or a contract that sets the rents (#453): how much of the
          building is restricted, until when, and what the model is not. */}
      <AffordablePanel affordable={readAffordable(safeExtraction)} />

      {/* The rent rules that reach the building (lib/rent-regulation): each
          regime, the regulated share as stated and the allowance in force —
          the model's growth beside it needs the model, which the sender's
          deal page carries. */}
      <RegulationPanel regulation={regulation} today={today} />

      {/* One tenant leases the whole property (#454): the guarantor, the
          term left and the options, the increases — the lease is the deal. */}
      <SingleTenantPanel lease={readSingleTenant(safeExtraction)} />

      {/* A multi-tenant property's listed tenants (#457): the roll to the
          model's sale, the anchors in and out of it, each tenant's end. */}
      <RosterPanel roster={readRoster(safeExtraction)} />

      {/* A value-add renovation program (#460): the doors, the premium and
          its proof, the pace. */}
      <ValueAddPanel program={readValueAdd(safeExtraction)} />

      {/* A property-tax abatement (#461): when it ends, the bill today
          against the full one, and the NOI's share that goes to taxes. */}
      <TaxAbatementPanel abatement={readTaxAbatement(safeExtraction)} />

      {/* What a hotel is sold with (#455): the flag, the manager, the
          encumbrance, the PIP and the rooms. */}
      <HotelPanel hotel={readHotelDeal(safeExtraction)} />

      {/* A student building (#468): the pre-leasing against last year's,
          the beds and the walk to campus. */}
      <StudentHousingPanel student={readStudentHousing(safeExtraction)} />

      {/* A manufactured-housing park (#470): whose homes stand on the pads,
          the lot rent against the market's and the water and sewer. */}
      <ManufacturedHousingPanel park={readManufacturedHousing(safeExtraction)} />

      {/* A self-storage facility (#471): its occupancies and the in-place
          rent against the street rate. */}
      <SelfStoragePanel storage={readSelfStorage(safeExtraction)} />

      {/* A mixed-use building (lib/mixed-use): the residential and
          commercial incomes and the commercial share of the area. */}
      <MixedUsePanel mixedUse={readMixedUse(safeExtraction, today ? new Date(`${today}T12:00:00Z`) : undefined)} />

      {/* Condominium units bought in bulk (lib/condo): the buyer's share of
          the association, a year of its dues and a lender's limit on a single
          owner. */}
      <CondoPanel condo={readCondo(safeExtraction, today ? new Date(`${today}T12:00:00Z`) : undefined)} />

      {/* What the third-party reports found (#465): a tile a report, the
          Phase I's age and the seismic PML against the lenders' lines. */}
      <SiteReportsPanel reports={readSiteReports(safeExtraction)} />

      {assumable && (
        <p
          data-qa="share-assumable"
          className="mt-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm leading-relaxed shadow-sm"
        >
          {assumableLine(assumable)}
        </p>
      )}

      {/* A note the seller offers to carry (#462), as stated — the pricing
          needs the model, which the sender's deal page carries. */}
      {sellerNoteLine && (
        <p
          data-qa="share-seller-note"
          className="mt-3 rounded-xl border border-line bg-surface px-4 py-2.5 text-sm leading-relaxed shadow-sm"
        >
          {sellerNoteLine}
        </p>
      )}

      {floodLine && (
        <p
          data-qa="share-flood"
          className="mt-3 rounded-xl border border-kill/25 bg-kill/5 px-4 py-2.5 text-sm leading-relaxed text-ink shadow-sm"
        >
          {floodLine}
        </p>
      )}

      {picture && picture.sources.length > 0 && <SharePicture sources={picture.sources} place={picture.place} />}

      <section
        className={`mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm border-l-4 ${vmeta.border}`}
      >
        <p className="text-xs font-medium uppercase tracking-wider text-muted">
          First-pass verdict
          {on ? (
            <span className="normal-case tracking-normal" data-qa="verdict-date">
              {" · "}
              {on}
            </span>
          ) : null}
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${vmeta.disc}`}
          >
            <VerdictIcon call={call} className="h-5 w-5" />
          </span>
          <p className={`text-3xl font-semibold leading-none tracking-tight ${vmeta.cls}`}>
            {vmeta.label}
          </p>
        </div>
        {verdictStale && <p className="mt-2 text-xs text-caution">{previousCallNote(staleWhy)}</p>}
        {verdict.reason && (
          <p className="mt-3 text-sm leading-relaxed">{verdict.reason}</p>
        )}
        {screen && (screen.sensitivity ?? []).length > 0 && (
          <FlipDots scenarios={screen.sensitivity} />
        )}
        {(verdict.topRisks ?? []).length > 0 && (
          <ul className="mt-4 space-y-1.5" aria-label="Top risks">
            {verdict.topRisks.slice(0, 4).map((r, i) => (
              <li key={i} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-kill" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* The basis per the counting row's own noun (a hotel counting "Rooms"
          is per room), as the deal page's plan strip says it — else the
          class's; on a conversion or a development the proposed row's. */}
      <SharePlan strategy={strategy} plan={plan} noun={countNounOf(safeExtraction?.metrics ?? [], assetClass, strategy.kind).one} />

      {ranges.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">
            The screen — ranges, not hero numbers
          </h2>
          {/* The deal page's range cards, not a table: a table had to scroll
              sideways on a phone, leaving a lender with the Low column. */}
          <ul className="mt-3 grid gap-3 sm:grid-cols-2" aria-label="Screening ranges">
            {ranges.map((r, i) => {
              // The honesty markers the deal page shows on every range card:
              // the model's confidence, where the base sits inside the range
              // (drawn in one neutral colour — the higher figure is not
              // always the sponsor's end), and what drives the spread.
              const conf = RANGE_CONF[r.confidence];
              const pos = basePosition(r);
              const posLabel = "Where the base sits inside the range";
              return (
                <li key={i} className="rounded-xl border border-line p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{r.label}</p>
                    {conf && (
                      <span
                        className={`shrink-0 rounded-full px-1.5 py-px text-[10px] font-medium uppercase ${conf.cls}`}
                        title={`${conf.label} confidence`}
                      >
                        {conf.label}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line text-center">
                    <div className="bg-surface px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted">Low</p>
                      <p className="mt-0.5 text-sm tabular-nums">{r.low}</p>
                    </div>
                    {/* Opaque, so the grid's line colour never shows through
                        the tint (research pass 33). */}
                    <div className="bg-[color-mix(in_oklab,var(--color-brand)_10%,var(--color-surface))] px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted">Base</p>
                      <p className="mt-0.5 text-sm font-semibold tabular-nums text-brand">{r.base}</p>
                    </div>
                    <div className="bg-surface px-2 py-1.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted">High</p>
                      <p className="mt-0.5 text-sm tabular-nums">{r.high}</p>
                    </div>
                  </div>
                  {pos != null && (
                    <span
                      role="img"
                      aria-label={posLabel}
                      title={posLabel}
                      className="relative mt-2.5 block h-1 rounded-full bg-line"
                    >
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-brand/30"
                        style={{ width: `${pos * 100}%` }}
                      />
                      <span
                        className="absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-surface"
                        style={{ left: `${pos * 100}%` }}
                      />
                    </span>
                  )}
                  <p className="mt-2 text-xs text-muted">{r.source}</p>
                  {r.basis && <p className="mt-0.5 text-[11px] text-muted">{r.basis}</p>}
                </li>
              );
            })}
          </ul>

          {killers.length > 0 && (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {killers.map((k, i) => (
                <div key={i}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand">
                    <span
                      aria-hidden
                      className="flex h-5 w-5 items-center justify-center rounded-full bg-brand/10 text-[10px] tabular-nums"
                    >
                      {i + 1}
                    </span>
                    {LEVER_LABEL[k.lever] ?? k.lever}
                  </p>
                  <p className="mt-1 text-sm text-muted">{k.read}</p>
                  {k.risk && (
                    <p className="mt-1 text-xs text-kill">Breaks if: {k.risk}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {metrics.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-sm">
          <h2 className="text-sm font-semibold tracking-tight">Key terms</h2>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-4">
            {metrics.map((m, i) => (
              <div key={i} className="min-w-0">
                <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-xs uppercase tracking-wider text-muted">
                  {/* A lender reading "PRO FORMA …" beside 5.7% learns nothing:
                      the label wraps to a second line rather than truncating,
                      and the badge drops under it when the column is narrow. */}
                  <span className="line-clamp-2">{m.label}</span>
                  {/* The same badge the deal page puts on every metric card:
                      a bare "NOI" or "Cap rate" label says nothing about
                      whether the figure is today's or the sponsor's story. */}
                  {m.basis === "pro_forma" && (
                    <span className="shrink-0 rounded bg-caution/10 px-1 py-px text-[9px] font-semibold normal-case tracking-normal text-caution">
                      pro forma
                    </span>
                  )}
                  {m.basis === "in_place" && (
                    <span className="shrink-0 rounded bg-pass/10 px-1 py-px text-[9px] font-semibold normal-case tracking-normal text-pass">
                      in place
                    </span>
                  )}
                </p>
                {/* Two columns on a phone: "$68,000,000" ran into the cap
                    beside it at full size. */}
                <p className="mt-0.5 text-sm font-semibold tabular-nums sm:text-base">{m.value}</p>
                {m.flagged && (
                  <p className="text-[11px] text-caution">verify vs. source</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {portfolio && (
        <div className="mt-6">
          <PortfolioCard portfolio={portfolio} assetClass={extraction?.assetClass || assetClass} />
        </div>
      )}

      {(comps?.summary || market?.summary) && (
        <section className="mt-6 grid gap-6 sm:grid-cols-2">
          {comps?.summary && (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-sm font-semibold tracking-tight">Comp read</h2>
              {staleReads.includes("comps") && <PreviousRead why={staleWhy} />}
              <Fold text={comps.summary} className="mt-2 text-sm leading-relaxed text-muted" />
            </div>
          )}
          {market?.summary && (
            <div className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
              <h2 className="text-sm font-semibold tracking-tight">Market read</h2>
              {staleReads.includes("market") && <PreviousRead why={staleWhy} />}
              <Fold text={market.summary} className="mt-2 text-sm leading-relaxed text-muted" />
              {/* A covered market's figures that could not be read that day
                  (lib/market-read-failed), said rather than left out. */}
              {!market.liveBrief && liveReadFailedLine(market.liveReadFailed) && (
                <p className="mt-2 text-xs text-caution" data-qa="live-read-failed">
                  {liveReadFailedLine(market.liveReadFailed)}
                </p>
              )}
              {market.liveBrief && market.liveBrief.lines.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {noneOwnOf(market.liveBrief)
                    ? market.liveBrief.grain === "state"
                      ? `Checked beside ${figureCount(market.liveBrief.lines.length)}, read on ${market.liveBrief.readOn} — each the nation's: none of the state of ${market.liveBrief.metro}'s own was current.`
                      : `Checked beside ${figureCount(market.liveBrief.lines.length)}, read on ${market.liveBrief.readOn} — each the nation's: none of the ${market.liveBrief.metro} market's own was current${placedByClause(market.liveBrief.placedBy)}.`
                    : market.liveBrief.grain === "state"
                      ? `Checked beside ${figureCount(market.liveBrief.lines.length)} for the state of ${market.liveBrief.metro}, read on ${market.liveBrief.readOn} — ${splitOf(market.liveBrief, "the state's", "each the state's, not any metro's and not the building's", "none any metro's or the building's")}.`
                      : `Checked beside ${figureCount(market.liveBrief.lines.length)} for the ${market.liveBrief.metro} market${placedByClause(market.liveBrief.placedBy)}, read on ${market.liveBrief.readOn} — ${splitOf(market.liveBrief, "the metro's", "each the metro's, not the building's", "none the building's")}.`}
                </p>
              )}
              {/* A portfolio across markets (#413): each other market's own
                  figures, with how many of the properties sit there. */}
              {(market.otherBriefs ?? [])
                .filter((b) => b.lines.length > 0)
                .map((b, i) => {
                  const lead = i === 0 && !(market.liveBrief && market.liveBrief.lines.length > 0) ? "Checked beside" : "And beside";
                  const where = b.portfolio
                    ? `, where ${b.portfolio.here} of the ${b.portfolio.of} properties ${b.portfolio.here === 1 ? "sits" : "sit"}`
                    : "";
                  return (
                    <p key={b.metro} className="mt-1 text-xs text-muted">
                      {noneOwnOf(b)
                        ? `${lead} ${b.lines.length} of the nation's, read on ${b.readOn} — none of ${b.grain === "state" ? `the state of ${b.metro}'s` : `the ${b.metro} market's`} own was current${where}.`
                        : b.grain === "state"
                          ? `${lead} ${b.lines.length} for the state of ${b.metro}${where}, read on ${b.readOn} — the state's, never the portfolio's.`
                          : `${lead} ${b.lines.length} for the ${b.metro} market${where}, read on ${b.readOn} — the metro's, never the portfolio's.`}
                    </p>
                  );
                })}
            </div>
          )}
        </section>
      )}

      <footer className="mt-10 border-t border-line pt-5 text-center">
        <p className="text-xs text-muted">
          First-pass screen, not investment advice. Figures flagged
          &ldquo;verify vs. source&rdquo; deserve independent confirmation.
        </p>
        <p className="mt-3 text-sm">
          Screened with{" "}
          <Link
            href="/"
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            Underwrite Copilot
          </Link>{" "}
          — the disciplined first pass for CRE deals.
        </p>
      </footer>
    </main>
  );
}
