"use client";

// The pipeline as a board: a column a stage, in ladder order (lib/stages),
// each headed by its stage and its count, the deals as compact cards — the
// same filtered and sorted rows the cards, the list and the map show, and
// no read of its own. A deal moves by the stage select on its card, the one
// every card and row carries and the same server action behind it, handed
// in (`stageControl`) as the cards' is, so this module imports no action.
// No drag and drop this round: a select is reachable from the keyboard by
// construction, and a drag would need a keyboard way of its own.
//
// The columns scroll sideways inside their own named region
// (app/scroll-region), never the page: on a phone the board is wider than
// the screen, and the region is a Tab stop, so the arrow keys scroll it.

import { memo, type ReactNode } from "react";
import Link from "next/link";
import { ScrollRegion } from "@/app/scroll-region";
import { DealThumb } from "./deal-thumb";
import { TileCall } from "./deal-tile";
import { OffersDueBit } from "./offers-due-bit";
import { PriceChangeBadge } from "./price-change-badge";
import { Unstated, assetMeta, compactPrice } from "./deal-card-parts";
import { CAP_WITHHELD, ownYieldOf } from "@/lib/cap-slot";
import { PLAN_YOC_TITLE } from "@/lib/plan-facts";
import { STAGE_LABEL, normalizeStage, type Stage } from "@/lib/stages";
import type { DealCard } from "./pipeline";

export type BoardColumn = { stage: Stage; deals: DealCard[] };

/** The figure a pipeline reads a deal by, beside its price: the cap, else a
 *  plan deal's yield on cost, else a note's or a position's own yield, else
 *  why none is struck — the list row's cap cell, in its words. */
function BoardFigure({ d }: { d: DealCard }) {
  const s = d.slots;
  const micro = "text-[9px] font-sans font-medium uppercase";
  if (s.cap) {
    return (
      <span>
        <span className="font-mono tabular-nums">{s.cap}</span> cap
      </span>
    );
  }
  if (s.yoc) {
    return (
      <span title={PLAN_YOC_TITLE}>
        <span className="font-mono tabular-nums">{s.yoc}</span> <span className={micro}>yoc</span>
      </span>
    );
  }
  if (s.yocWithheld) {
    return (
      <span title={s.yocWithheld}>
        n/a <span className={micro}>yoc</span>
      </span>
    );
  }
  if (s.noteYield) {
    const own = ownYieldOf(s.capWithheld);
    return (
      <span title={own.title}>
        <span className="font-mono tabular-nums">{s.noteYield}</span> <span className={micro}>{own.micro}</span>
      </span>
    );
  }
  if (s.capWithheld) return <span title={CAP_WITHHELD[s.capWithheld].title}>n/a cap</span>;
  return null;
}

/** One deal on the board: its picture, its name, its price and its figure,
 *  then its call and the stage select that moves it. */
const BoardCard = memo(function BoardCard({
  d,
  compareMode,
  checked,
  onToggle,
  todayIso,
  stageControl,
}: {
  d: DealCard;
  compareMode: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  todayIso: string;
  stageControl: (d: DealCard) => ReactNode;
}) {
  const isDead = normalizeStage(d.stage) === "dead";
  const asset = assetMeta(d.assetClass ?? "");
  const body = (
    <>
      <DealThumb sources={d.thumbs ?? []} cover={d.cover ?? null} label={d.name} />
      <span className="block min-w-0 flex-1">
        <span className="line-clamp-2 text-sm font-medium" title={d.name}>
          {d.name}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
          <span
            className="font-mono tabular-nums text-ink"
            title={d.slots.price ? [d.slots.price, d.slots.basis].filter(Boolean).join(" — ") : undefined}
          >
            {d.slots.price ? compactPrice(d.slots.price) : <Unstated reading={!!d.reading} width="w-12" />}
            <PriceChangeBadge change={d.priceChange} />
          </span>
          <BoardFigure d={d} />
        </span>
        {d.offersDue ? (
          <span className="mt-0.5 block text-xs">
            <OffersDueBit iso={d.offersDue} today={todayIso} />
          </span>
        ) : null}
      </span>
    </>
  );
  return (
    <li
      data-board-card={d.id}
      // The asset-class rail the list row wears; a dead deal reads grey,
      // never faded (research pass 33).
      className={`rounded-xl border border-l-[3px] border-line bg-surface shadow-card ${
        d.assetClass ? asset.rail : ""
      } ${isDead ? "grayscale" : ""}`}
    >
      {compareMode ? (
        <button
          type="button"
          onClick={() => onToggle(d.id)}
          aria-pressed={checked}
          data-deal-nav
          className={`flex w-full items-start gap-2.5 rounded-xl p-2.5 text-left transition-colors ${
            checked ? "bg-brand/5" : "hover:bg-faint"
          }`}
        >
          {body}
        </button>
      ) : (
        <Link
          href={`/deals/${d.id}`}
          data-deal-nav
          className="flex items-start gap-2.5 rounded-t-xl p-2.5 transition-colors hover:bg-faint"
        >
          {body}
        </Link>
      )}
      <div className="flex items-center gap-2 border-t border-line px-2.5 py-2">
        <span className="flex shrink-0">
          <TileCall d={d} />
        </span>
        {!compareMode && <span className="ml-auto block w-36 min-w-0">{stageControl(d)}</span>}
      </div>
    </li>
  );
});

/**
 * The board. `columns` is the page's own grouping of the rows it shows
 * (lib/pipeline-view `boardColumns` names the stages), each column's deals
 * in the list's sort.
 */
export function PipelineBoard({
  columns,
  compareMode,
  selected,
  onToggle,
  todayIso,
  stageControl,
}: {
  columns: BoardColumn[];
  compareMode: boolean;
  selected: ReadonlySet<string>;
  onToggle: (id: string) => void;
  /** the page's day, the offers-due countdown's */
  todayIso: string;
  /** a card's stage select, handed in as the cards' is */
  stageControl: (d: DealCard) => ReactNode;
}) {
  return (
    <ScrollRegion label="The pipeline as a board, a column a stage" className="pb-2" data-view="board">
      <div className="grid auto-cols-[minmax(15rem,20rem)] grid-flow-col gap-3">
        {columns.map(({ stage, deals }) => {
          const headingId = `board-${stage}`;
          return (
            <section
              key={stage}
              aria-labelledby={headingId}
              data-board-column={stage}
              className="flex min-w-0 flex-col rounded-2xl border border-line bg-faint p-2"
            >
              <h2 id={headingId} className="flex items-center gap-2 px-1 pb-2 pt-1">
                <span className={`text-sm font-semibold tracking-tight ${stage === "dead" ? "text-muted" : ""}`}>
                  {STAGE_LABEL[stage]}
                </span>
                <span className="rounded-full bg-surface px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted" data-board-count>
                  {deals.length}
                  <span className="sr-only">{deals.length === 1 ? " deal" : " deals"}</span>
                </span>
              </h2>
              {deals.length > 0 ? (
                <ul className="space-y-2">
                  {deals.map((d) => (
                    <BoardCard
                      key={d.id}
                      d={d}
                      compareMode={compareMode}
                      checked={selected.has(d.id)}
                      onToggle={onToggle}
                      todayIso={todayIso}
                      stageControl={stageControl}
                    />
                  ))}
                </ul>
              ) : (
                <p className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted">
                  No deals here
                </p>
              )}
            </section>
          );
        })}
      </div>
    </ScrollRegion>
  );
}
