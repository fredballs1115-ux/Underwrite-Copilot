// A pipeline card's data, built from a deal row: the figures, the fit, the
// tags and the pictures the pipeline's card (`DealTile`) and its list row
// draw (#428). One builder, so the pipeline page and a page that shows the
// sample deal's card draw the same card from the same readers — the sample's
// Philadelphia market photograph with its caption and credit, "Caution" on
// it, $68M with its basis under it — never a copy of the card's figures.
//
// No I/O: the page reads the rows, the jobs, the deadlines, the teammates'
// names and the buy box, and hands each deal's to `pipelineCard`. It reads
// lib/market-county and lib/deal-picture, so it runs on the server only.

import type { DealCard } from "@/app/(app)/deals/pipeline";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import type { StructuredAddress } from "@/lib/address";
import { CARD, THUMB, bannerSources, cardPictureSet, pictureVersion } from "@/lib/deal-banner";
import { coverFor, coverPlace } from "@/lib/deal-cover";
import { marketPictureFor } from "@/lib/market-picture";
import { PICTURE_CREDIT, galleryPage, memorandumPhotoCredit, pictureMayBeInMemorandum } from "@/lib/deal-picture";
import { cacheFresh, type DealVisualCache } from "@/lib/deal-location";
import { evaluateBuyBox, foldBuyBoxChecks, buyBoxCoverage, type BuyBox } from "@/lib/criteria";
import { dealCheckSource } from "@/lib/buy-box-chip";
import { pickSlots, readingTerms, shownAssetClass } from "@/lib/pipeline-slots";
import { floodCell, floodTag, siteFlagsStale, type SiteFlagsResult } from "@/lib/site-flags/core";
import { scoreMandateFit } from "@/lib/mandate";
import { countyOf, placeDeal } from "@/lib/market-county";
import { listJobStatus, screenedDay, screenedOn, type JobLike } from "@/lib/screen-run";
import { olderScreen } from "@/lib/older-screen";
import { SAMPLE_DEAL, SAMPLE_DEMO_BOX } from "@/lib/sample-deal";

/** A deal row as the pipeline reads it. */
export interface PipelineCardRow {
  id: string;
  name: string;
  asset_class: string | null;
  created_at: string;
  verdict: unknown;
  extraction: unknown;
  address: unknown;
  first_signal: unknown;
  user_id: string;
  team_id: string | null;
  stage: string | null;
  is_sample: boolean | null;
  site_flags?: SiteFlagsResult | null;
  photo?: DealVisualCache | null;
  om_storage_path?: string | null;
}

/** What the page read beside the row. */
export interface PipelineCardContext {
  /** the reader, so a teammate's deal names who added it */
  viewerId: string | null;
  /** the reader is on a team, so a deal no team holds is their own */
  onTeam: boolean;
  /** the buy box the deal is judged against (the team's on a team deal) */
  box: BuyBox | null;
  /** the deal's latest job */
  job?: JobLike;
  /** the teammate who added the deal, where the reader did not */
  addedByName?: string | null;
  /** the call-for-offers day (ISO), set or read from the memorandum */
  offersDue: string | null;
  /** the reader's day (ISO), the rent rules' and the countdown's */
  today: string;
  /** whether Street View can be tried at all */
  googleEnabled: boolean;
  /** the moment the location cache is judged fresh at */
  now?: number;
}

/** A stored site-flags result as the pipeline row reads it (#426). */
function floodFor(flags: SiteFlagsResult | null): { tag: string | null; cell: string } | null {
  if (!flags || flags.status === "pending") return null;
  return { tag: floodTag(flags.flood), cell: floodCell(flags.flood) };
}

