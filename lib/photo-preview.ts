// A photograph's preview (#463) — the listing sites' blur-up. Each stored
// photograph of a deal carries a preview a couple of dozen pixels on its
// long side, a WebP of a few hundred bytes kept inline in the photo cache,
// so the page that draws the photograph has its colours in hand before the
// photograph itself is fetched. The frame shows the preview blurred until
// the photograph has loaded whole, then the photograph fades in over it:
// the right colours at once, never a grey plate or a drawing where a
// photograph is on its way.
//
// Pure: the preview is made by lib/deal-picture (sharp, server-only); this
// only checks one and turns it into the CSS that draws it.

import { focusPosition, focusStyle } from "@/lib/photo-focus";

/** The preview's long side, pixels: small enough to ride in the page, large
 *  enough that the blur has the photograph's shapes to work with. */
export const PREVIEW_PX = 24;

/** The most characters a preview may take in the page — a WebP of 24px at a
 *  low quality is a few hundred; anything larger is not a preview. */
export const PREVIEW_MAX_CHARS = 2_000;

const PREVIEW = /^data:image\/(?:webp|jpeg|png);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Whether a string is a preview this site made: a small base64 image data
 *  URI, nothing else — it goes into a style attribute. */
export function isPreview(v: unknown): v is string {
  return typeof v === "string" && v.length <= PREVIEW_MAX_CHARS && PREVIEW.test(v);
}

/**
 * The CSS background that draws a preview blurred — an SVG with a Gaussian
 * blur over the preview, stretched to the frame (the technique next/image
 * uses for its blur placeholder), so the blur is the browser's and the
 * frame needs no second element. The SVG's own edges are clamped with the
 * blur's `edgeMode`, so the frame's border never fades to white. Null
 * where the value is not a preview.
 */
export function blurredBackground(preview: string | null | undefined): string | null {
  if (!isPreview(preview)) return null;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 320 200' preserveAspectRatio='none'>` +
    `<filter id='b' color-interpolation-filters='sRGB'><feGaussianBlur stdDeviation='14' edgeMode='duplicate'/>` +
    `<feComponentTransfer><feFuncA type='discrete' tableValues='1 1'/></feComponentTransfer></filter>` +
    `<image preserveAspectRatio='none' filter='url(%23b)' x='0' y='0' width='100%25' height='100%25' href='${preview}'/></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${svg.replace(/"/g, "'").replace(/</g, "%3C").replace(/>/g, "%3E")}")`;
}

/** The style that paints a preview under a frame: the blurred background,
 *  covering, held at the photograph's point of interest where it has one
 *  (lib/photo-focus) — where the photograph that fades in over it is held —
 *  and at the centre otherwise. Empty where there is no preview. */
export function previewStyle(
  preview: string | null | undefined,
  focus?: unknown,
): { backgroundImage: string; backgroundSize: string; backgroundPosition: string } | undefined {
  const bg = blurredBackground(preview);
  return bg ? { backgroundImage: bg, backgroundSize: "cover", backgroundPosition: focusPosition(focus) ?? "center" } : undefined;
}

/** The style of a stored photograph's own <img> in a frame that crops it:
 *  its preview painted under it, and both held at its point of interest.
 *  Undefined where it has neither. */
export function photoStyle(
  preview: string | null | undefined,
  focus?: unknown,
): { backgroundImage?: string; backgroundSize?: string; backgroundPosition?: string; objectPosition?: string } | undefined {
  const style = { ...previewStyle(preview, focus), ...focusStyle(focus) };
  return Object.keys(style).length > 0 ? style : undefined;
}
