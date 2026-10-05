/**
 * The frames, in pixels, that a deal's picture routes draw, and the one rule
 * that snaps an asked-for size to them (the security review of 2026-10-01).
 *
 * Each of these routes drew whatever width and height its query named
 * between 48 and 1280: one link asking `?w=301`, `?w=302`… was one USGS
 * export and one sharp pass apiece. A route now draws only the frames its
 * own pages ask for, and any other size is the listed frame nearest it. The
 * pages that build the URLs import these same constants, so a page and its
 * route cannot drift apart: the shared screen's aerial (2026-10-01), and the
 * signed-in deal aerial and best-picture routes (research pass 22).
 *
 * Pure and universal, so a client component can import the constants too.
 */

/** A picture's frame in pixels. */
export interface PixelFrame {
  readonly w: number;
  readonly h: number;
}

/** The shared screen's one aerial (app/share/[token]/page.tsx), drawn 12:5
 *  across the screen's column. */
export const SHARE_AERIAL: PixelFrame = { w: 960, h: 400 };

/** The frames the shared screen's aerial route draws: its page's one. */
export const SHARE_AERIAL_FRAMES: readonly PixelFrame[] = [SHARE_AERIAL];

// ── /api/deals/[id]/aerial — the signed-in overhead (research pass 22) ──────

/** The deal page's overhead views (property-visual: the Aerial and the
 *  Satellite views and their places in the filmstrip): the route's widest. */
export const DEAL_AERIAL_VIEW: PixelFrame = { w: 1280, h: 576 };
/** The overheads in the full-screen viewer (property-visual): 4:3. */
export const DEAL_AERIAL_VIEWER: PixelFrame = { w: 1280, h: 960 };
/** A card's overhead (lib/deal-banner `BANNER`, the compare page's columns):
 *  16:9, twice a 320px column for a sharp picture on a dense screen. */
export const DEAL_BANNER: PixelFrame = { w: 640, h: 360 };
/** The pipeline's cards (lib/deal-banner `CARD`, #428): 16:10, twice a
 *  360px card. */
export const DEAL_CARD: PixelFrame = { w: 720, h: 450 };
/** A list row's thumbnail (lib/deal-banner `THUMB`, #442): square, three
 *  times a phone's 56px slot. */
export const DEAL_THUMB: PixelFrame = { w: 168, h: 168 };

/** The frames /api/deals/[id]/aerial draws: the deal page's two, and every
 *  frame lib/deal-banner's `bannerSources` — the one builder of a card's
 *  overhead — is handed (the pipeline's card and row ask theirs with the
 *  overhead off today, #442, and keep their frames should it come back). */
export const DEAL_AERIAL_FRAMES: readonly PixelFrame[] = [
  DEAL_THUMB,
  DEAL_BANNER,
  DEAL_CARD,
  DEAL_AERIAL_VIEW,
  DEAL_AERIAL_VIEWER,
];

// ── /api/deals/[id]/image — the best picture, at avatar size ───────────────

/** A deal's avatar (app/(app)/deal-avatar.tsx), asked at twice its slot: a
 *  list's 32px (`sm`) and a page heading's 40px (`md`). */
export const DEAL_AVATAR: { readonly sm: PixelFrame; readonly md: PixelFrame } = {
  sm: { w: 64, h: 64 },
  md: { w: 80, h: 80 },
};
/** The pipeline map's hover card (lib/pipeline-map), twice its 48px. */
export const PIPELINE_MAP_PICTURE: PixelFrame = { w: 96, h: 96 };

/** The frames /api/deals/[id]/image draws: the avatar's two and the map's. */
export const DEAL_IMAGE_FRAMES: readonly PixelFrame[] = [DEAL_AVATAR.sm, DEAL_AVATAR.md, PIPELINE_MAP_PICTURE];

/** The size a request that names none was always drawn at (the deal routes'
 *  old default); it is snapped like any other ask. */
const UNSIZED: PixelFrame = { w: 800, h: 450 };

/** A side as asked: a finite number, else the fallback's. `Number(null)` is
 *  0, which is finite, so a missing side is read before it is converted. */
function side(raw: number | string | null | undefined, fallback: number): number {
  const n = typeof raw === "number" ? raw : raw == null || raw.trim() === "" ? Number.NaN : Number(raw);
  return Number.isFinite(n) ? Math.min(10_000, Math.max(1, n)) : fallback;
}

/**
 * The listed frame nearest an asked-for size — nearest in proportion and in
 * size together, the sum of the two sides' log ratios, and the larger on a
 * tie so a picture is never softer than asked: lib/metro-imagery's
 * `metroFrame` rule for the market overheads. A missing or unreadable side is
 * `unsized`'s (the routes' old default) before the snap.
 */
export function nearestFrame(
  frames: readonly PixelFrame[],
  rawW: number | string | null | undefined,
  rawH: number | string | null | undefined,
  unsized: PixelFrame = UNSIZED,
): PixelFrame {
  const w = side(rawW, unsized.w);
  const h = side(rawH, unsized.h);
  let best = frames[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const f of frames) {
    const d = Math.abs(Math.log(f.w / w)) + Math.abs(Math.log(f.h / h));
    if (d < bestD - 1e-9 || (Math.abs(d - bestD) <= 1e-9 && f.w * f.h > best.w * best.h)) {
      best = f;
      bestD = d;
    }
  }
  return best;
}
