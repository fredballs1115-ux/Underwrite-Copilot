import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { StructuredAddress } from "@/lib/address";
import { resolveDealLocation, type DealLocation, type DealVisualCache } from "@/lib/deal-location";
import { fetchAerialImage } from "@/lib/imagery";
import { HeldCopies } from "@/lib/held-copies";
import type { PixelFrame } from "@/lib/image-frames";

/**
 * A deal's USGS aerial, drawn once per deal per process and kept (the
 * security review of 2026-10-01). The shared screen's aerial route
 * (/api/share/[token]/aerial) is public: anyone holding one link could ask
 * for the picture at any size and as often as they liked. Each ask was a
 * fresh USGS export and a sharp pass, with no copy kept and no limit on how
 * many ran at once (the reviewer's harness: 42 asks, 42 exports, 40 at
 * once). Now:
 *
 *   - the route draws one frame, its page's (`SHARE_AERIAL`), whatever size
 *     is asked for (lib/image-frames);
 *   - the picture is kept per deal and frame. Each copy remembers the point
 *     it was drawn around (`aerialPointKey`), so a deal whose address has
 *     moved is drawn again rather than shown at its old place. The copies
 *     are bounded on count and on total bytes (lib/held-copies);
 *   - asks that arrive while a drawing is under way share it;
 *   - the export itself waits its turn behind `AERIAL_IN_FLIGHT`
 *     (lib/imagery), as every building's aerial now does.
 *
 * The copy is served only after the route has resolved the link again, so
 * a revoked or expired link gets nothing from it.
 */

export interface HeldAerial {
  bytes: Buffer;
  type: string;
  /** the point the picture was drawn around (`aerialPointKey`) */
  at: string;
}

/** How many aerials, and how many bytes of them, this process keeps. A
 *  960 × 400 frame finishes at roughly 100–250 KB. */
export const MAX_HELD_AERIALS = 32;
export const MAX_HELD_AERIAL_BYTES = 8_000_000;

const held = new HeldCopies<HeldAerial>(MAX_HELD_AERIALS, MAX_HELD_AERIAL_BYTES);

/** Where a frame is drawn around: the point, and how precise it is, since
 *  the zoom follows the precision (lib/imagery-plan `frameZoom`). */
export function aerialPointKey(loc: DealLocation): string {
  return `${loc.lat},${loc.lng},${loc.precision}`;
}

/**
 * The deal's aerial at `frame`, from this process's copy where it was drawn
 * around the point the deal is at now, else drawn (sharing a drawing already
 * under way). Null where the deal has no place or USGS did not answer. A
 * failed drawing is kept by nobody, so the next ask tries again.
 */
export async function heldDealAerial(
  supabase: SupabaseClient,
  dealId: string,
  address: StructuredAddress | null,
  cache: DealVisualCache | null,
  frame: PixelFrame,
): Promise<HeldAerial | null> {
  const loc = await resolveDealLocation(supabase, dealId, address, cache);
  if (!loc) return null;
  const at = aerialPointKey(loc);
  const key = `${dealId}:${frame.w}x${frame.h}`;
  return held.take(
    key,
    async () => {
      const res = await fetchAerialImage(loc, { width: frame.w, height: frame.h });
      if (!res) return null;
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.byteLength === 0) return null;
      return { bytes, type: res.headers.get("content-type") ?? "image/jpeg", at };
    },
    { fresh: (h) => h.at === at, flight: `${key}@${at}` },
  );
}

/** Forget every kept aerial (tests). */
export function forgetDealAerials(): void {
  held.forget();
}
