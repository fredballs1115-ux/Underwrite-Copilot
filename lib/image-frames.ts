/**
 * The frames, in pixels, that a deal's picture routes draw, and the one rule
 * that snaps an asked-for size to them (the security review of 2026-10-01).
 *
 * Each of these routes drew whatever width and height its query named
 * between 48 and 1280: one link asking `?w=301`, `?w=302`… was one USGS
 * export and one sharp pass apiece. A route now draws only the frames its
 * own pages ask for, and any other size is the listed frame nearest it. The
 * pages that build the URLs import these same constants, so a page and its
 * route cannot drift apart.
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
