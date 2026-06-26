"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createDeal } from "./actions";

export type DealCard = {
  id: string;
  name: string;
  assetClass: string;
  createdAt: string;
  verdict: string | null; // "pass" | "caution" | "pass_on" | null
  market: string;
  stats: { label: string; value: string }[];
};

const VERDICT_META: Record<
  string,
  { label: string; cls: string; rank: number }
> = {
  pass_on: { label: "Pass on", cls: "bg-kill/15 text-kill", rank: 0 },
  caution: { label: "Caution", cls: "bg-caution/15 text-caution", rank: 1 },
  pass: { label: "Pass", cls: "bg-pass/15 text-pass", rank: 2 },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function Pipeline({
  deals,
  errorMessage,
}: {
  deals: DealCard[];
  errorMessage: string | null;
}) {
  const [verdict, setVerdict] = useState("all");
  const [asset, setAsset] = useState("all");
  const [market, setMarket] = useState("all");
  const [sort, setSort] = useState("newest");
  const [showForm, setShowForm] = useState(!!errorMessage);

  const assets = useMemo(
    () => Array.from(new Set(deals.map((d) => d.assetClass).filter(Boolean))).sort(),
    [deals],
  );
  const markets = useMemo(
    () => Array.from(new Set(deals.map((d) => d.market).filter(Boolean))).sort(),
    [deals],
  );

  const filtered = useMemo(() => {
    const list = deals.filter((d) => {
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
  }, [deals, verdict, asset, market, sort]);

  function clearFilters() {
    setVerdict("all");
    setAsset("all");
    setMarket("all");
  }
  const filtersActive =
    verdict !== "all" || asset !== "all" || market !== "all";

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Pipeline</h1>
          <p className="mt-1 text-sm text-muted">
            {deals.length} {deals.length === 1 ? "deal" : "deals"} screened
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm((s) => !s)}
          className="shadow-card hover-lift shrink-0 rounded-lg bg-brand px-4 py-2.5 text-sm font-medium text-white"
        >
          {showForm ? "Close" : "+ New deal"}
        </button>
      </div>

      {showForm && <NewDealForm errorMessage={errorMessage} />}

      {deals.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            value={verdict}
            onChange={setVerdict}
            options={[
              ["all", "All verdicts"],
              ["pass", "Pass"],
              ["caution", "Caution"],
              ["pass_on", "Pass on"],
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
        <div className="rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
          <p className="text-sm text-muted">
            No deals yet. Add your first OM to start your pipeline.
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="mt-3 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            + New deal
          </button>
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
              <DealRow key={d.id} d={d} i={idx} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function DealRow({ d, i }: { d: DealCard; i: number }) {
  const v = d.verdict ? VERDICT_META[d.verdict] : null;
  return (
    <li style={{ "--i": i } as React.CSSProperties}>
      <Link
        href={`/deals/${d.id}`}
        className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-faint"
      >
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
            {d.stats.map((s, i) => (
              <div key={i} className="text-right">
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
        ) : (
          <span className="shrink-0 text-[11px] text-muted">Screening</span>
        )}
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
      </Link>
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
      className={`rounded-lg border border-line bg-surface px-3 py-1.5 text-sm text-ink shadow-sm outline-none transition-colors hover:bg-faint focus:border-brand ${className}`}
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
            className="flex-1 rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand"
          />
          <select
            name="assetClass"
            defaultValue="auto"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-brand"
          >
            <option value="auto">Auto-detect</option>
            <option value="multifamily">Multifamily</option>
            <option value="office">Office</option>
            <option value="industrial">Industrial</option>
            <option value="retail">Retail</option>
          </select>
        </div>
        <input
          type="file"
          name="om"
          accept="application/pdf"
          required
          className="block w-full text-sm text-muted file:mr-3 file:rounded-lg file:border-0 file:bg-brand file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-brand-strong"
        />
        <button
          type="submit"
          className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
        >
          Create &amp; analyze
        </button>
      </form>
    </section>
  );
}
