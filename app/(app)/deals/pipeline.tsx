"use client";

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
import { createDeal, createSampleDeal } from "./actions";
import { BatchUpload } from "./batch-upload";
import { DealThumb } from "./deal-thumb";
import { DealBanner } from "./deal-banner";
import type { BannerSource } from "@/lib/deal-banner";
import type { DealCoverFacts } from "@/lib/deal-cover";
import { PipelineMap } from "./pipeline-map";
import type { MapDeal, MapPlace } from "@/lib/pipeline-map";
import { PIPELINE_VIEW_COOKIE, remembersView, type PipelineView } from "@/lib/pipeline-view";
import { ManualDealForm } from "./manual-deal-form";
import { FileDrop } from "../file-drop";
import { PendingButton } from "../pending-button";
import { AddressAutocomplete } from "../address-autocomplete";
import type { StructuredAddress } from "@/lib/address";
import { ASSET_CLASS_OPTIONS, assetClassLabel } from "@/lib/asset-class";
import { StageSelect } from "./[id]/stage-select";
import { OffersDueBit } from "./offers-due";
import { parseMoney, parsePct, parsePrice, priceRange, priceRangeShort } from "@/lib/criteria";
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
  /** deterministic buy-box result against the user's mandate */
  fit: "fits" | "near" | "outside" | null;
  /** 0–100 mandate-fit score + its PURSUE/WATCH/PASS call (null pre-screen) */
  score: number | null;
  mandateVerdict: "PURSUE" | "WATCH" | "PASS" | null;
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
  slots: { cap: string | null; price: string | null; yoc: string | null; interest?: string | null; debt?: string | null; affordable?: string | null; tenancy?: string | null; hotel?: string | null; sale?: string | null; roster?: string | null; valueAdd?: string | null; abatement?: string | null; sellerNote?: string | null; reports?: string | null; broker?: string | null; student?: string | null; mh?: string | null; storage?: string | null; basis?: string | null };
  /** latest analysis-job state: a live run, one that stopped writing
   *  progress (its process died), or a failure that left the verdict behind */
  jobStatus?: "running" | "stalled" | "failed" | null;
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
};

// How the pipeline is drawn, and which view is remembered, live in
// lib/pipeline-view (#438): the page is a server component and reads them,
// and an export of this "use client" module is only a client reference there.
export type { PipelineView } from "@/lib/pipeline-view";

/** A card as the map reads it. */
function mapDealOf(d: DealCard): MapDeal {
  return {
    id: d.id,
    name: d.name,
    verdict: d.verdict,
    price: d.slots.price ? compactPrice(d.slots.price) : null,
    figure: d.slots.cap ? `${d.slots.cap} cap` : d.slots.yoc ? `${d.slots.yoc} yield on cost` : null,
    place: d.place ?? null,
    placeMiss: d.placeMiss,
    hasAddress: d.hasAddress,
  };
}

/** One row per deal: name · asset · price · cap · buy box · status · added.
 *  Every column is sortable from its header. */
type SortKey = "name" | "asset" | "price" | "cap" | "fit" | "status" | "added";

/** The price as a table wants it — "$68.0M", "$950k" — with the OM's own
 *  figure kept for the tooltip and the CSV. A column eighty pixels wide
 *  showed every deal as "$68,000,…" before; the raw string stays when it
 *  is not a figure at all ("Call for offers"). */
