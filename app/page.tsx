import Link from "next/link";
import type { ReactNode } from "react";
import { LogoMark } from "./logo";
import { Reveal, CountUp, CriteriaChips, DemoTabs, type SampleFit } from "./landing-interactive";
import { ScreenRunStrip } from "./screen-run-strip";
import { ScrollProgress } from "./scroll-progress";
import { RECONCILE_RUN, SCREEN_STAGES } from "@/lib/screen-stages";
import { STAGE_ICON } from "./stage-icons";
import type { Metadata } from "next";
import {
  SPREAD_LOW_IRR_PCT,
  SPREAD_HIGH_IRR_PCT,
  SPREAD_BPS,
  ANALYSIS_STAGES,
  DEAL_KILLERS,
  COMPS_JURISDICTIONS,
  PRICE_PRO_MONTHLY,
  PRICE_TEAM_BASE_MONTHLY,
  PRICE_TEAM_MEMBER_MONTHLY,
  FREE_DEALS,
  FREE_DEALS_LINE,
  FREE_PLAN,
  PRO_PLAN_LINES,
} from "@/lib/marketing-constants";
import { TEAM_TRIAL_DEALS } from "@/lib/teams";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";
import { sampleDerivedInputs, sampleWorkbookPreview } from "@/lib/sample-derive";
import { sampleTodayReads } from "@/lib/sample-stress-read";
import { verdictCounts } from "@/lib/stress-test-words";
import { sampleDemoDataOnce, walkthroughData } from "./demo/demo-data";
// The sample's stress test is read on the reader's day the memo tile and the
// downloads date it by (lib/reader-day, New York with no reader's zone).
import { readerToday } from "@/lib/reader-day";
import { NO_DEBT_SEEDS } from "@/lib/debt-index";
import { BUY_BOX_CHIP_CLS, boxCriteria, buyBoxRead, dealCheckSource } from "@/lib/buy-box-chip";
import { ruleCounts } from "@/lib/research-data";
import { hoursSince } from "@/lib/research";
import { latestChange } from "@/lib/changelog";
import { StressBench } from "./landing-stress";
// The /tools shelf reads the SAME list /tools builds its cards from, so the
// homepage can only ever advertise what the page actually serves.
import { TOOL_COUNT, groupedTools } from "@/lib/tools/catalog";
import metrosSeed from "@/data/research/metros.json";
import { MARKET_COUNT } from "./markets-marquee";
import { DATA_METROS } from "@/lib/market-match";
import { MarketsGallery } from "./markets-gallery";
import { HERO_STRIP, HERO_WORDS_TOP, PhotoScrim, PlaceBackdrop } from "./place-band";
import { HERO_AERIAL, photoSrc, stripPhotos, type PhotoSlot } from "@/lib/photos";
import { photosOnDisk } from "@/lib/photos-fs";
import { sampleHeader, type HeaderFacts } from "@/lib/sample-header";
import { SampleDealHero } from "./sample-hero";
import { ValueAddPanel } from "./value-add-panel";
import { MemoPreview } from "./memo-preview";
import { SamplePipelineCard } from "./sample-pipeline-card";
import { sampleMemoData } from "@/lib/sample-memo";
import { compRating, inCompOrder } from "@/lib/comp-rating";
import { SCREENING_BUILT_ON, SCREENING_GROWTH_EXIT_LINE } from "@/lib/screening-model-words";

// The research layer's scale, DERIVED from the same seeds the app evaluates
// — the homepage can never claim coverage the rules engine doesn't have.
// (Server component only: these pull the research JSONs, which must not ride
// into client bundles via marketing-constants.)
const RULES = ruleCounts();
// "29 rules across the markets, 28 of them source-linked" — a rule filed
// without a source is never counted as linked (the pre-ship audit of
// 2026-09-30), and the count is the file's whole, never one market's
// (research pass 43, L11).
const RULES_PHRASE =
  RULES.sourced === RULES.all
    ? `${RULES.all} across the markets, each source-linked`
    : `${RULES.all} across the markets, ${RULES.sourced} of them source-linked`;
// Deliberately FOCUSED coverage (per direction): FIFTEEN markets, full stop
// — the DMV core (one market, four jurisdiction entries) + the rest of the
// Mid-Atlantic + the biggest US markets. Research and website coverage stop
// at this list; outside it the screen runs on the statewide rules and the
// state's published figures, and says "unscreened" where no rule is on file.
const MAJOR_MARKETS = (metrosSeed.metros ?? []).filter(
  (m) => (m as { region?: string }).region === "Major US markets"
);
const MAJOR_MARKET_COUNT = MAJOR_MARKETS.length;

// Title/description inherit the site defaults from the root layout;
// the canonical is declared per page so subpages never collapse to /.
export const metadata: Metadata = { alternates: { canonical: "/" } };

// ISR, five-minute window: the footer quotes the live steward stamp, and
// paired with next.config's expireTime this bounds cache staleness (browser
// SWR included) to ~10 minutes.
export const revalidate = 300;

// Landing page — a React Server Component (zero client JS, no secrets).
//
// The rule of this page, per the operator: words that can be a picture are a
// picture. Every section is one idea — an eyebrow, a headline of a few words,
// and the thing itself (the sample deal card, the six-stage rail, the
// verdict tabs, the live stress bench, the aerial gallery, the artifacts).
// No paragraph runs past a line; the long-form argument lives on /why.
// (Never claim "same answer every run" — LLM stages vary run to run, and the
// retrade diff would happily display that contradiction to a skeptic.)

