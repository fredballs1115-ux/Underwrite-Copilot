"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MarketNavEntry } from "@/lib/market-match";

type PaletteDeal = {
  id: string;
  name: string;
  market: string;
  address: string;
  docs: string;
  call: string | null;
  stage: string;
};

type Item = {
  key: string;
  label: string;
  hint: string;
  href: string;
  dot?: string;
  icon?: React.ReactNode;
  group: "deals" | "actions";
  /** extra matchable text (address, document filenames) beyond label+hint */
  search?: string;
};

function ActionIcon({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5 shrink-0 text-muted"
      aria-hidden
    >
      {children}
    </svg>
  );
}

const ACTIONS: Item[] = [
  {
    key: "a-new",
    label: "New deal…",
    hint: "upload an OM",
    href: "/deals?new=1",
    group: "actions",
    icon: (
      <ActionIcon>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </ActionIcon>
    ),
  },
  {
    key: "a-pipeline",
    label: "Pipeline",
    hint: "all deals",
    href: "/deals",
    group: "actions",
    icon: (
      <ActionIcon>
        <path d="m12 2 9 5-9 5-9-5 9-5Z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 17 9 5 9-5" />
      </ActionIcon>
    ),
  },
  {
    key: "a-criteria",
    label: "Buy box",
    hint: "your criteria",
    href: "/criteria",
    group: "actions",
    icon: (
      <ActionIcon>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="0.8" fill="currentColor" />
      </ActionIcon>
    ),
  },
  {
    key: "a-comps",
    label: "Pull comps",
    hint: "recorded sales near any address",
    href: "/comps",
    group: "actions",
    icon: (
      <ActionIcon>
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
        <circle cx="12" cy="10" r="3" />
      </ActionIcon>
    ),
  },
  {
    key: "a-market",
    label: "Market data",
    hint: "benchmarks & rates",
    href: "/market",
    group: "actions",
    icon: (
      <ActionIcon>
        <path d="M4 4h16v5H4z" />
        <path d="M4 15h16v5H4z" />
        <path d="M8 6.5h0" />
        <path d="M8 17.5h0" />
      </ActionIcon>
    ),
  },
  {
    key: "a-news",
    label: "News",
    hint: "scored stories, linked to the source",
    href: "/news",
    group: "actions",
    icon: (
      <ActionIcon>
        <path d="M4 22h16a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v16a2 2 0 0 1-2 2Zm0 0a2 2 0 0 1-2-2v-9c0-1.1.9-2 2-2h2" />
        <path d="M18 14h-8" />
        <path d="M15 18h-5" />
        <path d="M10 6h8v4h-8V6Z" />
      </ActionIcon>
    ),
  },
  {
    key: "a-data-health",
    label: "Data health",
    hint: "steward runs, issues, changelog",
    href: "/data-health",
    group: "actions",
    icon: (
      <ActionIcon>
        <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
      </ActionIcon>
    ),
  },
  {
    key: "a-whats-new",
    label: "What's new",
    hint: "every product improvement, newest first",
    href: "/whats-new",
    group: "actions",
    search: "whats new changelog improvements updates shipped",
    icon: (
      <ActionIcon>
        <path d="M12 2v4" />
        <path d="m16.2 7.8 2.9-2.9" />
        <path d="M18 12h4" />
        <path d="M12 22a10 10 0 1 1 10-10" />
        <path d="m9 12 2 2 4-4" />
      </ActionIcon>
    ),
  },
  {
    key: "a-analytics",
    label: "Analytics",
    hint: "portfolio trends",
    href: "/analytics",
    group: "actions",
    icon: (
      <ActionIcon>
        <path d="M3 3v18h18" />
        <path d="M8 17v-3" />
        <path d="M13 17V7" />
        <path d="M18 17v-6" />
      </ActionIcon>
    ),
  },
  {
    key: "a-team",
    label: "Team",
    hint: "shared pipeline",
    href: "/team",
    group: "actions",
    icon: (
      <ActionIcon>
        <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
        <path d="M16 3.13a4 4 0 0 1 0 7.75" />
      </ActionIcon>
    ),
  },
  {
    key: "a-billing",
    label: "Billing",
    hint: "plan & invoices",
    href: "/billing",
    group: "actions",
    icon: (
      <ActionIcon>
        <rect x="2" y="5" width="20" height="14" rx="2" />
        <path d="M2 10h20" />
      </ActionIcon>
    ),
  },
  {
    key: "a-account",
    label: "Account",
    hint: "profile & data",
    href: "/account",
    group: "actions",
    icon: (
      <ActionIcon>
        <path d="M20 21a8 8 0 0 0-16 0" />
        <circle cx="12" cy="7" r="4" />
      </ActionIcon>
    ),
  },
];

const CALL_DOT: Record<string, string> = {
  pass: "bg-pass",
  caution: "bg-caution",
  pass_on: "bg-kill",
};

/**
 * ⌘K / Ctrl+K jump-anywhere. Deals are fetched lazily on first open (and
 * refreshed on each open) from /api/palette — RLS keeps it to the caller's own.
 */
