// The homepage's photographs of real things — PURE.
//
// The operator's rule (2026-09-14): "start using real pictures of actual
// things in the homescreen … built for a human, not a robot." A picture we
// do not have is worse than no picture: a broken-image glyph, a stock
// placeholder or a drawn stand-in all say the opposite of "real". So the
// homepage carries SLOTS, and a slot renders only when its file is on disk
// under `public/photos/` — the section around an absent slot folds away,
// never a hole. The one photograph the site can always produce on its own
// is a USGS aerial of a covered market's downtown (`/api/imagery/metro/…`),
// which stands behind the hero until the operator's ground-level
// photograph arrives.
//
// This module is the list and the choosing; the file check is the caller's
// (`lib/photos-fs.ts` on the server, a stub in tests) so the page stays a
// render and the test never touches the disk.

export interface PhotoSlot {
  /** stable key, also the file's stem */
  id: "hero" | "team" | "site-walk" | "building";
  /** the file the operator drops in — `public/photos/<file>` */
  file: string;
  /** what the photograph must show, in one line, for the operator */
  brief: string;
  /** what a screen reader says; the hero's is decorative and stays empty */
  alt: string;
  /** the size to supply, so the slot never upscales */
  width: number;
  height: number;
}

/** The slots, in the order the page draws them. */
export const PHOTO_SLOTS: readonly PhotoSlot[] = [
  {
    id: "hero",
    file: "hero.jpg",
    brief:
      "The hero's backdrop under the headline: a real building the reader would buy, or an acquisitions team at work, wide, with quiet mid-tones (the headline sits over it).",
    alt: "",
    width: 2400,
    height: 1350,
  },
  {
    id: "team",
    file: "team.jpg",
    brief: "An acquisitions team around a table on deal day, the screen open between them.",
    alt: "An acquisitions team around a table, the screen open between them",
    width: 1200,
    height: 900,
  },
  {
    id: "site-walk",
    file: "site-walk.jpg",
    brief: "An analyst walking a property — the tour, not the desk.",
    alt: "An analyst walking a property on a site tour",
    width: 1200,
    height: 900,
  },
  {
    id: "building",
    file: "building.jpg",
    brief: "The asset itself at street level: a mid-rise multifamily or an industrial box, honest light.",
    alt: "A mid-rise multifamily building at street level",
    width: 1200,
    height: 900,
  },
] as const;

/** The public path a present slot is served from. */
export function photoSrc(slot: PhotoSlot): string {
  return `/photos/${slot.file}`;
}

/**
 * The slots whose files exist, keyed by id. `exists` answers for one file
 * name (never a path — the caller decides where the folder is), so a test
 * can hand in a set and the server hands in the disk.
 */
export function presentPhotos(
  exists: (file: string) => boolean,
): Partial<Record<PhotoSlot["id"], PhotoSlot>> {
  const out: Partial<Record<PhotoSlot["id"], PhotoSlot>> = {};
  for (const slot of PHOTO_SLOTS) if (exists(slot.file)) out[slot.id] = slot;
  return out;
}

/** The strip's photographs — every present slot but the hero, in order. */
export function stripPhotos(
  present: Partial<Record<PhotoSlot["id"], PhotoSlot>>,
): PhotoSlot[] {
  return PHOTO_SLOTS.filter((s) => s.id !== "hero" && present[s.id] !== undefined);
}

/**
 * The market whose downtown stands behind the hero until the operator's
 * photograph arrives. Midtown Manhattan reads as itself from above; the
 * frame is the imagery route's largest.
 */
export const HERO_AERIAL = {
  metro: "nyc",
  place: "Midtown Manhattan",
  width: 1600,
  height: 900,
} as const;
