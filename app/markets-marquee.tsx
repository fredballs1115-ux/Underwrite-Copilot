import Link from "next/link";
import metrosSeed from "@/data/research/metros.json";
import { datedLong } from "@/lib/debt-index";
import { fmrLabel, fmrOf, fmrToday, fmrWhen } from "@/lib/fmr";
import { MARKET_COUNT } from "@/lib/market-count";
import { blockCitations, figuresTitle } from "@/lib/tracker-read";
import { PausableTicker } from "./pausable-ticker";

// Server-component module only: it pulls a research seed JSON, which must
// never ride into a client bundle. Shared by the homepage, /why, and /demo
// so the across-the-screen markets band is one implementation everywhere.

// The count every page states lives in lib/market-count (the DMV core's four
// jurisdiction entries are one market); re-exported for the pages that
// import it from here.
export { MARKET_COUNT };

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
 *  quarterly prints — never a live feed, so each figure carries its own
 *  period, the one its block's read states (lib/tracker-read), "undated"
 *  where the file states none; the snapshot's `as_of` is the day the
 *  research was read, said as that and never as a figure's date. */
const SECTOR_LABEL: Record<string, string> = {
  office: "Office",
  industrial: "Industrial",
  multifamily: "Multifamily",
  retail: "Retail",
};

export interface MetroFact {
  /** the sector's figures, each with the period its own read states —
   *  "Office 21.3–22.2% vac (Q2 2026) · 3 rules on file" — or HUD's fair
   *  market rent with its fiscal year, or the rules count alone */
  text: string;
  /** who published each figure in `text`, for what area and when — a
   *  title's words; null where `text` carries no tracker figure */
  cite: string | null;
  /** the day the research sweep read the snapshot (its `as_of`), never a
   *  figure's date; null where `text` carries no tracker figure or the file
   *  states none */
  readOn: string | null;
}

/** "read Aug 25, 2026" — the day the research was read, as every page says it. */
export function researchReadOn(day: string): string {
  return `read ${datedLong(day)}`;
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
    // Each figure's own period, never the day the research was read.
    const shown = blockCitations(b).filter((f) => f.label !== "Cap");
    const when = (label: string) => shown.find((f) => f.label === label)?.read.period ?? "undated";
    const rent =
      typeof b.asking_rent_psf === "number" ? ` · $${b.asking_rent_psf.toFixed(2)}/SF (${when("Rent")})` : "";
    const snapAsOf = (entry.sector_snapshot as Record<string, unknown>).as_of;
    return {
      text: [`${SECTOR_LABEL[sector]} ${vac} vac (${when("Vacancy")})${rent}`, rulesPart]
        .filter((x): x is string => x !== null)
        .join(" · "),
      cite: figuresTitle(shown),
      readOn: typeof snapAsOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(snapAsOf) ? snapAsOf : null,
    };
  }

  // The FMR through the one reader, so the text names the year its block
  // states — never a year typed here — and never a year that has ended: a
  // band this short has no room to say so, so it leaves the figure out.
  const fmr = fmrOf(m);
  const twoBed = fmr?.rents["2br"] ?? null;
  const inForce = !!fmr && !fmrWhen(fmr, fmrToday()).ended;
  const parts = [
    fmr && twoBed !== null && inForce ? `${fmrLabel(fmr.fy)} 2BR FMR $${twoBed.toLocaleString("en-US")}/mo` : null,
    rulesPart,
  ].filter((x): x is string => x !== null);
  return parts.length ? { text: parts.join(" · "), cite: null, readOn: null } : null;
}

export function MarketsMarquee() {
  const facts = (metrosSeed.metros ?? []).map((m, i) => ({ entry: m as { id: string; name: string; region?: string }, fact: metroFact(m, i) }));
  // Each figure carries its own period in its text; the heading says the
  // day the research was read where every market's was read the same day.
  const first = facts[0]?.fact?.readOn ?? null;
  const shared = first && facts.every((f) => f.fact?.readOn === first) ? first : null;
  const items = facts.map(({ entry, fact }) => {
    const text = fact ? fact.text : (entry.region ?? "covered market");
    return [entry.id, entry.name, text, fact?.cite ?? undefined] as const;
  });
  // Each item is a real link into that market's brief — the marquee is a
  // navigation surface, not just decoration. Duplicate row is aria-hidden,
  // so screen readers and tab order see each market once.
  const row = (hidden: boolean) => (
    <div
      aria-hidden={hidden || undefined}
      className="flex shrink-0 items-center gap-10 pr-10"
    >
      {items.map(([id, k, v, cite]) => (
        <Link
          key={k}
          href={`/market?metro=${id}`}
          tabIndex={hidden ? -1 : undefined}
          title={cite}
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
  // The band never stops on its own, so it carries a pause button
  // (app/pausable-ticker); the heading keeps clear of it at the right.
  return (
    <PausableTicker what="markets band" className="overflow-hidden border-y border-line bg-faint/70 py-3">
      <p className="mb-1.5 px-10 text-center text-[11px] font-medium uppercase tracking-wider text-muted">
        {`The ${MARKET_COUNT} covered markets — dated research${shared ? `, ${researchReadOn(shared)}` : ""}`}
      </p>
      <div className="ticker-track-reverse flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </PausableTicker>
  );
}
