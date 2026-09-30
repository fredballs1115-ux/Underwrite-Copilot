import Link from "next/link";
import metrosSeed from "@/data/research/metros.json";
import { datedLong } from "@/lib/debt-index";
import { fmrLabel, fmrOf } from "@/lib/fmr";

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

/** The strongest honest fact string for a metro — its leading ASSET-CLASS
 *  read (office / industrial / multifamily / retail, same derivation as the
 *  pulse tiles) plus the rules-on-file count; HUD's two-bedroom fair market
 *  rent, with the fiscal year its block states (lib/fmr), is the fallback
 *  only when no sector read exists yet. `rotate` varies which sector leads,
 *  so a strip of many metros shows a mix instead of an all-office wall.
 *  Shared by the marquee and the homepage's gallery so the two surfaces can
 *  never describe the same market differently.
 *
 *  These are dated research — the tracker's snapshot of brokerages'
 *  quarterly prints — never a live feed, so the fact carries the research
 *  file's own date for its figure (the snapshot's `as_of`), and every
 *  surface prints it; a file that states no date gets none printed. */
const SECTOR_LABEL: Record<string, string> = {
  office: "Office",
  industrial: "Industrial",
  multifamily: "Multifamily",
  retail: "Retail",
};

export interface MetroFact {
  text: string;
  /** the research file's own date for the figure in `text` — the sector
   *  snapshot's `as_of`; null where the text dates itself (a fair market
   *  rent names its fiscal year), carries no figure (the rules count alone)
   *  or the file states none */
  asOf: string | null;
}

/** "as of Aug 25, 2026" — the research file's date, as every page says it. */
export function researchAsOf(asOf: string): string {
  return `as of ${datedLong(asOf)}`;
}

export function metroFact(m: unknown, rotate = 0): MetroFact | null {
  const entry = m as {
    rule_ids?: string[];
    sector_snapshot?: Record<
      string,
      {
        vacancy_pct?: number | null;
        vacancy_pct_low?: number | null;
        vacancy_pct_high?: number | null;
        asking_rent_psf?: number | null;
      } | null
    > | null;
  };
  const rules = entry.rule_ids?.length ?? 0;
  const rulesPart = rules > 0 ? `${rules} rule${rules === 1 ? "" : "s"} on file` : null;

  // Sectors that actually carry a vacancy read, in canonical order.
  const readable = Object.keys(SECTOR_LABEL).filter((s) => {
    const b = entry.sector_snapshot?.[s];
    return b != null && typeof (b.vacancy_pct ?? b.vacancy_pct_low) === "number";
  });
  if (readable.length > 0) {
    const sector = readable[((rotate % readable.length) + readable.length) % readable.length];
    const b = entry.sector_snapshot![sector]!;
    const lo = b.vacancy_pct ?? b.vacancy_pct_low;
    const hi = b.vacancy_pct ?? b.vacancy_pct_high ?? lo;
    const vac = lo === hi ? `${lo}%` : `${lo}–${hi}%`;
    const rent =
      typeof b.asking_rent_psf === "number" ? ` · $${b.asking_rent_psf.toFixed(2)}/SF` : "";
    const snapAsOf = (entry.sector_snapshot as Record<string, unknown>).as_of;
    return {
      text: [`${SECTOR_LABEL[sector]} ${vac} vac${rent}`, rulesPart]
        .filter((x): x is string => x !== null)
        .join(" · "),
      asOf: typeof snapAsOf === "string" && snapAsOf.trim() ? snapAsOf : null,
    };
  }

  // The FMR through the one reader, so the text names the year its block
  // states — never a year typed here.
  const fmr = fmrOf(m);
  const twoBed = fmr?.rents["2br"] ?? null;
  const parts = [
    fmr && twoBed !== null ? `${fmrLabel(fmr.fy)} 2BR FMR $${twoBed.toLocaleString("en-US")}/mo` : null,
    rulesPart,
  ].filter((x): x is string => x !== null);
  return parts.length ? { text: parts.join(" · "), asOf: null } : null;
}

export function MarketsMarquee() {
  const facts = (metrosSeed.metros ?? []).map((m, i) => ({ entry: m as { id: string; name: string; region?: string }, fact: metroFact(m, i) }));
  // One date for the strip where every figure carries the same one; each
  // figure its own where they differ — never a date a figure does not have.
  const first = facts[0]?.fact?.asOf ?? null;
  const shared = first && facts.every((f) => f.fact?.asOf === first) ? first : null;
  const items = facts.map(({ entry, fact }) => {
    const text = fact
      ? `${fact.text}${!shared && fact.asOf ? ` · ${researchAsOf(fact.asOf)}` : ""}`
      : (entry.region ?? "covered market");
    return [entry.id, entry.name, text] as const;
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
        {`The ${MARKET_COUNT} covered markets — dated research${shared ? `, ${researchAsOf(shared)}` : ""}`}
      </p>
      <div className="ticker-track-reverse flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