function Icon({ children, className = "h-5 w-5" }: { children: ReactNode; className?: string }) {
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

// The screen's six stages each wear their icon (app/stage-icons, shared with
// the deal page's empty states); the trace band under the rail shows what
// each stage produces.

// Reconciling the buyer's own model is a run of its own, after the screen,
// which re-runs the verdict (lib/anthropic/pipeline) — drawn apart from the
// six, as the deal page's rail keeps it among its side jobs.
const RECONCILE_ICON = (
  <Icon>
    <path d="M12 4v16M5 20h14M6 8h12" />
    <path d="m6 8-3 6h6zM18 8l-3 6h6z" />
  </Icon>
);

// Everything else the product does, as an icon and a few words. A tile
// opens the public surface that shows it working where there is one (the
// sample screen, the stress bench, the market pages); one that works only
// on a deal of your own is a tile with no link, never a link to a page
// that does not show it (the tasks tile had opened /demo, which shows no
// tasks).
const FEATURES: { label: string; href?: string; icon: ReactNode }[] = [
  {
    label: "OM + rent roll + T‑12: actuals beat pro forma",
    href: "/demo",
    icon: (
      <Icon>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M3 10h18M9 4v16" />
      </Icon>
    ),
  },
  {
    label: "Drag the levers, watch it break",
    href: "#stress",
    icon: (
      <Icon>
        <path d="M4 8h9M19 8h1M4 16h3M13 16h7" />
        <circle cx="16" cy="8" r="2.5" />
        <circle cx="10" cy="16" r="2.5" />
      </Icon>
    ),
  },
  {
    label: "Your buy box, scored 0–100",
    href: "/demo",
    icon: (
      <Icon>
        <rect x="3" y="3" width="18" height="18" rx="3" />
        <path d="m8 12 3 3 5-6" />
      </Icon>
    ),
  },
  {
    label: "Comps from public property records",
    href: "/market",
    icon: (
      <Icon>
        <path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11z" />
        <path d="M9 10h6" />
      </Icon>
    ),
  },
  {
    label: "The loan, sized by whichever lender test binds",
    href: "/demo",
    icon: (
      <Icon>
        <path d="m3 10 9-6 9 6" />
        <path d="M5 10v9M10 10v9M14 10v9M19 10v9M3 19h18" />
      </Icon>
    ),
  },
  {
    label: "Rent control, checked at the address",
    href: "/market",
    icon: (
      <Icon>
        <path d="m14 4 6 6M4 20l7-7M10 14l4 4" />
        <path d="m12 6 6 6-2 2-6-6z" />
      </Icon>
    ),
  },
  {
    label: "Every number carries its source",
    href: "/market",
    icon: (
      <Icon>
        <path d="M6 2h12v20l-3-2-3 2-3-2-3 2z" />
        <path d="M9 8h6M9 12h6" />
      </Icon>
    ),
  },
  {
    label: "Ask this deal, answered with the page",
    icon: (
      <Icon>
        <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />
        <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 16.5h.01" />
      </Icon>
    ),
  },
  {
    label: "FEMA's flood map over the building",
    icon: (
      <Icon>
        <path d="M2 15c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" />
        <path d="M2 19.5c2 0 2-1.5 4-1.5s2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5" />
        <path d="m5 10 7-6 7 6M7 9v3M17 9v3" />
      </Icon>
    ),
  },
  {
    label: "Your pipeline as photo cards, a list, a board or a map",
    icon: (
      <Icon>
        <rect x="3" y="3" width="8" height="8" rx="1.5" />
        <rect x="13" y="3" width="8" height="8" rx="1.5" />
        <rect x="3" y="13" width="8" height="8" rx="1.5" />
        <path d="M17 21s3-2.7 3-5a3 3 0 0 0-6 0c0 2.3 3 5 3 5z" />
      </Icon>
    ),
  },
  {
    label: "Compare deals side by side",
    icon: (
      <Icon>
        <rect x="3" y="4" width="7" height="16" rx="1.5" />
        <rect x="14" y="4" width="7" height="16" rx="1.5" />
        <path d="M5.5 9h2M16.5 9h2M5.5 13h2M16.5 13h2" />
      </Icon>
    ),
  },
  {
    label: "Share the screen by link, never your files",
    icon: (
      <Icon>
        <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
        <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
      </Icon>
    ),
  },
  {
    label: "An LOI drafted from the screen",
    icon: (
      <Icon>
        <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
        <path d="M14 3v6h6" />
        <path d="m9 16 1.5-3.5L16 7l1.5 1.5L12 14z" />
      </Icon>
    ),
  },
  {
    label: "Two BOVs, the gap taken apart",
    icon: (
      <Icon>
        <path d="M12 3v18M5 8l7-5 7 5" />
        <path d="M3 12h6l-3 6-3-6zM15 12h6l-3 6-3-6z" />
      </Icon>
    ),
  },
  {
    label: "The pipeline meeting's workbook",
    icon: (
      <Icon>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M9 3v18" />
        <path d="M12 13h5M12 17h3" />
      </Icon>
    ),
  },
  {
    label: "Verdict → assigned tasks",
    icon: (
      <Icon>
        <path d="M10 6h11M10 12h11M10 18h11" />
        <path d="m3 6 1.5 1.5L7 5M3 12l1.5 1.5L7 11M3 18l1.5 1.5L7 17" />
      </Icon>
    ),
  },
];

// Every kind of deal the screen reads for what it is: each the heading its
// panel on the deal page wears (app/*-panel.tsx `PanelHead`, held to the
// panels' sources by lib/home.render.test.ts), so the row names nothing the
// product does not draw.
const DEAL_KINDS: string[] = [
  "What is being sold",
  "Rent regulation",
  "Affordable housing",
  "Single tenant",
  "Tenants",
  "Hotel",
  "How it is sold",
  "Value-add program",
  "Tax abatement",
  "Third-party reports",
  "Student housing",
  "Manufactured housing",
  "Self-storage",
  "Mixed-use",
  "Operating business",
  "Condominium",
  "Sandwich position",
  "Forward purchase",
];

const STATS: { value: number; suffix: string; label: string }[] = [
  { value: ANALYSIS_STAGES, suffix: "", label: "stages, same order every OM" },
  { value: DEAL_KILLERS, suffix: "", label: "deal-killers named first" },
  { value: MARKET_COUNT, suffix: "", label: "covered markets" },
  { value: RULES.all, suffix: "", label: "rules checked by address" },
];

// The Excel-preview tile's rows: the sample workbook's own figures — its
// engine on the one derivation the demo workbook is built from, and two
// cells of its Sensitivity tab (lib/sample-derive) — so the tile and the
// workbook it links can never disagree.
const XLSX_PREVIEW_ROWS: [string, string, string][] = sampleWorkbookPreview();

// The stress bench's base: the same derivation, run here so the browser
// gets the inputs and never the derivation (its readers hold data tables).
const BENCH = sampleDerivedInputs();

// The sample against its demo buy box, read the way the deal page's header
// reads it (lib/buy-box-chip's `buyBoxRead`): the fit score, a criterion the
// box misses outright winning the chip, and every criterion the count
// counts — so no surface here says what the product's own header would not.
const SAMPLE_READ = buyBoxRead(
  SAMPLE_DEAL.asset_class,
  dealCheckSource(SAMPLE_DEAL.extraction, null, SAMPLE_DEAL.address),
  SAMPLE_DEMO_BOX,
);
const SAMPLE_FIT: SampleFit = {
  label: SAMPLE_READ.chip.label,
  cls: BUY_BOX_CHIP_CLS[SAMPLE_READ.chip.tone],
  ...(SAMPLE_READ.chip.note ? { note: SAMPLE_READ.chip.note } : {}),
  criteria: boxCriteria(SAMPLE_READ.checks, SAMPLE_READ.mandate),
};

// The plan cards' lists are the billing page's too (lib/marketing-constants
// FREE_PLAN, PRO_PLAN_LINES), each Pro line held to the gate that makes it
// Pro by lib/plan-features.test.ts.

const FAQ: { q: string; a: string }[] = [
  {
    q: "What do I need to get started?",
    a: "Just an offering memorandum as a PDF. Upload it and the test runs on its own: the headline figures, the extraction, each assumption challenged, the broker's comps graded, the market check, a verdict. Add a rent roll or T-12 and actuals beat the pro forma. You can also explore a fully-worked sample deal before uploading anything.",
  },
  {
    q: "Where do the numbers come from?",
    a: "Every figure says where it came from — an OM page, your rent roll, a dated published figure, or a rule of thumb named as one — and conflicting sources are reconciled openly (actuals beat pro forma), never silently merged. The return math is deterministic code, not a language model guessing at arithmetic.",
  },
  {
    q: "Which markets does it cover?",
    a: `${MARKET_COUNT} markets with research briefs, deliberately: the DMV core (DC, Prince George's, Montgomery County, Northern Virginia), Baltimore, Richmond, Hampton Roads, Philadelphia (incl. Wilmington), Newark/Jersey City — and ${MAJOR_MARKET_COUNT} of the largest US metros: ${MAJOR_MARKETS.map((m) => m.name).join(", ")}. Each carries its rent rules (${RULES_PHRASE}, machine-evaluated at every address), market notes, and data coverage with sources. ${DATA_METROS.length} more metro areas are read without a brief — their published rents, vacancy, jobs and, where FRED carries them, permits, each dated, with no local rules or notes on file: ${DATA_METROS.map((m) => m.name).join(", ")}. Outside all of them the screen still runs: the statewide rules on file for ${RULES.statewideStates} states are checked, the market check reads the state's published figures, and where no local rule is on file it says "unscreened — not unregulated" rather than guessing. Recorded-sales comps run via public property-record APIs in ${COMPS_JURISDICTIONS}.`,
  },
  {
    q: "Why not just ask ChatGPT?",
    a: "Underwriting is a precision problem, not a language problem. A 10% drift reads perfectly fine in a sentence while it quietly kills the deal — so the cash-flow and return math here is deterministic code, each headline assumption is set against a dated published figure, the deal's own documents or a rule of thumb named as one, and every OM runs the same stages in the same order. The AI reads the documents; the cash flows, returns, loan sizing and scores are computed in code.",
  },
  {
    q: "Does the test make me more accurate?",
    a: "It cannot say yet. It checks each OM assumption against evidence that exists on the day and shows what the gap does to the return: the levered IRR on a stabilized deal, and on a value-add, lease-up, conversion or development plan the yield on total cost, where the OM states its stabilized NOI and total cost, since the model runs today's income, not the plan. Whether that was right is known only when a later document, your decision or a trade arrives, and the track record will count exactly those.",
  },
  {
    q: "Are my documents private?",
    a: "Yes. Documents are stored in private storage behind the database's row-level security and a server check on every file, and your deals are visible only to you and your team — and to whoever holds a share link you send, which shows the screen, never your documents. To run a screen, a document is read by Anthropic's Claude API, which does not train on it; the security page lists every outside service and what it receives. Nothing you upload is ever sold.",
  },
  {
    q: "Is this investment advice?",
    a: "No. Underwrite Copilot is a first-pass screen that tells you whether a deal earns more of your time. Always verify flagged figures against source documents before acting.",
  },
  {
    q: "What's in the Excel model?",
    a: `Included with every Pro test: the screening model as a live-formula workbook. ${SCREENING_BUILT_ON} ${SCREENING_GROWTH_EXIT_LINE}; the method page has the whole rule. It has a cover, a deal summary with sources & uses and returns, every assumption with its source, annual and monthly cash flows, a debt schedule, operating metrics, and sensitivity grids across the exit cap, hold, price, leverage and rate — change an input and the whole model recalculates. An OM Facts tab lists every figure the screen read out of the memorandum, as stated, with its page and whether it was flagged. A portfolio gets a tab of its properties, and where today's published figures were read, a Market Read tab sets each assumption the OM or a default set against them, and names a figure the model was set from as the figure it runs, never as a check.`,
  },
  {
    q: "Can my team share one pipeline?",
    a: `Yes. Create a team, send teammates an invite link, and the deals you all add land in one shared pipeline, with the same screens, verdicts, models, and memos for everyone: up to ${TEAM_TRIAL_DEALS} shared deals free to try it, and every one on the Team plan. The Team plan is ${PRICE_TEAM_BASE_MONTHLY} per month — which includes the account owner — plus ${PRICE_TEAM_MEMBER_MONTHLY} per month for each added member, on one subscription that adjusts automatically as people join or leave.`,
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Pro is a monthly subscription managed through Stripe — upgrade, downgrade, or cancel from the billing page whenever you like. The free tier stays free.",
  },
];

// Structured data so search engines understand the product and pricing.
const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://underwrite-copilot.onrender.com";

const JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    // Who publishes the site and what the site is (#430), so a search
    // engine can name it in results and tie the app to its maker.
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: "Underwrite Copilot",
      url: SITE_URL,
      // The 180px touch icon (app/apple-icon.tsx): Google wants a logo of
      // 112px at least, and the favicon is 32.
      logo: `${SITE_URL}/apple-icon`,
      email: "underwritecopilot.support@gmail.com",
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: "Underwrite Copilot",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
    },
    {
      "@type": "SoftwareApplication",
      name: "Underwrite Copilot",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      // The layout's own description (app/layout.tsx), word for word.
      description:
        "Upload an offering memorandum. Each assumption it makes is set against the deal's own documents, dated published figures and the rule of thumb it is asked to beat, named as such; the unsupported and stretched ones are listed first; a Go / Caution / No-go that shows its work. The model is included.",
      offers: [
        { "@type": "Offer", name: "Free", price: "0", priceCurrency: "USD" },
        { "@type": "Offer", name: "Pro", price: PRICE_PRO_MONTHLY.replace("$", ""), priceCurrency: "USD" },
        {
          "@type": "Offer",
          name: `Team (base includes the owner; each added member ${PRICE_TEAM_MEMBER_MONTHLY})`,
          price: PRICE_TEAM_BASE_MONTHLY.replace("$", ""),
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

// How an uploaded OM is handled, beside the price — the four things the
// security page states in full, each an icon and a few words, each opening
// that page. Only what is true: no attestation badge, because we hold none.
const TRUST: { label: string; icon: ReactNode }[] = [
  {
    label: "Private storage, links that expire",
    icon: (
      <Icon>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      </Icon>
    ),
  },
  {
    label: "Isolated in the database itself",
    icon: (
      <Icon>
        <ellipse cx="12" cy="6" rx="8" ry="3" />
        <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
        <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
      </Icon>
    ),
  },
  {
    label: "Never used to train a model",
    icon: (
      <Icon>
        <path d="M9 4a3 3 0 0 0-3 3v1a3 3 0 0 0-2 3 3 3 0 0 0 2 3v1a3 3 0 0 0 3 3h1V4z" />
        <path d="M15 4a3 3 0 0 1 3 3v1a3 3 0 0 1 2 3 3 3 0 0 1-2 3v1a3 3 0 0 1-3 3h-1V4z" />
        <path d="M3 3l18 18" />
      </Icon>
    ),
  },
  {
    label: "Delete it all, self-serve (a team owner, by email)",
    icon: (
      <Icon>
        <path d="M4 7h16M10 11v6M14 11v6" />
        <path d="M6 7l1 13h10l1-13M9 7V4h6v3" />
      </Icon>
    ),
  },
];

/** One section's header: an eyebrow and a headline of a few words. */
function SectionHead({
  eyebrow,
  title,
  dark = false,
}: {
  eyebrow: string;
  title: string;
  dark?: boolean;
}) {
  return (
    <div>
      <p
        className={`text-xs font-medium uppercase tracking-wider ${dark ? "text-accent/90" : "text-muted"}`}
      >
        {eyebrow}
      </p>
      <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2>
    </div>
  );
}

/**
 * The photograph behind the hero's headline. The operator's own (a real
 * building, a team at work) when `public/photos/hero.jpg` exists; until
 * then the sample deal's own market, Philadelphia (lib/photos HERO_AERIAL),
 * so the band and the sample's header in it show one city — the photograph
 * the site can always produce for itself (PlaceBackdrop, shared with the
 * other public pages' opening bands), credited at the band's foot. Both draw at full strength under the SAME scrim (PhotoScrim):
 * dark under the left-hand type, clear over the picture. A photograph the
 * treatment washes out costs the same bytes and says nothing.
 *
 * The hero's words are its `children`, drawn after the picture and, where
 * the picture owes a credit, before it: the credit sits at the band's foot,
 * and first in the markup it was the first thing Tab reached, ahead of "Get
 * started free" (PlaceBackdrop).
 */
function HeroBackdrop({ photo, children }: { photo: PhotoSlot | undefined; children: ReactNode }) {
  // The first picture on the page, so it is asked for first (`eager`).
  if (!photo) {
    return (
      <PlaceBackdrop metro={HERO_AERIAL.metro} height={HERO_AERIAL.height} scrim="hero" eager>
        {children}
      </PlaceBackdrop>
    );
  }
  return (
    <>
      <div aria-hidden className={`pointer-events-none ${HERO_STRIP}`}>
        {/* eslint-disable-next-line @next/next/no-img-element -- a static file under public/, sized by the slot */}
        <img
          src={photoSrc(photo)}
          alt=""
          width={photo.width}
          height={photo.height}
          fetchPriority="high"
          decoding="async"
          className="h-full w-full object-cover object-[50%_42%]"
        />
        <PhotoScrim scrim="hero" />
      </div>
      {children}
    </>
  );
}

/**
 * The people the screen is for, photographed — only when the operator's
 * files are on disk (lib/photos). A strip with a hole would say "stock
 * placeholder"; an absent strip says nothing, which is the honest default.
 */
function PeopleStrip({ photos }: { photos: PhotoSlot[] }) {
  if (!photos.length) return null;
  const cols = photos.length === 1 ? "sm:grid-cols-1" : photos.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3";
  return (
    <section aria-label="Who it is for" className="border-b border-line">
      <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
        <SectionHead eyebrow="Who it's for" title="Acquisitions teams, on deal day." />
        <ul className={`mt-8 grid grid-cols-1 gap-4 ${cols}`}>
          {photos.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-2xl border border-line bg-faint">
              {/* eslint-disable-next-line @next/next/no-img-element -- a static file under public/, sized by the slot */}
              <img
                src={photoSrc(p)}
                alt={p.alt}
                width={p.width}
                height={p.height}
                loading="lazy"
                decoding="async"
                className="aspect-[4/3] w-full object-cover"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export default async function Home() {
  const photos = photosOnDisk();
  // The sample's header, read on the render's day (the page is ISR).
  const header = sampleHeader();
  // The sample memo's own data, as its download draws it, on the render's
  // day (the download names the day it is printed), on the published
  // figures the download reads.
  const memo = sampleMemoData(new Date(), await sampleTodayReads());
  return (
    <div className="flex flex-1 flex-col">
      <script
        type="application/ld+json"
        // `<` escaped, as Next's own guide does, so no string inside can
        // close the script tag.
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, "\\u003c") }}
      />
      {/* Hairline reading-progress bar over everything (accent, so it reads
          on the dark hero and the light body alike). */}
      <ScrollProgress />
      {/* Nav — dark, so it reads as one piece with the hero. */}
      <header data-home-bar className="sticky top-0 z-10 border-b border-white/10 bg-sidebar text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-3.5">
          {/* min-w-0 + truncate: on narrow phones the wordmark gives way
              instead of colliding with the CTA (the logo always stays). */}
          <div className="flex min-w-0 items-center gap-2.5">
            <LogoMark className="h-8 w-8 shrink-0" />
            <span className="font-semibold tracking-tight max-[360px]:hidden">
              Underwrite Copilot
            </span>
          </div>
          <nav className="hidden items-center gap-1 md:flex">
            {[
              ["#screen", "How it's tested"],
              ["/how-we-test", "The method"],
              ["/demo", "Sample test"],
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
              className="whitespace-nowrap rounded-lg bg-white px-3.5 py-1.5 text-sm font-semibold text-brand-strong transition-colors hover:bg-accent"
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
                  ["#screen", "How it's tested"],
                  ["/how-we-test", "The method"],
                  ["/demo", "Sample test"],
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

      <main id="main" className="flex-1">
        {/* Hero — dark navy with soft accent glows; the product is the visual. */}
        <section className="band-dark relative overflow-hidden text-white">
          {/* A real photograph behind the headline — the operator's, or a
              covered market's photograph until it arrives — and the words
              through it, so its credit comes after them and Tab reaches
              "Get started free" first. */}
          <HeroBackdrop photo={photos.hero}>
            {/* Ambient glows: pure CSS, no layout shift, subtle by design. */}
            <div
              aria-hidden
              className="glow-drift pointer-events-none absolute -top-32 right-[-10%] h-[28rem] w-[28rem] rounded-full opacity-25 blur-3xl"
              style={{
                background:
                  "radial-gradient(closest-side, #7fd6cc 0%, transparent 70%)",
              }}
            />
            <div
              aria-hidden
              className="glow-drift-2 pointer-events-none absolute bottom-[-8rem] left-[-6%] h-[22rem] w-[22rem] rounded-full opacity-15 blur-3xl"
              style={{
                background:
                  "radial-gradient(closest-side, #7fd6cc 0%, transparent 70%)",
              }}
            />
            {/* The words start at the foot of the photograph's strip below lg
                (HERO_WORDS_TOP), so they sit on the band, never on the sky. */}
            <div className={`relative mx-auto max-w-6xl px-6 pb-14 ${HERO_WORDS_TOP}`}>
              {/* grid-cols-1 matters (same as the walkthrough section): the
                  implicit mobile track is `auto` and cannot shrink below the
                  sample card's intrinsic width, which pushed the whole hero
                  wider than small phones — masked by the section's
                  overflow-hidden, so the page didn't scroll, it just clipped. */}
              <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
                <div className="on-photo">
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1 text-xs font-medium text-accent">
                    <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                    A stress test for offering memoranda
                  </span>
                  <h1 className="mt-6 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]">
                    Test the OM before you{" "}
                    <span className="relative inline-block whitespace-nowrap">
                      model it.
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
                  <p className="mt-6 max-w-xl text-lg leading-relaxed text-white/90">
                    Upload the OM. Each assumption it makes is set against the deal&apos;s own documents, today&apos;s published figures and the rule of thumb it is asked to beat — named as such — then a Go / Caution / No-go that shows its work. The model comes with it.
                  </p>
                  <div className="mt-8 flex flex-wrap items-center gap-3">
                    <Link
                      href="/login?mode=signup"
                      className="cta-breathe rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-brand-strong transition-colors [text-shadow:none] hover:bg-accent"
                    >
                      Get started free
                    </Link>
                    <Link
                      href="/demo"
                      className="rounded-lg border border-white/25 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-white/10"
                    >
                      See a full test
                    </Link>
                  </div>
                  <p className="mt-4 text-xs text-white/70">{FREE_DEALS_LINE} · no card</p>
                </div>

                {/* Product preview */}
                <div>
                  <DealPreview header={header} />
                  <p className="mt-4 text-center text-[11px] text-white/55">
                    Illustrative sample deal ·{" "}
                    <Link
                      href="/demo"
                      className="font-medium text-white/70 underline-offset-2 hover:text-white hover:underline"
                    >
                      open the whole test →
                    </Link>
                  </p>
                </div>
              </div>

              {/* Stat strip — the screen, quantified, two words each. */}
              <dl className="mt-16 grid grid-cols-2 gap-x-6 gap-y-8 border-t border-white/10 pt-8 sm:grid-cols-4">
                {/* Each stat read once: the label is the term, the figure
                    its value, and the column reversed so the figure still
                    sits on top. (A hidden term above a second copy of the
                    label as a value had a screen reader say it twice.)
                    `justify-end` packs a reversed column at its TOP, so
                    the figures share one line whichever label wraps. */}
                {STATS.map((st) => (
                  <div key={st.label} className="flex flex-col-reverse justify-end">
                    <dt className="mt-1 text-xs text-white/60">{st.label}</dt>
                    <dd className="font-mono text-3xl font-semibold tabular-nums text-accent">
                      <CountUp value={st.value} suffix={st.suffix} />
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </HeroBackdrop>
        </section>

        <PeopleStrip photos={stripPhotos(photos)} />

        {/* The problem, drawn: two analysts, one deal, the spread between
            them. Both ends are neutral on purpose — the spread is the problem. */}
        <section id="problem">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <SectionHead eyebrow="The problem" title="The pro forma is the seller's best case." />
            <Reveal>
              <div className="shadow-card mt-8 rounded-2xl border border-line bg-surface p-6">
                {/* The two IRRs are a stated illustration, not a measured
                    benchmark (lib/marketing-constants), so the card says so. */}
                <p className="mb-4">
                  <span className="rounded-full border border-line px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted">
                    Illustration
                  </span>
                </p>
                <div className="flex items-end justify-between gap-4">
                  <div>
                    <p className="font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
                      {SPREAD_LOW_IRR_PCT}%
                    </p>
                    <p className="mt-0.5 text-xs text-muted">
                      Analyst B · IRR · &ldquo;pass&rdquo;
                    </p>
                  </div>
                  <span className="mb-1 hidden rounded-full bg-caution/10 px-3 py-1 text-xs font-semibold text-caution sm:block">
                    {SPREAD_BPS} bps apart
                  </span>
                  <div className="text-right">
                    <p className="font-mono text-2xl font-semibold tabular-nums sm:text-3xl">
                      {SPREAD_HIGH_IRR_PCT}%
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
                    className="spread-dot-l absolute left-[10%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-ink/80 shadow"
                    aria-hidden
                  />
                  <span
                    className="spread-dot-r absolute left-[90%] top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-surface bg-ink/80 shadow"
                    aria-hidden
                  />
                </div>
                <p className="mt-3 text-center text-xs text-muted">
                  Same deal, same data room. The method is shown, the moves are computed, and whether it was right is scored as evidence arrives.
                </p>
              </div>
            </Reveal>
          </div>
        </section>

        {/* The six-stage screen — a rail of icons, then the trace of it running. */}
        <section id="screen" className="border-t border-line bg-faint">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <SectionHead eyebrow="How it's tested" title="Read it, challenge it, check it against the evidence." />
            <Reveal delay={60}>
              <ol className="stage-rail mt-8 grid grid-cols-3 gap-3 sm:grid-cols-6">
                {SCREEN_STAGES.map((s, i) => (
                  <li
                    key={s.key}
                    style={{ "--i": i } as React.CSSProperties}
                    className="hover-lift stage-cycle relative flex flex-col items-center gap-3 rounded-xl border border-line bg-surface px-3 py-5 text-center shadow-card"
                  >
                    <span className="absolute left-2.5 top-2 font-mono text-[11px] tabular-nums text-muted">
                      {i + 1}
                    </span>
                    <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand/10 text-brand">
                      {STAGE_ICON[s.key]}
                    </span>
                    <span className="text-sm font-medium">{s.label}</span>
                  </li>
                ))}
              </ol>
              {/* Apart from the six, dashed: it runs only once you add your
                  own model. */}
              <p className="mt-3 flex items-center gap-3 rounded-xl border border-dashed border-line px-4 py-3 text-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface text-muted">
                  {RECONCILE_ICON}
                </span>
                <span className="font-medium">{RECONCILE_RUN.label}</span>{" "}
                <span className="text-muted">a run of its own, when you add your model</span>
              </p>
            </Reveal>
          </div>
        </section>
        <ScreenRunStrip />

        {/* Inside the screen — the deal page's own sections, in miniature. */}
        <section className="border-b border-line">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-start gap-10 px-6 py-16 sm:py-20 lg:grid-cols-[1fr_1.4fr]">
            {/* Beside a walkthrough several screens tall, the heading and its
                button stay in view on a laptop rather than leaving the column
                empty below them. */}
            <div className="lg:sticky lg:top-24">
              <Reveal>
                <SectionHead eyebrow="The test, row by row" title="Click through what every call rests on." />
                <Link
                  href="/login?mode=signup"
                  className="mt-6 inline-flex rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
                >
                  Run it on a real OM
                </Link>
              </Reveal>
            </div>
            <Reveal delay={120}>
              <SampleWalkthrough />
            </Reveal>
          </div>
        </section>

        {/* Your pipeline — the sample's own pipeline card (lib/pipeline-card,
            deal-tile.tsx): its market photograph with its caption and
            credit, the call on the picture, Price with its basis under it,
            Cap, Fit. Only the sample's card, opening /demo, never an
            invented deal, and no stage control. */}
        <section className="border-b border-line" data-qa="home-pipeline-card">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-6 py-16 sm:py-20 md:grid-cols-[1fr_minmax(0,20rem)]">
            <Reveal>
              <SectionHead eyebrow="Your pipeline" title="Every deal, a card." />
            </Reveal>
            <Reveal delay={120}>
              <SamplePipelineCard />
            </Reveal>
          </div>
        </section>

        {/* What a gap does to the return — the deterministic engine, live in the browser. */}
        <section id="stress" className="band-dark text-white">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <Reveal>
              <SectionHead eyebrow="What a gap does to the return" title="Move the assumption, watch the return." dark />
            </Reveal>
            <Reveal delay={80}>
              <div className="mt-8">
                <StressBench base={BENCH.inputs} units={BENCH.meta.units} />
              </div>
            </Reveal>
            {/* The bench stresses one screened deal. /tools is the same
                arithmetic with NO deal behind it — the natural next click
                for anyone who has just finished dragging these sliders.

                This was one underlined sentence for a long time, and it
                said "size a loan, or run the cap rate math" well after the
                page had grown past that. The shelf below renders from
                TOOL_INDEX, the same list /tools builds its cards from, so
                the homepage can only ever name what the page actually
                serves. A count in prose would go stale; a list cannot. */}
            <Reveal delay={160}>
              <div className="mt-8 border-t border-white/15 pt-6">
                {/* The count is CALCULATIONS, not chips — "Over the hold"
                    answers the schedule and the refinance test off one set
                    of inputs — so the label says which, rather than leaving
                    a reader to count the chips and find one fewer. */}
                <p className="text-[11px] font-semibold uppercase tracking-widest text-white/60">
                  {TOOL_COUNT} more calculations, with no deal behind them
                </p>
                {/* Clustered, not a flat row. The shelf was a single line of
                    chips written when the list was short, and it is the same
                    wall /tools' own index hit at twenty-six — which is why
                    `groupedTools()` exists in the catalog rather than in the
                    page. One grouping, read by both, so the homepage cannot
                    present the page in a shape the page does not use. */}
                <div className="mt-4 grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
                  {groupedTools().map(({ group, tools }) => (
                    <div key={group}>
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-white/55">
                        {group}
                      </p>
                      <ul className="mt-2 flex flex-wrap gap-1.5">
                        {tools.map((t) => (
                          <li key={t.id}>
                            <Link
                              href={`/tools#${t.id}`}
                              className="inline-block rounded-lg border border-white/20 px-2.5 py-1 text-xs font-medium text-white/85 transition-colors hover:border-accent hover:text-accent"
                            >
                              {t.label}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
                <Link
                  href="/tools"
                  className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-accent underline-offset-4 transition-colors hover:underline"
                >
                  Run any of them on your own numbers
                  <span aria-hidden="true">→</span>
                </Link>
              </div>
            </Reveal>
          </div>
        </section>

        {/* The covered markets, photographed. */}
        <MarketsGallery />

        {/* The artifacts — what you actually walk away with, shown. */}
        <section className="border-y border-line bg-faint">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <Reveal>
              <SectionHead eyebrow="The artifacts" title="What you walk away with." />
            </Reveal>
            <Reveal delay={80}>
              {/* Two by two: the memo, the comps and the buy box first, and
                  the model last — it is included, not the product. */}
              <div className="mt-8 grid gap-4 lg:grid-cols-2">
                {/* Memo */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                    IC memo{" "}
                    <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold text-brand">Pro</span>
                  </h3>
                  {/* The memo it downloads: its own title, call and key
                      terms, from the download's own inputs. */}
                  <div className="mt-4 flex-1">
                    <MemoPreview data={memo} />
                  </div>
                  <a
                    href="/api/demo/memo"
                    className="mt-3 inline-block text-[11px] font-medium text-brand underline-offset-2 hover:underline"
                  >
                    Download the sample memo →
                  </a>
                </div>

                {/* Comps */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <h3 className="text-sm font-semibold">The broker&apos;s comps, graded</h3>
                  {/* The sample's own sale comps, in the deal page's order
                      and grades (lib/comp-rating), each with the figures its
                      memorandum line states. */}
                  <ul className="mt-4 space-y-1.5 text-[10px]">
                    {inCompOrder(SAMPLE_DEAL.comps.saleComps).map((c) => {
                      const r = compRating(c.support);
                      return (
                        <li key={c.name} className="rounded-md border border-line px-2.5 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="min-w-0 truncate font-medium">{c.name}</span>{" "}
                            <span
                              className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${r.badge}`}
                            >
                              {r.label}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate font-mono tabular-nums text-muted">{c.detail}</p>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {/* Buy box */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <h3 className="text-sm font-semibold">Your buy box, checked in code</h3>
                  {/* The sample deal's own checks against its demo buy box
                      (lib/sample-deal SAMPLE_DEMO_BOX), every one the count counts. */}
                  <div className="mt-4">
                    <CriteriaChips criteria={SAMPLE_FIT.criteria} />
                  </div>
                </div>

                {/* The model — included with the test, so it comes last. */}
                <div className="hover-lift flex flex-col rounded-2xl border border-line bg-surface p-5 shadow-card">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                      The screening model, included — Excel, live formulas
                      {/* On your own deals the exports are Pro, as the hero's
                          card marks them; the samples download free
                          (research pass 32). The space keeps "Pro" a word of
                          its own to a screen reader; the flex gap spaces it
                          on screen. */}{" "}
                      <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold text-brand">Pro</span>
                    </h3>
                    <span className="rounded-full bg-faint px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted">
                      Sample
                    </span>
                  </div>
                  <div className="mt-4">
                    <div className="overflow-hidden rounded-lg border border-line font-mono text-[11px]">
                      <div className="grid grid-cols-4 border-b border-line bg-faint px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted">
                        <span className="col-span-2">Input</span>
                        <span className="text-right">Value</span>
                        <span className="text-right">Effect</span>
                      </div>
                      {XLSX_PREVIEW_ROWS.map(([k, v, e], i) => (
                        <div
                          key={k}
                          className={`grid grid-cols-4 px-3 py-1.5 ${i >= 2 ? "bg-caution/5" : "bg-surface"}`}
                        >
                          <span className="col-span-2 text-muted">{k}</span>
                          <span
                            className={`text-right tabular-nums ${i !== 0 ? "bg-caution/10 px-1" : ""}`}
                          >
                            {v}
                          </span>
                          <span className="text-right tabular-nums">{e}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <a
                    href="/api/demo/underwrite.xlsx"
                    className="mt-3 inline-block text-[11px] font-medium text-brand underline-offset-2 hover:underline"
                  >
                    Download the sample workbook →
                  </a>
                </div>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Everything else, as icons. */}
        <section id="toolkit">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <Reveal>
              <SectionHead eyebrow="Also in the box" title="Everything else, at a glance." />
            </Reveal>
            <Reveal delay={80}>
              <ul className="feature-grid mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {FEATURES.map((f) => {
                  const face = (
                    <>
                      <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand/10 text-brand">
                        {f.icon}
                      </span>
                      <span className="text-sm font-medium leading-snug">{f.label}</span>
                    </>
                  );
                  const tile = "flex h-full flex-col items-start gap-3 rounded-xl border border-line bg-surface p-4 shadow-card";
                  return (
                    <li key={f.label}>
                      {f.href ? (
                        <Link href={f.href} className={`hover-lift ${tile} transition-colors hover:border-brand/30`}>
                          {face}
                        </Link>
                      ) : (
                        <div className={tile}>{face}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
              {/* The deal-type readers, each named as its panel is. */}
              <div className="mt-6">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                  Every kind of deal, read for what it is
                </p>
                <ul aria-label="The deal types the screen reads" className="mt-3 flex flex-wrap gap-1.5">
                  {DEAL_KINDS.map((k) => (
                    <li key={k} className="rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium">
                      {k}
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-line">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
          <Reveal>
            <SectionHead eyebrow="Pricing" title="Start free. Upgrade when the test earns it." />
          </Reveal>
          <Reveal delay={80}>
            <div className="mt-8 grid gap-5 md:grid-cols-3">
              {/* Free */}
              <div className="shadow-card flex flex-col rounded-2xl border border-line bg-surface p-6">
                <p className="text-sm font-semibold">Free</p>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">$0</span>
                </p>
                <p className="mt-1 text-sm text-muted">The full test on up to {FREE_DEALS} deals.</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {FREE_PLAN.map((f) => (
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
                  <span className="text-4xl font-semibold tracking-tight">{PRICE_PRO_MONTHLY}</span>
                  <span className="text-sm text-muted">/month</span>
                </p>
                <p className="mt-1 text-sm text-muted">Unlimited tests, plus the exports for your IC.</p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {PRO_PLAN_LINES.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-sm">
                      <span className="mt-0.5 flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full bg-pass/10 text-[10px] font-bold text-pass">
                        ✓
                      </span>
                      {f}
                    </li>
                  ))}
                </ul>
                {/* The plan rides through sign-up and its confirmation link
                    (lib/auth-flow's confirmationRedirect), so a new account
                    lands on Billing rather than an empty pipeline. */}
                <Link
                  href="/login?mode=signup&next=%2Fbilling"
                  className="mt-6 rounded-lg bg-brand px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-brand-strong"
                >
                  Start with Pro
                </Link>
              </div>

              {/* Team */}
              <div className="shadow-card flex flex-col rounded-2xl border border-line bg-surface p-6">
                <p className="text-sm font-semibold">Team</p>
                <p className="mt-2 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight">{PRICE_TEAM_BASE_MONTHLY}</span>
                  <span className="text-sm text-muted">/month</span>
                </p>
                <p className="mt-1 text-sm text-muted">
                  Includes the owner, + {PRICE_TEAM_MEMBER_MONTHLY}/month per added member.
                </p>
                <ul className="mt-5 flex-1 space-y-2.5">
                  {[
                    "Everything in Pro, for every member",
                    "One shared pipeline — same deals, same verdicts",
                    "Invite teammates with a link",
                    "Billing follows your seat count automatically",
                    `Up to ${TEAM_TRIAL_DEALS} shared deals free to try it`,
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
                  href="/login?mode=signup&next=%2Fteam"
                  className="mt-6 rounded-lg border border-brand/40 px-4 py-2.5 text-center text-sm font-medium text-brand transition-colors hover:bg-brand/5"
                >
                  Start a team
                </Link>
              </div>
            </div>
          </Reveal>
          <p className="mt-5 text-center text-xs text-muted">
            Billed monthly through Stripe · cancel anytime, and your deals and exports stay yours · no card required for Free.
          </p>
          {/* How the OM is handled, beside the price — each tile opens the
              security page, which states it in full. */}
          <Reveal delay={120}>
            <ul className="trust-strip mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {TRUST.map((t) => (
                <li key={t.label}>
                  <Link
                    href="/security"
                    className="hover-lift flex h-full items-center gap-3 rounded-xl border border-line bg-surface p-3.5 shadow-card transition-colors hover:border-brand/30"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand">
                      {t.icon}
                    </span>
                    <span className="text-sm font-medium leading-snug">{t.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Reveal>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="border-y border-line bg-faint">
          <div className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
            <SectionHead eyebrow="FAQ" title="The questions we'd ask too." />
            <div className="mx-auto mt-8 max-w-3xl divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              {FAQ.map((f, i) => (
                <details key={f.q} className="group">
                  <summary className="flex cursor-pointer items-center gap-3 px-5 py-4 text-sm font-medium transition-colors hover:bg-faint [&::-webkit-details-marker]:hidden">
                    <span className="font-mono text-xs tabular-nums text-brand/80">
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
            <p className="text-xs font-medium uppercase tracking-wider text-accent/90">
              The whole point
            </p>
            <h2 className="mx-auto mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
              Every OM gets the same test.
            </h2>
            <div className="mt-8 flex justify-center">
              <Link
                href="/login?mode=signup"
                className="cta-breathe rounded-lg bg-white px-6 py-3 text-sm font-semibold text-brand-strong transition-colors hover:bg-accent"
              >
                Test your first OM free
              </Link>
            </div>
            <p className="mt-4 text-xs text-white/50">
              {FREE_DEALS_LINE} · no credit card
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
                  How it&apos;s tested
                </a>
              </li>
              <li>
                <Link href="/why" className="text-muted transition-colors hover:text-ink">
                  Why Underwrite Copilot
                </Link>
              </li>
              <li>
                <Link href="/how-we-test" className="text-muted transition-colors hover:text-ink">
                  How each assumption is tested
                </Link>
              </li>
              <li>
                <Link href="/demo" className="text-muted transition-colors hover:text-ink">
                  Sample test
                </Link>
              </li>
              <li>
                <Link href="/market" className="text-muted transition-colors hover:text-ink">
                  Market data
                </Link>
              </li>
              <li>
                <Link href="/whats-new" className="text-muted transition-colors hover:text-ink">
                  What&apos;s new
                </Link>
              </li>
              <li>
                <a href="#pricing" className="text-muted transition-colors hover:text-ink">
                  Pricing
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
                <Link href="/security" className="text-muted transition-colors hover:text-ink">
                  Security
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
          <FooterTrustLine />
        </div>
      </footer>
    </div>
  );
}

/** The sample deal's header — the deal page's own `DealHero` on the facts
 *  lib/sample-header reads through the deal page's readers (the name with
 *  "Sample — ", the call, the buy-box fit, the four figures as stated,
 *  Philadelphia's photograph, the tool row), so the card shows exactly
 *  what the signed-in sample deal shows. Stacked on a second sheet, so it
 *  reads as one deal of a pipeline; the name is an h2 under the hero's h1. */
async function DealPreview({ header }: { header: HeaderFacts }) {
  // The stress test's counts beside the call, from the walkthrough's own
  // build of the sample (the same day and the same figures), so the chip and
  // the panel below can never disagree.
  const reads = await sampleTodayReads();
  const { data } = sampleDemoDataOnce(readerToday(null), reads, NO_DEBT_SEEDS);
  const stress = data.stressTest && data.stressTest.rows.length > 0 ? verdictCounts(data.stressTest) : null;
  return (
    <div className="relative text-ink">
      <div
        className="absolute inset-0 translate-x-3 translate-y-3 rounded-2xl border border-white/10 bg-white/[0.04]"
        aria-hidden
      />
      <div className="relative">
        <SampleDealHero header={header} titleAs="h2" stamp stress={stress} />
      </div>
    </div>
  );
}

// ── The walkthrough ─────────────────────────────────────────────────────────
// The sample's tabs from /demo's own build (app/demo/demo-data
// `sampleDemoData`, picked by `walkthroughData`): the guide, the actuals, the
// call with the OM's assumptions tested (lib/sample-stress, the one build the
// signed-in sample's page agrees with), the playground, the terms, the debt
// sizer, the model's read against today's figures, the model card, the buy
// box and the market check's demand card, each on today's figures for the
// sample's market (lib/sample-stress-read) — read at regeneration. A read
// that fails leaves the published rows unchecked and the two cards that read
// it out, never the page down. No debt index is read: the sample is never
// seeded from today's rates (lib/model-market), and the walkthrough draws no
// research panel.
async function SampleWalkthrough() {
  const reads = await sampleTodayReads();
  const { data } = sampleDemoDataOnce(readerToday(null), reads, NO_DEBT_SEEDS);
  // The renovation program the deal page and /demo draw under the sample's
  // header, from the same build, at the walkthrough's head: the homepage's
  // header is the hero's compact preview.
  return (
    <div className="flex flex-col gap-4">
      <ValueAddPanel {...data.valueAdd} />
      <DemoTabs {...walkthroughData(data)} />
    </div>
  );
}

// ── Footer trust line ────────────────────────────────────────────────────────
// "page rendered" catches stale deploys; "data last verified" is the nightly
// steward's public heartbeat. No steward run yet → the claim simply doesn't
// render (we never assert a verification that hasn't happened), and a run
// older than 48h renders as a visible warning, not a quiet omission.
async function FooterTrustLine() {
  let verifiedAt: string | null = null;
  try {
    const { createSupabaseAdminClient } = await import("@/lib/supabase/admin");
    const admin = createSupabaseAdminClient();
    const { data } = await admin
      .from("steward_runs")
      .select("finished_at")
      .not("finished_at", "is", null)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    verifiedAt = (data?.finished_at as string | null) ?? null;
  } catch {
    // table absent — render without the marker
  }
  const overdue = verifiedAt !== null && hoursSince(verifiedAt) > 48;
  // A job's bare day says UTC, with its year (CLAUDE.md's rule for a day
  // read off a timestamp).
  const fmt = (t: string | Date) =>
    new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  // Same checked-in changelog the app's What's-new card renders — the
  // homepage can never claim an improvement the app doesn't ship.
  const latest = latestChange();
  // Render exposes the deployed commit at build time — the footer names it,
  // so "is the site actually on the latest code" is answerable by comparing
  // this stamp to the repo's main tip. Absent locally; omitted then. Plain
  // text, never a link to the repository (research pass 43): live-verify
  // reads the same id off the <meta name="uc-build"> the layout prints.
  const buildSha = (process.env.RENDER_GIT_COMMIT ?? "").slice(0, 7);
  // The year is the render's, never typed: a typed one goes stale on Jan 1.
  const rendered = new Date();
  return (
    <p className="mx-auto max-w-6xl px-6 py-4 text-xs text-muted">
      {`© ${rendered.getFullYear()} Underwrite Copilot · page rendered ${fmt(rendered)}`}
      {buildSha && (
        <>
          {" · build "}
          <span className="font-mono">{buildSha}</span>
        </>
      )}
      {latest && (
        <>
          {" "}
          · latest improvement:{" "}
          <Link
            href="/whats-new"
            className="underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            {latest.title}
          </Link>{" "}
          ({fmt(`${latest.date}T00:00:00Z`)})
        </>
      )}
      {verifiedAt && !overdue && <> · research data last verified {fmt(verifiedAt)} UTC by the nightly steward</>}
      {verifiedAt && overdue && (
        <>
          {" · "}
          <span className="text-caution">
            research data verification overdue (last ran {fmt(verifiedAt)} UTC)
          </span>
        </>
      )}
      . A first-pass screen, not investment advice.
    </p>
  );
}
