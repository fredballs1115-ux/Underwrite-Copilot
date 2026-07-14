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
import { ManualDealForm } from "./manual-deal-form";
import { FileDrop } from "../file-drop";
import { PendingButton } from "../pending-button";
import { AddressAutocomplete } from "../address-autocomplete";
import type { StructuredAddress } from "@/lib/address";
import { StageSelect } from "./[id]/stage-select";
import { OffersDueBit } from "./offers-due";
import { parseMoney, parsePct } from "@/lib/criteria";
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
  /** the broker's call-for-offers date (ISO yyyy-mm-dd), if set */
  offersDue: string | null;
  /** table figures — null renders as an em-dash placeholder */
  slots: { cap: string | null; price: string | null };
  /** latest analysis-job state, for deals still screening */
  jobStatus?: "running" | "failed" | null;
};

/** One row per deal: name · asset · price · cap · buy box · status · added.
 *  Every column is sortable from its header. */
type SortKey = "name" | "asset" | "price" | "cap" | "fit" | "status" | "added";

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
      return d.slots.price ? (parseMoney(d.slots.price) ?? -1) : -1;
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

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
  onboarding,
  billing,
}: {
  deals: DealCard[];
  errorMessage: string | null;
  notice?: string | null;
  /** open the new-deal form (?new=<nonce> — the ⌘K "New deal…" action). A
   *  fresh nonce per invocation re-triggers the effect even when the form
   *  was closed and the param is still in the URL. */
  openNew?: string;
  onboarding?: OnboardingState;
  billing: BillingInfo | null;
}) {
  const [query, setQuery] = useState("");
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

  // While any deal is mid-screen, refresh the list every few seconds so the
  // verdict lands without a manual reload.
  const router = useRouter();
  const anyRunning = deals.some((d) => !d.verdict && d.jobStatus === "running");
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
      if (q && !`${d.name} ${d.market}`.toLowerCase().includes(q)) return false;
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
    const c = { pass: 0, caution: 0, pass_on: 0, screening: 0, pursuing: 0 };
    for (const d of deals) {
      if (d.verdict && d.verdict in c) c[d.verdict as keyof typeof c]++;
      else if (!d.verdict) c.screening++;
      if (normalizeStage(d.stage) === "active_pursuit") c.pursuing++;
    }
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
  // Empty stage sections render (collapsed) on the clean view, but hide while
  // filters narrow the list — a run of "(0)" headers under a filter is noise.
  const hideEmptySections = filtersActive;

  // Export the current (filtered) view as a CSV — opens in Excel/Sheets.
  function exportCsv() {
    // Neutralize formula-leading cells (=, +, -, @) — deal names and OM-derived
    // text are untrusted and must never execute when the CSV opens in Excel.
    const esc = (v: string) => {
      const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const header = ["Deal", "Asset class", "Market", "Price", "Cap rate", "Buy box", "Mandate score", "Mandate fit", "Status", "Stage", "Offers due", "Added", "Added by"];
    const lines = filtered.map((d) =>
      [
        d.name,
        d.assetClass,
        d.market,
        d.slots.price ?? "",
        d.slots.cap ?? "",
        d.fit ? FIT_META[d.fit].label : "",
        d.score != null ? String(d.score) : "",
        d.mandateVerdict ? MANDATE_META[d.mandateVerdict].label : "",
        d.verdict
          ? (VERDICT_META[d.verdict]?.label ?? d.verdict)
          : d.jobStatus === "running"
            ? "Screening"
            : d.jobStatus === "failed"
              ? "Failed"
              : "Not screened",
        STAGE_LABEL[normalizeStage(d.stage)],
        d.offersDue ?? "",
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
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pipeline</h1>
          <p className="mt-1 text-sm text-muted">
            {deals.length} {deals.length === 1 ? "deal" : "deals"} in your pipeline
            {showUsage && (
              <>
                {" · "}
                <Link
                  href="/billing"
                  className={`font-medium underline-offset-2 hover:underline ${
                    atLimit ? "text-caution" : ""
                  }`}
                >
                  {Math.max(0, billing!.dealLimit - billing!.dealCount)} free{" "}
                  {billing!.dealLimit - billing!.dealCount === 1
                    ? "deal"
                    : "deals"}{" "}
                  left
                </Link>
              </>
            )}
          </p>
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

      {/* The one number a pipeline exists to answer: how do the calls split?
          Each chip is also a one-tap filter. */}
      {deals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["pass", verdictCounts.pass],
              ["caution", verdictCounts.caution],
              ["pass_on", verdictCounts.pass_on],
            ] as const
          )
            .filter(([, n]) => n > 0)
            .map(([key, n]) => {
              const meta = VERDICT_META[key];
              const on = verdict === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setVerdict(on ? "all" : key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-all ${meta.cls} ${
                    on ? "ring-2 ring-current" : "hover:opacity-80"
                  }`}
                >
                  {n} {meta.label}
                </button>
              );
            })}
          {verdictCounts.screening > 0 && (
            <button
              type="button"
              aria-pressed={verdict === "screening"}
              onClick={() =>
                setVerdict(verdict === "screening" ? "all" : "screening")
              }
              className={`rounded-full bg-faint px-3 py-1 text-xs font-semibold text-muted transition-all ${
                verdict === "screening" ? "ring-2 ring-current" : "hover:opacity-80"
              }`}
            >
              {verdictCounts.screening} No verdict
            </button>
          )}
          {/* The funnel's business end — deals you're actively chasing. */}
          {verdictCounts.pursuing > 0 && (
            <button
              type="button"
              aria-pressed={stage === "active_pursuit"}
              onClick={() =>
                setStage(stage === "active_pursuit" ? "all" : "active_pursuit")
              }
              className={`rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand transition-all ${
                stage === "active_pursuit"
                  ? "ring-2 ring-current"
                  : "hover:opacity-80"
              }`}
            >
              {verdictCounts.pursuing} In pursuit
            </button>
          )}
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

      {showForm && !atLimit && <NewDealForm errorMessage={errorMessage} />}
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
          <FilterSelect
            value={verdict}
            onChange={setVerdict}
            options={[
              ["all", "All verdicts"],
              ["pass", "Go"],
              ["caution", "Caution"],
              ["pass_on", "No-go"],
              ["screening", "No verdict yet"],
            ]}
          />
          <FilterSelect
            value={stage}
            onChange={setStage}
            options={[
              ["all", "All stages"],
              ...STAGES.map((s) => [s, STAGE_LABEL[s]] as [string, string]),
            ]}
          />
          {assets.length > 1 && (
            <FilterSelect
              value={asset}
              onChange={setAsset}
              options={[
                ["all", "All assets"],
                ...assets.map((a) => [a, cap(a)] as [string, string]),
              ]}
            />
          )}
          {markets.length > 1 && (
            <FilterSelect
              value={market}
              onChange={setMarket}
              options={[
                ["all", "All markets"],
                ...markets.map((m) => [m, m] as [string, string]),
              ]}
            />
          )}
          {hasScores && (
            <FilterSelect
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
          {/* Below md the column headers are hidden, so sorting lives here. */}
          <FilterSelect
            value={`${sortKey}:${sortDir}`}
            onChange={(v) => {
              const [k, dir] = v.split(":") as [SortKey, "asc" | "desc"];
              setSortKey(k);
              setSortDir(dir);
            }}
            className="ml-auto md:hidden"
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
          <button
            type="button"
            onClick={exportCsv}
            disabled={filtered.length === 0}
            title={
              filtered.length === 0
                ? "Nothing to export — clear the filters first"
                : "Download the current view as a CSV"
            }
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-faint disabled:cursor-not-allowed disabled:opacity-50 md:ml-auto"
          >
            Export CSV
          </button>
          <a
            href="/api/pipeline/export"
            title="The whole pipeline as a formatted Excel workbook — stage-grouped with verdict and buy-box markers, plus a summary sheet. Built for pipeline meetings."
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-faint"
          >
            Meeting workbook
          </a>
        </div>
      )}

      {deals.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-card">
          <EmptyArt />
          <p className="mt-5 text-base font-semibold tracking-tight">
            Start your pipeline
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Upload an offering memorandum — or just type the deal’s facts — to
            screen your first deal. Or explore a fully-worked sample to see the
            whole thing first.
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
          <div>
            {/* One header row labels the columns for every group — each label
                is a sort control (sorting applies within each stage group).
                Widths/gaps mirror DealRow exactly; narrower columns join at
                lg, the Added column at xl (the Stage select takes its slot). */}
            <div className="hidden items-center gap-3 px-5 pb-1.5 md:flex">
              {compareMode && <span className="w-5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <SortHead label="Deal" k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              </div>
              <SortHead label="Asset" k="asset" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="hidden w-20 lg:flex" />
              <SortHead label="Price" k="price" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="w-20" right />
              <SortHead label="Cap" k="cap" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="w-12" right />
              <SortHead label="Buy box" k="fit" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="hidden w-16 lg:flex" right />
              <SortHead label="Status" k="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="w-22" right />
              <SortHead label="Added" k="added" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} cls="hidden w-24 xl:flex" right />
              {!compareMode && (
                <span className="hidden w-36 shrink-0 text-right text-[10px] font-medium uppercase tracking-wide text-muted lg:block">
                  Stage
                </span>
              )}
              {!compareMode && <span className="h-4 w-4 shrink-0 lg:hidden" />}
            </div>

            <div className="space-y-4">
              {STAGES.map((s) => {
                const sectionDeals = groups.get(s) ?? [];
                // Dead lives behind its toggle; empty sections hide while
                // filters narrow, otherwise render collapsed.
                if (s === "dead" && !showDead && stage !== "dead") return null;
                if (sectionDeals.length === 0 && hideEmptySections) return null;
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
                    {open && (
                      <ul className="stagger mt-1.5 divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
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
        </>
      )}
    </div>
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
}: {
  className?: string;
  bits: ReactNode[];
}) {
  const shown = bits.filter(Boolean);
  if (shown.length === 0) return null;
  return (
    <p className={`mt-0.5 truncate text-xs text-muted ${className ?? ""}`}>
      {shown.map((b, idx) => (
        <Fragment key={idx}>
          {idx > 0 && " · "}
          {b}
        </Fragment>
      ))}
    </p>
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
  const assetBit = d.assetClass ? (
    <span className="capitalize">{d.assetClass}</span>
  ) : null;
  const priceBit = d.slots.price ? (
    <span className="font-mono tabular-nums">{d.slots.price}</span>
  ) : null;
  const capBit = d.slots.cap ? (
    <>
      <span className="font-mono tabular-nums">{d.slots.cap}</span> cap
    </>
  ) : null;
  const fitBit =
    d.score != null && d.mandateVerdict ? (
      d.fit === "outside" ? (
        <span className="font-medium text-kill">Buy box {d.score} · Outside box</span>
      ) : (
        <span className={`font-medium ${MANDATE_META[d.mandateVerdict].cls}`}>
          Buy box {d.score} · {MANDATE_META[d.mandateVerdict].label}
        </span>
      )
    ) : d.fit ? (
      <span className={`font-medium ${FIT_META[d.fit].cls}`}>
        {FIT_META[d.fit].label} buy box
      </span>
    ) : null;
  const dateBit = (
    <span className="font-mono tabular-nums">{fmtDate(d.createdAt)}</span>
  );
  const dueBit = d.offersDue ? <OffersDueBit iso={d.offersDue} /> : null;
  const addedByBit = d.addedBy ? `added by ${d.addedBy}` : null;

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
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{d.name}</p>
        <MetaLine
          className="md:hidden"
          bits={[dueBit, marketBit, assetBit, priceBit, capBit, fitBit, dateBit, addedByBit]}
        />
        <MetaLine
          className="hidden md:block lg:hidden"
          bits={[dueBit, marketBit, assetBit, fitBit, dateBit, addedByBit]}
        />
        <MetaLine
          className="hidden lg:block xl:hidden"
          bits={[dueBit, marketBit, dateBit, addedByBit]}
        />
        <MetaLine
          className="hidden xl:block"
          bits={[dueBit, marketBit, addedByBit]}
        />
      </div>
      {/* Column cells — widths, order, and gaps mirror the header row. */}
      <span className="hidden w-20 shrink-0 truncate text-sm capitalize text-muted lg:block">
        {d.assetClass || <span className="text-line">—</span>}
      </span>
      <span className="hidden w-20 shrink-0 truncate text-right font-mono text-sm tabular-nums md:block">
        {d.slots.price ?? <span className="text-line">—</span>}
      </span>
      <span className="hidden w-12 shrink-0 text-right font-mono text-sm tabular-nums md:block">
        {d.slots.cap ?? <span className="text-line">—</span>}
      </span>
      <span className="hidden w-16 shrink-0 text-right text-xs font-semibold lg:block">
        {d.score != null && d.mandateVerdict ? (
          <span
            className={`tabular-nums ${d.fit === "outside" ? "text-kill" : MANDATE_META[d.mandateVerdict].cls}`}
            title={
              d.fit === "outside"
                ? `${d.score} / 100 mandate fit, but outside the box on a criterion the score doesn't weigh (e.g. price)`
                : `${d.score} / 100 · ${MANDATE_META[d.mandateVerdict].label} — mandate fit`
            }
          >
            {d.score}
          </span>
        ) : d.fit ? (
          <span className={FIT_META[d.fit].cls}>{FIT_META[d.fit].label}</span>
        ) : (
          <span className="font-normal text-line">—</span>
        )}
      </span>
      <span className="flex w-22 shrink-0 justify-end">
        {v ? (
          <span
            className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${v.cls}`}
          >
            {v.label}
          </span>
        ) : d.jobStatus === "failed" ? (
          <span className="rounded-full bg-kill/10 px-2.5 py-1 text-center text-[11px] font-medium leading-tight text-kill">
            Failed
          </span>
        ) : d.jobStatus === "running" ? (
          <span className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="pulse-bar h-1.5 w-1.5 rounded-full bg-brand" />
            Screening…
          </span>
        ) : (
          <span className="text-[11px] text-muted">Not screened</span>
        )}
      </span>
      <span className="hidden w-24 shrink-0 whitespace-nowrap text-right font-mono text-xs tabular-nums text-muted xl:block">
        {fmtDate(d.createdAt)}
      </span>
    </>
  );

  return (
    <li
      style={{ "--i": i } as React.CSSProperties}
      className={isDead ? "opacity-60" : undefined}
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
      label: "Set your buy box — every screen gets judged against it",
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
      label: "Explore the sample deal — every tab, no upload needed",
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
      label: "Screen your first OM — verdict in a few minutes",
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
          <h2 className="text-sm font-semibold tracking-tight">
            Get set up ({steps.length - remaining.length}/{steps.length})
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            Three steps and the copilot is working the way it should.
          </p>
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
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
  className?: string;
}) {
  return (
    <select
      value={value}
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

function NewDealForm({ errorMessage }: { errorMessage: string | null }) {
  // Two ways in: upload the OM, or type the facts (no document needed —
  // small-multifamily listings rarely come with one). An upload error code
  // in the URL means the last submit was an upload — open on that mode.
  const [mode, setMode] = useState<"upload" | "manual">("upload");
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
      <p className="mt-1 text-sm text-muted">
        {mode === "upload"
          ? "Upload the offering memorandum (PDF). We’ll extract the key terms and flag what to verify against the source."
          : "No OM? Type what you know — from the listing, a broker call, your notes. The screen runs on your numbers, and you can attach the OM later."}
      </p>
      {mode === "manual" && (
        <div className="mt-4">
          <ManualDealForm mode="create" />
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
            placeholder="Deal name — e.g. The Maddox at Highland Park"
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
            <option value="multifamily">Multifamily</option>
            <option value="office">Office</option>
            <option value="industrial">Industrial</option>
            <option value="retail">Retail</option>
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
          <p className="mt-1 text-xs text-muted">
            Picking a suggestion fills street, city, state, ZIP, and county —
            and your buy-box location check applies from the moment you upload.
          </p>
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
