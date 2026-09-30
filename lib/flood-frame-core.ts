// The Flood view's picture, kept once a deal (#472) — the pure half.
//
// The Flood view used to be two pictures asked for on every view: the USGS
// aerial (10 s, no retry) and FEMA's zones over it (15 s, one retry), with
// nothing kept on the server. The runner measured both hosts answering a
// cold first request in 20–30 s, and the view went whenever either missed —
// with the key and the sentence gone with it, and a reload usually working,
// which is why it failed "sometimes". So the frame is now drawn ONCE a deal:
// the aerial, calmed, with FEMA's zones in the site's palette at twice the
// pixels over it, stored, and cut to whatever shape a surface asks for (the
// page's 16:9, the viewer's 4:3, the report's band). It is drawn behind the
// deal page's first render, so it is usually there before anyone opens it;
// the key lists what the drawing actually shows, per crop, read off its own
// pixels when it was drawn.
//
// Pure — the drawing and the storage are lib/flood-frame's.

import type { FloodClassKey, FrameRegion } from "@/lib/flood-style";
import { centredRegion } from "@/lib/flood-style";
import { FLOOD_ZOOM, REPORT_FLOOD_SIZE } from "@/lib/basemaps";

/** The rules a stored frame was drawn under; a frame from older rules is
 *  drawn again on its deal's next view. */
export const FLOOD_FRAME_VERSION = 1;

/** The frame at CSS pixels: 4:3 at the Flood view's zoom, about 1.5 km by
 *  1.1 km at US latitudes — every crop a surface takes is inside it. The
 *  zones are drawn at `scale` times the pixels for the same ground, so an
 *  edge is crisp on a 2x screen. */
export const FLOOD_FRAME = { width: 1280, height: 960, zoom: FLOOD_ZOOM, scale: 2 } as const;

/** How long a drawn frame stands: FEMA revises a map by a letter of map
 *  revision, not by the hour, and a month bounds how stale one can be. */
export const FLOOD_FRAME_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** The shapes the site cuts the frame to. */
export const FLOOD_CROPS = {
  /** the deal page's Flood view and its filmstrip thumbnail */
  page: 16 / 9,
  /** the full-screen viewer: the whole frame */
  full: FLOOD_FRAME.width / FLOOD_FRAME.height,
  /** the full report's band */
  report: REPORT_FLOOD_SIZE.width / REPORT_FLOOD_SIZE.height,
} as const;
export type FloodCrop = keyof typeof FLOOD_CROPS;

/** A crop's region of the frame. */
export const cropRegion = (crop: FloodCrop): FrameRegion =>
  centredRegion(FLOOD_CROPS.full, FLOOD_CROPS[crop]);

/** The frame as the deal's photo cache keeps it. */
export interface FloodFrameRecord {
  v: number;
  /** `flood/<dealId>/<stamp>.jpg` in the private bucket */
  path: string;
  at: string;
  /** the point it was drawn around (`pointKey`) — a frame for another point
   *  is no frame for this one */
  for: string;
  /** the stored picture's pixels */
  width: number;
  height: number;
  /** the classes each crop shows, read off the drawing */
  classes: Record<FloodCrop, FloodClassKey[]>;
}

/** A point as a frame is keyed by: six places, about a tenth of a metre. */
export const pointKey = (p: { lat: number; lng: number }): string => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Whether a stored frame is the one to show for this point today: drawn
 *  under today's rules, around this point, inside the month. */
export function floodFrameCurrent(
  record: FloodFrameRecord | null | undefined,
  point: { lat: number; lng: number } | null,
  now = Date.now(),
): record is FloodFrameRecord {
  return (
    !!record &&
    !!point &&
    record.v === FLOOD_FRAME_VERSION &&
    record.for === pointKey(point) &&
    now - Date.parse(record.at) < FLOOD_FRAME_TTL_MS
  );
}

/** The pixels a crop of `w`×`h` takes out of a stored frame of
 *  `frameW`×`frameH`, centred — whole pixels inside the frame. */
export function cropBox(frameW: number, frameH: number, w: number, h: number): { left: number; top: number; width: number; height: number } {
  const region = centredRegion(frameW / frameH, w / h);
  const width = Math.min(frameW, Math.max(1, Math.round(frameW * region.w)));
  const height = Math.min(frameH, Math.max(1, Math.round(frameH * region.h)));
  return { left: Math.floor((frameW - width) / 2), top: Math.floor((frameH - height) / 2), width, height };
}

/** A request's size, held to what the stored frame can give without being
 *  stretched, in the shape asked for. */
export function servedSize(w: number, h: number, frameW: number, frameH: number): { width: number; height: number } {
  const box = cropBox(frameW, frameH, w, h);
  const k = Math.min(1, box.width / w, box.height / h);
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

/** The stored frame a deal's photo cache names, for the deletion sweep. */
export function floodFramePaths(cache: { floodFrame?: FloodFrameRecord } | null | undefined): string[] {
  return cache?.floodFrame?.path ? [cache.floodFrame.path] : [];
}
