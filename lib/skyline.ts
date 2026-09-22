// The photograph each covered market is known by — PURE.
//
// The operator's rule (2026-09-16): "I need beautiful professional skyline
// photos of each market." An overhead aerial answers "where is it"; a
// skyline answers "what is it". On a market brief, a coverage tile or a
// page's opening band, the second question is the one the reader is
// asking, so those surfaces show a skyline. The overhead stays only where
// the subject is one specific building — a deal's header, the memo cover,
// the shared screen — because there the roof IS the asset.
//
// WHY WIKIMEDIA COMMONS. The site needs one photograph per market that we
// may publish commercially, that costs nothing per view, that needs no key,
// and that we can point at by name rather than by a signed URL that
// expires. Commons is the only source meeting all four. Each entry below
// names a specific file, its photographer and its licence, because every
// licence here except public domain REQUIRES visible attribution — that is
// what `credit` and `licenseUrl` are for, and why `SkylinePhoto` renders
// them beside the picture rather than burying them in a footer.
//
// EVERY FILE IS VERIFIED BEFORE IT LANDS. The sandbox these entries are
// written in cannot reach any image host (commons.wikimedia.org answers 403
// through its egress proxy), so a filename typed from memory would be a
// guess. live-verify's "SKYLINE" step resolves each file from the GitHub
// runner and prints its status, byte count and pixel size; an entry only
// joins this table after that run showed it resolving to a real image.
// `scripts/probe-skylines.mjs` is that probe — run it before adding a market.

/** One market's photograph, with everything its licence obliges us to show. */
export interface SkylineShot {
  /** exact Commons filename, no "File:" prefix — the route resolves it */
  file: string;
  /** what the photograph shows, for the alt text and the caption */
  place: string;
  /** the photographer, exactly as the licence requires them to be named */
  credit: string;
  /** the licence's short name, e.g. "CC BY-SA 4.0" or "Public domain" */
  license: string;
  /** where the licence text lives; empty for public domain */
  licenseUrl: string;
}

/**
 * Keyed by the `id` in data/research/metros.json. A market with no entry
 * is not a bug — it falls back to its overhead frame, which is why the
 * table can grow one verified photograph at a time.
 *
 * Every row below was printed by the probe running on the GitHub runner on
 * 2026-09-16: the filename, the pixel size, the media type, the
 * photographer and the licence are all what Commons itself returned, not
 * what anybody remembered. A credit written from memory is a licence breach
 * with a name attached, which is why this is the one table in the codebase
 * that may never be edited from the sandbox alone.
 *
 * WHAT IS NOT HERE, and why. Montgomery County has no entry: it is a
 * suburban submarket, and a submarket does not have a skyline the way a
 * city does — the overhead frame is the more honest picture of a place
 * whose shape is the shape of its land, and the two searches that have been
 * run for it turned up a high-altitude aerial of Bethesda, an interstate
 * seen from a Rockville overpass, and a category full of berries and blue
 * jays (skyline-sheet runs 35660646197 and 35752022571 — the second with
 * Silver Spring and Rockville's articles and categories added, so the
 * doors are exhausted, not merely unopened). Prince George's County and Northern
 * Virginia were once left out on the same reasoning and each turned out to
 * have a picture it is actually known by: Rosslyn's towers across the
 * Potomac, and National Harbor's wheel on the river. The rule is the
 * photograph a place is known by, not a skyline for its own sake.
 *
 * HOW A PHOTOGRAPH IS CHOSEN NOW. The probe's search prints what a file is
 * called, who took it and how big it is, and none of that says whether it
 * is any good. `skyline-sheet.yml` runs the same search from the runner
 * with 640px copies saved and pushes them to their own branch, which the
 * sandbox CAN fetch and look at — so a picture is chosen by eye, and still
 * credited from what Commons returned, never from memory.
 */
