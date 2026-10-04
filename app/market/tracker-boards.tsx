import { Fragment } from "react";
import Link from "next/link";
import { linkOk } from "@/lib/link-audit";
import { sharedFigureWords, type LeaderRow, type Standing } from "@/lib/sector-leaderboard";
import { figureNote, figureSources, figuresTitle, rentText, type CitedFigure } from "@/lib/tracker-read";
import { heatShade } from "./heat-shade";

/**
 * The research tracker's rankings on /market, drawn: a brief's rank chip,
 * the sector leaderboard's table and the coverage board. Pure — the page
 * builds the rows (lib/sector-leaderboard) for the day it is read and hands
 * them in — so lib/views.render.test.ts draws each on the research file.
 *
 * What the rankings may claim is lib/sector-leaderboard's (the research pass
 * of 2026-10-01): one row per distinct figure, naming every market that
 * reads it; a rank only for a figure that is dated, no more than a year old,
 * for the whole stock and one read; everything else listed after, unranked,
 * with its reason; a band printed as a band, never as its midpoint.
 */

const LABEL: Record<string, string> = {
  office: "Office",
  industrial: "Industrial",
  multifamily: "Multifamily",
  retail: "Retail",
};

const sectorWord = (sector: string) => (LABEL[sector] ?? sector).toLowerCase();

/** "19.2%", or a band as a band ("21.3–22.2%") — the file's own figures. */
function pctBand(lo: number, hi: number | null): string {
  return hi === null || Math.abs(hi - lo) < 0.005 ? `${lo}%` : `${lo}–${hi}%`;
}

/** A vacancy figure as the boards print it: "19.2%", or a band as a band. */
export function vacancyText(row: Pick<LeaderRow, "vLow" | "vHigh">): string {
  return row.vLow === null ? "level open" : pctBand(row.vLow, row.vHigh);
}

/**
 * A brief's chip for one sector: its figure's rank where the ranking can
 * place it ("#3 of 6"), saying whose figure it is where several markets read
 * one; or "not ranked" with the reason, where it cannot.
 */
export function StandingChip({ sector, metroId, standing }: { sector: string; metroId: string; standing: Standing }) {
  const others = standing.row.markets.filter((m) => m.id !== metroId).map((m) => m.name);
  const shared =
    others.length > 0
      ? ` — one figure${standing.row.sharedArea ? ` for ${standing.row.sharedArea}` : ""}, read by ${others.join(", ")} too`
      : "";
  if (standing.rank !== null) {
    return (
      <Link
        href={`/market?sector=${sector}`}
        prefetch={false}
        title={`rank among the covered markets' ${sectorWord(sector)} vacancy figures that can be ranked, tightest first${shared}`}
        className="rounded-full border border-line px-1.5 py-px text-[10px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
      >
        {`#${standing.rank} of ${standing.total}`}
      </Link>
    );
  }
  return (
    <Link
      href={`/market?sector=${sector}`}
      prefetch={false}
      title={`not ranked across the covered markets: ${standing.reason ?? "no vacancy figure"}${shared}`}
      className="rounded-full border border-dashed border-line px-1.5 py-px text-[10px] font-medium text-muted transition-colors hover:border-brand hover:text-brand"
      data-qa="standing-unranked"
    >
      {`not ranked · ${standing.reason ?? "no vacancy figure"}`}
    </Link>
  );
}

/** The markets a row stands for, each linked, with whose figure it is where
 *  it stands for more than one: "Suburban Maryland — Prince George's County
 *  MD, Montgomery County MD". */
function RowMarkets({ row }: { row: LeaderRow }) {
  return (
    <span className="text-xs">
      {row.sharedArea && row.markets.length > 1 ? (
        <span className="font-semibold text-ink">{`${row.sharedArea} — `}</span>
      ) : null}
      {row.markets.map((m, i) => (
        <Fragment key={m.id}>
          {i > 0 ? ", " : null}
          <Link
            href={`/market?metro=${m.id}`}
            prefetch={false}
            className="font-medium underline decoration-dotted underline-offset-2 hover:text-brand"
          >
            {m.name}
          </Link>
        </Fragment>
      ))}
    </span>
  );
}

/**
 * Where a row's figures come from: a link for each figure the file ties to
 * one, and — said plainly — what is missing for a figure it ties to none:
 * "publisher not recorded" where the file names no house, "no link
 * recorded" where it names one and no link. Never a credit that looks like
 * a source ("on file") for a figure a visitor cannot check.
 */
