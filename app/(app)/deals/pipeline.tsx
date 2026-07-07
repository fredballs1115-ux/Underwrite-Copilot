"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDeal, createSampleDeal } from "./actions";
import { FileDrop } from "../file-drop";
import { PendingButton } from "../pending-button";

export type Stage = "screening" | "reviewing" | "pursuing" | "dead";

export type DealCard = {
  id: string;
  name: string;
  assetClass: string;
  createdAt: string;
  verdict: string | null; // "pass" | "caution" | "pass_on" | null
  /** the user's own tracker, independent of the verdict */
  stage: Stage;
  /** teammate who added this team deal (null when it's yours) */
  addedBy: string | null;
  /** deterministic buy-box check found at least one hard miss */
  outsideBuyBox?: boolean;
  market: string;
  stats: { label: string; value: string }[];
  /** latest analysis-job state, for deals still screening */
  jobStatus?: "running" | "failed" | null;
};

export const STAGE_LABEL: Record<Stage, string> = {
  screening: "Screening",
  reviewing: "Reviewing",
  pursuing: "Pursuing",
  dead: "Dead",
};

const VERDICT_META: Record<
  string,
  { label: string; cls: string; rank: number }
> = {
  pass_on: { label: "No-go", cls: "bg-kill/15 text-kill", rank: 0 },
  caution: { label: "Caution", cls: "bg-caution/15 text-caution", rank: 1 },
  pass: { label: "Go", cls: "bg-pass/15 text-pass", rank: 2 },
};

