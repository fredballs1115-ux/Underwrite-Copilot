import "server-only";
// The sample deal's two public documents — /api/demo/memo and
// /api/demo/report — draw their cover from here, so the two print one
// picture. The full report had printed no cover at all while the memo beside
// it printed the aerial (home-demo-gap M7), and the signed-in sample's report
// opens on its picture, as every report's first page is its memo.
import { COVER_SIZE, coverFrom } from "@/lib/memo/cover-aerial";
import type { MemoCover } from "@/lib/memo/memo-document";
import { fetchAerialImage } from "@/lib/imagery";

/** The sample is placed at neighbourhood level on purpose (lib/sample-deal:
 *  never a street address), so its cover is the USGS frame of Brewerytown
 *  itself — a real place, the building invented. Fixed coordinates, no
 *  geocode and no deal row to cache a location on. */
export const SAMPLE_COVER_POINT = { lat: 39.9735, lng: -75.185, precision: "area" as const };

/** One cover a day, shared by the memo and the report: the promise is held
 *  so a memo and a report asked for at once make one USGS request, and a
 *  cover that did not come through is forgotten, so the next document asks
 *  again rather than the day's every document printing without one. */
let held: { day: string; cover: Promise<MemoCover | null> } | null = null;

/**
 * The sample's cover for `day` (an ISO day): the aerial of Brewerytown at
 * the cover's frame, through the same bounded, validated path every memo's
 * cover takes (lib/memo/cover-aerial `coverFrom`: a few seconds and then no
 * cover, the bytes held to `intactImage` before react-pdf sees them, the
 * credit the source's own). Never throws.
 */
export function sampleCover(day: string): Promise<MemoCover | null> {
  if (held && held.day === day) return held.cover;
  const next: { day: string; cover: Promise<MemoCover | null> } = {
    day,
    cover: coverFrom(() =>
      fetchAerialImage(SAMPLE_COVER_POINT, COVER_SIZE).then((res) =>
        res ? { response: res, source: "aerial" as const } : null,
      ),
    ).then((cover) => {
      // Only our own entry — a newer day's may have replaced it.
      if (!cover && held === next) held = null;
      return cover;
    }),
  };
  held = next;
  return next.cover;
}

/** Test tooling: forget the held cover. */
export function forgetSampleCover(): void {
  held = null;
}