export function RowSources({ figures }: { figures: readonly CitedFigure[] }) {
  const ok = (href: string) => linkOk(href) !== false;
  const links = figureSources(figures, ok);
  const missing = figures.filter((f) => !f.read.links[0] || !ok(f.read.links[0]));
  const said = missing.map((f) => `${f.label.toLowerCase()}: ${f.read.house ? "no link recorded" : "publisher not recorded"}`);
  return (
    <span className="inline-flex flex-wrap gap-x-1.5" title={figuresTitle(figures)}>
      {links.map((l) => (
        <a
          key={l.href}
          href={l.href}
          target="_blank"
          rel="noreferrer"
          title={l.title}
          className="underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          {l.label}
        </a>
      ))}
      {said.length > 0 ? <span data-qa="missing-source">{said.join(" · ")}</span> : null}
    </span>
  );
}

/** Each figure's own period, said beside it: "Q2 2026", or "undated". */
function periodOf(figures: readonly CitedFigure[], label: CitedFigure["label"]): string | null {
  const f = figures.find((x) => x.label === label);
  return f ? (f.read.period ?? "undated") : null;
}

/**
 * The sector leaderboard's table: the ranked rows in order, then the rows
 * the sources do not let it rank, each with its reason, then the rows with
 * no vacancy figure. Each figure carries its own period beside it.
 */