export const SKYLINES: Record<string, SkylineShot> = {
  // The Height Act means Washington's skyline is the Mall, not a wall of
  // towers — so this is the picture the city is actually known by.
  // Chosen by eye from the contact sheet (skyline-sheet run 35660646197,
  // 2026-09-21): the Lincoln Memorial and Memorial Bridge from Arlington,
  // at ground level, in place of an overhead of the Mall — the overhead
  // said where the city is; this says what it looks like.
  dc: {
    file: "2011 - The View from Arlington National Cemetery (6103435717).jpg",
    place: "The Lincoln Memorial and Memorial Bridge, seen from Arlington",
    credit: "Arlington National Cemetery",
    license: "Public domain",
    licenseUrl: "",
  },
  // The one suburban market with a waterfront that IS its picture: National
  // Harbor's Capital Wheel at dusk, from the same sheet. Chosen over the
  // 4:1 marina panorama, which fits the band better and says less.
  pg_county: {
    file: "Capital Wheel at National Harbor, Maryland, USA.jpg",
    place: "The Capital Wheel at National Harbor, Prince George's County",
    credit: "MamaGeek",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // Northern Virginia is the one suburban market that gets a skyline, and
  // Rosslyn is the reason. PG County and Montgomery County still keep their
  // overheads — a place shaped by its land is photographed from above — but
  // Rosslyn is a genuine high-rise cluster, zoned tall precisely because it
  // stands across the Potomac from a height-limited Washington. There IS a
  // skyline here, so showing an aerial instead was answering a question
  // nobody asked.
  //
  // Of the five files the runner surfaced, this one: 4867x2692 is the
  // widest useful frame (the band crops to a panorama, so the two 4:3 files
  // would be cropped to a sliver), it is the largest at that ratio, it is
  // CC0, and it is the view — Rosslyn from Georgetown is the frame an
  // Arlington broker would put on a cover.
  nova: {
    file: "Rosslyn from Georgetown 1.jpg",
    place: "Rosslyn, seen from Georgetown across the Potomac",
    // CC0 obliges nobody, but the photographer is named anyway: the house
    // rule is that whoever took the picture is credited beside it.
    credit: "Theodore Christopher",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
  },
  baltimore: {
    file: "Baltimore, Maryland skyline (cropped).jpg",
    place: "Baltimore",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
  },
  // From the same sheet: 5424px across against the 1600px file it replaces,
  // the towers sharp against a clear sky rather than soft behind autumn
  // trees. The old file stays a candidate so the probe keeps proving both.
  richmond: {
    file: "A downtown view of Richmond, VA.jpg",
    place: "Downtown Richmond",
    credit: "Bruce Emmerling",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // Second sheet (skyline-sheet run 2, 2026-09-21): the file it replaces was
  // a street corner at dusk — a hotel and a garage — and this is the
  // waterfront the city is known by, from the same photographer.
  norfolk_hampton_roads: {
    file: "Downtown Norfolk during the day.jpg",
    place: "Downtown Norfolk from the Elizabeth River",
    credit: "Bruce Emmerling",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // The sample deal's own city, so this one carries /demo as well.
  philadelphia: {
    file: "Philadelphia skyline 20240528 (cropped).jpg",
    place: "Center City Philadelphia",
    credit: "颐园居",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  newark_jc: {
    file: "Jersey City Skyline September 2025 038 (cropped).jpg",
    place: "Jersey City",
    credit: "Kidfly182",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
  },
  nyc: {
    file: "View of Empire State Building from Rockefeller Center New York City dllu (cropped).jpg",
    place: "Midtown Manhattan",
    credit: "Dllu",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  boston: {
    file: "Boston skyline from Longfellow Bridge September 2017 panorama 2.jpg",
    place: "Back Bay, Boston",
    credit: "King of Hearts",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  chicago: {
    file: "Chicago Skyline in September 2023 pano.jpg",
    place: "Chicago",
    credit: "TheWxResearcher",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // Third sheet (skyline-sheet run 35661336976): the 6000px file it
  // replaces was a tight cluster of downtown towers under a blue sky —
  // sharp, and it could have been any city. This is the picture Los
  // Angeles is known by: downtown against the snow on the San Gabriels.
  los_angeles: {
    file: "LA Skyline Mountains2.jpg",
    place: "Downtown Los Angeles against the San Gabriel Mountains",
    credit: "Nserrano",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
  },
  san_francisco: {
    file: "SF From Marin Highlands3.jpg",
    place: "San Francisco from the Marin Headlands",
    credit: "Paul.h",
    license: "Public domain",
    licenseUrl: "",
  },
  seattle: {
    file: "View of Downtown Seattle from Ella Bailey Park (27305770463).jpg",
    place: "Downtown Seattle",
    credit: "Tiffany Von Arnim",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
  },
  // Brickell rather than the whole bay: it is the submarket a CRE reader
  // means when they say Miami.
  miami: {
    file: "Brickell neighborhood skyline (60062p).jpg",
    place: "Brickell, Miami",
    credit: "Rhododendrites",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  atlanta: {
    file: "Atlanta, Georgia Skyline.jpg",
    place: "Atlanta",
    credit: "Shawn M. Kent",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // The better-looking Dallas candidate is a 6000px PNG, and a PNG
  // photograph at 1600px is megabytes where a JPEG is hundreds of
  // kilobytes. Page weight wins on a tile nobody stops to admire.
  dallas: {
    file: "IMAG2591-dallas-downtown.jpg",
    place: "Downtown Dallas",
    credit: "alfred twu",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
  },
};

export function skylineFor(id: string): SkylineShot | null {
  return SKYLINES[id] ?? null;
}

/** Does this market have a verified photograph yet? */
export function hasSkyline(id: string): boolean {
  return id in SKYLINES;
}

/**
 * The widths the route will serve. A request for anything else is clamped,
 * so a caller cannot ask Commons for a 12000px render of every tile.
 */
export const SKYLINE_WIDTH = { min: 320, max: 2400, default: 1600 } as const;

/**
 * Where the bytes come from. `Special:FilePath` is Commons' stable
 * by-name redirect: it takes a filename and a width and answers with the
 * rendered thumbnail, so nothing here depends on the hashed storage path
 * that `upload.wikimedia.org` URLs carry (those change when a file is
 * re-uploaded; the name does not).
 */
export function commonsUrl(file: string, width: number): string {
  const w = Math.min(
    SKYLINE_WIDTH.max,
    Math.max(SKYLINE_WIDTH.min, Math.round(width) || SKYLINE_WIDTH.default),
  );
  return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}`;
}

/**
 * A short token that changes when a market's photograph changes.
 *
 * The route serves these `immutable` for a year, which is right for the
 * bytes — a Commons file's content does not change under its name — but
 * WRONG for the URL, because `/api/imagery/skyline/miami` means a different
 * photograph the day this table is edited. Without a token in the query, a
 * visitor who has been here before holds last year's picture and never
 * learns otherwise.
 *
 * FNV-1a over the filename: tiny, stable across processes and deploys (so
 * two servers agree and a rebuild does not needlessly bust every cache),
 * and derived from the one field that decides which photograph renders. It
 * is a cache key, never a checksum — nothing here is trusting it.
 */
export function skylineTag(id: string): string {
  const shot = SKYLINES[id];
  if (!shot) return "0";
  let h = 2166136261;
  for (let i = 0; i < shot.file.length; i++) {
    h ^= shot.file.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/**
 * One attribution line for a GRID of these photographs.
 *
 * A tile 240px wide has no room for a photographer's name under it, but
 * every licence here except the public-domain ones obliges us to give one.
 * Creative Commons asks for attribution "in any manner reasonable to the
 * medium", and the reasonable manner for a gallery is a single line under
 * it naming every creator and every licence — which is what a museum or a
 * newspaper does with a picture grid. So the tiles stay clean and this
 * sentence carries the obligation for all of them.
 *
 * Built from the table rather than written out, so a market added or a
 * photograph changed can never leave a name behind on the page.
 */
export function galleryCredit(ids: readonly string[]): string {
  const shots = ids.map((id) => SKYLINES[id]).filter((s): s is SkylineShot => Boolean(s));
  if (shots.length === 0) return "";
  const names = [...new Set(shots.map((s) => (s.credit && s.credit !== "unknown" ? s.credit : "Wikimedia Commons")))];
  const licenses = [...new Set(shots.map((s) => s.license))].sort();
  return `Skyline photographs by ${names.join(", ")} — via Wikimedia Commons, ${licenses.join(" / ")}.`;
}

/** The page that documents the file, for the credit link. */
export function commonsPage(file: string): string {
  return `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(file)}`;
}

/**
 * The one sentence a licence obliges us to print. Kept here rather than in
 * the component so the wording is identical everywhere it appears — on a
 * page, in the memo, and in any export that ever embeds one of these.
 */
export function creditLine(shot: SkylineShot): string {
  const author = shot.credit && shot.credit !== "unknown" ? shot.credit : "Wikimedia Commons";
  return `${shot.place} · ${author} · ${shot.license}`;
}

/**
 * The same credit, safe to put in an HTTP header.
 *
 * WHY THIS EXISTS, AND IT IS NOT HYPOTHETICAL. A header value is a
 * ByteString — every character must fit in one byte — and `new Headers()`
 * THROWS on anything above U+00FF rather than dropping it. Philadelphia's
 * photographer is credited on Commons as 颐园居, so the skyline route's
 * `x-imagery-source` header threw on construction, and a throw inside a
 * route handler is a 500. Philadelphia is the metro /demo opens on.
 *
 * WHAT A READER ACTUALLY SAW, because it is not what you would guess: the
 * aerial. `CityPhoto`'s fallback hangs off the `<img>`'s `onError`, and a
 * browser fires `error` for ANY failed image load — a 500 exactly as much
 * as a 404 (checked in a real Chromium against both). So the component
 * degraded as designed, swapped in the USGS overhead, and correctly moved
 * the credit line to USGS with it. No licence was misattributed. The
 * market simply showed the wrong kind of picture — an overhead where a
 * skyline was meant — which is the one complaint this whole layer exists
 * to answer.
 *
 * And THAT is why nothing caught it. A graceful, silent degradation is
 * invisible to every check we had: the page renders, the HTML carries a
 * credit either way, and the Commons probe resolves the FILE, which was
 * never the problem. Only asking the site for the image itself can see it,
 * which is what live-verify's PHOTOGRAPHS step does — it found this on its
 * first run.
 *
 * So: keep printable ASCII and the printable Latin-1 range — which a header
 * accepts, and which keeps "Mario Roberto Durán Ortiz" readable — and
 * percent-encode everything else as UTF-8. A name in another script survives
 * as something a reader can decode rather than as a 500. Control characters
 * go the same way, which incidentally closes header injection.
 */
export function headerSafe(credit: string): string {
  return credit.replace(/[^ -~ -ÿ]/gu, (ch) =>
    encodeURIComponent(ch),
  );
}
