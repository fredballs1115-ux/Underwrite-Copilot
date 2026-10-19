// Site flags card (server component): the stored background site-check —
// census tract, Opportunity Zone membership, FEMA flood zone. Renders the
// honest status for every sub-lookup; a failed lookup is a visible
// "unavailable", never a silent absence. Data: deals.site_flags
// (lib/site-flags, migration 0030).

import { isMinimalHazard, opportunityZoneRead, type SiteFlagsResult } from "@/lib/site-flags/core";
import { OSM_LOCATION_PARTS } from "@/lib/basemaps";
import { FLOOD_STRIP } from "@/lib/image-frames";
import { CreditPartsText } from "@/app/credit-parts";

/** The Flood view's frame for this deal, where the header draws one and the
 *  frame is drawn already: the URL stem (lib/flood-frame-core
 *  `floodFrameStem`, the one the Flood view asks with), the address the
 *  alt text names, whether the frame's centre is the building (the ring),
 *  and whether OpenStreetMap's geocoder placed the point (its credit). */
export type SiteFloodFrame = { stem: string; label: string; ring: boolean; osmPlaced: boolean };

/** The flood frame small, beside the chip: the filmstrip's own crop of the
 *  stored frame, so it costs no draw the Flood view does not already make,
 *  with the Flood view's credit under it. */
function FloodThumb({ frame }: { frame: SiteFloodFrame }) {
  const place = frame.label.trim() || "the deal's address";
  return (
    <figure data-qa="site-flags-flood-frame" className="w-48 shrink-0">
      <div
        className="relative overflow-hidden rounded-md border border-line bg-faint"
        style={{ aspectRatio: `${FLOOD_STRIP.w} / ${FLOOD_STRIP.h}` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- a stored crop of our own route, at its own pixels */}
        <img
          src={`${frame.stem}&w=${FLOOD_STRIP.w}&h=${FLOOD_STRIP.h}`}
          alt={`Aerial photograph of the blocks around ${place}, with FEMA's flood hazard zones drawn over it`}
          width={FLOOD_STRIP.w}
          height={FLOOD_STRIP.h}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
        {frame.ring && (
          <span
            aria-hidden
            data-picture="site-flood-pin"
            className="pointer-events-none absolute left-1/2 top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1.5px_rgba(0,0,0,0.45)]"
          />
        )}
      </div>
      <figcaption className="mt-1 text-[10px] leading-snug text-muted">
        FEMA flood zones · USGS imagery
        {frame.osmPlaced && <CreditPartsText parts={[" · ", ...OSM_LOCATION_PARTS]} />}
      </figcaption>
    </figure>
  );
}

function Chip({ label, cls }: { label: string; cls: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

export function SiteFlagsCard({
  result,
  hasAddress,
  today,
  floodFrame = null,
}: {
  result: SiteFlagsResult | null;
  hasAddress: boolean;
  /** the Flood view's stored frame, drawn small beside the flood chip; null
   *  where the header draws no Flood view or the frame is not drawn yet */
  floodFrame?: SiteFloodFrame | null;
  /** today as an ISO day (the reader's own, lib/reader-day), read by the
   *  page: what an answer from the 2018 list means turns on where that
   *  round stands */
  today: string;
}) {
  if (!hasAddress) return null;
  // The Opportunity Zone as the stored lookup can say it on `today`
  // (lib/site-flags): on the list, off it (by the 2010 tract, or the current
  // number with its caveat), or not checked and why — and the 2018 round's
  // line, which changes as the next round takes effect and the 2018 one ends.
  const oz = result ? opportunityZoneRead(result, today) : null;
  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h2 className="text-sm font-semibold">Site flags</h2>
      {!result || result.status === "pending" ? (
        <p className="mt-2 text-sm text-muted">
          Checking federal datasets for this address (flood zone, Opportunity
          Zone)… refresh the page in a minute.
        </p>
      ) : result.status === "geocode_failed" ? (
        <p className="mt-2 text-sm text-muted">
          The address didn&apos;t geocode, so the site checks couldn&apos;t run.
        </p>
      ) : (
        <div className={floodFrame ? "mt-3 flex flex-col gap-3 sm:flex-row sm:items-start" : undefined}>
          {floodFrame && <FloodThumb frame={floodFrame} />}
          <div className="min-w-0 flex-1">
          <div className={floodFrame ? "flex flex-wrap items-center gap-2" : "mt-3 flex flex-wrap items-center gap-2"}>
            {/* Flood */}
            {result.flood === "unavailable" ? (
              <Chip label="Flood: unavailable" cls="bg-faint text-muted" />
            ) : result.flood === null ? (
              // Every digitally mapped area carries a zone, Zone X included,
              // so no zone at all means no digital map here — not no hazard.
              <Chip label="Flood: no FEMA digital map at this point" cls="bg-faint text-muted" />
            ) : isMinimalHazard(result.flood) ? (
              <Chip label={`Flood zone ${result.flood.zone} · minimal flood hazard`} cls="bg-line/60 text-muted" />
            ) : result.flood.isHighRisk ? (
              <Chip
                label={`Flood zone ${result.flood.zone} — SFHA (flood insurance required on regulated-lender and agency loans)`}
                cls="bg-kill/10 text-kill"
              />
            ) : (
              <Chip
                label={`Flood zone ${result.flood.zone}${result.flood.subtype ? ` · ${result.flood.subtype.toLowerCase()}` : ""}`}
                cls="bg-caution/10 text-caution"
              />
            )}
            {/* Opportunity Zone — drawn as a zone in force only while the
                2018 designations are */}
            {oz && (
              <Chip
                label={oz.label}
                cls={
                  oz.kind === "listed" && oz.phase !== "ended"
                    ? "bg-pass/10 text-pass"
                    : oz.kind === "unchecked"
                      ? "bg-faint text-muted"
                      : "bg-line/60 text-muted"
                }
              />
            )}
            {result.tractGeoid && (
              <span className="text-xs text-muted">tract {result.tractGeoid}</span>
            )}
            {/* The number the zone was checked by, where 2010's differs. */}
            {result.ozTract?.vintage === "2010" && result.ozTract.geoid !== result.tractGeoid && (
              <span className="text-xs text-muted">2010 tract {result.ozTract.geoid}</span>
            )}
          </div>
          {oz?.caveat && <p className="mt-2 text-xs text-muted">{oz.caveat}</p>}
          {oz?.note && <p className="mt-2 text-xs text-muted">{oz.note}</p>}
          <p className="mt-2 text-xs text-muted">{result.note}</p>
          {result.error && <p className="mt-1 text-xs text-caution">{result.error}</p>}
          </div>
        </div>
      )}
    </section>
  );
}
