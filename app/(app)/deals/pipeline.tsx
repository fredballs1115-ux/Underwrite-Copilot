"use client";

import { compactUsd } from "@/lib/money";
import {
  Fragment,
  memo,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDealFromBatch, createSampleDeal } from "./actions";
import { BatchUpload } from "./batch-upload";
import { DealThumb } from "./deal-thumb";
import { DealBanner } from "./deal-banner";
import { GalleryCreditPartsText } from "@/app/credit-parts";
import { bannerSizes, shownMarketCredits, type BannerSource } from "@/lib/deal-banner";
import type { DealCoverFacts } from "@/lib/deal-cover";
import { PipelineMap } from "./pipeline-map";
import type { MapDeal, MapPlace } from "@/lib/pipeline-map";
import { PIPELINE_CARD_GRID, PIPELINE_CARD_SIZES, PIPELINE_VIEW_COOKIE, filtersFoldLabel, remembersView, type PipelineView } from "@/lib/pipeline-view";
import { ManualDealForm } from "./manual-deal-form";
import { FileDrop } from "../file-drop";
import { PendingButton } from "../pending-button";
import { AddressAutocomplete } from "../address-autocomplete";
import type { StructuredAddress } from "@/lib/address";
import { ASSET_CLASS_OPTIONS, assetClassLabel } from "@/lib/asset-class";
import { rowMarketLabel } from "@/lib/placed-by";
import { StageSelect } from "./[id]/stage-select";
import { OffersDueBit } from "./offers-due";
import { parsePrice, priceRange, priceRangeShort, type BuyBoxCoverage } from "@/lib/criteria";
import { compareSortValues, pipelineSortValue, type PipelineSortKey, type SortDir } from "@/lib/pipeline-sort";
import { PERSONAL_TAG, PICTURE_TIERS, dealTags, olderScreenTag, placeTagsByTier, type DealTag, type TagTone } from "@/lib/pipeline-tags";
import { SHARING_OPTIONS, dealLanding, matchesSharing } from "@/lib/personal-deal";
// Why a fit wears "First read": it is judged on the first signal, before the
// extraction lands — the deal page's buy-box panel says the same, and the
// CSV and the meeting workbook mark the figure with the same words.
import { FIRST_READ_TITLE, markFirstRead } from "@/lib/first-read";
import { CAP_WITHHELD, capCellText, ownYieldOf } from "@/lib/cap-slot";
import { PLAN_YOC_TITLE, YOC_WITHHELD } from "@/lib/plan-facts";
import { FOLD_WORD, checkedOf, checkedSentence, fitCellText, fitScoreLabel, fitTone, type FitTone } from "@/lib/fit-label";
import type { AllowancePool, DealAllowance } from "@/lib/deal-allowance";
import { DEAL_NAME_MAX, nameIsFromFile, prefillName, restoredFileName } from "@/lib/deal-name";
import {
  STAGES,
  STAGE_LABEL,
  normalizeStage,
  type Stage,
} from "@/lib/stages";

export type DealCard = {
  id: string;
  name: string;
  assetClass: string;
  createdAt: string;
  verdict: string | null; // "pass" | "caution" | "pass_on" | null
  /** the user's own tracker, independent of the verdict (raw DB value —
   *  normalized via lib/stages when read) */
  stage: string;
  /** teammate who added this team deal (null when it's yours) */
  addedBy: string | null;
  /** the deal is in the reader's own pipeline while the reader is on a team
   *  — no team holds it, so the teammates do not see it (lib/personal-deal);
   *  absent off a team */
  personal?: boolean;
  /** deterministic buy-box result against the user's mandate */
  fit: "fits" | "near" | "outside" | null;
  /** how many of the box's criteria the fit stands on (lib/criteria
   *  `buyBoxCoverage`): the card says "2 of 4 checked" where not every one
   *  could be, and draws no green while one the price decides is among them */
  fitCoverage?: BuyBoxCoverage | null;
  /** 0–100 mandate-fit score + its PURSUE/WATCH/PASS call (null pre-screen) */
  score: number | null;
  mandateVerdict: "PURSUE" | "WATCH" | "PASS" | null;
  /** the fit is judged on the first signal alone — the extraction has not
   *  landed — and is marked "first read", as the deal page marks it */
  fitFirstRead?: boolean;
  market: string;
  /** covered-market name when the address maps into the 15-market scope
   *  (computed server-side, lib/market-county's placeDeal) — null outside it */
  coveredMarket: string | null;
  /** the metro area whose figures are read and nothing briefed: one read
   *  without a brief, or one the deal's county placed it in (server-side,
   *  placeDeal) — null outside one or where the address is a covered
   *  market's */
  readMarket?: string | null;
  /** where the deal's county alone placed it in `readMarket` (#447):
   *  "Collin County, TX" — the row names the county rather than "read" */
  readCounty?: string | null;
  /** the broker's call-for-offers date (ISO yyyy-mm-dd), if set */
  offersDue: string | null;
  /** table figures — null renders as an em-dash placeholder */
  slots: { cap: string | null; price: string | null; yoc: string | null; yocWithheld?: string | null; plan?: boolean; capWithheld?: "note" | "position" | "share" | "under_water" | null; noteYield?: string | null; interest?: string | null; debt?: string | null; affordable?: string | null; tenancy?: string | null; hotel?: string | null; sale?: string | null; roster?: string | null; valueAdd?: string | null; abatement?: string | null; sellerNote?: string | null; reports?: string | null; broker?: string | null; student?: string | null; mh?: string | null; storage?: string | null; regulation?: string | null; forward?: string | null; mixedUse?: string | null; goingConcern?: string | null; condo?: string | null; sandwich?: string | null; exchange?: string | null; basis?: string | null };
  /** latest analysis-job state: a live run, one that stopped writing
   *  progress (its process died), or a failure that left the verdict behind */
  jobStatus?: "running" | "stalled" | "failed" | null;
  /** a live screen has not read the memorandum's terms yet (lib/pipeline-
   *  slots `readingTerms`): an empty slot is "not read yet" and shimmers,
   *  where a finished read's empty slot keeps the dash that says "not
   *  stated" */
  reading?: boolean;
  /** whether a memorandum is on file: a deal typed in from its facts has
   *  none, and its first screen reads no OM (the batch-2 audit) */
  hasOm?: boolean;
  /** a buy box stands against the deal, so a fit is scored once the terms
   *  are read — without one, the fit's dash is final */
  hasBox?: boolean;
  /** the deal has an address, so an aerial thumbnail can be attempted */
  hasAddress: boolean;
  /** FEMA's flood zone at the building (lib/site-flags, #426): `tag` only in
   *  a Special Flood Hazard Area ("Flood AE"), `cell` for the CSV in every
   *  case; absent before the lookup has answered */
  flood?: { tag: string | null; cell: string } | null;
  /** the pictures the card view tries, best first, each pinned to one
   *  source with its own credit (lib/deal-banner, #428) */
  pictures?: BannerSource[];
  /** the pictures a list row's thumbnail tries, at its own frame (#442) */
  thumbs?: BannerSource[];
  /** what the card and the row show where no photograph answers: the deal's
   *  cover (lib/deal-cover, #442), never an overhead */
  cover?: DealCoverFacts | null;
  /** the photographs the deal page holds — its cover and the memorandum's
   *  others (#448); 0 where the card shows none of them */
  photos?: number;
  /** the memorandum's other photographs, the card flips through over its
   *  own photograph (#450), each pinned to its route with its credit */
  slides?: BannerSource[];
  /** where the deal is, from the location its pictures were drawn at
   *  (lib/deal-location's cache, #431); null until one is resolved */
  place?: MapPlace | null;
  /** a geocoder definitively found nothing for the address */
  placeMiss?: boolean;
  /** the screen was stored before a reader its figures turn on (lib/older-
   *  screen): the server's sentence, worn as the "Older screen" chip on the
   *  card's line and the row's, the sentence in its title */
  older?: string | null;
};

// How the pipeline is drawn, and which view is remembered, live in
// lib/pipeline-view (#438): the page is a server component and reads them,
// and an export of this "use client" module is only a client reference there.
export type { PipelineView } from "@/lib/pipeline-view";

// The cap slot's words where it holds no cap of the deal's own — a note's
// or a position's own yield, or why the cap is withheld — live in
// lib/cap-slot, import-free, so the CSV's cell is tested and the words are
// held to the server's copy.

/** A card as the map reads it. */
function mapDealOf(d: DealCard): MapDeal {
  return {
    id: d.id,
    name: d.name,
    verdict: d.verdict,
    price: d.slots.price ? compactPrice(d.slots.price) : null,
    figure: d.slots.cap
      ? `${d.slots.cap} cap`
      : d.slots.yoc
        ? `${d.slots.yoc} yield on cost`
        : d.slots.noteYield
          ? `${d.slots.noteYield} ${ownYieldOf(d.slots.capWithheld).to}`
          : null,
    place: d.place ?? null,
    placeMiss: d.placeMiss,
    hasAddress: d.hasAddress,
  };
}

/** One row per deal: name · asset · price · cap · buy box · status · added.
 *  Every column is sortable from its header, and so is the call-for-offers
 *  date the deal's own cell carries. What each deal sorts on under a
 *  column is lib/pipeline-sort's `pipelineSortValue`. */
type SortKey = PipelineSortKey;

/** The price as a table wants it — "$68.0M", "$950k" — with the OM's own
 *  figure kept for the tooltip and the CSV. A column eighty pixels wide
 *  showed every deal as "$68,000,…" before; the raw string stays when it
 *  is not a figure at all ("Call for offers"). */
function compactPrice(raw: string): string {
  // Guidance stated as a range stays one (#466) — "$40–42M" — where the
  // first cut showed its bottom alone, the flattering end, as the price.
  const range = priceRange(raw);
  if (range) return priceRangeShort(range);
  // The price reader's own figure: a value that is no price ("6.25% cap
  // rate", "185,000 per unit") stays as written rather than a "$6".
  const n = parsePrice(raw);
  if (n == null || !(n > 0)) return raw;
  // Rounded as every surface rounds a compact figure (lib/money): "$5.5M"
  // here had stood beside the memo's "$5.6M" for a $5,550,000 price.
  return compactUsd(n);
}

// The fit's words and the score's call; their colour is the tone's alone
// (`FIT_TONE_CLS`), never a word's own.
const FIT_META: Record<NonNullable<DealCard["fit"]>, { label: string }> = {
  outside: { label: FOLD_WORD.outside },
  near: { label: FOLD_WORD.near },
  fits: { label: FOLD_WORD.fits },
};

/** A fit's colour by its tone (lib/fit-label `fitTone`): the call's, and
 *  muted — never green — while a criterion the price decides could not be
 *  checked, as the deal header's chip is. */
const FIT_TONE_CLS: Record<FitTone, string> = {
  pass: "text-pass",
  caution: "text-caution",
  kill: "text-kill",
  muted: "text-muted",
};

const MANDATE_META: Record<NonNullable<DealCard["mandateVerdict"]>, { label: string }> = {
  PASS: { label: "Pass" },
  WATCH: { label: "Watch" },
  PURSUE: { label: "Pursue" },
};

/** First click on a header sorts the way people expect that column to lead:
 *  text A→Z, figures biggest-first, dates newest-first, best fits first, and
 *  the offers due soonest first. */
const DEFAULT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  asset: "asc",
  price: "desc",
  cap: "desc",
  fit: "desc",
  status: "desc",
  added: "desc",
  due: "asc",
};

const VERDICT_META: Record<string, { label: string; cls: string }> = {
  pass_on: { label: "No-go", cls: "bg-kill/15 text-kill" },
  caution: { label: "Caution", cls: "bg-caution/10 text-caution" },
  pass: { label: "Go", cls: "bg-pass/10 text-pass" },
};

/** Each asset class reads as its own kind of thing at a glance: a colour dot
 *  beside the class name and a thin rail down the row's left edge, one hue per
 *  class (tokens in globals.css). Deliberately quiet — the verdict colours
 *  still carry the loudest signal on the row. */
const ASSET_META: Record<string, { dot: string; rail: string }> = {
  multifamily: { dot: "bg-asset-multifamily", rail: "border-l-asset-multifamily" },
  office: { dot: "bg-asset-office", rail: "border-l-asset-office" },
  industrial: { dot: "bg-asset-industrial", rail: "border-l-asset-industrial" },
  retail: { dot: "bg-asset-retail", rail: "border-l-asset-retail" },
};
const OTHER_ASSET = { dot: "bg-asset-other", rail: "border-l-asset-other" };
const assetMeta = (cls: string) => ASSET_META[cls.toLowerCase()] ?? OTHER_ASSET;

/** The ladder's steps at funnel width — the group headers keep the full
 *  labels; the funnel has room for one word each. */
const SHORT_STAGE: Record<Stage, string> = {
  screening: "Screening",
  tracking: "Tracking",
  active_pursuit: "Pursuit",
  loi_submitted: "LOI",
  under_contract: "Contract",
  closed: "Closed",
  dead: "Dead",
};

/** "Jordan Lee" → "JL"; an email → its first letter. */
function initials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 1);
  return letters.toUpperCase();
}

// One cached formatter — constructing Intl.DateTimeFormat per call costs
// ~50ms per full-list render at 500 rows. Pinned to UTC so the server and
// client render the same string (no hydration mismatch from timezones).
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function fmtDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

const PERSIST_KEY = "uc-pipeline-view";

type BillingInfo = {
  isPro: boolean;
  canCreateDeal: boolean;
  /** the free deals left and where the next one lands, by the create
   *  action's own rule (lib/deal-allowance, read by the page) */
  allowance: DealAllowance;
};

export type OnboardingState = {
  hasBuyBox: boolean;
  sampleId: string | null;
  /** a memorandum a screen has finished (lib/onboarding `screenedAnOm`) —
   *  not a deal typed in by hand, nor a screen still running */
  hasScreenedOm: boolean;
};