export function LeaderboardTable({
  sector,
  rows,
  ranked,
  heldOpen,
  stale = null,
}: {
  sector: string;
  rows: readonly LeaderRow[];
  ranked: number;
  heldOpen: readonly string[];
  /** past the research rule's limit (lib/research-age), the day the
   *  research was read with its age and the stale mark — "research read Aug
   *  25, 2026 (181 days old, stale)" — said under the heading; the figures
   *  and their ranks still show. Null while the research is current. */
  stale?: string | null;
}) {
  if (rows.length === 0 && heldOpen.length === 0) return null;
  const label = LABEL[sector] ?? sector;
  const anyRent = rows.some((r) => r.rent !== null);
  const anyCap = rows.some((r) => r.capLow !== null);
  const cols = 3 + (anyRent ? 1 : 0) + (anyCap ? 1 : 0) + 1;
  const firstUnranked = rows.findIndex((r) => r.rank === null);
  const credit = (r: LeaderRow, l: CitedFigure["label"]) => {
    const f = r.figures.filter((x) => x.label === l);
    return f.length > 0 ? figuresTitle(f) : undefined;
  };
  const when = (r: LeaderRow, l: CitedFigure["label"]) => {
    const p = periodOf(r.figures, l);
    // The space keeps the period a word of its own to a screen reader and the
    // page lint: a block span alone puts nothing between "5.2" and "Q1".
    return p ? (
      <>
        {" "}
        <span className="block text-[10px] font-sans text-muted">{p}</span>
      </>
    ) : null;
  };
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {label} across the covered markets
        </h3>
        <span className="text-[11px] text-muted">
          {`${ranked} figures ranked tightest to loosest; each figure's own period beside it`}
        </span>
      </div>
      {stale && (
        <p className="mt-0.5 text-[11px] text-caution" data-qa="research-stale">
          {stale}
        </p>
      )}
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[440px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-wide text-muted">
              <th className="py-1.5 pr-2 font-medium">#</th>
              <th className="py-1.5 pr-3 font-medium">Market</th>
              <th className="py-1.5 pr-3 font-medium">Vacancy</th>
              {anyRent && <th className="py-1.5 pr-3 font-medium">Asking $/SF</th>}
              {anyCap && <th className="py-1.5 pr-3 font-medium">Cap range</th>}
              <th className="py-1.5 font-medium">Src</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <Fragment key={r.markets.map((m) => m.id).join("+")}>
                {i === firstUnranked && (
                  <tr>
                    <td colSpan={cols} className="pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Not ranked — the reason under each market
                    </td>
                  </tr>
                )}
                <tr className="border-b border-line/60 align-top" data-row-rank={r.rank ?? "none"}>
                  <td className="py-1.5 pr-2 font-mono text-[11px] tabular-nums text-muted">{r.rank ?? "—"}</td>
                  <td className="py-1.5 pr-3">
                    <RowMarkets row={r} />
                    {r.reason && (
                      <span className="block text-[10px] text-muted" data-qa="unranked-reason">
                        {r.reason}
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-3 font-mono text-xs tabular-nums" title={credit(r, "Vacancy")}>
                    {vacancyText(r)}
                    {when(r, "Vacancy")}
                  </td>
                  {anyRent && (
                    <td className="py-1.5 pr-3 font-mono text-xs tabular-nums" title={credit(r, "Rent")}>
                      {r.rent !== null ? rentText(r.rent) : "—"}
                      {when(r, "Rent")}
                    </td>
                  )}
                  {anyCap && (
                    <td className="py-1.5 pr-3 font-mono text-xs tabular-nums" title={credit(r, "Cap")}>
                      {r.capLow !== null && r.capHigh !== null ? pctBand(r.capLow, r.capHigh) : "—"}
                      {r.capLow !== null && r.capHigh !== null ? when(r, "Cap") : null}
                    </td>
                  )}
                  <td className="py-1.5 text-[11px] text-muted">
                    <RowSources figures={r.figures} />
                  </td>
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
        {`A figure is ranked only where its source dates it within the last year, for the whole ${sectorWord(sector)} stock, as one read: a spread of two houses, two inventories or two periods is printed as the spread and never placed by its midpoint, and a range its publisher prints as one read is placed by its loosest end. Several markets that read one figure are one row.`}
      </p>
      {heldOpen.length > 0 && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
          Direction on file, numeric level held open: {heldOpen.join(" · ")} —
          the metro pages carry the sourced notes.
        </p>
      )}
    </div>
  );
}

/** One cell of the coverage board. */
export interface CoverageCell {
  /** the figure as printed: "19.2", "21.3–22.2" */
  label: string;
  /** the figure's own period, printed under it */
  period: string;
  /** 0 = tightest of the column's ranked figures, 1 = loosest; null = not ranked */
  t: number | null;
  /** the figure's own house, area and period, and whose it is where shared */
  credit: string;
  /** why it is not ranked, where it is not */
  reason: string | null;
}

/**
 * A coverage cell from a market's standing: the figure, its own period, its
 * shade where the column ranks it, and its credit — naming the area where
 * the market reads a figure it shares.
 */
export function coverageCell(s: Standing, total: number): CoverageCell {
  const vacancy = s.row.figures.find((f) => f.label === "Vacancy");
  const lo = s.row.vLow!;
  const hi = s.row.vHigh ?? lo;
  const shared = sharedFigureWords(s.row);
  return {
    label: Math.abs(hi - lo) < 0.005 ? `${lo}` : `${lo}–${hi}`,
    period: vacancy?.read.period ?? "undated",
    t: s.rank === null ? null : total > 1 ? (s.rank - 1) / (total - 1) : 0,
    credit: [vacancy ? figureNote(vacancy.read) : "undated", shared ? `one figure: ${shared}` : null].filter(Boolean).join("; "),
    reason: s.reason,
  };
}

export function CoverageBoardCell({ sector, cell }: { sector: string; cell: CoverageCell | null }) {
  if (!cell) {
    return (
      <div
        className="rounded-md border border-dashed border-line/70 px-1.5 py-1 text-center text-[11px] text-muted"
        title="No numeric level on file for this market and asset class — a recorded gap, never estimated."
      >
        —
      </div>
    );
  }
  const body = (
    <>
      {cell.label}{" "}
      <span className="block font-sans text-[9px] leading-tight text-muted">{cell.period}</span>
    </>
  );
  if (cell.t === null) {
    return (
      <div
        className="rounded-md border border-dashed border-line px-1.5 py-1 text-center font-mono text-xs tabular-nums text-ink"
        title={`${LABEL[sector] ?? sector} vacancy, ${cell.credit} — not ranked: ${cell.reason ?? "no rank"}`}
        data-cell="unranked"
      >
        {body}
      </div>
    );
  }
  return (
    <div
      className="rounded-md px-1.5 py-1 text-center font-mono text-xs tabular-nums text-ink"
      style={{ backgroundColor: heatShade(cell.t) }}
      title={`${LABEL[sector] ?? sector} vacancy, ${cell.credit} — shaded by rank within this column, tightest first`}
      data-cell="ranked"
    >
      {body}
    </div>
  );
}

/** A block's figures, each credited on one line to its own house, area and
 *  period, and linked to its own source where the file ties one to it. */
export function FigureCredits({ figures }: { figures: CitedFigure[] }) {
  if (figures.length === 0) return null;
  return (
    <p className="mt-1 text-[11px] leading-relaxed text-muted" data-qa="figure-credits">
      {figures.map((f, i) => {
        const href = f.read.links[0];
        return (
          <Fragment key={f.label}>
            {i > 0 ? " · " : null}
            {`${f.label}: `}
            {href && linkOk(href) !== false ? (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="underline decoration-dotted underline-offset-2 hover:text-ink"
              >
                {f.words}
              </a>
            ) : f.read.house ? (
              // A house the file names, with no link a visitor can follow:
              // said as that, never left to read like a checked source.
              `${f.words} (no link recorded)`
            ) : (
              f.words
            )}
          </Fragment>
        );
      })}
    </p>
  );
}