function fmtDate(iso: string): string {
  // Pin to UTC so the server and client render the same string (no hydration
  // mismatch from differing timezones).
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

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
  const [sort, setSort] = useState("newest");
  const searchRef = useRef<HTMLInputElement>(null);
  const [showForm, setShowForm] = useState(!!errorMessage || !!openNew);

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
  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else if (next.size < COMPARE_MAX) next.add(id);
      return next;
    });
  }

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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = deals.filter((d) => {
      if (q && !`${d.name} ${d.market}`.toLowerCase().includes(q)) return false;
      if (verdict !== "all") {
        if (verdict === "screening") {
          if (d.verdict) return false;
        } else if (d.verdict !== verdict) return false;
      }
      if (stage !== "all" && d.stage !== stage) return false;
      if (asset !== "all" && d.assetClass !== asset) return false;
      if (market !== "all" && d.market !== market) return false;
      return true;
    });
    return list.sort((a, b) => {
      if (sort === "oldest") return a.createdAt.localeCompare(b.createdAt);
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "verdict") {
        const ra = a.verdict ? (VERDICT_META[a.verdict]?.rank ?? 3) : 4;
        const rb = b.verdict ? (VERDICT_META[b.verdict]?.rank ?? 3) : 4;
        return ra - rb;
      }
      return b.createdAt.localeCompare(a.createdAt); // newest
    });
  }, [deals, query, verdict, stage, asset, market, sort]);

  const verdictCounts = useMemo(() => {
    const c = { pass: 0, caution: 0, pass_on: 0, screening: 0, pursuing: 0 };
    for (const d of deals) {
      if (d.verdict && d.verdict in c) c[d.verdict as keyof typeof c]++;
      else if (!d.verdict) c.screening++;
      if (d.stage === "pursuing") c.pursuing++;
    }
    return c;
  }, [deals]);

  function clearFilters() {
    setQuery("");
    setVerdict("all");
    setStage("all");
    setAsset("all");
    setMarket("all");
  }
  const filtersActive =
    query.trim() !== "" ||
    verdict !== "all" ||
    stage !== "all" ||
    asset !== "all" ||
    market !== "all";

  // Export the current (filtered) view as a CSV — opens in Excel/Sheets.
  function exportCsv() {
    // Neutralize formula-leading cells (=, +, -, @) — deal names and OM-derived
    // text are untrusted and must never execute when the CSV opens in Excel.
    const esc = (v: string) => {
      const safe = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
      return `"${safe.replaceAll('"', '""')}"`;
    };
    const header = ["Deal", "Market", "Asset class", "Added", "Verdict", "Stage", "Buy box", "Added by", "Key stats"];
    const lines = filtered.map((d) =>
      [
        d.name,
        d.market,
        d.assetClass,
        fmtDate(d.createdAt),
        d.verdict ? (VERDICT_META[d.verdict]?.label ?? d.verdict) : d.jobStatus === "running" ? "Screening" : "Not screened",
        STAGE_LABEL[d.stage],
        d.outsideBuyBox ? "Outside" : "",
        d.addedBy ?? "You",
        d.stats.map((s) => `${s.label}: ${s.value}`).join(" · "),
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
            {deals.length} {deals.length === 1 ? "deal" : "deals"} screened
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
          {/* The funnel's business end — deals you're actually chasing. */}
          {verdictCounts.pursuing > 0 && (
            <button
              type="button"
              aria-pressed={stage === "pursuing"}
              onClick={() => setStage(stage === "pursuing" ? "all" : "pursuing")}
              className={`rounded-full bg-brand/10 px-3 py-1 text-xs font-semibold text-brand transition-all ${
                stage === "pursuing" ? "ring-2 ring-current" : "hover:opacity-80"
              }`}
            >
              {verdictCounts.pursuing} Pursuing
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
              ["screening", "Screening"],
              ["reviewing", "Reviewing"],
              ["pursuing", "Pursuing"],
              ["dead", "Dead"],
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
          <FilterSelect
            value={sort}
            onChange={setSort}
            className="ml-auto"
            options={[
              ["newest", "Newest"],
              ["oldest", "Oldest"],
              ["verdict", "By verdict"],
              ["name", "Name A–Z"],
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
            className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium shadow-sm transition-colors hover:bg-faint disabled:cursor-not-allowed disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>
      )}

      {deals.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-10 text-center shadow-card">
          <EmptyArt />
          <p className="mt-5 text-base font-semibold tracking-tight">
            Start your pipeline
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Upload an offering memorandum to screen your first deal — or explore
            a fully-worked sample to see the whole thing first.
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
        <p className="text-sm text-muted">
          No deals match these filters.{" "}
          <button
            type="button"
            onClick={clearFilters}
            className="font-medium text-brand hover:text-brand-strong"
          >
            Clear filters
          </button>
        </p>
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
          <ul className="stagger divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
            {filtered.map((d, idx) => (
              <DealRow
                key={d.id}
                d={d}
                i={idx}
                compareMode={compareMode}
                checked={selected.has(d.id)}
                onToggle={() => toggleSelected(d.id)}
              />
            ))}
          </ul>
        </>
      )}
    </div>
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
      <rect x="68" y="32" width="54" height="4" rx="2" fill="#f0efe9" />
      <rect x="68" y="40" width="46" height="4" rx="2" fill="#f0efe9" />
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

function DealRow({
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
  onToggle: () => void;
}) {
  const v = d.verdict ? VERDICT_META[d.verdict] : null;

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
        <p className="mt-0.5 truncate text-xs text-muted">
          {d.market && <>{d.market} · </>}
          <span className="capitalize">{d.assetClass}</span>
          {" · "}
          <span className="font-mono tabular-nums">{fmtDate(d.createdAt)}</span>
          {d.stage !== "screening" && (
            <>
              {" · "}
              <span
                className={
                  d.stage === "dead"
                    ? "text-muted"
                    : "font-medium text-brand"
                }
              >
                {STAGE_LABEL[d.stage]}
              </span>
            </>
          )}
          {d.addedBy && <> · added by {d.addedBy}</>}
          {d.outsideBuyBox && (
            <>
              {" · "}
              <span className="font-medium text-kill">outside buy box</span>
            </>
          )}
        </p>
      </div>
      {/* Fixed three-slot grid, right-anchored, so numbers align into
          scannable columns across rows even when a deal is missing a stat. */}
      <div className="hidden w-[19rem] shrink-0 grid-cols-3 gap-3 md:grid">
        {Array.from({ length: 3 }).map((_, idx) => {
          const s = d.stats[idx];
          return (
            <div key={idx} className="text-right">
              {s ? (
                <>
                  <p className="truncate text-[10px] uppercase tracking-wide text-muted">
                    {s.label}
                  </p>
                  <p className="font-mono text-sm tabular-nums">{s.value}</p>
                </>
              ) : d.stats.length > 0 ? (
                <p className="font-mono text-sm text-line">—</p>
              ) : null}
            </div>
          );
        })}
      </div>
      <span className="flex w-24 shrink-0 justify-end">
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
      {!compareMode && (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 text-line transition-colors group-hover:text-muted"
          aria-hidden
        >
          <path d="m9 18 6-6-6-6" />
        </svg>
      )}
    </>
  );

  return (
    <li style={{ "--i": i } as React.CSSProperties}>
      {compareMode ? (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={checked}
          className={`group flex w-full items-center gap-4 px-5 py-4 text-left transition-colors ${
            checked ? "bg-brand/5" : "hover:bg-faint"
          }`}
        >
          {inner}
        </button>
      ) : (
        <Link
          href={`/deals/${d.id}`}
          className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-faint"
        >
          {inner}
        </Link>
      )}
    </li>
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
      action: state.sampleId ? (
        <Link
          href={`/deals/${state.sampleId}`}
          className="text-xs font-medium text-brand hover:text-brand-strong"
        >
          Open it →
        </Link>
      ) : (
        <form action={createSampleDeal}>
          <PendingButton
            pendingLabel="Adding…"
            className="text-xs font-medium text-brand hover:text-brand-strong"
          >
            Add it →
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

function NewDealForm({ errorMessage }: { errorMessage: string | null }) {
  return (
    <section className="rounded-xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold tracking-tight">New deal</h2>
      <p className="mt-1 text-sm text-muted">
        Upload the offering memorandum (PDF). We’ll extract the key terms and
        flag what to verify against the source.
      </p>
      {errorMessage && (
        <p className="mt-3 rounded-lg bg-kill/10 px-3 py-2 text-sm text-kill">
          {errorMessage}
        </p>
      )}
      <form action={createDeal} className="mt-4 space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            name="name"
            required
            placeholder="Deal name — e.g. The Maddox at Highland Park"
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
          />
          <select
            name="assetClass"
            defaultValue="auto"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <option value="auto">Auto-detect</option>
            <option value="multifamily">Multifamily</option>
            <option value="office">Office</option>
            <option value="industrial">Industrial</option>
            <option value="retail">Retail</option>
          </select>
        </div>
        <FileDrop
          name="om"
          accept="application/pdf"
          hint="PDF offering memorandum, up to 22 MB"
          maxBytes={22 * 1024 * 1024}
        />
        <PendingButton
          pendingLabel="Uploading your OM — hang tight…"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          Create &amp; analyze
        </PendingButton>
      </form>
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