function compactPrice(raw: string): string {
  // Guidance stated as a range stays one (#466) — "$40–42M" — where the
  // first cut showed its bottom alone, the flattering end, as the price.
  const range = priceRange(raw);
  if (range) return priceRangeShort(range);
  const n = parseMoney(raw);
  if (n == null || !(n > 0)) return raw;
  return n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${Math.round(n / 1e3)}k` : `$${Math.round(n)}`;
}

const FIT_META: Record<NonNullable<DealCard["fit"]>, { label: string; cls: string; rank: number }> = {
  outside: { label: "Outside", cls: "text-kill", rank: 0 },
  near: { label: "Near", cls: "text-caution", rank: 1 },
  fits: { label: "Fits", cls: "text-pass", rank: 2 },
};

const MANDATE_META: Record<
  NonNullable<DealCard["mandateVerdict"]>,
  { label: string; cls: string }
> = {
  PASS: { label: "Pass", cls: "text-kill" },
  WATCH: { label: "Watch", cls: "text-caution" },
  PURSUE: { label: "Pursue", cls: "text-pass" },
};

function statusRank(d: DealCard): number {
  if (d.verdict) return (VERDICT_META[d.verdict]?.rank ?? 0) + 2;
  if (d.jobStatus === "running") return 1;
  if (d.jobStatus === "stalled") return 0.75;
  if (d.jobStatus === "failed") return 0.5;
  return 0;
}

function sortValue(d: DealCard, key: SortKey): string | number {
  switch (key) {
    case "name":
      return d.name.toLowerCase();
    case "asset":
      return d.assetClass;
    case "price":
      return d.slots.price ? (parsePrice(d.slots.price) ?? -1) : -1;
    case "cap":
      return d.slots.cap ? (parsePct(d.slots.cap) ?? -1) : -1;
    case "fit":
      // Sort by the numeric mandate score when present (the column shows it),
      // falling back to the coarse fold rank for pre-score deals.
      return d.score ?? (d.fit ? FIT_META[d.fit].rank : -1);
    case "status":
      return statusRank(d);
    case "added":
      return d.createdAt;
  }
}

/** First click on a header sorts the way people expect that column to lead:
 *  text A→Z, figures biggest-first, dates newest-first, best fits first. */
const DEFAULT_DIR: Record<SortKey, "asc" | "desc"> = {
  name: "asc",
  asset: "asc",
  price: "desc",
  cap: "desc",
  fit: "desc",
  status: "desc",
  added: "desc",
};

const VERDICT_META: Record<
  string,
  { label: string; cls: string; rank: number }
> = {
  pass_on: { label: "No-go", cls: "bg-kill/15 text-kill", rank: 0 },
  caution: { label: "Caution", cls: "bg-caution/15 text-caution", rank: 1 },
  pass: { label: "Go", cls: "bg-pass/15 text-pass", rank: 2 },
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
  dealCount: number;
  dealLimit: number;
};

export type OnboardingState = {
  hasBuyBox: boolean;
  sampleId: string | null;
  hasRealDeal: boolean;
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
  const [sortKey, setSortKey] = useState<SortKey>("added");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
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
            showDead: boolean;
            collapsed: Partial<Record<Stage, boolean>>;
          }>;
          if (typeof v.verdict === "string") setVerdict(v.verdict);
          if (typeof v.stage === "string") setStage(v.stage);
          if (typeof v.asset === "string") setAsset(v.asset);
          if (typeof v.market === "string") setMarket(v.market);
          if (typeof v.mfit === "string") setMfit(v.mfit);
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
        JSON.stringify({ verdict, stage, asset, market, mfit, showDead, collapsed }),
      );
    } catch {
      // storage unavailable — view state is per-visit only
    }
  }, [verdict, stage, asset, market, mfit, showDead, collapsed]);

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
  const showUsage = !!billing && !billing.isPro;

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
      return true;
    });
    return list.sort((a, b) => {
      const va = sortValue(a, sortKey);
      const vb = sortValue(b, sortKey);
      const cmp =
        typeof va === "string" && typeof vb === "string"
          ? va.localeCompare(vb)
          : (va as number) - (vb as number);
      // Ties fall back to newest-first so the order stays stable and sane.
      const tie = sortKey === "added" ? 0 : b.createdAt.localeCompare(a.createdAt);
      return (sortDir === "asc" ? cmp : -cmp) || tie;
    });
  }, [deals, deferredQuery, verdict, stage, asset, market, mfit, sortKey, sortDir, showDead]);

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

  /** A section is open unless the user collapsed it; an EMPTY section starts
   *  collapsed until the user opens it. */
  function isOpen(s: Stage): boolean {
    const explicit = collapsed[s];
    if (explicit !== undefined) return !explicit;
    return (groups.get(s)?.length ?? 0) > 0;
  }
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
  }
  const filtersActive =
    query.trim() !== "" ||
    verdict !== "all" ||
    stage !== "all" ||
    asset !== "all" ||
    market !== "all" ||
    mfit !== "all";
  // Export the current (filtered) view as a CSV — opens in Excel/Sheets.
  function exportCsv() {
    // Neutralize formula-leading cells (=, +, -, @) — deal names and OM-derived
    // text are untrusted and must never execute when the CSV opens in Excel.
    const esc = (v: string) => {
      const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    // A plan deal's cap cell is empty and its yield on cost sits in its own
    // column — the same two columns the meeting .xlsx carries.
    const header = ["Deal", "Asset class", "Market", "Covered market", "Price", "Basis", "What the price buys", "Assumable debt", "Seller financing", "Affordability", "Tenancy", "Tenants", "Value-add", "Tax abatement", "Hotel", "Sale", "Reports", "Student housing", "Manufactured housing", "Self-storage", "Flood zone", "Cap rate", "Yield on cost", "Buy box", "Mandate score", "Mandate fit", "Status", "Stage", "Offers due", "Broker", "Added", "Added by"];
    const lines = filtered.map((d) =>
      [
        d.name,
        assetClassLabel(d.assetClass),
        d.market,
        d.coveredMarket ?? "",
        d.slots.price ?? "",
        // The price by the unit, the key or the foot (#469); blank where
        // the count or the area is not stated, and on a plan deal.
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
        // Every case said; blank only before FEMA's lookup has answered (#426).
        d.flood?.cell ?? "",
        d.slots.cap ?? "",
        d.slots.yoc ?? "",
        d.fit ? FIT_META[d.fit].label : "",
        d.score != null ? String(d.score) : "",
        d.mandateVerdict ? MANDATE_META[d.mandateVerdict].label : "",
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
              {showUsage && (
                // The free allowance as a meter with the number, not a sentence.
                <Link
                  href="/billing"
                  title={`${billing!.dealCount} of ${billing!.dealLimit} free deals used`}
                  className={`inline-flex items-center gap-1.5 font-medium underline-offset-2 hover:underline ${
                    atLimit ? "text-caution" : ""
                  }`}
                >
                  <span
                    aria-hidden
                    className="h-1.5 w-12 overflow-hidden rounded-full bg-faint ring-1 ring-inset ring-line"
                  >
                    <span
                      className={`block h-full rounded-full ${atLimit ? "bg-caution" : "bg-brand/70"}`}
                      style={{
                        width: `${Math.min(100, Math.round((billing!.dealCount / Math.max(1, billing!.dealLimit)) * 100))}%`,
                      }}
                    />
                  </span>
                  {Math.max(0, billing!.dealLimit - billing!.dealCount)} free{" "}
                  {billing!.dealLimit - billing!.dealCount === 1 ? "deal" : "deals"} left
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
        <NewDealForm errorMessage={errorMessage} prefill={prefillAddress ?? null} />
      )}
      {atLimit && errorMessage && (
        <section className="rounded-xl border border-caution/30 bg-caution/5 p-5">
          <p className="text-sm font-medium text-caution">{errorMessage}</p>
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
          <div className="relative">
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
              className="w-48 rounded-lg border border-line bg-surface py-1.5 pl-9 pr-3 text-sm shadow-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
            />
          </div>
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
              const [k, dir] = v.split(":") as [SortKey, "asc" | "desc"];
              setSortKey(k);
              setSortDir(dir);
            }}
            className={`ml-auto ${view === "list" ? "md:hidden" : ""}`}
            options={[
              ["added:desc", "Newest"],
              ["added:asc", "Oldest"],
              ["price:desc", "Price: high to low"],
              ["cap:desc", "Cap: high to low"],
              ["fit:desc", "Mandate fit: high to low"],
              ["status:desc", "By status"],
              ["name:asc", "Name A–Z"],
            ]}
          />
          {/* The two exports travel together at the right edge: when the
              filters wrap, the last line ends with them, never with one
              stranded select beside them. */}
          <div className={`flex items-center gap-2 ${view === "list" ? "md:ml-auto" : ""}`}>
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
            <Link
              href="/market"
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
              <div className="min-w-0 flex-1">
                <SortHead label="Deal" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </div>
              <SortHead label="Asset" k="asset" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="hidden w-24 lg:flex" />
              <SortHead label="Price" k="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="w-20" right />
              <SortHead label="Cap" k="cap" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="w-12" right />
              <SortHead label="Fit" k="fit" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="hidden w-16 lg:flex" right />
              <SortHead label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="w-22" right />
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
                if (s === "dead" && !showDead && stage !== "dead") return null;
                if (sectionDeals.length === 0) return null;
                const open = isOpen(s) && sectionDeals.length > 0;
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
                      // building's picture first, the way a listing reads.
                      <ul className="stagger mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4" data-view="cards">
                        {sectionDeals.map((d, idx) => (
                          <DealTile
                            key={d.id}
                            d={d}
                            i={idx}
                            compareMode={compareMode}
                            checked={selected.has(d.id)}
                            onToggle={toggleSelected}
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
                          />
                        ))}
                      </ul>
                    )}
                  </section>
                );
              })}
            </div>
          </div>
          )}
        </>
      )}
    </div>
  );
}

/** The ladder as one picture: a rung per live stage with its count, each a
 *  one-tap stage filter. An empty rung is hollow — it used to be a collapsed
 *  section header with a zero in it. Dead deals sit behind their own toggle. */
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
          // On a phone the populated rungs take twice the width of the hollow
          // ones and the hollow ones drop their label, so six rungs fit.
          <li
            key={s}
            className={`relative min-w-0 ${lit ? "flex-[2] sm:flex-1" : "flex-1"}`}
          >
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
              {/* Six rungs share a phone's width: the label shrinks there
                  rather than truncating; the full name is the tooltip. */}
              <span
                className={`w-full truncate text-[9px] font-medium uppercase sm:text-[10px] sm:tracking-wide ${
                  lit ? "text-ink" : "hidden text-muted sm:block"
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
  return (
    <p className={`${flush ? "" : "mt-0.5 "}truncate text-xs text-muted ${className ?? ""}`}>
      {shown.map((b, idx) => (
        <Fragment key={idx}>
          {idx > 0 && " · "}
          {b}
        </Fragment>
      ))}
    </p>
  );
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
}: {
  d: DealCard;
  i: number;
  compareMode: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
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
      {d.readCounty ? `${d.readMarket} · ${d.readCounty.split(",")[0]}` : `${d.readMarket} · read`}
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
  // What the price buys where it is not the building (#415): a share's
  // price, a note's, the land's under a ground lease — said beside the
  // figure so a $20M share never reads as a $20M building.
  const interestBit = d.slots.interest ? (
    <span
      className="whitespace-nowrap font-medium text-brand"
      title={`${d.slots.interest}: the price does not buy the building outright — the deal page says what it buys`}
    >
      {d.slots.interest}
    </span>
  ) : null;
  // The seller's loan, where it is offered for assumption (#419) — the deal
  // page prices it against today's rate.
  const debtBit = d.slots.debt ? (
    <span
      className="whitespace-nowrap font-medium text-brand"
      title={`${d.slots.debt}: the seller's loan is offered for assumption — the deal page prices it against today's rate`}
    >
      {d.slots.debt}
    </span>
  ) : null;
  // A covenant or a contract that sets the rents (#453): a restricted
  // building's rents move with the limits, not the market — said beside the
  // price, where the pipeline is scanned.
  const affordableBit = d.slots.affordable ? (
    <span
      className="whitespace-nowrap font-medium text-brand"
      title={`${d.slots.affordable}: a covenant or a contract sets these rents — the deal page says until when`}
    >
      {d.slots.affordable}
    </span>
  ) : null;
  // One tenant leases the whole property (#454): the lease is the income,
  // and how long it has left is what the price is paid for.
  const tenancyBit = d.slots.tenancy ? (
    <span
      className="whitespace-nowrap font-medium text-brand"
      title={`${d.slots.tenancy}: one lease is the whole income — the deal page reads its guarantor, its term and its increases`}
    >
      {d.slots.tenancy}
    </span>
  ) : null;
  // What a hotel is sold with (#455): the encumbrance and the PIP change
  // what the price buys.
  const hotelBit = d.slots.hotel ? (
    <span
      className="whitespace-nowrap font-medium text-brand"
      title={`${d.slots.hotel}: what the hotel is sold with — the deal page reads the flag, the manager and the PIP`}
    >
      {d.slots.hotel}
    </span>
  ) : null;
  // The listed tenants (#457): an anchor not in the sale, and the share of
  // the rent expiring before the model's sale.
  const rosterBit = d.slots.roster ? (
    <span
      className="whitespace-nowrap font-medium text-caution"
      title={`${d.slots.roster}: the listed tenants against the model's sale — the deal page reads the roll, the anchors and their rights`}
    >
      {d.slots.roster}
    </span>
  ) : null;
  // A renovation program (#460): the premium it is priced on, and its
  // return on the cost of a door.
  const valueAddBit = d.slots.valueAdd ? (
    <span
      className="whitespace-nowrap font-medium text-brand"
      title={`${d.slots.valueAdd}: the renovation program as stated — the deal page reads its proof, its pace and what the model does not carry`}
    >
      {d.slots.valueAdd}
    </span>
  ) : null;
  // A note the seller will carry (#462): its rate, beside the price.
  const sellerNoteBit = d.slots.sellerNote ? (
    <span
      className="whitespace-nowrap font-medium text-brand"
      title={`${d.slots.sellerNote}: the seller offers to carry financing — the deal page prices the note against today's rate`}
    >
      {d.slots.sellerNote}
    </span>
  ) : null;
  // A student building's pre-leasing against last year's (#468): behind
  // the pace, or a drive to campus, in the warning tone.
  const studentBit = d.slots.student ? (
    <span
      className={`whitespace-nowrap font-medium ${/−|Drive-to/.test(d.slots.student) ? "text-caution" : "text-brand"}`}
      title={`${d.slots.student}: a student building's leasing for the coming year — the deal page reads the pace, the beds and the walk to campus`}
    >
      {d.slots.student}
    </span>
  ) : null;
  // A manufactured-housing park's lot rent against the market's (#470): a
  // private water or sewer system in the warning tone.
  const mhBit = d.slots.mh ? (
    <span
      className={`whitespace-nowrap font-medium ${/Private/.test(d.slots.mh) ? "text-caution" : "text-brand"}`}
      title={`${d.slots.mh}: a manufactured-housing park — the deal page reads the lot rent against the market's, the park-owned homes and the water and sewer`}
    >
      {d.slots.mh}
    </span>
  ) : null;
  // A self-storage facility (#471): a lease-up in the warning tone.
  const storageBit = d.slots.storage ? (
    <span
      className={`whitespace-nowrap font-medium ${/Lease-up/.test(d.slots.storage) ? "text-caution" : "text-brand"}`}
      title={`${d.slots.storage}: a self-storage facility — the deal page reads its two occupancies and the rent sitting tenants pay against the street rate`}
    >
      {d.slots.storage}
    </span>
  ) : null;
  // What the third-party reports found (#465): the most serious finding.
  const reportsBit = d.slots.reports ? (
    <span
      className="whitespace-nowrap font-medium text-caution"
      title={`${d.slots.reports}: from the third-party reports the memorandum cites — the deal page reads them`}
    >
      {d.slots.reports}
    </span>
  ) : null;
  // A tax abatement (#461): the NOI is on an abated bill, how long it has
  // and what the owner pays more once it ends.
  const abatementBit = d.slots.abatement ? (
    <span
      className="whitespace-nowrap font-medium text-caution"
      title={`${d.slots.abatement}: the NOI is on an abated tax bill — the deal page reads when it ends and what it is worth`}
    >
      {d.slots.abatement}
    </span>
  ) : null;
  // How it is sold (#456): an auction's figure is where the bidding opens,
  // and a court's or a lender's sale is as-is.
  const saleBit = d.slots.sale ? (
    <span
      className="whitespace-nowrap font-medium text-caution"
      title={`${d.slots.sale}: the figure is where the bidding opens or the seller is not an owner — the deal page reads the sale`}
    >
      {d.slots.sale}
    </span>
  ) : null;
  // A Special Flood Hazard Area (#426): a federally backed loan requires
  // flood insurance there, which is a cost and a lender's condition — said
  // beside the price, where a list of deals is read.
  const floodBit = d.flood?.tag ? (
    <span
      className="whitespace-nowrap font-medium text-kill"
      title={`${d.flood.tag}: FEMA's Special Flood Hazard Area — a federally backed loan requires flood insurance; the deal page draws the map`}
    >
      {d.flood.tag}
    </span>
  ) : null;
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
    <span title="Yield on total cost — a plan deal has no going-in cap">
      <span className="font-mono tabular-nums">{d.slots.yoc}</span>{" "}
      <span className="text-[9px] font-medium uppercase">yoc</span>
    </span>
  ) : null;
  // The mandate score, when there is one: a call's colour, the words a
  // screen reader gets, and the tooltip — shared by the `lg` column and the
  // bar the narrower widths draw. The words "buy box" live on the Buy box
  // page and the deal header's chip — the row doesn't repeat them.
  const scored = d.score != null && d.mandateVerdict ? { score: d.score, verdict: d.mandateVerdict } : null;
  const fitCls = scored ? (d.fit === "outside" ? "text-kill" : MANDATE_META[scored.verdict].cls) : "";
  const fitWords = scored
    ? d.fit === "outside"
      ? `Fit ${scored.score} · Outside box`
      : `Fit ${scored.score} · ${MANDATE_META[scored.verdict].label}`
    : null;
  const fitTitle = scored
    ? d.fit === "outside"
      ? `${scored.score} / 100 mandate fit, but outside the box on a criterion the score doesn't weigh (e.g. price)`
      : `${scored.score} / 100 · ${MANDATE_META[scored.verdict].label} — mandate fit`
    : null;
  // Without a score there is no bar to draw, so the fit stays a word in the
  // meta line; with one, the bar below carries it and the word goes.
  const fitBit =
    !scored && d.fit ? (
      <span className={`font-medium ${FIT_META[d.fit].cls}`}>
        {FIT_META[d.fit].label} box
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
      <span className="sr-only">{fitWords}</span>
    </span>
  ) : null;
  const dateBit = (
    <span className="font-mono tabular-nums">{fmtDate(d.createdAt)}</span>
  );
  const dueBit = d.offersDue ? <OffersDueBit iso={d.offersDue} /> : null;
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
        className="flex items-center gap-1.5 text-[11px] text-muted"
        title={v ? `Re-screening — the previous call was ${v.label}` : undefined}
      >
        <span className="pulse-bar h-1.5 w-1.5 rounded-full bg-brand" />
        {v ? "Re-screening…" : "Screening…"}
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
    <>
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
          <MetaLine flush className="min-w-0" bits={[priceBit, saleBit, interestBit, debtBit, sellerNoteBit, affordableBit, tenancyBit, rosterBit, valueAddBit, abatementBit, hotelBit, reportsBit, studentBit, mhBit, storageBit, floodBit, capBit, fitBit]} />
        </div>
        <MetaLine
          className="hidden md:block lg:hidden"
          bits={[dueBit, marketBit, coveredBit, assetBit, saleBit, interestBit, debtBit, sellerNoteBit, affordableBit, tenancyBit, rosterBit, valueAddBit, abatementBit, hotelBit, reportsBit, studentBit, mhBit, storageBit, floodBit, fitBit, dateBit, addedByBit]}
        />
        <MetaLine
          className="hidden lg:block xl:hidden"
          bits={[dueBit, marketBit, coveredBit, saleBit, interestBit, debtBit, sellerNoteBit, affordableBit, tenancyBit, rosterBit, valueAddBit, abatementBit, hotelBit, reportsBit, studentBit, mhBit, storageBit, dateBit, addedByBit]}
        />
        <MetaLine
          className="hidden xl:block"
          bits={[dueBit, marketBit, coveredBit, saleBit, interestBit, debtBit, sellerNoteBit, affordableBit, tenancyBit, rosterBit, valueAddBit, abatementBit, hotelBit, reportsBit, studentBit, mhBit, storageBit, addedByBit]}
        />
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
          <span className="text-line">—</span>
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
        {d.slots.price ? compactPrice(d.slots.price) : <span className="text-line">—</span>}
      </span>
      <span className="hidden w-12 shrink-0 text-right font-mono text-sm tabular-nums md:block">
        {d.slots.cap ??
          (d.slots.yoc ? (
            <span title="Yield on total cost — a plan deal has no going-in cap" className="text-brand">
              {d.slots.yoc}
              <span className="ml-0.5 text-[9px] font-sans font-medium uppercase">yoc</span>
            </span>
          ) : (
            <span className="text-line">—</span>
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
          </span>
        ) : d.fit ? (
          <span className={FIT_META[d.fit].cls}>{FIT_META[d.fit].label}</span>
        ) : (
          <span className="font-normal text-line">—</span>
        )}
      </span>
      <span className="hidden w-22 shrink-0 justify-end sm:flex">{status}</span>
      <span className="hidden w-24 shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums text-muted xl:block">
        {fmtDate(d.createdAt)}
      </span>
    </>
  );

  return (
    <li
      style={{ "--i": i } as React.CSSProperties}
      // The asset-class rail: a 3px line in the class's hue down the left
      // edge, so a mixed section reads as its kinds without a legend.
      className={`border-l-[3px] ${d.assetClass ? asset.rail : "border-l-transparent"} ${
        isDead ? "opacity-60" : ""
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
        {v ? "Re-screening…" : "Screening…"}
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
}: {
  d: DealCard;
  i: number;
  compareMode: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
}) {
  // The deal's photographs, flipped through on the card (#450): which one is
  // on screen, and whether the deal's own photograph is the picture at all
  // (a card whose photograph failed shows its market's or its cover, and
  // offers nothing to flip through).
  // A photograph that fails to load is dropped from the set, so the arrows,
  // the dots and the count never point at a picture the card cannot show.
  const [dead, setDead] = useState<ReadonlySet<string>>(new Set());
  const slides = useMemo(() => (d.slides ?? []).filter((s) => !dead.has(s.src)), [d.slides, dead]);
  const [slideAsked, setSlide] = useState(0);
  const [photoOn, setPhotoOn] = useState(d.pictures?.[0]?.kind === "photo" && !d.pictures[0].pending);
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
    if (next) new Image().src = next.src;
  }, [canFlip, warm, slide, slides]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const isDead = normalizeStage(d.stage) === "dead";
  const asset = assetMeta(d.assetClass ?? "");
  const place = d.coveredMarket ?? d.readMarket ?? d.market;
  const scored = d.score != null && d.mandateVerdict ? { score: d.score, verdict: d.mandateVerdict } : null;
  const fitCls = scored ? (d.fit === "outside" ? "text-kill" : MANDATE_META[scored.verdict].cls) : "";
  // What the picture must not hide: a Special Flood Hazard Area, what the
  // price buys where it is not the building, the seller's loan, a covenant
  // on the rents, the one lease a single-tenant building is.
  const tags = [
    d.flood?.tag ? { text: d.flood.tag, cls: "text-kill", title: `${d.flood.tag}: FEMA's Special Flood Hazard Area — a federally backed loan requires flood insurance` } : null,
    d.slots.interest ? { text: d.slots.interest, cls: "text-brand", title: `${d.slots.interest}: the price does not buy the building outright` } : null,
    d.slots.debt ? { text: d.slots.debt, cls: "text-brand", title: `${d.slots.debt}: the seller's loan is offered for assumption` } : null,
    d.slots.affordable ? { text: d.slots.affordable, cls: "text-brand", title: `${d.slots.affordable}: a covenant or a contract sets these rents` } : null,
    d.slots.tenancy ? { text: d.slots.tenancy, cls: "text-brand", title: `${d.slots.tenancy}: one lease is the whole income` } : null,
    d.slots.roster ? { text: d.slots.roster, cls: "text-caution", title: `${d.slots.roster}: the listed tenants against the model's sale` } : null,
    d.slots.valueAdd ? { text: d.slots.valueAdd, cls: "text-brand", title: `${d.slots.valueAdd}: the renovation program as stated` } : null,
    d.slots.abatement ? { text: d.slots.abatement, cls: "text-caution", title: `${d.slots.abatement}: the NOI is on an abated tax bill` } : null,
    d.slots.sellerNote ? { text: d.slots.sellerNote, cls: "text-brand", title: `${d.slots.sellerNote}: the seller offers to carry financing` } : null,
    d.slots.hotel ? { text: d.slots.hotel, cls: "text-brand", title: `${d.slots.hotel}: what the hotel is sold with` } : null,
    d.slots.sale ? { text: d.slots.sale, cls: "text-caution", title: `${d.slots.sale}: the figure is where the bidding opens or the seller is not an owner` } : null,
    d.slots.reports ? { text: d.slots.reports, cls: "text-caution", title: `${d.slots.reports}: from the third-party reports the memorandum cites` } : null,
    d.slots.student
      ? { text: d.slots.student, cls: /−|Drive-to/.test(d.slots.student) ? "text-caution" : "text-brand", title: `${d.slots.student}: a student building's leasing for the coming year` }
      : null,
    d.slots.mh ? { text: d.slots.mh, cls: /Private/.test(d.slots.mh) ? "text-caution" : "text-brand", title: `${d.slots.mh}: a manufactured-housing park's lot rent and utilities` } : null,
    d.slots.storage
      ? { text: d.slots.storage, cls: /Lease-up/.test(d.slots.storage) ? "text-caution" : "text-brand", title: `${d.slots.storage}: a self-storage facility's occupancy and rates` }
      : null,
  ].filter((t): t is { text: string; cls: string; title: string } => t !== null);

  const inner = (
    <>
      <div className="relative">
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
          sizes="(min-width: 1536px) 24vw, (min-width: 1280px) 31vw, (min-width: 640px) 47vw, 100vw"
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
        {tags.length > 0 && (
          // Each tag truncates inside the column's 58%, never past it: a
          // flex item sized to its content ran leftward over the call.
          <span className="absolute right-3 top-3 flex max-w-[58%] flex-col items-end gap-1">
            {tags.map((t) => (
              <span
                key={t.text}
                title={t.title}
                className={`max-w-full truncate rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold shadow-sm ${t.cls}`}
              >
                {t.text}
              </span>
            ))}
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col px-4 pb-3.5 pt-3">
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
        {/* Pushes the figures to the card's foot, so a row of cards lines
            its figures up whatever the names' lengths. */}
        <span aria-hidden className="min-h-3 flex-1" />
        {/* The price is the longest figure ("$9–9.5M", "$124.5M"), so its
            column is the widest. */}
        <dl className="grid grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)] gap-3 border-t border-line pt-3">
          <TileStat label="Price" title={d.slots.price ?? undefined} sub={d.slots.basis}>
            {d.slots.price ? compactPrice(d.slots.price) : <span className="text-line">—</span>}
          </TileStat>
          {/* A plan deal has no going-in cap; its yield on total cost takes
              the slot, labelled. */}
          <TileStat label={!d.slots.cap && d.slots.yoc ? "Yield on cost" : "Cap"}>
            {d.slots.cap ?? d.slots.yoc ?? <span className="text-line">—</span>}
          </TileStat>
          <div className="min-w-0">
            <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">Fit</dt>
            <dd className="mt-0.5 text-sm font-semibold">
              {scored ? (
                <span className={`flex items-center gap-1.5 tabular-nums ${fitCls}`} title={`${scored.score} / 100 mandate fit`}>
                  {scored.score}
                  <FitBar score={scored.score} />
                </span>
              ) : d.fit ? (
                <span className={FIT_META[d.fit].cls}>{FIT_META[d.fit].label}</span>
              ) : (
                <span className="font-normal text-line">—</span>
              )}
            </dd>
          </div>
        </dl>
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
      className={`group relative flex flex-col overflow-hidden rounded-2xl border bg-surface shadow-card transition duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
        checked ? "border-brand ring-2 ring-brand/40" : "border-line"
      } ${isDead ? "opacity-60" : ""}`}
    >
      {compareMode ? (
        <button type="button" onClick={() => onToggle(d.id)} aria-pressed={checked} className="flex flex-1 flex-col text-left">
          {inner}
        </button>
      ) : (
        <>
          <Link href={`/deals/${d.id}`} className="flex flex-1 flex-col">
            {inner}
          </Link>
          {/* The deal's other photographs (#450), flipped through where a
              listing's card lets you: arrows on the picture, shown on hover
              or focus and always on a touch screen, a swipe, and a dot a
              photograph. Outside the link, over the picture: a button inside
              an anchor is invalid, and the card's click still opens the deal. */}
          {canFlip ? (
            <div data-flip="photos" className="pointer-events-none absolute inset-x-0 top-0 flex aspect-[16/10] items-center justify-between px-2">
              {[-1, 1].map((step) => (
                <button
                  key={step}
                  type="button"
                  onClick={() => go(step)}
                  aria-label={`${step < 0 ? "Previous" : "Next"} photo of ${d.name}`}
                  data-flip-step={step}
                  className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink shadow-md opacity-0 transition hover:bg-white focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand group-hover:opacity-100 pointer-coarse:opacity-90"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
                    <path d={step < 0 ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
                  </svg>
                </button>
              ))}
              <span aria-hidden className="absolute bottom-7 left-1/2 flex -translate-x-1/2 gap-1">
                {Array.from({ length: Math.min(count, 5) }, (_, k) => {
                  const first = Math.min(Math.max(0, slide - 2), Math.max(0, count - 5));
                  return (
                    <span
                      key={first + k}
                      className={`h-1.5 w-1.5 rounded-full shadow-sm ${first + k === slide ? "bg-white" : "bg-white/55"}`}
                    />
                  );
                })}
              </span>
            </div>
          ) : null}
          {/* Outside the link: a select inside an anchor is invalid, and the
              stage is changed here without leaving the pipeline. */}
          <div className="flex items-center gap-2 border-t border-line bg-faint/60 px-4 py-2 text-[11px] text-muted">
            {d.offersDue ? (
              <OffersDueBit iso={d.offersDue} />
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

  const steps: {
    key: string;
    label: string;
    done: boolean;
    action: ReactNode;
  }[] = [
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
      key: "screen",
      label: "Screen your first OM",
      done: state.hasRealDeal,
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
                  ? "bg-pass/15 text-pass"
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
}

const DRAFT_KEY = "uc:new-deal-draft";

function readDraft(): DealDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as DealDraft;
    return d && typeof d === "object" ? d : null;
  } catch {
    return null;
  }
}

function writeDraft(d: DealDraft | null) {
  try {
    if (!d || (!d.name.trim() && !d.address)) {
      window.localStorage.removeItem(DRAFT_KEY);
    } else {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    }
  } catch {
    // Private mode / quota — drafts are a convenience, never a blocker.
  }
}

function NewDealForm({
  errorMessage,
  prefill,
}: {
  errorMessage: string | null;
  prefill?: StructuredAddress | null;
}) {
  // Two ways in: upload the OM, or type the facts (no document needed —
  // small-multifamily listings rarely come with one). An upload error code
  // in the URL means the last submit was an upload — open on that mode.
  // A Pull Comps hand-off arrives with the address picked: open on manual.
  const [mode, setMode] = useState<"upload" | "manual">(prefill ? "manual" : "upload");
  const [name, setName] = useState("");
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
      const d = readDraft();
      if (!d) return;
      if (d.submittedAt && !errorMessage) {
        // Last submit came back without an error — the deal was created and
        // this draft is spent.
        writeDraft(null);
        return;
      }
      if (d.name) setName(d.name);
      if (d.assetClass) setAssetClass(d.assetClass);
      if (d.address) {
        addressRef.current = d.address;
        setRestoredAddress(d.address);
        setAddrKey((k) => k + 1);
      }
      if (d.name || d.address) setRestored(true);
      if (d.submittedAt) writeDraft({ ...d, submittedAt: null });
    });
    return () => cancelAnimationFrame(raf);
    // errorMessage is fixed for the lifetime of this render of the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function persist(next: Partial<DealDraft>) {
    writeDraft({
      name,
      assetClass,
      address: addressRef.current,
      submittedAt: null,
      ...next,
    });
  }

  function clearDraft() {
    writeDraft(null);
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
        <div
          role="tablist"
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
              role="tab"
              aria-selected={mode === key}
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
      {errorMessage && (
        <p className="mt-3 rounded-lg bg-kill/10 px-3 py-2 text-sm text-kill">
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
      <form
        action={createDeal}
        onSubmit={() =>
          writeDraft({
            name,
            assetClass,
            address: addressRef.current,
            submittedAt: Date.now(),
          })
        }
        className="mt-4 space-y-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            name="name"
            required
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              persist({ name: e.target.value });
            }}
            aria-label="Deal name"
            placeholder="Deal name — e.g. The Maddox at Brewerytown"
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
          />
          <select
            name="assetClass"
            value={assetClass}
            onChange={(e) => {
              setAssetClass(e.target.value);
              persist({ assetClass: e.target.value });
            }}
            aria-label="Asset class"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <option value="auto">Auto-detect</option>
            {ASSET_CLASS_OPTIONS.map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>
        <div>
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