export function Pipeline({
  deals,
  errorMessage,
  notice,
  openNew,
  prefillAddress,
  onboarding,
  billing,
  initialView = "cards",
  viewerId = null,
  onTeam = false,
  todayIso,
}: {
  deals: DealCard[];
  errorMessage: string | null;
  notice?: string | null;
  /** open the new-deal form (?new=<nonce> — the ⌘K "New deal…" action). A
   *  fresh nonce per invocation re-triggers the effect even when the form
   *  was closed and the param is still in the URL. */
  openNew?: string;
  /** structured address handed in from Pull Comps ("screen this address") —
   *  opens the form on the manual tab with the address pre-picked. */
  prefillAddress?: StructuredAddress | null;
  onboarding?: OnboardingState;
  billing: BillingInfo | null;
  /** the view the reader last chose, read from its cookie by the page */
  initialView?: PipelineView;
  /** the signed-in reader's id, whose own the new-deal form's draft is */
  viewerId?: string | null;
  /** the reader is on a team: the pipeline holds the team's deals beside
   *  the reader's own, and a filter tells the two apart */
  onTeam?: boolean;
  /** the page's day (the reader's own, yyyy-mm-dd — lib/reader-day), read
   *  once per request by the server: every offers-due countdown on the list
   *  counts from it, so the server's markup and the browser's are the same
   *  day */
  todayIso: string;
}) {
  const [query, setQuery] = useState("");
  const [view, setViewState] = useState<PipelineView>(initialView);
  const setView = useCallback((v: PipelineView) => {
    setViewState(v);
    // Only the cards or the list is remembered: the map is for this visit.
    if (!remembersView(v)) return;
    try {
      document.cookie = `${PIPELINE_VIEW_COOKIE}=${v}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // cookies unavailable — the choice lasts this visit
    }
  }, []);
  const [verdict, setVerdict] = useState("all");
  const [stage, setStage] = useState("all");
  const [asset, setAsset] = useState("all");
  const [market, setMarket] = useState("all");
  // Mandate-fit filter (Feature 4): all / PURSUE / WATCH / PASS.
  const [mfit, setMfit] = useState("all");
  // On a team: the shared pipeline's deals, or the reader's own the team
  // does not see (lib/personal-deal).
  const [sharing, setSharing] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("added");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  // Dead deals stay out of the pipeline until asked for (or filtered to).
  const [showDead, setShowDead] = useState(false);
  // Which stage sections the user has explicitly collapsed/expanded — until
  // touched, a section's default is open-when-populated / collapsed-when-empty.
  const [collapsed, setCollapsed] = useState<Partial<Record<Stage, boolean>>>({});
  const searchRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(!!errorMessage || !!openNew);

  // Filters and view state persist across navigation (deal page and back)
  // within the tab. Restored after mount so server and client first paint
  // identically; saves are gated until the restore has run, otherwise the
  // very first render would overwrite the saved state with defaults.
  const viewRestored = useRef(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        const saved = sessionStorage.getItem(PERSIST_KEY);
        if (saved) {
          const v = JSON.parse(saved) as Partial<{
            verdict: string;
            stage: string;
            asset: string;
            market: string;
            mfit: string;
            sharing: string;
            showDead: boolean;
            collapsed: Partial<Record<Stage, boolean>>;
          }>;
          if (typeof v.verdict === "string") setVerdict(v.verdict);
          if (typeof v.stage === "string") setStage(v.stage);
          if (typeof v.asset === "string") setAsset(v.asset);
          if (typeof v.market === "string") setMarket(v.market);
          if (typeof v.mfit === "string") setMfit(v.mfit);
          if (typeof v.sharing === "string") setSharing(v.sharing);
          if (typeof v.showDead === "boolean") setShowDead(v.showDead);
          if (v.collapsed && typeof v.collapsed === "object")
            setCollapsed(v.collapsed);
        }
      } catch {
        // corrupt/absent state — defaults stand
      }
      viewRestored.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, []);
  useEffect(() => {
    if (!viewRestored.current) return;
    try {
      sessionStorage.setItem(
        PERSIST_KEY,
        JSON.stringify({ verdict, stage, asset, market, mfit, sharing, showDead, collapsed }),
      );
    } catch {
      // storage unavailable — view state is per-visit only
    }
  }, [verdict, stage, asset, market, mfit, sharing, showDead, collapsed]);

  // The ⌘K "New deal…" action lands here as ?new=1 — honor it even when the
  // pipeline is already mounted (client-side navigation keeps state). The
  // setState is rAF-deferred so the effect body stays synchronous-free.
  useEffect(() => {
    if (!openNew) return;
    const raf = requestAnimationFrame(() => setShowForm(true));
    return () => cancelAnimationFrame(raf);
  }, [openNew]);
  const [compareMode, setCompareMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // While any deal is mid-screen — a first screen or a re-screen — refresh
  // the list every few seconds so the verdict lands without a manual reload.
  const router = useRouter();
  const anyRunning = deals.some((d) => d.jobStatus === "running");
  useEffect(() => {
    if (!anyRunning) return;
    const t = setInterval(() => router.refresh(), 7000);
    return () => clearInterval(t);
  }, [anyRunning, router]);

  // Keyboard shortcuts: "/" jumps to search, "n" opens the new-deal form,
  // Escape closes it. Ignored while typing in any field.
  const atLimitRef = !!billing && !billing.canCreateDeal;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Another handler (the ⌘K palette's Escape) already consumed this key,
      // or focus sits inside an open dialog — the page shortcuts stand down.
      if (e.defaultPrevented) return;
      const t = e.target as HTMLElement | null;
      if (t && t.closest('[role="dialog"]')) return;
      const typing =
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.tagName === "SELECT" ||
          t.isContentEditable);
      if (e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return;
      // Never let Escape nuke the form while the user is in a field — that's
      // how browsers cancel autofill/IME, and search inputs clear on Escape.
      if (typing) return;
      if (e.key === "Escape") {
        setShowForm(false);
        return;
      }
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "n" && !atLimitRef) {
        e.preventDefault();
        setShowForm(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [atLimitRef]);

  const COMPARE_MAX = 4;
  // Stable identity so memoized rows don't re-render on unrelated changes.
  const toggleSelected = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < COMPARE_MAX) next.add(id);
      return next;
    });
  }, []);

  // Free users who've hit the cap can't open the create form — they upgrade.
  const atLimit = !!billing && !billing.canCreateDeal;
  // The meter shows wherever a cap applies to the next deal: the reader's
  // own free deals, and a team trial's before them.
  const allowance = billing?.allowance ?? null;
  const showUsage = allowance?.left != null;

  const assets = useMemo(
    () => Array.from(new Set(deals.map((d) => d.assetClass).filter(Boolean))).sort(),
    [deals],
  );
  const markets = useMemo(
    () => Array.from(new Set(deals.map((d) => d.market).filter(Boolean))).sort(),
    [deals],
  );
  // Only surface the mandate-fit filter once at least one deal carries a score.
  const hasScores = useMemo(() => deals.some((d) => !!d.mandateVerdict), [deals]);

  // Typing stays instant even with hundreds of rows: the list follows the
  // query at deferred priority.
  const deferredQuery = useDeferredValue(query);
  const filtered = useMemo(() => {
    const q = deferredQuery.trim().toLowerCase();
    const list = deals.filter((d) => {
      const dealStage = normalizeStage(d.stage);
      if (
        q &&
        !`${d.name} ${d.market} ${d.coveredMarket ?? ""}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      if (verdict !== "all") {
        if (verdict === "screening") {
          if (d.verdict) return false;
        } else if (d.verdict !== verdict) return false;
      }
      if (stage !== "all" && dealStage !== stage) return false;
      // Dead deals stay out of the clean pipeline unless the user asked for
      // them — explicitly filtering to Dead counts as asking.
      if (dealStage === "dead" && !showDead && stage !== "dead") return false;
      if (asset !== "all" && d.assetClass !== asset) return false;
      if (market !== "all" && d.market !== market) return false;
      if (mfit !== "all" && d.mandateVerdict !== mfit) return false;
      // Only where the filter is drawn: a choice saved on a team never
      // hides deals once the reader is off it.
      if (onTeam && !matchesSharing(sharing, !!d.personal)) return false;
      return true;
    });
    return list.sort((a, b) => {
      const cmp = compareSortValues(pipelineSortValue(a, sortKey), pipelineSortValue(b, sortKey), sortDir);
      // Ties fall back to newest-first so the order stays stable and sane.
      const tie = sortKey === "added" ? 0 : b.createdAt.localeCompare(a.createdAt);
      return cmp || tie;
    });
  }, [deals, deferredQuery, verdict, stage, asset, market, mfit, onTeam, sharing, sortKey, sortDir, showDead]);

  // The pipeline reads as one ladder: deals grouped by stage, in stage order,
  // each group internally sorted by the active column sort.
  const groups = useMemo(() => {
    const byStage = new Map<Stage, DealCard[]>(STAGES.map((s) => [s, []]));
    for (const d of filtered) byStage.get(normalizeStage(d.stage))!.push(d);
    return byStage;
  }, [filtered]);

  const deadCount = useMemo(
    () => deals.filter((d) => normalizeStage(d.stage) === "dead").length,
    [deals],
  );

  // Which market photograph each card settled on (DealBanner's report), for
  // the one credit line under the cards: a card has no room for the links a
  // Creative Commons credit carries, and a link inside the card's own link
  // is not one. Only the photographs on screen are credited — never one a
  // card fell past, one a memorandum photograph loaded over, or one in a
  // folded stage.
  const [marketShown, setMarketShown] = useState<ReadonlyMap<string, string | null>>(new Map());
  const reportMarket = useCallback((id: string, marketId: string | null) => {
    setMarketShown((prev) => {
      if (prev.has(id) && prev.get(id) === marketId) return prev;
      const next = new Map(prev);
      next.set(id, marketId);
      return next;
    });
  }, []);

  /** A section is open unless the user collapsed it; an EMPTY section starts
   *  collapsed until the user opens it. */
  function isOpen(s: Stage): boolean {
    const explicit = collapsed[s];
    if (explicit !== undefined) return !explicit;
    return (groups.get(s)?.length ?? 0) > 0;
  }
  /** A stage drawn at all: dead lives behind its toggle, and an empty rung
   *  is the funnel's to show. */
  function sectionDrawn(s: Stage): boolean {
    if (s === "dead" && !showDead && stage !== "dead") return false;
    return (groups.get(s)?.length ?? 0) > 0;
  }
  const cardsOnScreen =
    view === "cards" ? STAGES.flatMap((s) => (sectionDrawn(s) && isOpen(s) ? (groups.get(s) ?? []) : [])) : [];
  const marketPhotoCredits = shownMarketCredits(cardsOnScreen, marketShown);
  function toggleSection(s: Stage) {
    setCollapsed((c) => ({ ...c, [s]: isOpen(s) }));
  }

  function toggleSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(k);
      setSortDir(DEFAULT_DIR[k]);
    }
  }

  const verdictCounts = useMemo(() => {
    const c = { pass: 0, caution: 0, pass_on: 0, screening: 0 };
    for (const d of deals) {
      if (d.verdict && d.verdict in c) c[d.verdict as keyof typeof c]++;
      else if (!d.verdict) c.screening++;
    }
    return c;
  }, [deals]);
  // Every deal's rung on the ladder — the funnel's counts (dead deals have
  // their own toggle; the funnel leaves them out).
  const stageCounts = useMemo(() => {
    const c = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>;
    for (const d of deals) c[normalizeStage(d.stage)]++;
    return c;
  }, [deals]);

  function clearFilters() {
    setQuery("");
    setVerdict("all");
    setStage("all");
    setAsset("all");
    setMarket("all");
    setMfit("all");
    setSharing("all");
  }
  const filtersActive =
    query.trim() !== "" ||
    verdict !== "all" ||
    stage !== "all" ||
    asset !== "all" ||
    market !== "all" ||
    mfit !== "all" ||
    (onTeam && sharing !== "all");
  // The filters a phone folds behind one row, counted for its summary
  // ("Filters · 2 set"): the selects and the dead deals' toggle — never the
  // search beside it, or the verdict chips above it, which show their own.
  const filtersSet = [
    stage !== "all",
    asset !== "all",
    market !== "all",
    mfit !== "all",
    onTeam && sharing !== "all",
    deadCount > 0 && showDead,
  ].filter(Boolean).length;
  // Open when any is set (a saved view restored, a rung tapped), and as the
  // reader leaves it once they have opened or closed it themselves.
  const [foldOpen, setFoldOpen] = useState<boolean | null>(null);
  const filtersOpen = foldOpen ?? filtersSet > 0;
  // Export the current (filtered) view as a CSV — opens in Excel/Sheets.
  function exportCsv() {
    // Neutralize formula-leading cells (=, +, -, @) — deal names and OM-derived
    // text are untrusted and must never execute when the CSV opens in Excel.
    const esc = (v: string) => {
      const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    // A plan deal's cap cell says "n/a — plan" and its yield on cost sits in
    // its own column — the same two cells the meeting .xlsx writes, in its
    // words (lib/cap-slot `PLAN_CAP_NA`); the cell had been blank, which
    // reads as a cap the memorandum does not state.
    const header = ["Deal", "Asset class", "Market", "Market read", "Price", "Basis", "What the price buys", "Assumable debt", "Seller financing", "Affordability", "Tenancy", "Tenants", "Value-add", "Tax abatement", "Hotel", "Sale", "Reports", "Student housing", "Manufactured housing", "Self-storage", "Rent regulation", "Forward purchase", "Mixed-use", "Operating business", "Condominium", "Sandwich position", "1031 exchange", "Flood zone", "Cap rate", "Yield on cost", "Buy box", "Mandate score", "Mandate fit", "Status", "Stage", "Offers due", "Broker", "Added", "Added by"];
    const lines = filtered.map((d) =>
      [
        d.name,
        assetClassLabel(d.assetClass),
        d.market,
        // What the row itself names (lib/placed-by): the briefed market, or
        // the metro area read for it and how — never blank where the row
        // says "Pittsburgh PA · read" or "Dallas–Fort Worth · Collin County".
        rowMarketLabel(d) ?? "",
        d.slots.price ?? "",
        // The price by the unit, the key or the foot (#469); blank where
        // the count or the area is not stated, and on a conversion or a
        // development (whose basis is the all-in cost). A value-add's is the
        // price over the building as it stands, not the plan's all-in basis.
        d.slots.basis ?? "",
        // Blank on a fee simple — the price is the building's.
        d.slots.interest ?? "",
        // Blank where no loan is offered for assumption (#419).
        d.slots.debt ?? "",
        // Blank unless the seller offers to carry financing (#462).
        d.slots.sellerNote ?? "",
        // Blank on a market-rate deal (#453).
        d.slots.affordable ?? "",
        // Blank unless one tenant leases the whole property (#454).
        d.slots.tenancy ?? "",
        // Blank unless the listed tenants hold a shadow anchor or a roll
        // before the model's sale (#457).
        d.slots.roster ?? "",
        // Blank unless the memorandum states a renovation premium (#460).
        d.slots.valueAdd ?? "",
        // Blank unless the memorandum states a tax abatement (#461).
        d.slots.abatement ?? "",
        // Blank on anything but a hotel (#455).
        d.slots.hotel ?? "",
        // Blank on a negotiated sale (#456).
        d.slots.sale ?? "",
        // Blank unless the reports the memorandum cites found something (#465).
        d.slots.reports ?? "",
        // Blank on anything but student housing (#468).
        d.slots.student ?? "",
        // Blank on anything but a manufactured-housing park (#470).
        d.slots.mh ?? "",
        // Blank on anything but self-storage (#471).
        d.slots.storage ?? "",
        // Blank where no rent rule reaches the building and the memorandum
        // names no regime (lib/rent-regulation).
        d.slots.regulation ?? "",
        // Blank unless the buyer pays for the building at its delivery
        // (lib/forward-purchase).
        d.slots.forward ?? "",
        // Blank unless both halves of a mixed-use building's income, or the
        // commercial area and the building's, are stated (lib/mixed-use).
        d.slots.mixedUse ?? "",
        // Blank unless the memorandum names an operating business or states
        // its EBITDA (lib/going-concern).
        d.slots.goingConcern ?? "",
        // Blank unless the deal's own words name a condominium and the
        // memorandum states one of its figures (lib/condo).
        d.slots.condo ?? "",
        // Blank unless the price buys a master lease of the building, sublet,
        // and the memorandum states both rents (lib/sandwich-lease).
        d.slots.sandwich ?? "",
        // Blank unless the reader's buy box holds a 1031 exchange still
        // running: its deadlines against the row's (lib/exchange-deal).
        d.slots.exchange ?? "",
        // Every case said; blank only before FEMA's lookup has answered (#426).
        d.flood?.cell ?? "",
        // A plan deal's cap is "n/a — plan", as the meeting workbook says
        // it. A note's or a position's cap is withheld, its own yield in the
        // column as the card shows it ("17.0% to maturity"), else the cap
        // said withheld rather than left blank (#423).
        capCellText(d.slots),
        // A yield no project earns is refused in the plan's own words.
        d.slots.yoc ?? (d.slots.yocWithheld ? YOC_WITHHELD : ""),
        // A fit judged on the first signal, before the extraction lands, is
        // marked on each of its figures as the card marks it — "Near (first
        // read)" — since a CSV is read away from the page (lib/first-read);
        // and the fit says how many of the box's criteria it stands on where
        // not every one could be checked, "Fits (2 of 4)", as the meeting
        // workbook's cell does (lib/fit-label `fitCellText`).
        fitCellText(d.fit ? FIT_META[d.fit].label : "", d.fitCoverage, d.fitFirstRead),
        markFirstRead(d.score != null ? String(d.score) : "", d.fitFirstRead),
        // The score's call in the deal header's chip's own words (lib/
        // fit-label `fitScoreLabel`): "Outside box" on a miss outright, and
        // the count in the call's place where the screen could not check
        // every criterion ("2 of 4 checked"), never a bare "Pursue" over half
        // the box.
        markFirstRead(
          d.mandateVerdict && d.score != null
            ? fitScoreLabel(d.score, d.mandateVerdict, d.fit === "outside", d.fitCoverage).replace(/^Fit \d+ · /, "")
            : d.mandateVerdict
              ? MANDATE_META[d.mandateVerdict].label
              : "",
          d.fitFirstRead,
        ),
        d.jobStatus === "failed"
          ? "Failed"
          : d.jobStatus === "stalled"
            ? "Stalled"
            : d.jobStatus === "running"
              ? d.verdict
                ? "Re-screening"
                : "Screening"
              : d.verdict
                ? (VERDICT_META[d.verdict]?.label ?? d.verdict)
                : "Not screened",
        STAGE_LABEL[normalizeStage(d.stage)],
        d.offersDue ?? "",
        // The brokerage the memorandum names (#467).
        d.slots.broker ?? "",
        // ISO like the deadline column, so both parse as dates in Excel.
        d.createdAt.slice(0, 10),
        d.addedBy ?? "You",
      ]
        .map(esc)
        .join(","),
    );
    // BOM so Excel on Windows reads UTF-8 (names/markets can be non-ASCII).
    const csv = "\ufeff" + [header.map(esc).join(","), ...lines].join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "pipeline.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      {/* Wraps on a phone: "Compare" + "Upgrade for more" beside the title
          otherwise push the page 30px past the viewport at the deal limit. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pipeline</h1>
          {(deals.length > 0 || showUsage) && (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
              {deals.length > 0 && (
                <span>
                  {deals.length} {deals.length === 1 ? "deal" : "deals"}
                </span>
              )}
              {showUsage && allowance && allowance.left != null && (
                // The free allowance as a meter with the number, not a
                // sentence: a track a pool, the team's trial first — the
                // create action takes the next deal from it — then the
                // reader's own (lib/deal-allowance).
                <Link
                  href="/billing"
                  title={allowance.line ?? undefined}
                  className={`inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline ${
                    atLimit ? "text-caution" : ""
                  }`}
                >
                  <span aria-hidden className="flex w-12 items-center gap-0.5">
                    {allowance.teamTrial ? <MeterPool pool={allowance.teamTrial} atLimit={atLimit} which="team" /> : null}
                    {allowance.personal ? <MeterPool pool={allowance.personal} atLimit={atLimit} which="personal" /> : null}
                  </span>
                  {allowance.left} free {allowance.left === 1 ? "deal" : "deals"} left
                  {allowance.teamTrial ? <span className="sr-only">. {allowance.line}</span> : null}
                </Link>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {deals.length >= 2 && (
            <button
              type="button"
              onClick={() => {
                setCompareMode((c) => !c);
                setSelected(new Set());
              }}
              className={`rounded-lg border px-3.5 py-2.5 text-sm font-medium transition-colors ${
                compareMode
                  ? "border-brand bg-brand/5 text-brand"
                  : "border-line bg-surface hover:bg-faint"
              }`}
            >
              {compareMode ? "Done" : "Compare"}
            </button>
          )}
          {atLimit ? (
            <Link
              href="/billing"
              className="shadow-card hover-lift rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white"
            >
              Upgrade for more
            </Link>
          ) : (
            // The empty state carries its own CTA — don't show two primaries.
            deals.length > 0 && (
              <button
                type="button"
                onClick={() => setShowForm((s) => !s)}
                aria-expanded={showForm}
                className="shadow-card hover-lift rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white"
              >
                {showForm ? "Close" : "+ New deal"}
              </button>
            )
          )}
        </div>
      </div>

      {notice && (
        <p className="rounded-lg bg-pass/10 px-3 py-2 text-sm text-pass">
          {notice}
        </p>
      )}

      {onboarding && (
        <GettingStarted
          state={onboarding}
          atLimit={atLimit}
          onNewDeal={() => setShowForm(true)}
        />
      )}

      {/* The pipeline in one picture: the ladder with a count on each rung
          (each a one-tap stage filter) and the calls' split as one bar with
          its chips (each a one-tap verdict filter). */}
      {deals.length > 0 && (
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card lg:flex-row lg:items-center lg:gap-8">
          <StageFunnel counts={stageCounts} active={stage} onPick={setStage} />
          <VerdictSplit counts={verdictCounts} active={verdict} onPick={setVerdict} />
        </div>
      )}

      {compareMode && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3">
          <p className="text-sm font-medium">
            {selected.size === 0
              ? "Select 2–4 deals to compare."
              : selected.size >= COMPARE_MAX
                ? `${selected.size} of ${COMPARE_MAX} selected`
                : `${selected.size} selected`}
          </p>
          {selected.size >= 2 ? (
            <Link
              href={`/deals/compare?ids=${[...selected].join(",")}`}
              className="ml-auto rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
            >
              Compare {selected.size} deals
            </Link>
          ) : (
            <span className="ml-auto text-xs text-muted">
              {selected.size === 1 ? "Pick one more" : ""}
            </span>
          )}
        </div>
      )}

      {showForm && !atLimit && (
        <NewDealForm errorMessage={errorMessage} prefill={prefillAddress ?? null} viewerId={viewerId} />
      )}
      {atLimit && errorMessage && (
        <section className="rounded-xl border border-caution/30 bg-caution/5 p-5">
          <p role="alert" className="text-sm font-medium text-caution">
            {errorMessage}
          </p>
          <Link
            href="/billing"
            className="mt-3 inline-flex rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            See plans
          </Link>
        </section>
      )}

      {deals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative max-sm:min-w-0 max-sm:flex-1">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              aria-hidden
            >
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search deals…  ( / )"
              aria-label="Search deals"
              className="w-48 rounded-lg border border-line bg-surface py-1.5 pl-9 pr-3 text-sm shadow-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 max-sm:w-full"
            />
          </div>
          {/* Below sm the filters fold behind one row (research pass 29: four
              selects stacked two by two pushed a phone's first photograph
              off its first screen): this summary, saying how many are set,
              opens the selects that follow it, and is open when any is set.
              From sm up it is gone and the selects sit in the row as ever
              (`sm:contents`) — they follow the details rather than sit in it,
              since a closed details hides its contents at every width. */}
          <details
            data-filters="fold"
            open={filtersOpen}
            onToggle={(e) => setFoldOpen(e.currentTarget.open)}
            className="peer/filters group/filters sm:hidden"
          >
            <summary
              className={`inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 [&::-webkit-details-marker]:hidden ${
                filtersSet > 0 ? "border-brand bg-brand/5 text-brand" : "border-line bg-surface text-ink hover:bg-faint"
              }`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
                <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />
              </svg>
              {filtersFoldLabel(filtersSet)}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-3.5 w-3.5 transition-transform group-open/filters:rotate-180">
                <path d="m6 9 6 6 6-6" />
              </svg>
            </summary>
          </details>
          <div data-filters="selects" className="hidden w-full flex-wrap items-center gap-2 max-sm:peer-open/filters:flex sm:contents">
            {/* The verdict filter is the split's chips above; the stage filter
                is the funnel's rungs — this select is the keyboard-and-phone
                route to the same thing. */}
            <FilterSelect
              label="Filter by stage"
              value={stage}
              onChange={setStage}
              options={[
                ["all", "All stages"],
                ...STAGES.map((s) => [s, STAGE_LABEL[s]] as [string, string]),
              ]}
            />
            {assets.length > 1 && (
              <FilterSelect
                label="Filter by asset class"
                value={asset}
                onChange={setAsset}
                className="max-w-40"
                options={[
                  ["all", "All assets"],
                  ...assets.map((a) => [a, assetClassLabel(a)] as [string, string]),
                ]}
              />
            )}
            {/* A select is as wide as its longest option, and a market name can
                run to a whole line ("Washington, DC (DC Proper / Fort Totten …)")
                — capped, so the row keeps every filter on one line at desktop
                width instead of stranding the next one below. */}
            {markets.length > 1 && (
              <FilterSelect
                label="Filter by market"
                value={market}
                onChange={setMarket}
                className="max-w-48"
                options={[
                  ["all", "All markets"],
                  ...markets.map((m) => [m, m] as [string, string]),
                ]}
              />
            )}
            {hasScores && (
              <FilterSelect
                label="Filter by mandate fit"
                value={mfit}
                onChange={setMfit}
                options={[
                  ["all", "All fit"],
                  ["PURSUE", "Pursue · 75+"],
                  ["WATCH", "Watch · 50–74"],
                  ["PASS", "Pass · <50"],
                ]}
              />
            )}
            {/* On a team the list holds the shared pipeline's deals beside the
                reader's own, which the team does not see (lib/personal-deal). */}
            {onTeam && (
              <FilterSelect
                label="Filter by sharing"
                value={sharing}
                onChange={setSharing}
                options={SHARING_OPTIONS}
              />
            )}
            {deadCount > 0 && (
              <button
                type="button"
                aria-pressed={showDead}
                onClick={() => setShowDead((v) => !v)}
                className={`rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm transition-colors ${
                  showDead
                    ? "border-brand bg-brand/5 text-brand"
                    : "border-line bg-surface text-muted hover:bg-faint hover:text-ink"
                }`}
              >
                {showDead ? "Hide dead" : `Show dead (${deadCount})`}
              </button>
            )}
            {/* Below md the column headers are hidden, and the cards have none
                at any width, so sorting lives here. */}
            <FilterSelect
              label="Sort deals"
              value={`${sortKey}:${sortDir}`}
              onChange={(v) => {
                const [k, dir] = v.split(":") as [SortKey, SortDir];
                setSortKey(k);
                setSortDir(dir);
              }}
              className={`ml-auto ${view === "list" ? "md:hidden" : ""}`}
              options={[
                ["added:desc", "Newest"],
                ["added:asc", "Oldest"],
                ["due:asc", "Offers due, earliest"],
                ["price:desc", "Price: high to low"],
                ["cap:desc", "Cap: high to low"],
                ["fit:desc", "Mandate fit: high to low"],
                ["status:desc", "By status"],
                ["name:asc", "Name A–Z"],
              ]}
            />
          </div>
          {/* The two exports travel together at the right edge: when the
              filters wrap, the last line ends with them, never with one
              stranded select beside them. They wrap too: at 320px (a laptop
              at 400%) "Excel" ran off the page (research pass 33). */}
          <div className={`flex flex-wrap items-center gap-2 ${view === "list" ? "md:ml-auto" : ""}`}>
            <ViewToggle view={view} onChange={setView} />
            <button
              type="button"
              onClick={exportCsv}
              disabled={filtered.length === 0}
              title={
                filtered.length === 0
                  ? "Nothing to export — clear the filters first"
                  : "Download the current view as a CSV"
              }
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-faint disabled:cursor-not-allowed disabled:opacity-50"
            >
              <DownloadIcon />
              {/* On a phone the two exports are their icons (their names
                  stay for a screen reader and in the title): with the view
                  toggle beside them the row ran past a 390px screen. */}
              <span className="max-sm:sr-only">CSV</span>
            </button>
            <a
              href="/api/pipeline/export"
              title="The whole pipeline as an Excel workbook — stage-grouped, with verdict and buy-box markers and a summary sheet, for the pipeline meeting"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-faint"
            >
              <SheetIcon />
              <span className="max-sm:sr-only">Excel</span>
            </a>
          </div>
        </div>
      )}

      {deals.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-card">
          <EmptyArt />
          <p className="mt-5 text-base font-semibold tracking-tight">
            Start your pipeline
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Upload an OM or type the deal’s facts. Or open the worked sample first.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            {atLimit ? (
              <Link
                href="/billing"
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
              >
                See plans
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => setShowForm(true)}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
              >
                + New deal
              </button>
            )}
            <form action={createSampleDeal}>
              <PendingButton
                pendingLabel="Setting up your sample…"
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint"
              >
                Try a sample deal
              </PendingButton>
            </form>
          </div>
          <p className="mt-3 text-xs">
            {/* To the metro explorer itself: /market opens a signed-in
                reader on their own market data, which an empty pipeline has
                none of ("No market data yet", and a link back here). */}
            <Link
              href="/market#explorer"
              className="font-medium text-brand hover:text-brand-strong"
            >
              Browse the covered markets →
            </Link>
          </p>
        </div>
      ) : filtered.length === 0 ? (
        deadCount === deals.length && !showDead && stage !== "dead" ? (
          <p className="text-sm text-muted">
            All your deals are marked Dead.{" "}
            <button
              type="button"
              onClick={() => setShowDead(true)}
              className="font-medium text-brand hover:text-brand-strong"
            >
              Show dead deals
            </button>
          </p>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-surface px-6 py-10 text-center">
            <p className="text-sm text-muted">No deals match these filters.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-2 text-sm font-medium text-brand hover:text-brand-strong"
            >
              Clear filters
            </button>
          </div>
        )
      ) : (
        <>
          {filtersActive && (
            <p className="-mb-2 text-xs text-muted">
              {filtered.length} of {deals.length} shown ·{" "}
              <button
                type="button"
                onClick={clearFilters}
                className="font-medium text-brand hover:text-brand-strong"
              >
                clear
              </button>
            </p>
          )}
          {view === "map" && (
            <PipelineMap
              deals={filtered.map(mapDealOf)}
              compareMode={compareMode}
              selected={selected}
              onToggle={toggleSelected}
            />
          )}
          {view !== "map" && (
          <div>
            {/* One header row labels the columns for every group — each label
                is a sort control (sorting applies within each stage group).
                Widths/gaps mirror DealRow exactly; narrower columns join at
                lg, the Added column at xl (the Stage select takes its slot). */}
            {view === "list" && (
            <div className="hidden items-center gap-3 px-5 pb-1.5 md:flex">
              {compareMode && <span className="w-5 shrink-0" />}
              {/* The call for offers is drawn in the deal's own cell, under
                  its name, so its sort sits beside the name's. */}
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <SortHead label="Deal" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                <SortHead label="Offers due" k="due" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </div>
              <SortHead label="Asset" k="asset" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="hidden w-24 lg:flex" />
              <SortHead label="Price" k="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="w-20" right />
              <SortHead label="Cap" k="cap" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="w-12" right />
              <SortHead label="Fit" k="fit" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="hidden w-16 lg:flex" right />
              <SortHead label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="w-24" right />
              <SortHead label="Added" k="added" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="hidden w-24 xl:flex" right />
              {!compareMode && (
                <span className="hidden w-36 shrink-0 text-right text-[10px] font-medium uppercase tracking-wide text-muted lg:block">
                  Stage
                </span>
              )}
              {!compareMode && <span className="h-4 w-4 shrink-0 lg:hidden" />}
            </div>
            )}

            <div className="space-y-4">
              {STAGES.map((s) => {
                const sectionDeals = groups.get(s) ?? [];
                // Dead lives behind its toggle; an empty rung is the funnel's
                // to show — no header with a zero in it here.
                if (!sectionDrawn(s)) return null;
                const open = isOpen(s);
                return (
                  <section key={s}>
                    <button
                      type="button"
                      onClick={() => toggleSection(s)}
                      aria-expanded={open}
                      disabled={sectionDeals.length === 0}
                      className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors enabled:hover:bg-faint disabled:cursor-default"
                    >
                      <svg
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${
                          open ? "rotate-90" : ""
                        }`}
                        aria-hidden
                      >
                        <path d="m9 18 6-6-6-6" />
                      </svg>
                      <span
                        className={`text-sm font-semibold tracking-tight ${
                          s === "dead" ? "text-muted" : ""
                        }`}
                      >
                        {STAGE_LABEL[s]}
                      </span>
                      <span className="rounded-full bg-faint px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted">
                        {sectionDeals.length}
                      </span>
                    </button>
                    {open && view === "cards" && (
                      // The photograph-led view (#428): a card a deal, the
                      // building's picture first, the way a listing reads —
                      // never a card narrower than 17.5rem where one fits
                      // (lib/pipeline-view).
                      <ul className={`stagger ${PIPELINE_CARD_GRID}`} data-view="cards">
                        {sectionDeals.map((d, idx) => (
                          <DealTile
                            key={d.id}
                            d={d}
                            i={idx}
                            compareMode={compareMode}
                            checked={selected.has(d.id)}
                            onToggle={toggleSelected}
                            onMarket={reportMarket}
                            todayIso={todayIso}
                          />
                        ))}
                      </ul>
                    )}
                    {open && view === "list" && (
                      <ul className="stagger mt-1.5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card" data-view="list">
                        {sectionDeals.map((d, idx) => (
                          <DealRow
                            key={d.id}
                            d={d}
                            i={idx}
                            compareMode={compareMode}
                            checked={selected.has(d.id)}
                            onToggle={toggleSelected}
                            todayIso={todayIso}
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
            {view === "cards" && marketPhotoCredits.length > 0 ? (
              <p className="mt-6 text-[11px] leading-relaxed text-muted" data-qa="market-photo-credit">
                <GalleryCreditPartsText credits={marketPhotoCredits} linkClassName="underline decoration-dotted underline-offset-2 hover:text-ink" />
              </p>
            ) : null}
          </div>
          )}
        </>
      )}
    </div>
  );
}

/** The ladder as one picture: a rung per live stage with its count, each a
 *  one-tap stage filter. An empty rung is hollow — it used to be a collapsed
 *  section header with a zero in it — and still wears its stage's name, for
 *  sight and for a screen reader. Dead deals sit behind their own toggle. */
function StageFunnel({
  counts,
  active,
  onPick,
}: {
  counts: Record<Stage, number>;
  active: string;
  onPick: (s: Stage | "all") => void;
}) {
  const live = STAGES.filter((s) => s !== "dead");
  return (
    <ol
      className="stage-funnel relative flex min-w-0 flex-1 items-start"
      aria-label="Deals by stage"
    >
      {live.map((s, i) => {
        const n = counts[s] ?? 0;
        const on = active === s;
        const lit = n > 0 || on;
        return (
          // Six rungs share the width equally while there is room, and none
          // is ever narrower than its own name: on a phone, or beside the
          // calls' split at `lg`, "Screening" takes the width it needs and the
          // shorter names give it up. The hollow rungs used to drop their
          // name below `sm` to make room, which left a row of blank circles
          // a screen reader announced as "0 deals".
          <li key={s} className="relative min-w-max flex-1">
            {/* the rail, drawn as each rung's two halves so it meets the
                neighbours' centres whatever the rungs' widths; the rung's
                own background covers the joint */}
            {i > 0 && (
              <span aria-hidden className="absolute left-0 right-1/2 top-4 h-px bg-line" />
            )}
            {i < live.length - 1 && (
              <span aria-hidden className="absolute left-1/2 right-0 top-4 h-px bg-line" />
            )}
            <button
              type="button"
              aria-pressed={on}
              disabled={n === 0 && !on}
              onClick={() => onPick(on ? "all" : s)}
              title={`${STAGE_LABEL[s]} · ${n} ${n === 1 ? "deal" : "deals"}`}
              className="flex w-full flex-col items-center gap-1.5 rounded-lg px-0.5 py-1 text-center transition-colors enabled:hover:bg-faint disabled:cursor-default"
            >
              {/* An opaque disc under the count: the tint is translucent, and
                  without it the rail's hairline ran through the number. */}
              <span aria-hidden className="relative rounded-full bg-surface">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-semibold tabular-nums ring-2 transition-colors ${
                    on
                      ? "bg-brand text-white ring-brand"
                      : n > 0
                        ? "bg-brand/10 text-brand ring-brand/40"
                        : "bg-surface ring-line"
                  }`}
                >
                  {n > 0 ? n : ""}
                </span>
              </span>
              {/* Six names share a phone's width: the label is a size smaller
                  there (and smaller again under 340px, where the six only
                  just fit), never cut; the full name is the tooltip. */}
              <span
                className={`w-full truncate text-[8px] font-medium uppercase min-[340px]:text-[9px] sm:text-[10px] sm:tracking-wide ${
                  lit ? "text-ink" : "text-muted"
                }`}
              >
                {SHORT_STAGE[s]}
              </span>
              <span className="sr-only">
                {n} {n === 1 ? "deal" : "deals"}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

/** How the calls split, drawn: one bar, a segment per verdict in its colour,
 *  and the same counts as chips beneath — each chip a one-tap verdict filter. */
function VerdictSplit({
  counts,
  active,
  onPick,
}: {
  counts: { pass: number; caution: number; pass_on: number; screening: number };
  active: string;
  onPick: (v: string) => void;
}) {
  const parts = (
    [
      ["pass", counts.pass, "bg-pass"],
      ["caution", counts.caution, "bg-caution"],
      ["pass_on", counts.pass_on, "bg-kill"],
      ["screening", counts.screening, "bg-muted/40"],
    ] as const
  ).filter(([, n]) => n > 0);
  const total = parts.reduce((sum, [, n]) => sum + n, 0);
  if (total === 0) return null;
  const label = (key: string) =>
    key === "screening" ? "No verdict" : VERDICT_META[key].label;
  return (
    <div className="verdict-split lg:w-72 lg:shrink-0">
      <div
        role="img"
        aria-label={parts.map(([key, n]) => `${n} ${label(key)}`).join(", ")}
        className="flex h-2 gap-px overflow-hidden rounded-full bg-faint"
      >
        {parts.map(([key, n, bar]) => (
          <span
            key={key}
            className={`${bar} transition-opacity ${
              active === "all" || active === key ? "" : "opacity-25"
            }`}
            style={{ width: `${(n / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {parts.map(([key, n]) => {
          const on = active === key;
          const cls =
            key === "screening" ? "bg-faint text-muted" : VERDICT_META[key].cls;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              onClick={() => onPick(on ? "all" : key)}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all ${cls} ${
                on ? "ring-2 ring-current" : "hover:opacity-80"
              }`}
            >
              {n} {label(key)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** One pool of free deals drawn as a track, as wide as its share of the
 *  allowance and filled as far as it is used: the team's trial, or the
 *  reader's own. */
function MeterPool({ pool, atLimit, which }: { pool: AllowancePool; atLimit: boolean; which: "team" | "personal" }) {
  return (
    <span
      data-meter={which}
      className="h-1.5 overflow-hidden rounded-full bg-faint ring-1 ring-inset ring-line"
      style={{ flexGrow: pool.of, flexBasis: 0 }}
    >
      <span
        className={`block h-full rounded-full ${atLimit ? "bg-caution" : "bg-brand/70"}`}
        style={{ width: `${Math.min(100, Math.round((pool.used / Math.max(1, pool.of)) * 100))}%` }}
      />
    </span>
  );
}

function DownloadIcon() {
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
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function SheetIcon() {
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
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M9 4v16" />
    </svg>
  );
}

/** A column-header sort control. Click sorts by that column; click again
 *  reverses. The active column shows its direction. */
function SortHead({
  label,
  k,
  sortKey,
  sortDir,
  onSort,
  cls = "",
  right = false,
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onSort: (k: SortKey) => void;
  cls?: string;
  right?: boolean;
}) {
  const active = sortKey === k;
  return (
    <button
      type="button"
      onClick={() => onSort(k)}
      aria-label={
        active
          ? `Sorted by ${label.toLowerCase()}, ${
              sortDir === "asc" ? "ascending" : "descending"
            } — activate to reverse`
          : `Sort by ${label.toLowerCase()}`
      }
      className={`flex shrink-0 items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors ${
        right ? "justify-end" : ""
      } ${active ? "text-ink" : "text-muted hover:text-ink"} ${cls}`}
    >
      {label}
      {active && <span aria-hidden>{sortDir === "asc" ? "↑" : "↓"}</span>}
    </button>
  );
}

/** Empty-pipeline illustration: an OM becoming ranges and a verdict. */
function EmptyArt() {
  return (
    <svg viewBox="0 0 170 120" className="mx-auto h-28 w-auto" aria-hidden>
      <g transform="rotate(-8 62 65)">
        <rect
          x="30"
          y="18"
          width="70"
          height="92"
          rx="8"
          fill="#f3f5f4"
          stroke="#e7e4dd"
        />
      </g>
      <rect x="58" y="8" width="74" height="96" rx="8" fill="#fff" stroke="#e7e4dd" />
      <rect x="68" y="20" width="36" height="5" rx="2.5" fill="#e7e4dd" />
      <rect x="68" y="32" width="54" height="4" rx="2" fill="#e7e4dd" />
      <rect x="68" y="40" width="46" height="4" rx="2" fill="#e7e4dd" />
      <rect x="70" y="72" width="7" height="16" rx="3" fill="#114e54" opacity="0.35" />
      <rect x="82" y="60" width="7" height="28" rx="3" fill="#114e54" />
      <rect x="94" y="66" width="7" height="22" rx="3" fill="#114e54" opacity="0.55" />
      <line x1="68" y1="94" x2="122" y2="94" stroke="#e7e4dd" />
      <circle cx="132" cy="98" r="15" fill="#114e54" />
      <path
        d="M125 98l5 5 9-10"
        stroke="#7fd6cc"
        strokeWidth="2.6"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A dot-separated meta line that skips empty bits — so a hidden column's
 *  value can fall back into the meta line on narrow screens without
 *  stranding separators. */
function MetaLine({
  className,
  bits,
  flush = false,
}: {
  className?: string;
  bits: ReactNode[];
  /** no top margin: the line sits in a row that sets its own spacing */
  flush?: boolean;
}) {
  const shown = bits.filter(Boolean);
  if (shown.length === 0) return null;
  // `relative` holds a bit's screen-reader text (an absolute `sr-only`
  // span, "added by …") inside the clipped line: its containing block had
  // been outside it, so at 320px it sat past the screen's edge and the list
  // scrolled sideways (research pass 36).
  return (
    <p className={`${flush ? "" : "mt-0.5 "}relative truncate text-xs text-muted ${className ?? ""}`}>
      {shown.map((b, idx) => (
        <Fragment key={idx}>
          {idx > 0 && " · "}
          {b}
        </Fragment>
      ))}
    </p>
  );
}

/** A tag's tone in its words, and in the outline its chip wears on a line
 *  of its own (on the picture, a chip is white). */
const TAG_TEXT: Record<TagTone, string> = { brand: "text-brand", caution: "text-caution", kill: "text-kill", muted: "text-muted" };
const TAG_BORDER: Record<TagTone, string> = { brand: "border-brand/30", caution: "border-caution/35", kill: "border-kill/35", muted: "border-line" };

/** A deal's tags (lib/pipeline-tags) on a line of their own under its
 *  figures, wrapping: a chip each, never cut — a tag longer than the line
 *  wraps inside its chip rather than losing its end, and a figure never
 *  shares a line with them, so no tag can push a figure off one. The
 *  caller names the line's display (`flex`, or a card's width tiers'), and
 *  a card's own tiers for each chip. */
function TagLine({
  tags,
  className = "flex",
  chipClass,
}: {
  tags: readonly DealTag[];
  className?: string;
  chipClass?: (t: DealTag) => string;
}) {
  if (tags.length === 0) return null;
  return (
    <p className={`flex-wrap gap-1 ${className}`} data-tags="line">
      {tags.map((t, idx) => (
        <Fragment key={t.key}>
          {idx > 0 && " "}
          <span
            title={t.title}
            className={`max-w-full rounded-full border bg-surface px-2 py-0.5 text-[11px] font-semibold leading-tight ${TAG_BORDER[t.tone]} ${TAG_TEXT[t.tone]} ${chipClass?.(t) ?? ""}`}
          >
            {t.text}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

/** Drawn at the picture widths a mask names — one digit a tier of
 *  lib/pipeline-tags `PICTURE_TIERS`: under 278px, 278 to 347, 348 up — as
 *  the card's picture and tag row ask of themselves (`@container/card`).
 *  A chip shows as a block (a flex item either way); the line as a flex
 *  row. Every class is written out whole, for Tailwind's scanner. */
const AT_TIERS: Record<string, { block: string; flex: string }> = {
  "111": { block: "", flex: "flex" },
  "100": { block: "@min-[278px]/card:hidden", flex: "flex @min-[278px]/card:hidden" },
  "010": { block: "hidden @min-[278px]/card:block @min-[348px]/card:hidden", flex: "hidden @min-[278px]/card:flex @min-[348px]/card:hidden" },
  "001": { block: "hidden @min-[348px]/card:block", flex: "hidden @min-[348px]/card:flex" },
  "110": { block: "@min-[348px]/card:hidden", flex: "flex @min-[348px]/card:hidden" },
  "011": { block: "hidden @min-[278px]/card:block", flex: "hidden @min-[278px]/card:flex" },
  "101": { block: "@min-[278px]/card:hidden @min-[348px]/card:block", flex: "flex @min-[278px]/card:hidden @min-[348px]/card:flex" },
  "000": { block: "hidden", flex: "hidden" },
};
const atTiers = (shown: readonly boolean[]) => AT_TIERS[shown.map((on) => (on ? "1" : "0")).join("")] ?? AT_TIERS["111"];

/** A slot the live screen has not read yet: a quiet shimmer where the figure
 *  will land (`.skeleton` moves only where motion is welcome), named for a
 *  screen reader — never the dash that says the memorandum states none. */
function Reading({ width }: { width: string }) {
  return (
    <span
      role="img"
      aria-label="Reading the memorandum"
      title="Reading the memorandum"
      data-reading
      className={`skeleton inline-block h-3.5 rounded align-middle ${width}`}
    />
  );
}

/** A figure's empty slot: the shimmer while the terms are being read, the
 *  dash once a read has found none. */
function Unstated({ reading, width, className = "text-line" }: { reading: boolean; width: string; className?: string }) {
  return reading ? <Reading width={width} /> : <span className={className}>—</span>;
}

/** The mandate score drawn: a 0–100 bar in the current text colour (the
 *  call's), so a row reads its fit before the number does. */
function FitBar({ score }: { score: number }) {
  return (
    <span aria-hidden data-fit-bar className="h-1 w-10 overflow-hidden rounded-full bg-faint">
      <span
        className="block h-full rounded-full bg-current"
        style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
      />
    </span>
  );
}

// Memoized: a keystroke in the search box or a compare toggle must not
// re-render every row of a large pipeline.
const DealRow = memo(function DealRow({
  d,
  i,
  compareMode,
  checked,
  onToggle,
  todayIso,
}: {
  d: DealCard;
  i: number;
  compareMode: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  /** the page's day, the offers-due countdown's (`Pipeline`'s `todayIso`) */
  todayIso: string;
}) {
  const v = d.verdict ? VERDICT_META[d.verdict] : null;
  const isDead = normalizeStage(d.stage) === "dead";

  // Figures whose columns are hidden on narrower screens fold back into the
  // meta line there — same information, no duplication at any width. The
  // stage itself lives in the group header (and the row's Stage select), so
  // it no longer repeats here.
  const marketBit = d.market || null;
  // Non-interactive on purpose: the whole row is already one link, so this
  // marks "the ground layer knows this address" — the deal page carries the
  // actual link into the market brief.
  const coveredBit = d.coveredMarket ? (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap text-brand"
      title={`${d.coveredMarket} is a covered market — rules and benchmarks on file; the deal page links its brief`}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-brand" />
      {d.coveredMarket}
    </span>
  ) : d.readMarket ? (
    // A hollow dot: the ground layer reads this metro's figures and briefs
    // nothing, and the row says which — or, where the deal's county placed
    // it there (#447), which county.
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap text-muted"
      title={
        d.readCounty
          ? `${d.readCounty} lies in the ${d.readMarket} metro area — its published figures are read for this deal, placed by its county; the market check says which`
          : `${d.readMarket} is read, not briefed — its published figures are under the market check; no brief, comps or tracker on file`
      }
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full border border-muted" />
      {rowMarketLabel(d)}
    </span>
  ) : null;
  const asset = assetMeta(d.assetClass ?? "");
  const assetBit = d.assetClass ? (
    <span className="inline-flex items-center gap-1">
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${asset.dot}`} />
      {assetClassLabel(d.assetClass)}
    </span>
  ) : null;
  const priceBit = d.slots.price ? (
    <span className="font-mono tabular-nums" title={d.slots.basis ? `${d.slots.price} — ${d.slots.basis}` : d.slots.price}>
      {compactPrice(d.slots.price)}
    </span>
  ) : null;
  // What the price buys where it is not the building, the seller's loan, a
  // covenant on the rents, a flood zone… (lib/pipeline-tags): said on a
  // line of their own under the figures at every width, so a tag never
  // pushes the price, the cap or the fit off a one-line truncation — the
  // phone's line had read "$41.3M · 49% share · 5…" — and is never cut
  // itself. A screen stored before a reader its figures turn on says so
  // after them (lib/older-screen), and a deal the reader's team does not see
  // says so last.
  const older = olderScreenTag(d.older);
  const tags = [...dealTags(d.slots, d.flood), ...(older ? [older] : []), ...(d.personal ? [PERSONAL_TAG] : [])];
  // A plan deal has no going-in cap; its yield on total cost is the figure
  // that answers the same question, so it takes the slot — labelled.
  const capBit = d.slots.cap ? (
    <>
      <span className="font-mono tabular-nums">{d.slots.cap}</span> cap
    </>
  ) : d.slots.yoc ? (
    // This bit only shows below `md` (the cap column takes over there), so
    // it wears the column's "yoc" micro-label: "7.2% yield on cost" was the
    // part a phone's one-line truncation cut.
    <span title={PLAN_YOC_TITLE}>
      <span className="font-mono tabular-nums">{d.slots.yoc}</span>{" "}
      <span className="text-[9px] font-medium uppercase">yoc</span>
    </span>
  ) : d.slots.yocWithheld ? (
    // A yield no project earns is refused: n/a, with the plan's sentence why.
    <span title={d.slots.yocWithheld}>
      n/a <span className="text-[9px] font-medium uppercase">yoc</span>
    </span>
  ) : d.slots.noteYield ? (
    // A note, or a preferred equity position, has no going-in cap: its own
    // yield takes the slot.
    <span title={ownYieldOf(d.slots.capWithheld).title}>
      <span className="font-mono tabular-nums">{d.slots.noteYield}</span>{" "}
      <span className="text-[9px] font-medium uppercase">{ownYieldOf(d.slots.capWithheld).micro}</span>
    </span>
  ) : null;
  // The mandate score, when there is one: a call's colour, the words a
  // screen reader gets, and the tooltip — shared by the `lg` column and the
  // bar the narrower widths draw. The words "buy box" live on the Buy box
  // page and the deal header's chip — the row doesn't repeat them.
  const scored = d.score != null && d.mandateVerdict ? { score: d.score, verdict: d.mandateVerdict } : null;
  // The call's colour — red on a miss outright — and never green while a
  // criterion the price decides could not be checked (lib/fit-label
  // `fitTone`, the deal header's chip's rule).
  const fitCls = scored ? FIT_TONE_CLS[fitTone(scored.verdict, d.fit, d.fitCoverage)] : "";
  // A fit judged on the first signal alone says so wherever it is drawn —
  // the deal page's "First read" — until the extraction lands.
  const firstRead = !!d.fitFirstRead && (!!scored || !!d.fit);
  // How many of the box's criteria the fit stands on, where the screen
  // could not check every one: "2 of 4" in the column, "2 of 4 checked"
  // where there is room, and which ones in the tooltip.
  const checkedShort = scored || d.fit ? checkedOf(d.fitCoverage, true) : null;
  const checkedNote = scored || d.fit ? checkedSentence(d.fitCoverage) : null;
  // The deal header's chip's own words (lib/fit-label): "Outside box"
  // wherever the deal misses the box outright, whatever the score's call,
  // and the count in the call's place where the box was not judged whole.
  const fitWords = scored
    ? `${fitScoreLabel(scored.score, scored.verdict, d.fit === "outside", d.fitCoverage)}${firstRead ? ", first read" : ""}`
    : null;
  const fitTitle = scored
    ? [
        d.fit === "outside"
          ? `${scored.score} / 100 mandate fit (${MANDATE_META[scored.verdict].label}), but outside the box: it misses at least one criterion outright, and that wins over the score's call`
          : checkedShort
            ? `${scored.score} / 100 mandate fit, on the criteria the screen could check`
            : `${scored.score} / 100 · ${MANDATE_META[scored.verdict].label} — mandate fit`,
        checkedNote,
        firstRead ? FIRST_READ_TITLE : null,
      ]
        .filter((s): s is string => !!s)
        .map((s) => s.replace(/\.$/, ""))
        .join(". ")
    : null;
  const firstReadMark = firstRead ? (
    <span className="text-[9px] font-medium uppercase text-brand" title={FIRST_READ_TITLE}>
      first read
    </span>
  ) : null;
  const checkedMark = checkedShort ? (
    <span className="whitespace-nowrap text-[9px] font-medium text-muted" title={checkedNote ?? undefined} data-qa="fit-checked">
      {checkedShort}
    </span>
  ) : null;
  // Without a score there is no bar to draw, so the fit stays a word in the
  // meta line; with one, the bar below carries it and the word goes.
  const fitBit =
    !scored && d.fit ? (
      <span
        className={`font-medium ${FIT_TONE_CLS[fitTone(null, d.fit, d.fitCoverage)]}`}
        title={[checkedNote, firstRead ? FIRST_READ_TITLE : null].filter(Boolean).join(" ") || undefined}
      >
        {`${FIT_META[d.fit].label} box${checkedShort ? `, ${checkedOf(d.fitCoverage)}` : ""}${firstRead ? ", first read" : ""}`}
      </span>
    ) : null;
  // Below `lg` the score column is hidden, and as a word at the end of the
  // meta line the fit was the part a one-line truncation cut first. Draw it
  // instead: the same bar the column draws, on its own line, in the call's
  // colour — the words stay for a screen reader.
  const fitBar = scored ? (
    <span
      className={`mt-1.5 flex items-center gap-1.5 lg:hidden ${fitCls}`}
      title={fitTitle ?? undefined}
    >
      <span aria-hidden className="text-[9px] font-medium uppercase tracking-wide text-muted">
        fit
      </span>
      <FitBar score={scored.score} />
      {checkedShort ? <span aria-hidden>{checkedMark}</span> : null}
      {firstRead ? <span aria-hidden>{firstReadMark}</span> : null}
      <span className="sr-only">{fitWords}</span>
    </span>
  ) : null;
  const dateBit = (
    <span className="font-mono tabular-nums">{fmtDate(d.createdAt)}</span>
  );
  const dueBit = d.offersDue ? <OffersDueBit iso={d.offersDue} today={todayIso} /> : null;
  // A teammate's deal wears their initials; the name is the tooltip and
  // what a screen reader says.
  const addedByBit = d.addedBy ? (
    <span className="inline-flex items-center align-middle" title={`Added by ${d.addedBy}`}>
      <span
        aria-hidden
        className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/10 text-[9px] font-semibold text-brand"
      >
        {initials(d.addedBy)}
      </span>
      <span className="sr-only">added by {d.addedBy}</span>
    </span>
  ) : null;

  // The call. It sits in its own column from `sm` up; on a phone it leads
  // the price line instead (#420), because the column's 88px beside a name
  // that also has the building's picture beside it left the name
  // "The Maddox at…".
  // A failed, stalled or running screen outranks the stored verdict: that
  // verdict was written about the terms as they were before the run the
  // analyst just asked for, and the deal page says so (lib/screen-run).
  const status =
    d.jobStatus === "failed" ? (
      <span
        className="rounded-full bg-kill/10 px-2.5 py-1 text-center text-[11px] font-medium leading-tight text-kill"
        title={
          v
            ? "The latest screen failed before it reached the verdict — the previous verdict still shows on the deal page, marked as such"
            : "The screen failed — open the deal to see why and try again"
        }
      >
        Failed
      </span>
    ) : d.jobStatus === "stalled" ? (
      <span
        className="rounded-full bg-caution/10 px-2.5 py-1 text-center text-[11px] font-medium leading-tight text-caution"
        title="The run stopped writing progress — its process was likely interrupted. Open the deal to start it again."
      >
        Stalled
      </span>
    ) : d.jobStatus === "running" ? (
      <span
        className="flex items-center gap-1.5 whitespace-nowrap text-[11px] text-muted"
        title={v ? `Re-screening — the previous call was ${v.label}` : undefined}
      >
        <span className="pulse-bar h-1.5 w-1.5 rounded-full bg-brand" />
        {v ? "Re-screening…" : d.hasOm === false ? "Screening the facts…" : "Reading the OM…"}
      </span>
    ) : v ? (
      <span className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${v.cls}`}>{v.label}</span>
    ) : (
      // Nothing has run yet: an empty ring where the verdict pill will sit.
      <span className="inline-flex h-6 items-center" title="Not screened yet — open the deal to run the screen">
        <span aria-hidden className="h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed border-muted/70" />
        <span className="sr-only">Not screened</span>
      </span>
    );

  const inner = (
    // Two rows: the picture beside the deal's line and its columns, then
    // the deal's tags under them (lib/pipeline-tags) — once, at every
    // width, starting under the name and running the row's whole width
    // (under the columns from `md`), so a tag wraps only where the row
    // runs out and never shares a line with a figure it could push off.
    <div className="grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3">
      <div className="flex items-center gap-3">
        {compareMode && (
          <span
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
              checked
                ? "border-brand bg-brand text-white"
                : "border-line bg-surface"
            }`}
            aria-hidden
          >
            {checked && (
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3 w-3"
              >
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
          </span>
        )}
        <DealThumb sources={d.thumbs ?? []} cover={d.cover ?? null} label={d.name} />
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <div className="min-w-0 flex-1">
          {/* The name is the row: two lines before an ellipsis at every
              width, so "The Maddox at Brewerytown" is never "The Maddox at
              Bre…" beside a half-empty column. */}
          <p className="line-clamp-2 font-medium" title={d.name}>
            {d.name}
          </p>
          {/* A phone gets two lines — where the deal is (the row's coloured
              edge already says what it is), then what it costs and how it
              fits — so the price, the cap and the fit are never the part a
              one-line truncation cuts off. */}
          <MetaLine className="md:hidden" bits={[dueBit, marketBit, coveredBit, assetBit, addedByBit]} />
          {/* On a phone the price line leads with the call; from `sm` to `md`
              the call has its own column and the line is the figures alone. */}
          <div className="mt-1 flex items-center gap-2 md:hidden">
            <span className="flex shrink-0 sm:hidden">{status}</span>
            <MetaLine flush className="min-w-0" bits={[priceBit, capBit, fitBit]} />
          </div>
          <MetaLine className="hidden md:block lg:hidden" bits={[dueBit, marketBit, coveredBit, assetBit, fitBit, dateBit, addedByBit]} />
          <MetaLine className="hidden lg:block xl:hidden" bits={[dueBit, marketBit, coveredBit, dateBit, addedByBit]} />
          <MetaLine className="hidden xl:block" bits={[dueBit, marketBit, coveredBit, addedByBit]} />
          {fitBar}
        </div>
        {/* Column cells — widths, order, and gaps mirror the header row. */}
        <span className="hidden w-24 shrink-0 items-center gap-1.5 truncate text-sm text-muted lg:flex">
          {d.assetClass ? (
            <>
              <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${asset.dot}`} />
              <span className="truncate" title={assetClassLabel(d.assetClass)}>
                {assetClassLabel(d.assetClass)}
              </span>
            </>
          ) : (
            // An "Auto-detect" deal's class is the deck's, read with the terms.
            <Unstated reading={!!d.reading} width="w-16" />
          )}
        </span>
        <span
          className="hidden w-20 shrink-0 truncate text-right font-mono text-sm tabular-nums md:block"
          title={
            d.slots.price
              ? [d.slots.price, d.slots.basis, d.slots.interest?.toLowerCase()].filter(Boolean).join(" — ")
              : undefined
          }
        >
          {d.slots.price ? compactPrice(d.slots.price) : <Unstated reading={!!d.reading} width="w-14" />}
        </span>
        <span className="hidden w-12 shrink-0 text-right font-mono text-sm tabular-nums md:block">
          {d.slots.cap ??
            (d.slots.yoc ? (
              <span title={PLAN_YOC_TITLE} className="text-brand">
                {d.slots.yoc}
                <span className="ml-0.5 text-[9px] font-sans font-medium uppercase">yoc</span>
              </span>
            ) : d.slots.yocWithheld ? (
              // A yield no project earns is refused, its sentence the title.
              <span title={d.slots.yocWithheld} className="font-sans text-xs text-muted">
                n/a
              </span>
            ) : d.slots.noteYield ? (
              // A note, or a position, has no going-in cap: its own yield, labelled.
              <span title={ownYieldOf(d.slots.capWithheld).title} className="text-brand">
                {d.slots.noteYield}{" "}
                <span className="text-[9px] font-sans font-medium uppercase">{ownYieldOf(d.slots.capWithheld).micro}</span>
              </span>
            ) : d.slots.capWithheld ? (
              <span title={CAP_WITHHELD[d.slots.capWithheld].title} className="font-sans text-xs text-muted">
                n/a
              </span>
            ) : (
              <Unstated reading={!!d.reading} width="w-10" />
            ))}
        </span>
        <span className="hidden w-16 shrink-0 flex-col items-end text-right text-xs font-semibold lg:flex">
          {scored ? (
            // The score, and the score drawn: a 0–100 bar in the call's colour.
            <span
              className={`flex flex-col items-end gap-1 tabular-nums ${fitCls}`}
              title={fitTitle ?? undefined}
            >
              {scored.score}
              <FitBar score={scored.score} />
              {checkedMark}
              {firstReadMark}
            </span>
          ) : d.fit ? (
            <>
              <span
                className={FIT_TONE_CLS[fitTone(null, d.fit, d.fitCoverage)]}
                title={[checkedNote, firstRead ? FIRST_READ_TITLE : null].filter(Boolean).join(" ") || undefined}
              >
                {FIT_META[d.fit].label}
              </span>
              {checkedMark}
              {firstReadMark}
            </>
          ) : (
            <Unstated reading={!!d.reading && !!d.hasBox} width="w-12" className="font-normal text-line" />
          )}
        </span>
        <span className="hidden w-24 shrink-0 justify-end sm:flex">{status}</span>
        <span className="hidden w-24 shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums text-muted xl:block">
          {fmtDate(d.createdAt)}
        </span>
      </div>
      <TagLine tags={tags} className="col-start-2 mt-1.5 flex" />
    </div>
  );

  return (
    <li
      style={{ "--i": i } as React.CSSProperties}
      // The asset-class rail: a 3px line in the class's hue down the left
      // edge, so a mixed section reads as its kinds without a legend.
      // A dead deal reads grey, never faded: at 60% opacity its words fell
      // to 2.5:1 (research pass 33), and the stage select still says Dead.
      className={`border-l-[3px] ${d.assetClass ? asset.rail : "border-l-transparent"} ${
        isDead ? "grayscale" : ""
      }`}
    >
      {compareMode ? (
        <button
          type="button"
          onClick={() => onToggle(d.id)}
          aria-pressed={checked}
          className={`group flex w-full items-center gap-3 px-5 py-4 text-left transition-colors ${
            checked ? "bg-brand/5" : "hover:bg-faint"
          }`}
        >
          {inner}
        </button>
      ) : (
        // The stage select is a form, so it sits BESIDE the link (nesting
        // interactive elements is invalid) — the row still reads and hovers
        // as one unit, and everything except the select navigates.
        <div className="group flex items-center gap-3 px-5 py-4 transition-colors hover:bg-faint">
          <Link
            href={`/deals/${d.id}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            {inner}
          </Link>
          <span className="hidden w-36 shrink-0 justify-end lg:flex">
            <StageSelect dealId={d.id} stage={d.stage} next="pipeline" compact />
          </span>
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 text-line transition-colors group-hover:text-muted lg:hidden"
            aria-hidden
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </div>
      )}
    </li>
  );
});

/** The two views as one control: an icon and a word each, the current one
 *  pressed. */
function ViewToggle({ view, onChange }: { view: PipelineView; onChange: (v: PipelineView) => void }) {
  const opt = (v: PipelineView, label: string, icon: ReactNode) => (
    <button
      type="button"
      aria-pressed={view === v}
      onClick={() => onChange(v)}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium transition-colors ${
        view === v ? "bg-brand text-white shadow-sm" : "text-muted hover:bg-faint hover:text-ink"
      }`}
    >
      {icon}
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="Pipeline view" className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface p-0.5 shadow-sm">
      {opt(
        "cards",
        "Cards",
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
          <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
          <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
          <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
          <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
        </svg>,
      )}
      {opt(
        "list",
        "List",
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
          <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
        </svg>,
      )}
      {opt(
        "map",
        "Map",
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5" aria-hidden>
          <path d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z" />
          <path d="M9 4v13M15 6.5v13" />
        </svg>,
      )}
    </div>
  );
}

/** A card's call, drawn solid so it reads over any photograph: the
 *  verdict in its colour, a failed or stalled run over the verdict it left
 *  behind, a live screen, or the empty ring of a deal not yet screened. */
const TILE_CALL: Record<string, string> = {
  pass: "bg-pass text-white",
  caution: "bg-caution text-white",
  pass_on: "bg-kill text-white",
};

function TileCall({ d }: { d: DealCard }) {
  const v = d.verdict ? VERDICT_META[d.verdict] : null;
  const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none shadow-sm";
  if (d.jobStatus === "failed") {
    return (
      <span className={`${pill} bg-kill text-white`} title="The latest screen failed — open the deal to see why and try again">
        Failed
      </span>
    );
  }
  if (d.jobStatus === "stalled") {
    return (
      <span className={`${pill} bg-caution text-white`} title="The run stopped writing progress — open the deal to start it again">
        Stalled
      </span>
    );
  }
  // A screen in flight outranks the call it will replace: a re-screen's
  // terms are already rewriting under the old verdict.
  if (d.jobStatus === "running") {
    return (
      <span className={`${pill} bg-white/95 text-ink`} title={v ? `Re-screening — the previous call was ${v.label}` : undefined}>
        <span aria-hidden className="pulse-bar h-1.5 w-1.5 rounded-full bg-brand" />
        {v ? "Re-screening…" : d.hasOm === false ? "Screening the facts…" : "Reading the OM…"}
      </span>
    );
  }
  if (v && d.verdict) return <span className={`${pill} ${TILE_CALL[d.verdict] ?? "bg-white/95 text-ink"}`}>{v.label}</span>;
  return (
    <span className={`${pill} bg-white/90 py-1.5 text-muted`} title="Not screened yet — open the deal to run the screen">
      <span aria-hidden className="h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed border-muted/70" />
      <span className="sr-only">Not screened</span>
    </span>
  );
}

function TileStat({ label, title, sub, children }: { label: string; title?: string; sub?: string | null; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-sm tabular-nums text-ink" title={title}>
        {children}
      </dd>
      {/* A second figure under the first, as a listing card prints the
          price per unit under the price (#469). */}
      {sub && <dd className="truncate font-mono text-[10px] tabular-nums text-muted" data-qa="tile-sub">{sub}</dd>}
    </div>
  );
}

// The card view's deal (#428): the building's picture first — its own
// photograph or the Street View frame, else the photograph its market is
// known by, named as the market's (#438), and outside every photographed
// market the deal's cover, never an overhead (#442); each pinned with its
// credit — the call over the picture, then the name, the place and the
// three figures a pipeline is read by. Memoized like the row.
const DealTile = memo(function DealTile({
  d,
  i,
  compareMode,
  checked,
  onToggle,
  onMarket,
  todayIso,
}: {
  d: DealCard;
  i: number;
  compareMode: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  /** told which market photograph the card shows, for the page's credit */
  onMarket?: (dealId: string, marketId: string | null) => void;
  /** the page's day, the offers-due countdown's (`Pipeline`'s `todayIso`) */
  todayIso: string;
}) {
  const dealId = d.id;
  const reportMarket = useCallback((marketId: string | null) => onMarket?.(dealId, marketId), [dealId, onMarket]);
  // The deal's photographs, flipped through on the card (#450): which one is
  // on screen, and whether the deal's own photograph is the picture at all
  // (a card whose photograph failed shows its market's or its cover, and
  // offers nothing to flip through).
  // A photograph that fails to load is dropped from the set, so the arrows,
  // the dots and the count never point at a picture the card cannot show.
  const [dead, setDead] = useState<ReadonlySet<string>>(new Set());
  const slides = useMemo(() => (d.slides ?? []).filter((s) => !dead.has(s.src)), [d.slides, dead]);
  const [slideAsked, setSlide] = useState(0);
  // Told by the banner once the deal's own photograph is whole on screen:
  // the arrows and the dots wait for it, as its count and credit do, so
  // nothing points at photographs over the cover that holds the frame.
  const [photoOn, setPhotoOn] = useState(false);
  const canFlip = !compareMode && photoOn && slides.length > 0;
  const count = slides.length + 1;
  const slide = slideAsked < count ? slideAsked : 0;
  const go = (step: number) => setSlide((s) => ((s < count ? s : 0) + step + count) % count);
  const dropSlide = useCallback((src: string) => setDead((g) => new Set(g).add(src)), []);
  // The next photograph is asked for before it is wanted: on the first
  // hover, then one ahead of wherever the reader is.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    if (!canFlip || !warm) return;
    const next = slides[slide % slides.length];
    if (!next) return;
    // Asked as the card's picture will ask it (research pass 29): the card
    // copy or the hero, whichever the browser takes for the card, never both.
    const ahead = new Image();
    const sizes = bannerSizes(next, PIPELINE_CARD_SIZES, 16 / 10);
    if (next.srcSet && sizes) {
      ahead.sizes = sizes;
      ahead.srcset = next.srcSet;
    }
    ahead.src = next.src;
  }, [canFlip, warm, slide, slides]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const isDead = normalizeStage(d.stage) === "dead";
  const asset = assetMeta(d.assetClass ?? "");
  const place = d.coveredMarket ?? d.readMarket ?? d.market;
  const scored = d.score != null && d.mandateVerdict ? { score: d.score, verdict: d.mandateVerdict } : null;
  // The deal header's chip's colour rule (lib/fit-label `fitTone`): red on a
  // miss outright, and never green while a criterion the price decides
  // could not be checked.
  const fitCls = scored ? FIT_TONE_CLS[fitTone(scored.verdict, d.fit, d.fitCoverage)] : "";
  // How many of the box's criteria the fit stands on, under it, where not
  // every one could be checked: "2 of 4 checked", which ones in its tooltip.
  const fitChecked = scored || d.fit ? checkedOf(d.fitCoverage) : null;
  const fitCheckedNote = fitChecked ? checkedSentence(d.fitCoverage) : null;
  // What the picture must not hide — a Special Flood Hazard Area, how it is
  // sold, what the price buys where it is not the building, the seller's
  // loan… (lib/pipeline-tags). A chip rides on the picture only where it
  // fits whole on a picture as wide as this card's (each of the tiers'
  // widths, asked by container query), two at most; the rest wait on the
  // card's line under the figures. A chip is never cut: the picture's had
  // truncated "Shadow-anchored, 56% rolls in 5 …" at 390px.
  const placed = placeTagsByTier(dealTags(d.slots, d.flood));
  const pictureTags = placed.filter((p) => p.onPicture.some(Boolean));
  const lineTags = placed.filter((p) => p.onPicture.some((on) => !on));
  const lineAt = new Map(lineTags.map((p) => [p.tag.key, p.onPicture.map((on) => !on)]));
  // A screen stored before a reader its figures turn on (lib/older-screen),
  // and a deal the reader's team does not see, say so on the line at every
  // width, after the tags; never on the picture, which carries what the
  // building's figures must not hide.
  const older = olderScreenTag(d.older);
  const lineShown = PICTURE_TIERS.map((_, k) => !!d.personal || !!older || lineTags.some((p) => !p.onPicture[k]));

  const inner = (
    <>
      {/* A container (`@container/card`), so the chips on it ask the
          picture's own width. */}
      <div className="@container/card relative">
        <DealBanner
          sources={d.pictures ?? []}
          cover={d.cover ?? null}
          label={d.name}
          aspect="16/10"
          flush
          shade
          priority={i < 4}
          photos={d.photos ? d.photos - dead.size : 0}
          slides={slides}
          slide={canFlip ? slide : 0}
          onPhoto={setPhotoOn}
          onSlideGone={dropSlide}
          onMarket={reportMarket}
          sizes={PIPELINE_CARD_SIZES}
        />
        {/* The call, and in compare mode the pick beside it: the foot of the
            picture is the market photograph's caption (#438). */}
        <span className="absolute left-3 top-3 flex items-center gap-1.5">
          <TileCall d={d} />
          {compareMode && (
            <span
              aria-hidden
              className={`flex h-6 w-6 items-center justify-center rounded-md border-2 shadow-sm ${
                checked ? "border-brand bg-brand text-white" : "border-white bg-white/80"
              }`}
            >
              {checked && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
          )}
        </span>
        {pictureTags.length > 0 && (
          // Inside the column's 58%, never past it: a flex item sized to its
          // content ran leftward over the call. Every chip here fits that
          // column whole on the narrowest card (lib/pipeline-tags), so none
          // is truncated.
          <span className="absolute right-3 top-3 flex max-w-[58%] flex-col items-end gap-1" data-tags="picture">
            {pictureTags.map(({ tag: t, onPicture }, idx) => (
              <Fragment key={t.key}>
                {idx > 0 && " "}
                <span
                  title={t.title}
                  className={`max-w-full rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold shadow-sm ${TAG_TEXT[t.tone]} ${atTiers(onPicture).block}`}
                >
                  {t.text}
                </span>
              </Fragment>
            ))}
          </span>
        )}
      </div>
      {/* The card's rows — the picture, the name and place, the figures,
          the tags under them — are the grid row's own (`grid-rows-subgrid`
          on the card), so a row of cards lines up its figures whatever the
          names' lengths, and whichever cards carry tags under them. */}
      <div className="px-4 pb-3 pt-3">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight" title={d.name}>
          {d.name}
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
          {d.assetClass ? (
            <>
              <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${asset.dot}`} />
              <span className="shrink-0">{assetClassLabel(d.assetClass)}</span>
            </>
          ) : null}
          {d.assetClass && place ? <span aria-hidden>·</span> : null}
          {place ? (
            <span className="truncate" title={place}>
              {place}
            </span>
          ) : null}
        </p>
      </div>
      {/* The price is the longest figure ("$9–9.5M", "$124.5M"), so its
          column is the widest. */}
      <dl className="grid grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)] gap-3 border-t border-line mx-4 pt-3">
        {/* While a first screen has not read the terms, an empty slot
            shimmers ("not read yet"); once a read finds none, the dash
            ("not stated"). */}
        <TileStat label="Price" title={d.slots.price ?? undefined} sub={d.slots.basis}>
          {d.slots.price ? compactPrice(d.slots.price) : <Unstated reading={!!d.reading} width="w-14" />}
        </TileStat>
        {/* A plan deal has no going-in cap; its yield on total cost takes
            the slot, labelled. Nor has a note: its yield to maturity
            takes it where the note pays or may, else it says n/a. */}
        <TileStat
          label={
            // A plan deal is judged on its yield on total cost, stated or
            // not: a dash under "Cap" read as a cap the memorandum left out.
            !d.slots.cap && (d.slots.yoc || d.slots.plan)
              ? "Yield on cost"
              : !d.slots.cap && d.slots.noteYield
                ? ownYieldOf(d.slots.capWithheld).label
                : "Cap"
          }
          title={
            !d.slots.cap && !d.slots.yoc && d.slots.capWithheld
              ? CAP_WITHHELD[d.slots.capWithheld].title
              : !d.slots.cap && !d.slots.yoc && d.slots.yocWithheld
                ? d.slots.yocWithheld
                : undefined
          }
          sub={
            !d.slots.cap && !d.slots.yoc && d.slots.noteYield
              ? ownYieldOf(d.slots.capWithheld).to
              : // A note under water: no yield, and why, on the card's face
                // (research pass 38).
                !d.slots.cap && !d.slots.yoc && d.slots.capWithheld === "under_water"
                ? "under water"
                : undefined
          }
        >
          {d.slots.cap ??
            d.slots.yoc ??
            d.slots.noteYield ??
            (d.slots.capWithheld || d.slots.yocWithheld ? "n/a" : <Unstated reading={!!d.reading} width="w-10" />)}
        </TileStat>
        <div className="min-w-0">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">Fit</dt>
          <dd className="mt-0.5 text-sm font-semibold">
            {scored ? (
              <span
                className={`flex items-center gap-1.5 tabular-nums ${fitCls}`}
                title={[`${scored.score} / 100 mandate fit`, fitCheckedNote?.replace(/\.$/, ""), d.fitFirstRead ? FIRST_READ_TITLE : null]
                  .filter(Boolean)
                  .join(". ")}
              >
                {scored.score}
                <FitBar score={scored.score} />
              </span>
            ) : d.fit ? (
              <span
                className={FIT_TONE_CLS[fitTone(null, d.fit, d.fitCoverage)]}
                title={[fitCheckedNote, d.fitFirstRead ? FIRST_READ_TITLE : null].filter(Boolean).join(" ") || undefined}
              >
                {FIT_META[d.fit].label}
              </span>
            ) : (
              <Unstated reading={!!d.reading && !!d.hasBox} width="w-12" className="font-normal text-line" />
            )}
          </dd>
          {/* Not every criterion of the box could be checked: how many were,
              under the fit, as the deal header's chip says it. */}
          {fitChecked ? (
            <dd className="truncate text-[10px] font-medium text-muted" title={fitCheckedNote ?? undefined} data-qa="fit-checked">
              {fitChecked}
            </dd>
          ) : null}
          {/* Judged on the first signal while the extraction is on its
              way: said under the fit, as the deal page says it. */}
          {d.fitFirstRead && (scored || d.fit) ? (
            <dd className="truncate text-[10px] font-medium uppercase tracking-wide text-brand" title={FIRST_READ_TITLE} data-qa="fit-first-read">
              First read
            </dd>
          ) : null}
        </div>
      </dl>
      {/* The tags the picture could not carry whole, on a line of their own
          under the figures, at the widths where it could not; a card with
          none keeps only the padding. A container, as the picture is, so
          the two ask the same width. */}
      <div className="@container/card pb-3.5">
        <TagLine
          tags={[...lineTags.map((p) => p.tag), ...(older ? [older] : []), ...(d.personal ? [PERSONAL_TAG] : [])]}
          className={`px-4 pt-2.5 ${atTiers(lineShown).flex}`}
          chipClass={(t) => atTiers(lineAt.get(t.key) ?? []).block}
        />
      </div>
    </>
  );

  return (
    <li
      style={{ "--i": i } as React.CSSProperties}
      data-deal-tile={d.id}
      onPointerEnter={canFlip && !warm ? () => setWarm(true) : undefined}
      onTouchStart={
        canFlip
          ? (e) => {
              const t = e.touches[0];
              const inPicture = (e.target as Element).closest("[data-deal-banner],[data-flip]");
              touch.current = t && inPicture ? { x: t.clientX, y: t.clientY } : null;
              setWarm(true);
            }
          : undefined
      }
      onTouchEnd={
        canFlip
          ? (e) => {
              const from = touch.current;
              const t = e.changedTouches[0];
              touch.current = null;
              if (!from || !t) return;
              const dx = t.clientX - from.x;
              // A swipe across the picture, not a scroll down the page.
              if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(t.clientY - from.y)) go(dx < 0 ? 1 : -1);
            }
          : undefined
      }
      // Five rows of the grid's own (the picture, the name and place, the
      // figures, the tags under them, the footer), so every card in a row
      // of the grid shares their heights.
      className={`group relative row-span-5 grid grid-rows-subgrid gap-y-0 overflow-hidden rounded-2xl border bg-surface shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        checked ? "border-brand ring-2 ring-brand/40" : "border-line"
      } ${isDead ? "grayscale" : ""}`}
    >
      {compareMode ? (
        <button type="button" onClick={() => onToggle(d.id)} aria-pressed={checked} className="row-span-4 grid grid-rows-subgrid text-left">
          {inner}
        </button>
      ) : (
        <>
          <Link href={`/deals/${d.id}`} className="row-span-4 grid grid-rows-subgrid">
            {inner}
          </Link>
          {/* The deal's other photographs (#450), flipped through where a
              listing's card lets you, once its own photograph is whole on
              screen. Outside the link, over the picture: a button inside an
              anchor is invalid, and the card's click still opens the deal. */}
          {canFlip ? <PhotoFlip name={d.name} count={count} slide={slide} onStep={go} /> : null}
          {/* Outside the link: a select inside an anchor is invalid, and the
              stage is changed here without leaving the pipeline. */}
          <div className="flex items-center gap-2 border-t border-line bg-faint/60 px-4 py-2 text-[11px] text-muted">
            {d.offersDue ? (
              <OffersDueBit iso={d.offersDue} today={todayIso} />
            ) : (
              <span className="font-mono tabular-nums">{fmtDate(d.createdAt)}</span>
            )}
            {d.addedBy ? (
              <span className="inline-flex items-center" title={`Added by ${d.addedBy}`}>
                <span aria-hidden className="flex h-4 w-4 items-center justify-center rounded-full bg-brand/10 text-[9px] font-semibold text-brand">
                  {initials(d.addedBy)}
                </span>
                <span className="sr-only">added by {d.addedBy}</span>
              </span>
            ) : null}
            <span className="ml-auto">
              <StageSelect dealId={d.id} stage={d.stage} next="pipeline" compact />
            </span>
          </div>
        </>
      )}
    </li>
  );
});

/**
 * A card's way through its deal's photographs (#450), over the picture: an
 * arrow each side, shown on hover or focus and always on a touch screen,
 * named for the deal, and a dot a photograph on a dark pill — five at
 * most, a window round the one on screen. The card draws it only once its
 * own photograph is whole on screen, and it fades in with it. Pure, so a
 * test draws it.
 */
export function PhotoFlip({
  name,
  count,
  slide,
  onStep,
}: {
  /** the deal's name, for the arrows' accessible names */
  name: string;
  /** how many photographs there are to flip through, the lead one included */
  count: number;
  /** the one on screen, from 0 */
  slide: number;
  onStep: (step: number) => void;
}) {
  const first = Math.min(Math.max(0, slide - 2), Math.max(0, count - 5));
  return (
    <div
      data-flip="photos"
      className="pointer-events-none absolute inset-x-0 top-0 flex aspect-[16/10] items-center justify-between px-2 transition-opacity duration-500 ease-out starting:opacity-0"
    >
      {[-1, 1].map((step) => (
        <button
          key={step}
          type="button"
          onClick={() => onStep(step)}
          aria-label={`${step < 0 ? "Previous" : "Next"} photo of ${name}`}
          data-flip-step={step}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink shadow-md opacity-0 transition hover:bg-white focus-visible:opacity-100 focus-on-photo group-hover:opacity-100 pointer-coarse:opacity-90"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
            <path d={step < 0 ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
          </svg>
        </button>
      ))}
      {/* On a dark pill, the photograph count's own: bare white dots went
          missing over a bright sky or a white facade (research pass 29). */}
      {count > 1 ? (
        <span
          aria-hidden
          data-flip="dots"
          className="absolute bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-1.5 py-1"
        >
          {Array.from({ length: Math.min(count, 5) }, (_, k) => (
            <span key={first + k} className={`h-1.5 w-1.5 rounded-full ${first + k === slide ? "bg-white" : "bg-white/50"}`} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

const ONBOARD_KEY = "uc-onboard-dismissed";

/** Three real steps to a working account — every check reflects actual data,
 *  and the card retires itself (or can be dismissed) once the account is set. */
function GettingStarted({
  state,
  atLimit,
  onNewDeal,
}: {
  state: OnboardingState;
  atLimit: boolean;
  onNewDeal: () => void;
}) {
  // Hidden until mount so a stored dismissal never flashes the card.
  const [show, setShow] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      try {
        setShow(localStorage.getItem(ONBOARD_KEY) !== "1");
      } catch {
        setShow(true);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  // The upload first, the sample second, the buy box last: the checklist
  // had opened on the buy box, the step that asks the most of someone who
  // has not yet seen a screen (research pass 32).
  const steps: {
    key: string;
    label: string;
    done: boolean;
    action: ReactNode;
  }[] = [
    {
      key: "screen",
      label: "Screen your first OM",
      done: state.hasScreenedOm,
      action: atLimit ? (
        <Link
          href="/billing"
          className="text-xs font-medium text-brand hover:text-brand-strong"
        >
          See plans →
        </Link>
      ) : (
        <button
          type="button"
          onClick={onNewDeal}
          className="text-xs font-medium text-brand hover:text-brand-strong"
        >
          Upload →
        </button>
      ),
    },
    {
      key: "sample",
      label: "Open the sample deal",
      done: !!state.sampleId,
      // Both states route through the ACTION (it redirects into an existing
      // sample after topping up anything the fixture gained since — a plain
      // link would bypass that self-heal).
      action: (
        <form action={createSampleDeal}>
          <PendingButton
            pendingLabel={state.sampleId ? "Opening…" : "Adding…"}
            className="text-xs font-medium text-brand hover:text-brand-strong"
          >
            {state.sampleId ? "Open it →" : "Add it →"}
          </PendingButton>
        </form>
      ),
    },
    {
      key: "buybox",
      label: "Set your buy box",
      done: state.hasBuyBox,
      action: (
        <Link
          href="/criteria"
          className="text-xs font-medium text-brand hover:text-brand-strong"
        >
          Set it →
        </Link>
      ),
    },
  ];

  const remaining = steps.filter((s) => !s.done);
  if (!show || remaining.length === 0) return null;

  function dismiss() {
    try {
      localStorage.setItem(ONBOARD_KEY, "1");
    } catch {
      // storage unavailable — hide for this visit only
    }
    setShow(false);
  }

  return (
    <section className="animate-rise rounded-2xl border border-brand/20 bg-brand/[0.03] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold tracking-tight">Get set up</h2>
          {/* Progress as segments, one per step. */}
          <div
            className="mt-1.5 flex items-center gap-1"
            role="img"
            aria-label={`${steps.length - remaining.length} of ${steps.length} steps done`}
          >
            {steps.map((s) => (
              <span
                key={s.key}
                className={`h-1.5 w-8 rounded-full ${s.done ? "bg-pass" : "bg-line"}`}
              />
            ))}
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Hide the setup checklist"
          className="rounded-md p-1 text-muted transition-colors hover:bg-faint hover:text-ink"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
      <ul className="mt-3 space-y-2">
        {steps.map((s, i) => (
          <li
            key={s.key}
            className="flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2"
          >
            <span
              aria-hidden
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                s.done
                  ? "bg-pass/10 text-pass"
                  : "bg-faint text-muted ring-1 ring-inset ring-line"
              }`}
            >
              {s.done ? "✓" : i + 1}
            </span>
            <span
              className={`min-w-0 flex-1 text-sm ${
                s.done ? "text-muted line-through decoration-line" : ""
              }`}
            >
              {s.label}
            </span>
            {!s.done && <span className="shrink-0">{s.action}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
  className = "",
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  className?: string;
  /** the accessible name — a select with no label is announced as nothing
   *  but its value ("All verdicts") to a screen reader */
  label: string;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(e) => onChange(e.target.value)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%235f6b69' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>\")",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "right 0.6rem center",
        backgroundSize: "0.85rem",
      }}
      className={`appearance-none rounded-lg border border-line bg-surface py-1.5 pl-3 pr-8 text-sm text-ink shadow-sm outline-none transition-colors hover:bg-faint focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 ${className}`}
    >
      {options.map(([val, label]) => (
        <option key={val} value={val}>
          {label}
        </option>
      ))}
    </select>
  );
}

/** The new-deal form's typed fields, mirrored to localStorage so an upload
 *  failure — or a full page refresh — never costs the user their typing.
 *  (The chosen FILE can't be restored; browsers forbid it.) */
interface DealDraft {
  name: string;
  assetClass: string;
  address: StructuredAddress | null;
  /** set when a submit starts; a return WITHOUT an error means it succeeded */
  submittedAt: number | null;
  /** the name is the one the last chosen PDF gave it, so a newer file may
   *  replace it after a reload or an upload error, as it could before; a
   *  name the reader typed is never marked */
  nameFromFile?: boolean;
}

// The unsent draft is kept under the reader's own account: kept under one
// key for the browser, the next person to sign in on it was offered the last
// one's deal name and address (pass 14, 2026-10-01). The old shared key is
// cleared on sight, never read.
const DRAFT_KEY = "uc:new-deal-draft";
const draftKeyFor = (viewerId: string | null | undefined) =>
  viewerId ? `${DRAFT_KEY}:${viewerId.toLowerCase().replace(/[^0-9a-f-]/g, "")}` : null;

function readDraft(key: string | null): DealDraft | null {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
    if (!key) return null;
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as DealDraft;
    return d && typeof d === "object" ? d : null;
  } catch {
    return null;
  }
}

function writeDraft(key: string | null, d: DealDraft | null) {
  if (!key) return;
  try {
    if (!d || (!d.name.trim() && !d.address)) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(d));
    }
  } catch {
    // Private mode / quota — drafts are a convenience, never a blocker.
  }
}

function NewDealForm({
  errorMessage,
  prefill,
  viewerId,
}: {
  errorMessage: string | null;
  prefill?: StructuredAddress | null;
  /** the signed-in reader, whose own the unsent draft is */
  viewerId?: string | null;
}) {
  const draftKey = draftKeyFor(viewerId);
  const router = useRouter();
  // No answer came back for the upload — the connection dropped, or the
  // server failed before it answered: the deal may or may not exist, so the
  // form says to look before uploading again (a repeat is merged into the
  // first only inside 15 seconds; app/(app)/deals/actions.ts).
  const [dropped, setDropped] = useState(false);
  // Two ways in: upload the OM, or type the facts (no document needed —
  // small-multifamily listings rarely come with one). An upload error code
  // in the URL means the last submit was an upload — open on that mode.
  // A Pull Comps hand-off arrives with the address picked: open on manual.
  const [mode, setMode] = useState<"upload" | "manual">(prefill ? "manual" : "upload");
  const [name, setName] = useState("");
  // The name the last chosen PDF put in the field: a newer file replaces it,
  // as the batch upload names each deal by its file; a name typed stays.
  const filledName = useRef<string | null>(null);
  const [assetClass, setAssetClass] = useState("auto");
  // The address field manages its own text; we mirror its latest value here
  // and remount it (key) when a draft restores.
  const addressRef = useRef<StructuredAddress | null>(null);
  const [restoredAddress, setRestoredAddress] = useState<StructuredAddress | null>(null);
  const [addrKey, setAddrKey] = useState(0);
  const [restored, setRestored] = useState(false);

  // Restore once on mount (an effect, so SSR markup stays draft-free; the
  // rAF defers the setState burst out of the effect body per hooks rules).
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const d = readDraft(draftKey);
      if (!d) return;
      if (d.submittedAt && !errorMessage) {
        // Last submit came back without an error — the deal was created and
        // this draft is spent.
        writeDraft(draftKey, null);
        return;
      }
      if (d.name) {
        setName(d.name);
        // A name a PDF gave stays the file's to replace; the file itself
        // cannot be restored, so the next one chosen names the deal.
        filledName.current = restoredFileName(d);
      }
      if (d.assetClass) setAssetClass(d.assetClass);
      if (d.address) {
        addressRef.current = d.address;
        setRestoredAddress(d.address);
        setAddrKey((k) => k + 1);
      }
      if (d.name || d.address) setRestored(true);
      if (d.submittedAt) writeDraft(draftKey, { ...d, submittedAt: null });
    });
    return () => cancelAnimationFrame(raf);
    // errorMessage is fixed for the lifetime of this render of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(next: Partial<DealDraft>) {
    const draftName = next.name ?? name;
    writeDraft(draftKey, {
      name,
      assetClass,
      address: addressRef.current,
      submittedAt: null,
      ...next,
      nameFromFile: nameIsFromFile(draftName, filledName.current),
    });
  }

  function clearDraft() {
    writeDraft(draftKey, null);
    filledName.current = null;
    setName("");
    setAssetClass("auto");
    addressRef.current = null;
    setRestoredAddress(null);
    setAddrKey((k) => k + 1);
    setRestored(false);
  }

  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold tracking-tight">New deal</h2>
        {/* Two pressed-or-not buttons, as the view toggle is: it promised
            tabs the arrow keys did not move (research pass 33). */}
        <div
          role="group"
          aria-label="How to add the deal"
          className="flex gap-1 rounded-lg bg-faint p-1"
        >
          {(
            [
              ["upload", "Upload the OM"],
              ["manual", "Type the facts"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                mode === key
                  ? "bg-surface text-ink shadow-sm"
                  : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* The upload mode needs no sentence — the drop zone says what it takes. */}
      {mode === "manual" && (
        <p className="mt-1 text-sm text-muted">
          No OM? Type what you know; attach the OM later.
        </p>
      )}
      {mode === "manual" && (
        <div className="mt-4">
          <ManualDealForm mode="create" initialAddress={prefill ?? null} />
        </div>
      )}
      {mode === "upload" && (
        <>
      {/* An alert: it arrives through the address bar after an upload the
          server refused, and was said to no one (research pass 33). */}
      {errorMessage && (
        <p role="alert" className="mt-3 rounded-lg bg-kill/10 px-3 py-2 text-sm text-kill">
          {errorMessage}
        </p>
      )}
      {restored && errorMessage && (
        <p className="mt-2 text-sm text-muted" role="status">
          Everything you typed is still filled in below — just re-attach the
          PDF and resubmit.
        </p>
      )}
      {restored && !errorMessage && (
        <p className="mt-2 text-sm text-muted" role="status">
          Restored your unsaved draft.{" "}
          <button
            type="button"
            onClick={clearDraft}
            className="font-medium text-brand transition-colors hover:text-brand-strong"
          >
            Start fresh
          </button>
        </p>
      )}
      {dropped && (
        <p className="mt-3 rounded-lg bg-caution/10 px-3 py-2 text-sm text-caution" role="alert">
          No answer came back for the upload, so the deal may or may not have
          been created. Check your pipeline for it before uploading again;
          everything you typed is still here.
        </p>
      )}
      <form
        // The create's own outcome, read here rather than through a redirect:
        // a dropped connection mid-upload had reached the app's error page
        // ("a rendering hiccup"), wiped the draft as a success, and left a
        // second upload free to make a twin deal (pass 14, 2026-10-01). The
        // batch panel reads the same action the same way.
        action={async (fd: FormData) => {
          setDropped(false);
          const keep = () =>
            writeDraft(draftKey, {
              name,
              assetClass,
              address: addressRef.current,
              submittedAt: null,
              nameFromFile: nameIsFromFile(name, filledName.current),
            });
          let res: Awaited<ReturnType<typeof createDealFromBatch>>;
          try {
            res = await createDealFromBatch(fd);
          } catch {
            keep();
            setDropped(true);
            router.refresh();
            return;
          }
          if (res.ok) {
            writeDraft(draftKey, null);
            // Where a team member's deal went into their own pipeline, the
            // deal page says so (lib/personal-deal) — the landing carries it.
            router.push(dealLanding(res.dealId, !!res.personal));
            return;
          }
          keep();
          // Signed out mid-upload: round-trip through sign-in back to the
          // error, as the server action's own redirect did.
          if (res.error === "auth") router.push(`/login?next=${encodeURIComponent("/deals?error=auth")}`);
          else router.push(`/deals?error=${res.error}`);
        }}
        onSubmit={() =>
          writeDraft(draftKey, {
            name,
            assetClass,
            address: addressRef.current,
            submittedAt: Date.now(),
            nameFromFile: nameIsFromFile(name, filledName.current),
          })
        }
        className="mt-4 space-y-3"
      >
        {/* Each field says what it is above it, where a placeholder alone
            went the moment the reader typed (research pass 33). */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium text-muted">Deal name</span>
            <input
              name="name"
              required
              maxLength={DEAL_NAME_MAX}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                persist({ name: e.target.value });
              }}
              placeholder="e.g. The Maddox at Brewerytown"
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted">Asset class</span>
            <select
              name="assetClass"
              value={assetClass}
              onChange={(e) => {
                setAssetClass(e.target.value);
                persist({ assetClass: e.target.value });
              }}
              className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              <option value="auto">Auto-detect</option>
              {ASSET_CLASS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div>
          {/* The field's own name is "Property address"; this is that name,
              on screen. */}
          <p aria-hidden className="mb-1 text-xs font-medium text-muted">
            Property address <span className="font-normal">(optional)</span>
          </p>
          <AddressAutocomplete
            key={addrKey}
            name="address"
            textName="addressText"
            defaultValue={restoredAddress}
            onDraft={(text, picked) => {
              addressRef.current =
                picked ??
                (text.trim()
                  ? {
                      label: text.trim(),
                      street: "",
                      city: "",
                      state: "",
                      zip: "",
                      county: "",
                      submarket: "",
                    }
                  : null);
              persist({ address: addressRef.current });
            }}
            placeholder="Property address (optional) — start typing for suggestions"
            className="w-full rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
          />
        </div>
        <FileDrop
          name="om"
          accept="application/pdf"
          hint="PDF offering memorandum, up to 32 MB"
          maxBytes={32 * 1024 * 1024}
          tooLarge="memorandum"
          onFile={(file) => {
            if (!file) return;
            const next = prefillName(name, filledName.current, file.name);
            if (next == null) return;
            filledName.current = next;
            setName(next);
            persist({ name: next });
          }}
        />
        <PendingButton
          pendingLabel="Uploading your OM — hang tight…"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          Create &amp; screen
        </PendingButton>
      </form>
      <BatchUpload />
        </>
      )}
      <form action={createSampleDeal} className="mt-3 border-t border-line pt-3">
        <PendingButton
          pendingLabel="Setting up your sample deal…"
          className="text-sm font-medium text-brand transition-colors hover:text-brand-strong"
        >
          Or explore a sample deal →
        </PendingButton>
      </form>
    </section>
  );
}
