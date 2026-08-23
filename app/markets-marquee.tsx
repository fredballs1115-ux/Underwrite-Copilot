import Link from "next/link";
import metrosSeed from "@/data/research/metros.json";

// Server-component module only: it pulls a research seed JSON, which must
// never ride into a client bundle. Shared by the homepage, /why, and /demo
// so the across-the-screen markets band is one implementation everywhere.

// DMV core's four jurisdiction entries are ONE market to a human; every
// other entry counts as itself, whatever its region stamp — an unstamped
// future metro must move this number, not silently vanish from it.
export const MARKET_COUNT = new Set(
  (metrosSeed.metros ?? []).map((m) =>
    (m as { region?: string }).region === "DMV core" ? "DMV core" : m.id
  )
).size;

/** The strongest honest fact string for a metro — the published FMR and the
 *  rules-on-file count TOGETHER when both exist — or null when the seed
 *  carries neither. Shared by the marquee and the hero rotator so the two
 *  surfaces can never describe the same market differently. */
export function metroFact(m: unknown): string | null {
  const entry = m as {
    rule_ids?: string[];
    fmr_fy2026?: { "2br"?: number | null };
  };
  const fmr = entry.fmr_fy2026?.["2br"];
  const rules = entry.rule_ids?.length ?? 0;
  const parts = [
    typeof fmr === "number" ? `2BR FMR $${fmr.toLocaleString()}/mo` : null,
    rules > 0 ? `${rules} rule${rules === 1 ? "" : "s"} on file` : null,
  ].filter((x): x is string => x !== null);
  return parts.length ? parts.join(" · ") : null;
}

export function MarketsMarquee() {
  const items = (metrosSeed.metros ?? []).map((m) => {
    const entry = m as { id: string; name: string; region?: string };
    const fact = metroFact(m) ?? (entry.region ?? "covered market");
    return [entry.id, entry.name, fact] as const;
  });
  // Each item is a real link into that market's brief — the marquee is a
  // navigation surface, not just decoration. Duplicate row is aria-hidden,
  // so screen readers and tab order see each market once.
  const row = (hidden: boolean) => (
    <div
      aria-hidden={hidden || undefined}
      className="flex shrink-0 items-center gap-10 pr-10"
    >
      {items.map(([id, k, v]) => (
        <Link
          key={k}
          href={`/market?metro=${id}`}
          tabIndex={hidden ? -1 : undefined}
          className="group inline-flex items-baseline gap-2 whitespace-nowrap text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        >
          <span className="font-medium underline-offset-2 group-hover:underline">
            {k}
          </span>
          <span className="font-mono text-[13px] tabular-nums text-brand">{v}</span>
        </Link>
      ))}
    </div>
  );
  return (
    <div className="overflow-hidden border-y border-line bg-faint/70 py-3">
      <p className="mb-1.5 text-center text-[11px] font-medium uppercase tracking-wider text-muted">
        The {MARKET_COUNT} covered markets — live from the research layer
      </p>
      <div className="ticker-track-reverse flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
