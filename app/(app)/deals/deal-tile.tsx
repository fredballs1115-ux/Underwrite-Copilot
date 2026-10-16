"use client";

// The pipeline's card (#428), moved out of pipeline.tsx so a page can draw
// the card — the sample's on an empty pipeline or a public page
// (`DealTilePreview`) — without loading the whole pipeline: the list, the
// map, the filters and the new-deal form stay there.
import { PriceChangeBadge } from "./price-change-badge";
import {
  Fragment,
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import { DealBanner } from "./deal-banner";
import { GalleryCreditPartsText } from "@/app/credit-parts";
import { bannerSizes, shownMarketCredits } from "@/lib/deal-banner";
import { PIPELINE_CARD_SIZES } from "@/lib/pipeline-view";
import { assetClassLabel } from "@/lib/asset-class";
import { OffersDueBit } from "./offers-due-bit";
import { PERSONAL_TAG, PICTURE_TIERS, dealTags, olderScreenTag, placeTagsByTier } from "@/lib/pipeline-tags";
import { FIRST_READ_TITLE } from "@/lib/first-read";
import { CAP_WITHHELD, ownYieldOf } from "@/lib/cap-slot";
import { checkedOf, checkedSentence, fitTone } from "@/lib/fit-label";
import { STAGE_LABEL, normalizeStage } from "@/lib/stages";
import {
  FIT_META,
  FIT_TONE_CLS,
  FitBar,
  TAG_TEXT,
  TagLine,
  Unstated,
  VERDICT_META,
  assetMeta,
  callTitle,
  compactPrice,
  fmtDate,
} from "./deal-card-parts";
import { PersonBadge } from "../person-badge";
import { displayName } from "@/lib/person";
import type { DealCard } from "./pipeline";

/** Drawn at the picture widths a mask names — one digit a tier of
 *  lib/pipeline-tags `PICTURE_TIERS`: under 278px, 278 to 347, 348 up — as
 *  the card's picture and tag row ask of themselves (`@container/card`).
 *  A chip shows as a block (a flex item either way); the line as a flex
 *  row. Every class is written out whole, for Tailwind's scanner. */
const AT_TIERS: Record<string, { block: string; flex: string }> = {
  "111": { block: "", flex: "flex" },
  "100": { block: "@min-[278px]/card:hidden", flex: "flex @min-[278px]/card:hidden" },
  "010": { block: "hidden @min-[278px]/card:block @min-[348px]/card:hidden", flex: "hidden @min-[278px]/card:flex @min-[348px]/card:hidden" },
  "001": { block: "hidden @min-[348px]/card:block", flex: "hidden @min-[348px]/card:flex" },
  "110": { block: "@min-[348px]/card:hidden", flex: "flex @min-[348px]/card:hidden" },
  "011": { block: "hidden @min-[278px]/card:block", flex: "hidden @min-[278px]/card:flex" },
  "101": { block: "@min-[278px]/card:hidden @min-[348px]/card:block", flex: "flex @min-[278px]/card:hidden @min-[348px]/card:flex" },
  "000": { block: "hidden", flex: "hidden" },
};
const atTiers = (shown: readonly boolean[]) => AT_TIERS[shown.map((on) => (on ? "1" : "0")).join("")] ?? AT_TIERS["111"];

/** A card's call, drawn solid so it reads over any photograph: the
 *  verdict in its colour, a failed or stalled run over the verdict it left
 *  behind, a live screen, or the empty ring of a deal not yet screened. */
const TILE_CALL: Record<string, string> = {
  pass: "bg-pass text-white",
  caution: "bg-caution text-white",
  pass_on: "bg-kill text-white",
};

function TileCall({ d }: { d: DealCard }) {
  const v = d.verdict ? VERDICT_META[d.verdict] : null;
  const pill = "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold leading-none shadow-sm";
  if (d.jobStatus === "failed") {
    return (
      <span className={`${pill} bg-kill text-white`} title="The latest screen failed — open the deal to see why and try again">
        Failed
      </span>
    );
  }
  if (d.jobStatus === "stalled") {
    return (
      <span className={`${pill} bg-caution text-white`} title="The run stopped writing progress — open the deal to start it again">
        Stalled
      </span>
    );
  }
  // A screen in flight outranks the call it will replace: a re-screen's
  // terms are already rewriting under the old verdict.
  if (d.jobStatus === "running") {
    return (
      <span className={`${pill} bg-white/95 text-ink`} title={v ? `Re-screening — the previous call was ${v.label}` : undefined}>
        <span aria-hidden className="pulse-bar h-1.5 w-1.5 rounded-full bg-brand" />
        {v ? "Re-screening…" : d.hasOm === false ? "Screening the facts…" : "Reading the OM…"}
      </span>
    );
  }
  // The day the call was written, in its tooltip: a call nine months old
  // had read like yesterday's (research pass 42).
  if (v && d.verdict)
    return (
      <span className={`${pill} ${TILE_CALL[d.verdict] ?? "bg-white/95 text-ink"}`} title={callTitle(v.label, d.screened)}>
        {v.label}
      </span>
    );
  return (
    <span className={`${pill} bg-white/90 py-1.5 text-muted`} title="Not screened yet — open the deal to run the screen">
      <span aria-hidden className="h-2.5 w-2.5 rounded-full border-[1.5px] border-dashed border-muted/70" />
      <span className="sr-only">Not screened</span>
    </span>
  );
}

function TileStat({
  label,
  title,
  sub,
  badge,
  children,
}: {
  label: string;
  title?: string;
  sub?: string | null;
  /** a mark on its own line under the figure (the price's move, research
   *  pass 24 B14): beside the figure in a column this narrow, the figure's
   *  truncation clipped it (audit C8, M6) */
  badge?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-sm tabular-nums text-ink" title={title}>
        {children}
      </dd>
      {badge ? (
        <dd className="mt-0.5 leading-none" data-qa="tile-badge">
          {badge}
        </dd>
      ) : null}
      {/* A second figure under the first, as a listing card prints the
          price per unit under the price (#469). */}
      {sub && <dd className="truncate font-mono text-[10px] tabular-nums text-muted" data-qa="tile-sub">{sub}</dd>}
    </div>
  );
}

// The card view's deal (#428): the building's picture first — its own
// photograph or the Street View frame, else the photograph its market is
// known by, named as the market's (#438), and outside every photographed
// market the deal's cover, never an overhead (#442); each pinned with its
// credit — the call over the picture, then the name, the place and the
// three figures a pipeline is read by. Memoized like the row.
export const DealTile = memo(function DealTile({
  d,
  i,
  compareMode,
  checked,
  onToggle,
  onMarket,
  todayIso,
  preview,
  stageControl,
  lazy = false,
}: {
  d: DealCard;
  i: number;
  compareMode: boolean;
  checked: boolean;
  onToggle: (id: string) => void;
  /** told which market photograph the card shows, for the page's credit */
  onMarket?: (dealId: string, marketId: string | null) => void;
  /** the page's day, the offers-due countdown's (`Pipeline`'s `todayIso`) */
  todayIso: string;
  /** the card shown outside the reader's pipeline (`DealTilePreview`): it
   *  opens `href` in place of the deal's page, or is a still picture of
   *  the card with none, and its footer names the stage rather than
   *  offering a change to it */
  preview?: TilePreviewTarget;
  /** the footer's stage control, which the pipeline hands in (`StageSelect`,
   *  a server action's form): this module imports none, so a page that
   *  draws only the preview — the homepage — loads no server action */
  stageControl?: (d: DealCard) => ReactNode;
  /** asked for as it nears the screen, whatever its place: a card far down
   *  a page (the homepage's) is no first picture */
  lazy?: boolean;
}) {
  const dealId = d.id;
  const reportMarket = useCallback((marketId: string | null) => onMarket?.(dealId, marketId), [dealId, onMarket]);
  // The deal's photographs, flipped through on the card (#450): which one is
  // on screen, and whether the deal's own photograph is the picture at all
  // (a card whose photograph failed shows its market's or its cover, and
  // offers nothing to flip through).
  // A photograph that fails to load is dropped from the set, so the arrows,
  // the dots and the count never point at a picture the card cannot show.
  const [dead, setDead] = useState<ReadonlySet<string>>(new Set());
  const slides = useMemo(() => (d.slides ?? []).filter((s) => !dead.has(s.src)), [d.slides, dead]);
  const [slideAsked, setSlide] = useState(0);
  // Told by the banner once the deal's own photograph is whole on screen:
  // the arrows and the dots wait for it, as its count and credit do, so
  // nothing points at photographs over the cover that holds the frame.
  const [photoOn, setPhotoOn] = useState(false);
  const canFlip = !compareMode && photoOn && slides.length > 0;
  const count = slides.length + 1;
  const slide = slideAsked < count ? slideAsked : 0;
  const go = (step: number) => setSlide((s) => ((s < count ? s : 0) + step + count) % count);
  const dropSlide = useCallback((src: string) => setDead((g) => new Set(g).add(src)), []);
  // The next photograph is asked for before it is wanted: on the first
  // hover, then one ahead of wherever the reader is.
  const [warm, setWarm] = useState(false);
  useEffect(() => {
    if (!canFlip || !warm) return;
    const next = slides[slide % slides.length];
    if (!next) return;
    // Asked as the card's picture will ask it (research pass 29): the card
    // copy or the hero, whichever the browser takes for the card, never both.
    const ahead = new Image();
    const sizes = bannerSizes(next, PIPELINE_CARD_SIZES, 16 / 10);
    if (next.srcSet && sizes) {
      ahead.sizes = sizes;
      ahead.srcset = next.srcSet;
    }
    ahead.src = next.src;
  }, [canFlip, warm, slide, slides]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const isDead = normalizeStage(d.stage) === "dead";
  const asset = assetMeta(d.assetClass ?? "");
  const place = d.coveredMarket ?? d.readMarket ?? d.market;
  const scored = d.score != null && d.mandateVerdict ? { score: d.score, verdict: d.mandateVerdict } : null;
  // The deal header's chip's colour rule (lib/fit-label `fitTone`): red on a
  // miss outright, and never green while a criterion the price decides
  // could not be checked.
  const fitCls = scored ? FIT_TONE_CLS[fitTone(scored.verdict, d.fit, d.fitCoverage)] : "";
  // How many of the box's criteria the fit stands on, under it, where not
  // every one could be checked: "2 of 4 checked", which ones in its tooltip.
  const fitChecked = scored || d.fit ? checkedOf(d.fitCoverage) : null;
  const fitCheckedNote = fitChecked ? checkedSentence(d.fitCoverage) : null;
  // What the picture must not hide — a Special Flood Hazard Area, how it is
  // sold, what the price buys where it is not the building, the seller's
  // loan… (lib/pipeline-tags). A chip rides on the picture only where it
  // fits whole on a picture as wide as this card's (each of the tiers'
  // widths, asked by container query), two at most; the rest wait on the
  // card's line under the figures. A chip is never cut: the picture's had
  // truncated "Shadow-anchored, 56% rolls in 5 …" at 390px.
  const placed = placeTagsByTier(dealTags(d.slots, d.flood));
  const pictureTags = placed.filter((p) => p.onPicture.some(Boolean));
  const lineTags = placed.filter((p) => p.onPicture.some((on) => !on));
  const lineAt = new Map(lineTags.map((p) => [p.tag.key, p.onPicture.map((on) => !on)]));
  // A screen stored before a reader its figures turn on (lib/older-screen),
  // and a deal the reader's team does not see, say so on the line at every
  // width, after the tags; never on the picture, which carries what the
  // building's figures must not hide.
  const older = olderScreenTag(d.older);
  const lineShown = PICTURE_TIERS.map((_, k) => !!d.personal || !!older || lineTags.some((p) => !p.onPicture[k]));

  const inner = (
    <>
      {/* A container (`@container/card`), so the chips on it ask the
          picture's own width. */}
      <div className="@container/card relative">
        <DealBanner
          sources={d.pictures ?? []}
          cover={d.cover ?? null}
          label={d.name}
          aspect="16/10"
          flush
          shade
          priority={i < 4 && !lazy}
          photos={d.photos ? d.photos - dead.size : 0}
          slides={slides}
          slide={canFlip ? slide : 0}
          onPhoto={setPhotoOn}
          onSlideGone={dropSlide}
          onMarket={reportMarket}
          sizes={PIPELINE_CARD_SIZES}
        />
        {/* The call, and in compare mode the pick beside it: the foot of the
            picture is the market photograph's caption (#438). */}
        <span className="absolute left-3 top-3 flex items-center gap-1.5">
          <TileCall d={d} />
          {compareMode && (
            <span
              aria-hidden
              className={`flex h-6 w-6 items-center justify-center rounded-md border-2 shadow-sm ${
                checked ? "border-brand bg-brand text-white" : "border-white bg-white/80"
              }`}
            >
              {checked && (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              )}
            </span>
          )}
        </span>
        {pictureTags.length > 0 && (
          // Inside the column's 58%, never past it: a flex item sized to its
          // content ran leftward over the call. Every chip here fits that
          // column whole on the narrowest card (lib/pipeline-tags), so none
          // is truncated.
          <span className="absolute right-3 top-3 flex max-w-[58%] flex-col items-end gap-1" data-tags="picture">
            {pictureTags.map(({ tag: t, onPicture }, idx) => (
              <Fragment key={t.key}>
                {idx > 0 && " "}
                <span
                  title={t.title}
                  className={`max-w-full rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-semibold shadow-sm ${TAG_TEXT[t.tone]} ${atTiers(onPicture).block}`}
                >
                  {t.text}
                </span>
              </Fragment>
            ))}
          </span>
        )}
      </div>
      {/* The card's rows — the picture, the name and place, the figures,
          the tags under them — are the grid row's own (`grid-rows-subgrid`
          on the card), so a row of cards lines up its figures whatever the
          names' lengths, and whichever cards carry tags under them. */}
      <div className="px-4 pb-3 pt-3">
        <p className="line-clamp-2 text-[15px] font-semibold leading-snug tracking-tight" title={d.name}>
          {d.name}
        </p>
        <p className="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted">
          {d.assetClass ? (
            <>
              <span aria-hidden className={`h-1.5 w-1.5 shrink-0 rounded-full ${asset.dot}`} />
              <span className="shrink-0">{assetClassLabel(d.assetClass)}</span>
            </>
          ) : null}
          {d.assetClass && place ? <span aria-hidden>·</span> : null}
          {place ? (
            <span className="truncate" title={place}>
              {place}
            </span>
          ) : null}
        </p>
      </div>
      {/* The price is the longest figure ("$9–9.5M", "$124.5M"), so its
          column is the widest. */}
      <dl className="grid grid-cols-[minmax(0,4fr)_minmax(0,3fr)_minmax(0,3fr)] gap-3 border-t border-line mx-4 pt-3">
        {/* While a first screen has not read the terms, an empty slot
            shimmers ("not read yet"); once a read finds none, the dash
            ("not stated"). */}
        <TileStat
          label="Price"
          title={d.slots.price ?? undefined}
          sub={d.slots.basis}
          badge={d.priceChange ? <PriceChangeBadge change={d.priceChange} inline={false} /> : null}
        >
          {d.slots.price ? compactPrice(d.slots.price) : <Unstated reading={!!d.reading} width="w-14" />}
        </TileStat>
        {/* A plan deal has no going-in cap; its yield on total cost takes
            the slot, labelled. Nor has a note: its yield to maturity
            takes it where the note pays or may, else it says n/a. */}
        <TileStat
          label={
            // A plan deal is judged on its yield on total cost, stated or
            // not: a dash under "Cap" read as a cap the memorandum left out.
            !d.slots.cap && (d.slots.yoc || d.slots.plan)
              ? "Yield on cost"
              : !d.slots.cap && d.slots.noteYield
                ? ownYieldOf(d.slots.capWithheld).label
                : "Cap"
          }
          title={
            !d.slots.cap && !d.slots.yoc && d.slots.capWithheld
              ? CAP_WITHHELD[d.slots.capWithheld].title
              : !d.slots.cap && !d.slots.yoc && d.slots.yocWithheld
                ? d.slots.yocWithheld
                : undefined
          }
          sub={
            !d.slots.cap && !d.slots.yoc && d.slots.noteYield
              ? ownYieldOf(d.slots.capWithheld).to
              : // A note under water: no yield, and why, on the card's face
                // (research pass 38).
                !d.slots.cap && !d.slots.yoc && d.slots.capWithheld === "under_water"
                ? "under water"
                : undefined
          }
        >
          {d.slots.cap ??
            d.slots.yoc ??
            d.slots.noteYield ??
            (d.slots.capWithheld || d.slots.yocWithheld ? "n/a" : <Unstated reading={!!d.reading} width="w-10" />)}
        </TileStat>
        <div className="min-w-0">
          <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">Fit</dt>
          <dd className="mt-0.5 text-sm font-semibold">
            {scored ? (
              <span
                className={`flex items-center gap-1.5 tabular-nums ${fitCls}`}
                title={[`${scored.score} / 100 mandate fit`, fitCheckedNote?.replace(/\.$/, ""), d.fitFirstRead ? FIRST_READ_TITLE : null]
                  .filter(Boolean)
                  .join(". ")}
              >
                {scored.score}
                <FitBar score={scored.score} />
              </span>
            ) : d.fit ? (
              <span
                className={FIT_TONE_CLS[fitTone(null, d.fit, d.fitCoverage)]}
                title={[fitCheckedNote, d.fitFirstRead ? FIRST_READ_TITLE : null].filter(Boolean).join(" ") || undefined}
              >
                {FIT_META[d.fit].label}
              </span>
            ) : (
              <Unstated reading={!!d.reading && !!d.hasBox} width="w-12" className="font-normal text-line" />
            )}
          </dd>
          {/* Not every criterion of the box could be checked: how many were,
              under the fit, as the deal header's chip says it. */}
          {fitChecked ? (
            <dd className="truncate text-[10px] font-medium text-muted" title={fitCheckedNote ?? undefined} data-qa="fit-checked">
              {fitChecked}
            </dd>
          ) : null}
          {/* Judged on the first signal while the extraction is on its
              way: said under the fit, as the deal page says it. */}
          {d.fitFirstRead && (scored || d.fit) ? (
            <dd className="truncate text-[10px] font-medium uppercase tracking-wide text-brand" title={FIRST_READ_TITLE} data-qa="fit-first-read">
              First read
            </dd>
          ) : null}
        </div>
      </dl>
      {/* The tags the picture could not carry whole, on a line of their own
          under the figures, at the widths where it could not; a card with
          none keeps only the padding. A container, as the picture is, so
          the two ask the same width. */}
      <div className="@container/card pb-3.5">
        <TagLine
          tags={[...lineTags.map((p) => p.tag), ...(older ? [older] : []), ...(d.personal ? [PERSONAL_TAG] : [])]}
          className={`px-4 pt-2.5 ${atTiers(lineShown).flex}`}
          chipClass={(t) => atTiers(lineAt.get(t.key) ?? []).block}
        />
      </div>
    </>
  );

  return (
    <li
      style={{ "--i": i } as React.CSSProperties}
      data-deal-tile={d.id}
      onPointerEnter={canFlip && !warm ? () => setWarm(true) : undefined}
      onTouchStart={
        canFlip
          ? (e) => {
              const t = e.touches[0];
              const inPicture = (e.target as Element).closest("[data-deal-banner],[data-flip]");
              touch.current = t && inPicture ? { x: t.clientX, y: t.clientY } : null;
              setWarm(true);
            }
          : undefined
      }
      onTouchEnd={
        canFlip
          ? (e) => {
              const from = touch.current;
              const t = e.changedTouches[0];
              touch.current = null;
              if (!from || !t) return;
              const dx = t.clientX - from.x;
              // A swipe across the picture, not a scroll down the page.
              if (Math.abs(dx) > 40 && Math.abs(dx) > 1.5 * Math.abs(t.clientY - from.y)) go(dx < 0 ? 1 : -1);
            }
          : undefined
      }
      // Five rows of the grid's own (the picture, the name and place, the
      // figures, the tags under them, the footer), so every card in a row
      // of the grid shares their heights.
      className={`group relative row-span-5 grid grid-rows-subgrid gap-y-0 overflow-hidden rounded-2xl border bg-surface shadow-card transition duration-200 ${
        preview && !preview.href ? "" : "hover:-translate-y-0.5 hover:shadow-lg"
      } ${
        checked ? "border-brand ring-2 ring-brand/40" : "border-line"
      } ${isDead ? "grayscale" : ""}`}
    >
      {preview ? (
        <>
          {preview.href ? (
            <Link href={preview.href} title={preview.title} className="row-span-4 grid grid-rows-subgrid">
              {inner}
            </Link>
          ) : (
            // A still card: the page beside it holds the one control that
            // acts (the empty pipeline's "Try a sample deal"). A button
            // round the card was invalid — its picture, name and figures are
            // block content — and read the whole card as its name.
            <div className="row-span-4 grid grid-rows-subgrid" data-qa="tile-still">
              {inner}
            </div>
          )}
          {/* The stage the card is filed under, as words: a change to it is
              the reader's own pipeline's, never a preview's. */}
          <div className="flex items-center gap-2 border-t border-line bg-faint/60 px-4 py-2 text-[11px] text-muted">
            {preview.note ? <span className="truncate">{preview.note}</span> : null}
            <span className="ml-auto font-medium text-ink" data-qa="tile-stage">
              {STAGE_LABEL[normalizeStage(d.stage)]}
            </span>
          </div>
        </>
      ) : compareMode ? (
        <button type="button" onClick={() => onToggle(d.id)} aria-pressed={checked} className="row-span-4 grid grid-rows-subgrid text-left">
          {inner}
        </button>
      ) : (
        <>
          <Link href={`/deals/${d.id}`} className="row-span-4 grid grid-rows-subgrid">
            {inner}
          </Link>
          {/* The deal's other photographs (#450), flipped through where a
              listing's card lets you, once its own photograph is whole on
              screen. Outside the link, over the picture: a button inside an
              anchor is invalid, and the card's click still opens the deal. */}
          {canFlip ? <PhotoFlip name={d.name} count={count} slide={slide} onStep={go} /> : null}
          {/* Outside the link: a select inside an anchor is invalid, and the
              stage is changed here without leaving the pipeline. */}
          <div className="flex items-center gap-2 border-t border-line bg-faint/60 px-4 py-2 text-[11px] text-muted">
            {d.offersDue ? (
              <OffersDueBit iso={d.offersDue} today={todayIso} />
            ) : (
              <span className="font-mono tabular-nums">{fmtDate(d.createdAt)}</span>
            )}
            {d.addedBy ? (
              <span className="inline-flex items-center" title={`Added by ${displayName(d.addedBy)}`}>
                <PersonBadge name={d.addedBy} size="xs" decorative />
                <span className="sr-only">added by {displayName(d.addedBy)}</span>
              </span>
            ) : null}
            <span className="ml-auto">{stageControl?.(d)}</span>
          </div>
        </>
      )}
    </li>
  );
});

/** Where a card shown outside the reader's pipeline goes (`DealTilePreview`). */
type TilePreviewTarget = {
  /** a page the card opens — the public sample's, /demo; with none the
   *  card is still, and the control that acts sits beside it (the empty
   *  pipeline's "Try a sample deal", a PendingButton) */
  href?: string;
  /** the card's tooltip: where it goes */
  title?: string;
  /** a word for the card's footer, before its stage */
  note?: string;
};

/**
 * The pipeline's own card, drawn outside the reader's pipeline (the empty
 * pipeline, a public page): `DealTile` itself on a card built by lib/
 * pipeline-card, so it is the very card the pipeline shows — the picture
 * and its caption, the call on it, the name, the place, the three figures —
 * opening `href` instead of the deal's page, or still where none is given
 * (the control that acts sits beside it, never round it), with no
 * stage control and no photographs to flip. Under it, the one credit line
 * the pipeline prints under its cards, for the market photograph the card
 * settled on.
 */
export function DealTilePreview({
  d,
  href,
  title,
  note,
  todayIso,
  className = "grid",
  lazy = false,
}: {
  d: DealCard;
  /** the day the offers-due countdown counts from */
  todayIso: string;
  /** the list's classes: its width and grid */
  className?: string;
  /** the picture asked for lazily, at no high priority (a card far down
   *  the page); the empty pipeline's card, on the first screen, is not */
  lazy?: boolean;
} & TilePreviewTarget) {
  const [shown, setShown] = useState<ReadonlyMap<string, string | null>>(new Map());
  const onMarket = useCallback((id: string, marketId: string | null) => {
    setShown((prev) => (prev.has(id) && prev.get(id) === marketId ? prev : new Map(prev).set(id, marketId)));
  }, []);
  const credits = shownMarketCredits([d], shown);
  const card = useMemo(() => ({ ...d, slides: [], photos: 0 }), [d]);
  return (
    <div>
      <ul className={className} data-view="cards">
        <DealTile
          d={card}
          i={0}
          compareMode={false}
          checked={false}
          onToggle={noop}
          onMarket={onMarket}
          todayIso={todayIso}
          preview={{ href, title, note }}
          lazy={lazy}
        />
      </ul>
      {credits.length > 0 ? (
        <p className="mt-2 text-[11px] leading-relaxed text-muted" data-qa="market-photo-credit">
          <GalleryCreditPartsText credits={credits} linkClassName="underline decoration-dotted underline-offset-2 hover:text-ink" />
        </p>
      ) : null}
    </div>
  );
}

function noop() {}

/**
 * A card's way through its deal's photographs (#450), over the picture: an
 * arrow each side, shown on hover or focus and always on a touch screen,
 * named for the deal, and a dot a photograph on a dark pill — five at
 * most, a window round the one on screen. The card draws it only once its
 * own photograph is whole on screen, and it fades in with it. Pure, so a
 * test draws it.
 */
export function PhotoFlip({
  name,
  count,
  slide,
  onStep,
}: {
  /** the deal's name, for the arrows' accessible names */
  name: string;
  /** how many photographs there are to flip through, the lead one included */
  count: number;
  /** the one on screen, from 0 */
  slide: number;
  onStep: (step: number) => void;
}) {
  const first = Math.min(Math.max(0, slide - 2), Math.max(0, count - 5));
  return (
    <div
      data-flip="photos"
      className="pointer-events-none absolute inset-x-0 top-0 flex aspect-[16/10] items-center justify-between px-2 transition-opacity duration-500 ease-out starting:opacity-0"
    >
      {[-1, 1].map((step) => (
        <button
          key={step}
          type="button"
          onClick={() => onStep(step)}
          aria-label={`${step < 0 ? "Previous" : "Next"} photo of ${name}`}
          data-flip-step={step}
          className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-ink shadow-md opacity-0 transition hover:bg-white focus-visible:opacity-100 focus-on-photo group-hover:opacity-100 pointer-coarse:opacity-90"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="h-4 w-4">
            <path d={step < 0 ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
          </svg>
        </button>
      ))}
      {/* On a dark pill, the photograph count's own: bare white dots went
          missing over a bright sky or a white facade (research pass 29). */}
      {count > 1 ? (
        <span
          aria-hidden
          data-flip="dots"
          className="absolute bottom-7 left-1/2 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-1.5 py-1"
        >
          {Array.from({ length: Math.min(count, 5) }, (_, k) => (
            <span key={first + k} className={`h-1.5 w-1.5 rounded-full ${first + k === slide ? "bg-white" : "bg-white/50"}`} />
          ))}
        </span>
      ) : null}
    </div>
  );
}

