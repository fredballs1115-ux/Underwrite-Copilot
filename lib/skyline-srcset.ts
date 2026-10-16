// The skyline route's srcset widths, with no imports, so a client
// component (the sample's header picture) can offer a skyline at the band's
// own widths without loading lib/skyline's table, which no browser loads
// (lib/client-bundle-tables.test.ts). lib/skyline re-exports the widths.

/**
 * The widths a skyline is offered at where a surface says how wide its slot
 * draws (#446), so the browser takes the smallest file that covers the slot
 * on its own screen: a dense screen gets the pixels it draws, a plain one
 * does not pay for them. A tile asked for at one fixed 480px was stretched
 * twice over on every phone and every laptop with a dense screen. 1600 is
 * the width the deploy probe measures every file at; 2400 (#451) is for a
 * page's full-width band on a dense laptop screen, 2,880 device pixels
 * across at 1440, which 1400 had stretched twice over.
 */
export const SKYLINE_SRCSET = [480, 960, 1600, 2400] as const;

/**
 * The srcset a skyline route URL belongs to — the same URL at each of
 * `SKYLINE_SRCSET`'s widths, its market and version as written — or null for
 * any other URL. An image offered this srcset at a band's own `sizes` takes
 * the very file the band takes, so one download serves both (audit C7,
 * L14: the homepage's hero band and the sample's header picture asked
 * Philadelphia at two different URLs wherever the band took a width other
 * than the header's fixed 1600 — a dense laptop, a 2x phone).
 */
export function skylineSrcSetOf(src: string): string | null {
  const m = /^(\/api\/imagery\/skyline\/[^/?#]+\?w=)\d+(&v=[^&#]+)$/.exec(src);
  if (!m) return null;
  return SKYLINE_SRCSET.map((w) => `${m[1]}${w}${m[2]} ${w}w`).join(", ");
}
