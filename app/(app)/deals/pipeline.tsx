"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createDeal, createSampleDeal } from "./actions";
import { FileDrop } from "../file-drop";

export type DealCard = {
  id: string;
  name: string;
  assetClass: string;
  createdAt: string;
  verdict: string | null; // "pass" | "caution" | "pass_on" | null
  market: string;
  stats: { label: string; value: string }[];
  /** latest analysis-job state, for deals still screening */
  jobStatus?: "running" | "failed" | null;
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

export function Pipeline({
  deals,
  errorMessage,
  notice,
  billing,
}: {
  deals: DealCard[];
  errorMessage: string | null;
  notice?: string | null;
  billing: BillingInfo | null;
}) {
  const [query, setQuery] = useState("");
  const [verdict, setVerdict] = useState("all");
  const [asset, setAsset] = useState("all");
  const [market, setMarket] = useState("all");
  const [sort, setSort] = useState("newest");
  const [showForm, setShowForm] = useState(!!errorMessage);
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
  }, [deals, query, verdict, asset, market, sort]);

  const verdictCounts = useMemo(() => {
    const c = { pass: 0, caution: 0, pass_on: 0, screening: 0 };
    for (const d of deals) {
      if (d.verdict && d.verdict in c) c[d.verdict as keyof typeof c]++;
      else if (!d.verdict) c.screening++;
    }
    return c;
  }, [deals]);

  function clearFilters() {
    setQuery("");
    setVerdict("all");
    setAsset("all");
    setMarket("all");
  }
  const filtersActive =
    query.trim() !== "" ||
    verdict !== "all" ||
    asset !== "all" ||
    market !== "all";

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
                <span className={atLimit ? "text-caution" : ""}>
                  {billing!.dealCount} of {billing!.dealLimit} free
                </span>
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
            <button
              type="button"
              onClick={() => setShowForm((s) => !s)}
              className="shadow-card hover-lift rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white"
            >
              {showForm ? "Close" : "+ New deal"}
            </button>
          )}
        </div>
      </div>

      {notice && (
        <p className="rounded-lg bg-pass/10 px-3 py-2 text-sm text-pass">
          {notice}
        </p>
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
              {verdictCounts.screening} Screening
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
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search deals…"
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
              ["screening", "Screening"],
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
        </div>
      )}

      {deals.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
          <p className="text-sm font-medium">Start your pipeline</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted">
            Upload an offering memorandum to screen your first deal — or explore
            a fully-worked sample to see the whole thing first.
          </p>
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
            >
              + New deal
            </button>
            <form action={createSampleDeal}>
              <button
                type="submit"
                className="rounded-lg border border-line px-4 py-2 text-sm font-medium transition-colors hover:bg-faint"
              >
                Try a sample deal
              </button>
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
        </p>
      </div>
      {d.stats.length > 0 && (
        <div className="hidden shrink-0 items-center gap-5 md:flex">
          {d.stats.map((s, idx) => (
            <div key={idx} className="text-right">
              <p className="text-[10px] uppercase tracking-wide text-muted">
                {s.label}
              </p>
              <p className="font-mono text-sm tabular-nums">{s.value}</p>
            </div>
          ))}
        </div>
      )}
      {v ? (
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${v.cls}`}
        >
          {v.label}
        </span>
      ) : d.jobStatus === "failed" ? (
        <span className="shrink-0 rounded-full bg-kill/10 px-2.5 py-1 text-[11px] font-medium text-kill">
          Analysis failed
        </span>
      ) : d.jobStatus === "running" ? (
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] text-muted">
          <span className="pulse-bar h-1.5 w-1.5 rounded-full bg-brand" />
          Screening…
        </span>
      ) : (
        <span className="shrink-0 text-[11px] text-muted">Not screened</span>
      )}
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
      className={`rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink shadow-sm outline-none transition-colors hover:bg-faint focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40 ${className}`}
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
        />
        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          Create &amp; analyze
        </button>
      </form>
      <form action={createSampleDeal} className="mt-3 border-t border-line pt-3">
        <button
          type="submit"
          className="text-sm font-medium text-brand transition-colors hover:text-brand-strong"
        >
          Or explore a sample deal →
        </button>
      </form>
    </section>
  );
}