/** One deal's card: the pipeline's card, its list row and its map pin. */
export function pipelineCard(d: PipelineCardRow, ctx: PipelineCardContext): DealCard {
  const extraction = d.extraction as ExtractionResult | null;
  const verdict = d.verdict as { verdict?: string } | null;
  const job = ctx.job;
  const box = ctx.box;
  // Same deterministic engine AND the same inputs as the deal page: judge
  // against the deal page's own source (lib/buy-box-chip `dealCheckSource`:
  // extraction, else first signal, with the typed address widening
  // geography, the kind the card infers — so the fit judges a
  // development's land cost, the price the card prints — and what the
  // price buys) so a deal reads identically on both surfaces.
  const checkSource = box
    ? dealCheckSource(
        extraction,
        (d.first_signal as FirstSignal | null) ?? null,
        (d.address as StructuredAddress | null) ?? null,
      )
    : null;
  const mandate = box && checkSource ? scoreMandateFit(d.asset_class ?? "", checkSource, box) : null;
  // The box's checks, read once: the fold the card draws and how many of
  // the box's criteria it stands on (lib/criteria `buyBoxCoverage`).
  const checks = box && checkSource ? evaluateBuyBox(d.asset_class ?? "", checkSource, box) : null;
  // Where the deal is, the deal page's answer (lib/market-county, #447):
  // its briefed market, else the metro area whose figures it reads — by
  // its county where its address names no place a market's keywords know.
  // Site flags looked up for an address since edited are the old one's.
  const rowAddress = (d.address as StructuredAddress | null) ?? null;
  const storedFlags = d.site_flags ?? null;
  const flags = siteFlagsStale(storedFlags, rowAddress?.label) ? null : storedFlags;
  const placement = placeDeal(rowAddress, countyOf(rowAddress, flags));
  // Running, stalled (its process died mid-screen — a deploy, most
  // often) or failed with the verdict left behind; a failure that never
  // touched the verdict leaves the pill alone (lib/screen-run.ts).
  const jobStatus = listJobStatus(job, !!verdict?.verdict);
  const shownClass = shownAssetClass(d.asset_class, extraction);

  // The card's pictures, best first and each pinned with its credit
  // (#428, the compare page's rule): the deal's own photograph — or the
  // memorandum's cover on its first ask — then Street View, then the
  // photograph the deal's market is known by, named as the market's
  // (#438). No overhead (#442): the pipeline's rule is pictures, not
  // maps, so where no photograph answers the card wears the deal's
  // cover, and the list row's thumbnail the same, at its own frame.
  const pictures = (() => {
    const cache = d.photo ?? null;
    const address = rowAddress;
    const unread = pictureMayBeInMemorandum({
      omPath: d.om_storage_path ?? null,
      isSample: !!d.is_sample,
      cache,
    });
    // A memorandum photograph lifted under older rules is asked for
    // again like one not yet looked for (#444): over the next picture,
    // taking over only if today's search keeps it.
    const picture = unread ? null : (cache?.picture ?? null);
    const market = marketPictureFor(address, extraction?.market ?? null, placement.briefed ?? placement.read, placement.county);
    const facts = {
      dealId: d.id,
      pictureCredit: picture ? PICTURE_CREDIT[picture.source] : null,
      // Its colours before its pixels (#463): the blur-up the frame
      // shows until the photograph has loaded whole.
      picturePreview: picture?.preview ?? null,
      // Its version in its URL, so the browser keeps it until it is
      // replaced rather than asking again on every view.
      pictureVersion: picture ? pictureVersion(picture.hero) : null,
      // Its sizes, so a card is offered the 800px card copy beside the
      // hero and takes the one its slot needs (research pass 29).
      pictureSizes: picture,
      memorandumUnread: unread,
      googleEnabled: ctx.googleEnabled,
      hasStreetAddress: !!address?.street?.trim(),
      hasAddress: !!address?.label?.trim(),
      aerial: false,
    };
    return {
      pictures: bannerSources({ ...facts, market }, CARD),
      // No market photograph on a row: a skyline is a panorama, a sliver
      // at 48px, and its licence wants the photographer named beside it,
      // which a row's slot has no room for. The building's own
      // photograph, then its cover.
      thumbs: bannerSources(facts, THUMB),
      cover: coverFor({
        seed: d.id,
        assetClass: shownClass,
        place: coverPlace(address, market?.name, extraction?.market),
      }),
      // How many photographs the deal page holds (#448): the cover and
      // the memorandum's others, counted on the card over its photograph.
      photos: picture && !d.is_sample ? 1 + (cache?.gallery?.length ?? 0) : 0,
      // …and flipped through on the card (#450), each with its own page's
      // credit, only where the card leads with the deal's own photograph.
      slides:
        picture && !d.is_sample
          ? (cache?.gallery ?? []).map((g, k) => {
              // A page the deal's owner wrote is printed only as a page number.
              const page = galleryPage(g.page);
              const v = pictureVersion(g.hero);
              return {
                kind: "photo" as const,
                src: `/api/deals/${encodeURIComponent(d.id)}/picture?size=hero&g=${k + 1}${v ? `&v=${encodeURIComponent(v)}` : ""}`,
                credit: memorandumPhotoCredit(page),
                alt: page
                  ? `Photograph from page ${page} of the memorandum for ${d.name}`
                  : `Photograph from the memorandum for ${d.name}`,
                // Its card copy beside its hero (research pass 29).
                ...cardPictureSet(d.id, g, v, k + 1),
              };
            })
          : [],
    };
  })();

  // Where the deal is, from the location its pictures were drawn at
  // (#431): read from the cache only — the list never geocodes; the map
  // places the rest on its own first view.
  const where = (() => {
    const cache = d.photo ?? null;
    if (!cacheFresh(cache, ctx.now ?? Date.now(), rowAddress)) return { place: null };
    if (cache?.geoMiss) return { place: null, placeMiss: true };
    return typeof cache?.lat === "number" && typeof cache?.lng === "number"
      ? {
          place: {
            lat: cache.lat,
            lng: cache.lng,
            precision: cache.geoPrecision ?? (rowAddress?.street?.trim() ? "street" : "area"),
            ...(cache.geoSource ? { source: cache.geoSource } : {}),
          },
        }
      : { place: null };
  })();

  return {
    id: d.id,
    name: d.name,
    // "auto" is the create form's choice, not a class: the row shows what
    // the extraction read the deck as, and nothing until it has.
    assetClass: shownClass,
    createdAt: d.created_at,
    verdict: verdict?.verdict ?? null,
    // The day the call on file was written (lib/screen-run `screenedOn`):
    // the card's and the row's call say it, the CSV writes it. None for a
    // deal with no call — never the day it was added.
    screened: (() => {
      const at = verdict?.verdict ? (d.verdict as { generatedAt?: string } | null)?.generatedAt : null;
      const on = screenedOn(at);
      const day = screenedDay(at);
      return on && day ? { on, day } : null;
    })(),
    stage: (d.stage as DealCard["stage"]) ?? "screening",
    // Any miss → outside; else any near-miss → near; all-pass → fits.
    // Unknown-only results (nothing checkable yet) stay null and render as —.
    fit: checks ? foldBuyBoxChecks(checks) : null,
    // How many of the box's criteria the fit stands on: the card says "2
    // of 4 checked" where not every one could be, and draws no green while
    // one the price decides is among them, as the deal header's chip does
    // — the score's cash-on-cash floor and red lines counted with them.
    fitCoverage: checks ? buyBoxCoverage(checks, mandate) : null,
    score: mandate?.score ?? null,
    mandateVerdict: mandate?.verdict ?? null,
    // Judged on the first signal alone until the extraction lands — the
    // deal page's "First read" (its buy-box panel's provisional rule).
    fitFirstRead: !extraction && !!d.first_signal,
    addedBy: d.team_id && d.user_id !== ctx.viewerId ? (ctx.addedByName ?? "Teammate") : null,
    // On a team, a deal no team holds is the reader's own and the team
    // does not see it — filed there once the team's trial deals are in
    // use, or added before the reader joined (lib/personal-deal).
    personal: ctx.onTeam && !d.team_id,
    market: extraction?.market ?? "",
    // The same placement the deal page makes — the list and the detail
    // agree on whether an address sits inside the briefed markets.
    coveredMarket: placement.briefed?.name ?? null,
    // A metro area the site reads without a brief, or one the deal's
    // county placed it in: named, and said how, so the row never reads
    // as "no figures".
    readMarket: placement.read?.name ?? null,
    readCounty: placement.placedBy?.county ?? null,
    offersDue: ctx.offersDue,
    // Before the extraction lands the first signal's ask fills the price,
    // as on the deal page (lib/pipeline-slots). The rent rules are read at
    // the address the row now holds, with the site flags stored for it,
    // on the reader's own day. The reader's 1031 exchange, from the box the
    // row is judged against, set against the deadline the row carries
    // (lib/exchange-deal) — on the reader's own day, as the deal header
    // reads it.
    slots: pickSlots(extraction, (d.first_signal as FirstSignal | null) ?? null, d.asset_class ?? "", {
      address: rowAddress,
      siteFlags: storedFlags,
      today: ctx.today,
    }, box?.exchange ? { block: box.exchange, offersDue: ctx.offersDue } : null),
    jobStatus,
    // A screen stored before a reader its figures turn on — what is being
    // sold — wears "Older screen", the deal page's sentence in its title
    // (lib/older-screen); never the sample or a deal typed by hand, and
    // not while a re-screen is rewriting it.
    older: jobStatus === "running" ? null : (olderScreen(extraction, { isSample: !!d.is_sample })?.line ?? null),
    // A first screen before its terms are read: an empty slot is "not
    // read yet" and shimmers, never the dash that says "not stated"
    // (lib/pipeline-slots). The fit waits with them only where a buy box
    // stands — without one its dash is final.
    reading: readingTerms(jobStatus, !!extraction, !!d.om_storage_path),
    hasOm: !!d.om_storage_path,
    hasBox: !!box,
    // Gate the aerial thumbnail here rather than letting every row fire a
    // request that can only 404: no address, no possible photograph.
    hasAddress: !!rowAddress?.label?.trim(),
    // FEMA's flood zone at the building, from the stored site-flags lookup
    // (#426): the row's tag in a Special Flood Hazard Area, the CSV's cell
    // in every case, nothing before the lookup has answered.
    flood: floodFor(flags),
    ...where,
    ...pictures,
  };
}