export function CommandPalette({
  open,
  onOpenChange,
  markets = [],
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** slim covered-market list, built server-side (lib/market-match) */
  markets?: MarketNavEntry[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [deals, setDeals] = useState<PaletteDeal[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Open/close on ⌘K anywhere; Escape closes (handled on the input too).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        onOpenChange(!open);
      } else if (e.key === "Escape" && open) {
        // preventDefault so other global Escape handlers (e.g. the pipeline's
        // close-form shortcut) don't ALSO fire from the same keystroke.
        e.preventDefault();
        onOpenChange(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  // Each open: reset, focus, and (re)load the jump list. State resets are
  // rAF-deferred so the effect body never sets state synchronously.
  useEffect(() => {
    if (!open) return;
    const raf = requestAnimationFrame(() => {
      setQuery("");
      setActive(0);
      inputRef.current?.focus();
    });
    fetch("/api/palette", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json();
      })
      .then((d: { deals: PaletteDeal[] }) => {
        setDeals(d.deals);
        setLoadFailed(false);
      })
      .catch(() => {
        // "No matches." would read as "your deals are gone" — say what broke.
        setDeals([]);
        setLoadFailed(true);
      });
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const dealItems: Item[] = (deals ?? []).map((d) => ({
      key: d.id,
      label: d.name,
      hint: d.market || d.address || d.stage,
      href: `/deals/${d.id}`,
      dot: d.call ? (CALL_DOT[d.call] ?? "bg-line") : "bg-line",
      group: "deals" as const,
      search: `${d.name} ${d.market} ${d.address} ${d.docs}`,
    }));
    // Market briefs come LAST so core actions stay above the fold on an
    // empty query; their alias search text makes "brooklyn" or "fort worth"
    // land on the right brief.
    const marketItems: Item[] = markets.map((m) => ({
      key: `mkt-${m.id}`,
      label: `Market brief: ${m.name}`,
      hint: m.region,
      href: `/market?metro=${m.id}`,
      group: "actions" as const,
      search: `market brief ${m.search}`,
      icon: (
        <ActionIcon>
          <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
          <circle cx="12" cy="10" r="3" />
        </ActionIcon>
      ),
    }));
    const all = [...dealItems, ...ACTIONS, ...marketItems];
    if (!q) return all;
    return all.filter((i) =>
      (i.search ?? `${i.label} ${i.hint}`).toLowerCase().includes(q),
    );
  }, [deals, markets, query]);

  // Clamp instead of a state-syncing effect: as the filter narrows, the
  // highlighted row is derived from the raw index, never reset via setState.
  // Floored at 0 so an empty result list can never park the index at −1.
  const activeIdx = Math.max(0, Math.min(active, items.length - 1));

  function go(item: Item) {
    onOpenChange(false);
    // "New deal…" carries a fresh nonce each time so re-selecting it re-opens
    // the form even when ?new= is already in the URL.
    router.push(item.key === "a-new" ? `/deals?new=${Date.now()}` : item.href);
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.max(0, Math.min(activeIdx + 1, items.length - 1)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIdx - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[activeIdx];
      if (item) go(item);
    }
  }

  // Keep the active option scrolled into view.
  useEffect(() => {
    listRef.current
      ?.querySelector(`#palette-opt-${activeIdx}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx]);

  if (!open) return null;

  const groups: { title: string; items: { item: Item; index: number }[] }[] = [
    {
      title: "Jump to",
      items: items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.group === "deals"),
    },
    {
      title: "Actions",
      items: items
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => item.group === "actions"),
    },
  ].filter((g) => g.items.length > 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <button
        type="button"
        aria-label="Close command palette"
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={() => onOpenChange(false)}
      />
      <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
        <div className="flex items-center gap-2.5 border-b border-line px-4">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 text-muted"
            aria-hidden
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onInputKey}
            placeholder="Search deals, addresses, documents…"
            aria-label="Search deals and actions"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items.length ? `palette-opt-${activeIdx}` : undefined}
            className="w-full bg-transparent py-3.5 text-sm outline-none placeholder:text-muted"
          />
          <kbd className="shrink-0 rounded border border-line bg-faint px-1.5 py-0.5 text-[10px] text-muted">
            esc
          </kbd>
        </div>

        <ul
          id="palette-list"
          ref={listRef}
          role="listbox"
          aria-label="Results"
          className="max-h-[46vh] overflow-y-auto p-2"
        >
          {items.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-muted">
              {deals === null
                ? "Loading…"
                : loadFailed
                  ? "Search is unreachable right now — close and try again."
                  : "No matches."}
            </li>
          )}
          {groups.map((g) => (
            <li key={g.title} role="presentation">
              <p className="px-3 pb-1 pt-2 text-[10px] font-medium uppercase tracking-wider text-muted">
                {g.title}
              </p>
              <ul role="presentation">
                {g.items.map(({ item, index }) => (
                  <li
                    key={item.key}
                    id={`palette-opt-${index}`}
                    role="option"
                    aria-selected={index === activeIdx}
                  >
                    <button
                      type="button"
                      onClick={() => go(item)}
                      onMouseMove={() => setActive(index)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                        index === activeIdx ? "bg-brand/10 text-ink" : "text-ink"
                      }`}
                    >
                      {item.icon ??
                        (item.dot && (
                          <span
                            aria-hidden
                            className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.dot}`}
                          />
                        ))}
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span className="max-w-[11rem] shrink-0 truncate text-xs text-muted">
                        {item.hint}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-3 border-t border-line bg-faint/60 px-4 py-2 text-[10px] text-muted">
          <span>
            <kbd className="rounded border border-line bg-surface px-1">↑↓</kbd>{" "}
            navigate
          </span>
          <span>
            <kbd className="rounded border border-line bg-surface px-1">↵</kbd>{" "}
            open
          </span>
          <span>
            <kbd className="rounded border border-line bg-surface px-1">esc</kbd>{" "}
            close
          </span>
        </div>
      </div>
    </div>
  );
}
