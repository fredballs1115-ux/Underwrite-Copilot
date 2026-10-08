import Link from "next/link";
import metrosSeed from "@/data/research/metros.json";
import { datedLong } from "@/lib/debt-index";
import { fmrLabel, fmrOf, fmrToday, fmrWhen } from "@/lib/fmr";
import { MARKET_COUNT } from "@/lib/market-count";
import {
  blockCitations,
  figuresTitle,
  houseShort,
  rentOf,
  rentText,
  snapshotReadOn,
  type CitedFigure,
} from "@/lib/tracker-read";
import { oldestDate, researchAge, staleMark } from "@/lib/research-age";
import { sharedAreaFor } from "@/lib/sector-leaderboard";
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
  /** `text` with each tracker figure's house beside its period — "Office
   *  21.3–22.2% vac (Colliers and CBRE, Q2 2026) · 3 rules on file" — the
   *  words a surface with room for them prints (the band); `text` itself
   *  where it carries no tracker figure */
  credited: string;
  /** who published the tracker figures in `text`, as a line of its own —
   *  "Vacancy: Colliers and CBRE", "Vacancy and rent: Matthews", "Vacancy:
   *  Newmark · Rent: CBRE" — for a surface that sets the figures where
   *  their houses will not fit (the gallery's tiles); null where `text`
   *  carries no tracker figure */
  houses: string | null;
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

/**
 * The covered markets' snapshots as the band and the gallery date them: the
 * day they were read, or the span where they differ ("read Aug 25, 2026");
 * and, past the research rule's limit on `today` (lib/research-age), the
 * oldest read's age and the stale mark — the figures still show, said as
 * stale. Null `stale` while every read is current. One reading for both.
 */
export function marketsResearch(
  facts: readonly (Pick<MetroFact, "readOn"> | null)[],
  today: string,
): { span: string | null; stale: string | null } {
  const sorted = [...new Set(facts.map((f) => f?.readOn ?? null).filter((d): d is string => d !== null))].sort();
  const span =
    sorted.length === 0
      ? null
      : sorted.length === 1
        ? researchReadOn(sorted[0])
        : `read ${datedLong(sorted[0])} to ${datedLong(sorted[sorted.length - 1])}`;
  const mark = staleMark(researchAge(oldestDate(sorted), today));
  return { span, stale: mark ? (sorted.length > 1 ? `the oldest ${mark}` : mark) : null };
}

/** Today as an ISO day, read outside the render — the band and the gallery
 *  are drawn on ISR pages, so the day is the render's, never the process's. */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function metroFact(m: unknown, rotate = 0): MetroFact | null {
  const entry = m as {
    id?: string;
    rule_ids?: string[];
    sector_snapshot?: Record<
      string,
      {
        vacancy_pct?: number | null;
        vacancy_pct_low?: number | null;
        vacancy_pct_high?: number | null;
        asking_rent_psf?: number | null;
        asking_rent_psf_low?: number | null;
        asking_rent_psf_high?: number | null;
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
    // A figure's period, and the narrower stock it covers where the file
    // says it is one ("Class A space, Q2 2026") — and, where the market
    // reads a figure it shares with others, whose figure it is ("Suburban
    // Maryland, Q1 2026"), never the county's own.
    const shared = sharedAreaFor(sector, entry.id);
    // `credited` puts each figure's house first among its words (research
    // pass 31, C5): who published it, then where and when.
    const when = (label: string, credited: boolean) => {
      const read = shown.find((f) => f.label === label)?.read;
      const house = credited ? houseShort(read ?? { house: null }) : null;
      return [house, shared, read?.slice, read?.period ?? "undated"].filter(Boolean).join(", ");
    };
    // A band as the file states it ("$10–15/SF"), never a point made of one.
    const rentBand = rentOf(b);
    const line = (credited: boolean) =>
      [
        `${SECTOR_LABEL[sector]} ${vac} vac (${when("Vacancy", credited)})${rentBand ? ` · ${rentText(rentBand)}/SF (${when("Rent", credited)})` : ""}`,
        rulesPart,
      ]
        .filter((x): x is string => x !== null)
        .join(" · ");
    return {
      text: line(false),
      credited: line(true),
      houses: housesLine(shown),
      cite: figuresTitle(shown),
      readOn: snapshotReadOn(entry.sector_snapshot),
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
  if (parts.length === 0) return null;
  const text = parts.join(" · ");
  return { text, credited: text, houses: null, cite: null, readOn: null };
}

/**
 * The houses behind a tile's figures, as one line: "Vacancy: Colliers and
 * CBRE", "Vacancy and rent: Matthews" where one house published both, and
 * "Vacancy: Newmark · Rent: CBRE" where two did. Null with no figure.
 */
function housesLine(shown: readonly CitedFigure[]): string | null {
  if (shown.length === 0) return null;
  const houses = shown.map((f) => houseShort(f.read));
  if (houses.every((h) => h === houses[0])) {
    const labels = shown.map((f) => f.label.toLowerCase()).join(" and ");
    return `${labels.charAt(0).toUpperCase()}${labels.slice(1)}: ${houses[0]}`;
  }
  return shown.map((f, i) => `${f.label}: ${houses[i]}`).join(" · ");
}

export function MarketsMarquee({ today = todayIso() }: { today?: string }) {
  const facts = (metrosSeed.metros ?? []).map((m, i) => ({ entry: m as { id: string; name: string; region?: string }, fact: metroFact(m, i) }));
  // Each figure carries its own period in its text; the heading says the
  // day the research was read where every market's was read the same day,
  // and past the research rule's limit how old the read is and that it is
  // stale (lib/research-age) — never hiding the figures or the day.
  const first = facts[0]?.fact?.readOn ?? null;
  const shared = first && facts.every((f) => f.fact?.readOn === first) ? first : null;
  const { stale } = marketsResearch(
    facts.map((f) => f.fact),
    today,
  );
  // Each figure with its house in the words the band shows (`credited`):
  // the band never wraps, so the house fits beside its figure at any width,
  // and the title keeps the whole citation for a pointer.
  const items = facts.map(({ entry, fact }) => {
    const text = fact ? fact.credited : (entry.region ?? "covered market");
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
        {stale && (
          <span className="text-caution" data-qa="research-stale">
            {` (${stale})`}
          </span>
        )}
      </p>
      <div className="ticker-track-reverse flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </PausableTicker>
  );
}