/**
 * The sample deal's card, as the pipeline draws it once the reader adds the
 * sample: the same row the "Try a sample deal" action inserts (lib/sample-
 * deal), read by `pipelineCard`. Judged against the box given — the public
 * sample's own (`SAMPLE_DEMO_BOX`) unless a reader's is handed in, and none
 * where `null` is, as a reader with no buy box sees their sample. Its id is
 * the cover's seed and nothing else: the sample states no street and stores
 * no photograph, so no picture of it asks a deal's own route.
 */
export function sampleDealCard(opts: {
  today: string;
  box?: BuyBox | null;
  id?: string;
  viewerId?: string | null;
  onTeam?: boolean;
}): DealCard {
  return pipelineCard(
    {
      id: opts.id ?? "sample",
      name: SAMPLE_DEAL.name,
      asset_class: SAMPLE_DEAL.asset_class,
      // A sample is added on the day it is asked for; the card's preview
      // prints no date.
      created_at: `${opts.today}T12:00:00.000Z`,
      verdict: SAMPLE_DEAL.verdict,
      extraction: SAMPLE_DEAL.extraction,
      address: SAMPLE_DEAL.address,
      first_signal: null,
      user_id: opts.viewerId ?? "",
      team_id: null,
      stage: "screening",
      is_sample: true,
      site_flags: null,
      photo: null,
      om_storage_path: null,
    },
    {
      viewerId: opts.viewerId ?? null,
      onTeam: !!opts.onTeam,
      box: opts.box === undefined ? SAMPLE_DEMO_BOX : opts.box,
      offersDue: null,
      today: opts.today,
      googleEnabled: false,
    },
  );
}
