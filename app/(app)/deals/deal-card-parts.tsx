// The pieces the pipeline's list row and its card both draw (moved out of
// pipeline.tsx so the card, deal-tile.tsx, stands on its own): the price as
// a table wants it, the fit's and the call's words and colours, the class's
// dot, a teammate's initials, a date, the tag line, the reading shimmer and
// the fit bar. Pure: no hooks, no server actions.
import { Fragment } from "react";
import { compactUsd } from "@/lib/money";
import { parsePrice, priceRange, priceRangeShort } from "@/lib/criteria";
import { FOLD_WORD, type FitTone } from "@/lib/fit-label";
import type { DealTag, TagTone } from "@/lib/pipeline-tags";
import type { DealCard } from "./pipeline";

/** The price as a table wants it — "$68.0M", "$950k" — with the OM's own
 *  figure kept for the tooltip and the CSV. A column eighty pixels wide
 *  showed every deal as "$68,000,…" before; the raw string stays when it
 *  is not a figure at all ("Call for offers"). */
export function compactPrice(raw: string): string {
  // Guidance stated as a range stays one (#466) — "$40–42M" — where the
  // first cut showed its bottom alone, the flattering end, as the price.
  const range = priceRange(raw);
  if (range) return priceRangeShort(range);
  // The price reader's own figure: a value that is no price ("6.25% cap
  // rate", "185,000 per unit") stays as written rather than a "$6".
  const n = parsePrice(raw);
  if (n == null || !(n > 0)) return raw;
  // Rounded as every surface rounds a compact figure (lib/money): "$5.5M"
  // here had stood beside the memo's "$5.6M" for a $5,550,000 price.
  return compactUsd(n);
}

// The fit's words and the score's call; their colour is the tone's alone
// (`FIT_TONE_CLS`), never a word's own.
export const FIT_META: Record<NonNullable<DealCard["fit"]>, { label: string }> = {
  outside: { label: FOLD_WORD.outside },
  near: { label: FOLD_WORD.near },
  fits: { label: FOLD_WORD.fits },
};

/** A fit's colour by its tone (lib/fit-label `fitTone`): the call's, and
 *  muted — never green — while a criterion the price decides could not be
 *  checked, as the deal header's chip is. */
export const FIT_TONE_CLS: Record<FitTone, string> = {
  pass: "text-pass",
  caution: "text-caution",
  kill: "text-kill",
  muted: "text-muted",
};

export const VERDICT_META: Record<string, { label: string; cls: string }> = {
  pass_on: { label: "No-go", cls: "bg-kill/15 text-kill" },
  caution: { label: "Caution", cls: "bg-caution/10 text-caution" },
  pass: { label: "Go", cls: "bg-pass/10 text-pass" },
};

/** Each asset class reads as its own kind of thing at a glance: a colour dot
 *  beside the class name and a thin rail down the row's left edge, one hue per
 *  class (tokens in globals.css). Deliberately quiet — the verdict colours
 *  still carry the loudest signal on the row. */
const ASSET_META: Record<string, { dot: string; rail: string }> = {
  multifamily: { dot: "bg-asset-multifamily", rail: "border-l-asset-multifamily" },
  office: { dot: "bg-asset-office", rail: "border-l-asset-office" },
  industrial: { dot: "bg-asset-industrial", rail: "border-l-asset-industrial" },
  retail: { dot: "bg-asset-retail", rail: "border-l-asset-retail" },
};
const OTHER_ASSET = { dot: "bg-asset-other", rail: "border-l-asset-other" };
export const assetMeta = (cls: string) => ASSET_META[cls.toLowerCase()] ?? OTHER_ASSET;

/** "Jordan Lee" → "JL"; an email → its first letter. */
export function initials(name: string): string {
  const parts = name.split(/[\s._-]+/).filter(Boolean);
  const letters = parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 1);
  return letters.toUpperCase();
}

// One cached formatter — constructing Intl.DateTimeFormat per call costs
// ~50ms per full-list render at 500 rows. Pinned to UTC so the server and
// client render the same string (no hydration mismatch from timezones).
const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export function fmtDate(iso: string): string {
  return DATE_FMT.format(new Date(iso));
}

/** A tag's tone in its words, and in the outline its chip wears on a line
 *  of its own (on the picture, a chip is white). */
export const TAG_TEXT: Record<TagTone, string> = { brand: "text-brand", caution: "text-caution", kill: "text-kill", muted: "text-muted" };
const TAG_BORDER: Record<TagTone, string> = { brand: "border-brand/30", caution: "border-caution/35", kill: "border-kill/35", muted: "border-line" };

/** A deal's tags (lib/pipeline-tags) on a line of their own under its
 *  figures, wrapping: a chip each, never cut — a tag longer than the line
 *  wraps inside its chip rather than losing its end, and a figure never
 *  shares a line with them, so no tag can push a figure off one. The
 *  caller names the line's display (`flex`, or a card's width tiers'), and
 *  a card's own tiers for each chip. */
export function TagLine({
  tags,
  className = "flex",
  chipClass,
}: {
  tags: readonly DealTag[];
  className?: string;
  chipClass?: (t: DealTag) => string;
}) {
  if (tags.length === 0) return null;
  return (
    <p className={`flex-wrap gap-1 ${className}`} data-tags="line">
      {tags.map((t, idx) => (
        <Fragment key={t.key}>
          {idx > 0 && " "}
          <span
            title={t.title}
            className={`max-w-full rounded-full border bg-surface px-2 py-0.5 text-[11px] font-semibold leading-tight ${TAG_BORDER[t.tone]} ${TAG_TEXT[t.tone]} ${chipClass?.(t) ?? ""}`}
          >
            {t.text}
          </span>
        </Fragment>
      ))}
    </p>
  );
}

/** A slot the live screen has not read yet: a quiet shimmer where the figure
 *  will land (`.skeleton` moves only where motion is welcome), named for a
 *  screen reader — never the dash that says the memorandum states none. */
function Reading({ width }: { width: string }) {
  return (
    <span
      role="img"
      aria-label="Reading the memorandum"
      title="Reading the memorandum"
      data-reading
      className={`skeleton inline-block h-3.5 rounded align-middle ${width}`}
    />
  );
}

/** A figure's empty slot: the shimmer while the terms are being read, the
 *  dash once a read has found none. */
export function Unstated({ reading, width, className = "text-line" }: { reading: boolean; width: string; className?: string }) {
  return reading ? <Reading width={width} /> : <span className={className}>—</span>;
}

/** The mandate score drawn: a 0–100 bar in the current text colour (the
 *  call's), so a row reads its fit before the number does. */
export function FitBar({ score }: { score: number }) {
  return (
    <span aria-hidden data-fit-bar className="h-1 w-10 overflow-hidden rounded-full bg-faint">
      <span
        className="block h-full rounded-full bg-current"
        style={{ width: `${Math.max(0, Math.min(100, score))}%` }}
      />
    </span>
  );
}

/** A call's tooltip: the call and the day it was written ("Caution —
 *  screened Sep 12, 2026"), or the call alone for one saved before the
 *  pipeline dated it. */
export function callTitle(label: string, screened: DealCard["screened"]): string {
  return screened ? `${label} — screened ${screened.on}` : label;
}

