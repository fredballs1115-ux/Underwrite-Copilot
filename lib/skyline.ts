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

import {
  creditText,
  galleryCreditLineOf,
  galleryCreditPartsOf,
  photographerParts,
  type CreditLink,
  type CreditPart,
  type GalleryAuthor,
} from "./credit-parts";

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
  /** a metro area's name as a card shows it ("San Jose, CA"), for an entry
   *  keyed by its Census code (`areaSkylineId`, #472) — a market the site
   *  reads has its own name */
  name?: string;
  /** the original's width and height in pixels, as the run that chose it
   *  printed them — where known, a card asks for enough width that a wide
   *  panorama cut to the card by its height stays sharp
   *  (lib/market-picture's `marketPhotoWidth`) */
  size?: readonly [number, number];
  /** where a band crops the photograph from top to bottom, a percent of
   *  its height (drawn as `object-position: 50% <bandFocusY>%`), for a
   *  photograph the band's own 42% cut wrong: a tall subject's top lost,
   *  or the subject sunk under the words' scrim (research pass 29). Judged
   *  by eye through the bands' own crops — the laptop band at 1104×336,
   *  /market's at 1062×336, the tablet's at 730×336 and the phone's strip
   *  at 300×224 — with the scrim and the words painted on, so the
   *  subject's top clears the frame and the scrim does not bury it. For a
   *  band (`PlaceBackdrop`) only, never a card or a tile, whose frames are
   *  other shapes. Unset, the band's own 42%. */
  bandFocusY?: number;
}

/** The table's key for a metro area the site reads no figures for (#472):
 *  its five-digit Census code, so a deal placed by its county wears its
 *  metro area's photograph (lib/market-picture). */
export const areaSkylineId = (cbsa: string): string => `cbsa:${cbsa}`;

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
    size: [3008, 2000],
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
    size: [3008, 2000],
    // The wheel is taller than a laptop's band: at 42% its crown of
    // gondolas went off the top, at 0% the whole upper arc stands clear
    // and the hub sits in the words' scrim (research pass 29's
    // band-laptop-0 sheet, and the focus sheets cut 2026-10-05).
    bandFocusY: 0,
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
    size: [4867, 2692],
  },
  baltimore: {
    file: "Baltimore, Maryland skyline (cropped).jpg",
    place: "Baltimore",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    size: [7988, 3495],
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
    size: [5424, 3484],
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
    size: [5436, 3352],
  },
  // The sample deal's own city, so this one carries /demo as well.
  philadelphia: {
    file: "Philadelphia skyline 20240528 (cropped).jpg",
    place: "Center City Philadelphia",
    credit: "颐园居",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [4250, 2656],
  },
  newark_jc: {
    file: "Jersey City Skyline September 2025 038 (cropped).jpg",
    place: "Jersey City",
    credit: "Kidfly182",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    size: [3793, 1466],
  },
  nyc: {
    file: "View of Empire State Building from Rockefeller Center New York City dllu (cropped).jpg",
    place: "Midtown Manhattan",
    credit: "Dllu",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [8207, 4616],
  },
  boston: {
    file: "Boston skyline from Longfellow Bridge September 2017 panorama 2.jpg",
    place: "Back Bay, Boston",
    credit: "King of Hearts",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [9250, 3700],
  },
  // Sixth sheet (skyline-sheet run 35792083388, a one-market run — the
  // five-market sheet before it had shown six files for Chicago and the
  // search door never opened): the daytime pano it replaces was 3127px
  // across and soft, the whole skyline in a strip 795px tall. This is the
  // same view at first light — Willis to the Hancock across the water,
  // every tower lit, a sky going blue — 4000px and 2.4:1, which is the
  // band's own shape. Chosen by eye over the darker frame taken minutes
  // earlier by the same photographer ("- 01").
  chicago: {
    file: "Chicago Skyline Sunrise March 15 2026 - 02.jpg",
    place: "The Chicago skyline at sunrise, from the lakefront",
    credit: "NorbertNagel",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [4000, 1668],
    // At 42% the skyline sat under the words' scrim below empty sky; at 80%
    // it stands above the scrim, the Willis Tower's antennas clear of the
    // top on /market's band and on /tools' shorter one, which 100% cut
    // (band-laptop-1; focus sheets 2026-10-05).
    bandFocusY: 80,
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
    size: [2816, 1880],
  },
  san_francisco: {
    file: "SF From Marin Highlands3.jpg",
    place: "San Francisco from the Marin Headlands",
    credit: "Paul.h",
    license: "Public domain",
    licenseUrl: "",
    size: [2672, 1885],
  },
  seattle: {
    file: "View of Downtown Seattle from Ella Bailey Park (27305770463).jpg",
    place: "Downtown Seattle",
    credit: "Tiffany Von Arnim",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    size: [8443, 3361],
  },
  // Brickell rather than the whole bay: it is the submarket a CRE reader
  // means when they say Miami.
  miami: {
    file: "Brickell neighborhood skyline (60062p).jpg",
    place: "Brickell, Miami",
    credit: "Rhododendrites",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [8330, 3456],
    // Both tall towers' tops clear the laptop band at 16%; at 42% both were
    // cut (band-laptop-1; focus sheets 2026-10-05).
    bandFocusY: 16,
  },
  atlanta: {
    file: "Atlanta, Georgia Skyline.jpg",
    place: "Atlanta",
    credit: "Shawn M. Kent",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [1920, 1280],
    // At 42% the laptop band kept the freeway and lost the towers' tops; at
    // 6% the skyline stands whole above the words' scrim, Bank of America
    // Plaza's spire clear (band-laptop-1; focus sheets 2026-10-05).
    bandFocusY: 6,
  },
  // Fourth sheet (skyline-sheet run 35752500514, the first one-market run,
  // thirty-six files deep): the hazy plane-window aerial gives way to the
  // picture Dallas is actually known by — downtown at dusk with the green
  // outline of Bank of America Plaza and the ball of Reunion Tower behind
  // it. The Wikipedia article's own lead for downtown, a JPEG, where the
  // city article's lead was a 6000px PNG — measured by the probe at
  // 3,110 KB at 1600px against this file's 736 KB (live-verify run
  // 35781910084), which is the whole argument in two numbers.
  dallas: {
    file: "Dallas view.jpg",
    place: "Downtown Dallas at dusk",
    credit: "Robert Hensley",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    size: [5951, 3669],
  },
  // pittsburgh: chosen by eye from contact sheet 7 (skyline-sheet run
  // 35943054619, 2026-09-24) — the golden-hour view over the Monongahela with PPG Place lit, the picture the city is known by — over a winter overlook framed by a bare tree and two night panoramas too short for the band.
  pittsburgh: {
    file: "Downtown Pittsburgh seen from Mt. Washington.jpg",
    place: "Downtown Pittsburgh at the Point, from Mount Washington",
    credit: "EEJCC",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [3264, 2448],
  },
  // denver: chosen by eye from contact sheet 7 (skyline-sheet run
  // 35943054619, 2026-09-24) — the article's own lead, the towers against the snow on the Front Range at 6782px — over a 2048×580 midnight panorama and a stadium aerial.
  denver: {
    file: "Denver, Colorado skyline (cropped 3x5).jpg",
    place: "Downtown Denver against the Front Range",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    size: [6782, 4069],
  },
  // nashville: chosen by eye from contact sheet 7 (skyline-sheet run
  // 35943054619, 2026-09-24) — the article's lead, downtown over the Cumberland with the river bridges in the frame at 6850px — over three drone aerials of the riverfront.
  nashville: {
    file: "Nashville, Tennessee (cropped).jpg",
    place: "Downtown Nashville over the Cumberland River",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    size: [6850, 4113],
  },
  // austin: chosen by eye from contact sheet 7 (skyline-sheet run
  // 35943054619, 2026-09-24) — the article's lead, the tower cluster over Lady Bird Lake at 10242px — over the pedestrian-bridge view and a sunset frame from 2011.
  austin: {
    file: "Skyline of Austin, Texas (cropped).jpg",
    place: "Downtown Austin over Lady Bird Lake",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    size: [10242, 5636],
  },
  // houston: chosen by eye from contact sheet 8 (skyline-sheet run
  // 35943350787, 2026-09-24) — the article's lead, the tower cluster over the bayou's trees at 4320px — over a 3587×1202 strip and street-level frames of the aquarium and the transit centre.
  houston: {
    file: "Downtown Houston, TX Skyline - 2018.jpg",
    place: "Downtown Houston from Buffalo Bayou",
    credit: "David Daniel Turner",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    size: [4320, 2160],
    // The tallest tower's top clears the laptop band at 22%; at 42% it was
    // cut (band-laptop-2; focus sheets 2026-10-05).
    bandFocusY: 22,
  },
  // minneapolis: chosen by eye from contact sheet 8 (skyline-sheet run
  // 35943350787, 2026-09-24) — the article's lead, the skyline over the river at 4828px — over St. Anthony Falls at dusk, which is the falls rather than the city, and a 5168×1528 strip.
  minneapolis: {
    file: "Minneapolis Skyline looking south.jpg",
    place: "Downtown Minneapolis over the Mississippi, looking south",
    credit: "BpA9543",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [4828, 2672],
  },
  // las_vegas: chosen by eye from contact sheet 8 (skyline-sheet run
  // 35943350787, 2026-09-24) — the Strip lit at night from above at 6144px, the picture the place is known by — over a daytime aerial of downtown and the mountains, which is a city rather than Las Vegas.
  las_vegas: {
    file: "Night aerial view, Las Vegas, Nevada, 04649u.jpg",
    place: "The Las Vegas Strip at night, from the air",
    credit: "Carol M. Highsmith",
    license: "Public domain",
    licenseUrl: "",
    size: [6144, 4096],
  },
  // tampa: chosen by eye from contact sheet 8 (skyline-sheet run
  // 35943350787, 2026-09-24) — the article's lead, the towers across the river under a blue sky at 4810px — over two Gasparilla-festival frames from 2002 and a 1913 photograph.
  tampa: {
    file: "Downtown Tampa, Florida.jpg",
    place: "Downtown Tampa across the Hillsborough River",
    credit: "Clément Bardot",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [4810, 2762],
    // The tallest tower's pointed crown is whole in the laptop band at 8%;
    // at 42% it was cut off (band-laptop-2; focus sheets 2026-10-05).
    bandFocusY: 8,
  },
  // raleigh: chosen by eye from contact sheet 9 (skyline-sheet run
  // 35943520435, 2026-09-24) — the article's lead, the tower cluster and the amphitheatre lit low from the west at 4000px — over two panoramio street views, a Fayetteville Street frame and, from the search, a photograph of Kyiv by a Raleigh photographer.
  raleigh: {
    file: "Raleigh Skyline.jpg",
    place: "Downtown Raleigh at golden hour, from the air",
    credit: "Abhiram Juvvadi",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [4000, 2250],
  },
  // salt_lake_city: chosen by eye from contact sheet 9 (skyline-sheet run
  // 35943520435, 2026-09-24) — the article's lead, the skyline under the snow on the Wasatch at 3000px — over a rooftop view from the Church Office Building and four airport aerials.
  // Its own one-market run (skyline-sheet run 35945126660) found nothing better:
  // the view from Ensign Peak is a grid under a haze and the Capitol a building.
  salt_lake_city: {
    file: "SLC Skyline 2024.jpg",
    place: "Downtown Salt Lake City against the Wasatch",
    credit: "Invictus323",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    size: [3000, 1395],
  },
  // san_antonio: chosen by eye from contact sheet 9 (skyline-sheet run
  // 35943520435, 2026-09-24) — the city from its own observation tower at 4032px, the Grand Hyatt in the foreground — over a 2000×735 strip and a campus frame.
  san_antonio: {
    file: "Downtown San Antonio view from The Tower of the Americas.jpg",
    place: "Downtown San Antonio from the Tower of the Americas",
    credit: "Jouaienttoi",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [4032, 1708],
  },
  // sacramento: chosen by eye from contact sheet 9 (skyline-sheet run
  // 35943520435, 2026-09-24) — the article's lead, the gold Tower Bridge with the skyline behind at 7967px — over a ballpark frame and two aerials.
  sacramento: {
    file: "Sacramento, CA skyline (cropped).jpg",
    place: "The Tower Bridge and downtown Sacramento over the Sacramento River",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    size: [7967, 4484],
  },
  // columbus: chosen by eye from contact sheet 9 (skyline-sheet run
  // 35943520435, 2026-09-24) — the article's lead, the LeVeque Tower and the river at 6188px, public domain — over the same view in two other crops and a rooftop frame from the tower.
  columbus: {
    file: "Downtown Columbus View from Main St Bridge - edit1.jpg",
    place: "Downtown Columbus from the Main Street Bridge over the Scioto",
    credit: "Paul Wasneski",
    license: "Public domain",
    licenseUrl: "",
    size: [6188, 4227],
  },  // kansas_city: chosen by eye from contact sheet 10 (skyline-sheet run
  // 35943694349, 2026-09-24), through the market band's own crop — the downtown article's own view, the towers and the Kauffman Center over Union Station's roof, 3264px — over a tight tower crop that loses its tops in the band, and an Army Corps aerial of Kansas City, Kansas.
  kansas_city: {
    file: "View from base of the Liberty Memorial.jpg",
    place: "Downtown Kansas City over Union Station, from the Liberty Memorial",
    credit: "Brit By Birth",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [3264, 2448],
  },
  // st_louis: chosen by eye from contact sheet 10 (skyline-sheet run
  // 35943694349, 2026-09-24), through the market band's own crop — the article's lead, the Arch framing the courthouse dome, 3133px — over the Arch Overlook frame (a PNG, never served), a 2007 skyline strip too short for the band at 1139px, and a 1908 postcard.
  st_louis: {
    file: "Runner Fountain and Old Courthouse and Arch (5618845531).jpg",
    place: "The Gateway Arch over the Old Courthouse, St. Louis",
    credit: "Jefferson National Expansion Memorial, NPS from St. Louis, MO, USA",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    size: [3133, 2400],
  },
  // cincinnati: chosen by eye from contact sheet 10 (skyline-sheet run
  // 35943694349, 2026-09-24), through the market band's own crop — the article's lead at 5568px, the towers, the stadium and the river in one frame — over the Roebling Bridge frame (a tower of the bridge and a sky) and the same photographer's view from Mt. Adams.
  cincinnati: {
    file: "Downtown Cincinnati viewed from Devou Park (cropped).jpg",
    place: "Downtown Cincinnati across the Ohio River from Devou Park, Kentucky",
    credit: "EEJCC",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [5568, 2786],
  },
  // jacksonville: chosen by eye from contact sheet 10 (skyline-sheet run
  // 35943694349, 2026-09-24), through the market band's own crop — the article's lead at 7823px — over the Fuller Warren Bridge panorama, which in the band is an overpass, and a stadium aerial.
  jacksonville: {
    file: "Jacksonville skyline.jpg",
    place: "Downtown Jacksonville's Northbank from the air",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    size: [7823, 5035],
    // The tallest tower's pyramid top is whole in the laptop band at 23%; at
    // 42% the band kept its shaft and cut the top (band-laptop-4; focus
    // sheets 2026-10-05).
    bandFocusY: 23,
  },
  // detroit: chosen by eye from contact sheet 10 (skyline-sheet run
  // 35943694349, 2026-09-24), through the market band's own crop — the article's lead at 4773px — over a night frame from 2021 whose Renaissance Center falls out of the phone's crop, a Gordie Howe Bridge aerial and a 1929 panorama (a PNG).
  detroit: {
    file: "Detroit Skyline from Windsor 2025-09-01.jpg",
    place: "Downtown Detroit and the Renaissance Center across the river from Windsor",
    credit: "TheWxResearcher",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    size: [4773, 2787],
  },
  // portland: chosen by eye from contact sheet 11 (skyline-sheet run
  // 35943831078, 2026-09-24), through the market band's own crop — the view the city is known by, downtown under Mount Hood at 22500px and 3.75:1, the band's own shape — over the article's lead aerial, whose crop loses the mountain, and a night skyline on the Willamette that could be any river town.
  portland: {
    file: "Portland from Pittock Mansion October 2019 panorama 2.jpg",
    place: "Portland and Mount Hood from Pittock Mansion at dusk",
    credit: "King of Hearts",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [22500, 6000],
  },
  // cleveland: chosen by eye from contact sheet 11 (skyline-sheet run
  // 35943831078, 2026-09-24), through the market band's own crop — the article's lead at 8199px, the Key Tower and the Terminal Tower tall in frame — over a sunrise panorama whose towers vanish under the words and the same view in June 2024, which loses the Key Tower's top.
  cleveland: {
    file: "Cleveland skyline from Lakewood Park, January 2026.jpg",
    place: "The Cleveland skyline across Lake Erie from Lakewood Park",
    credit: "Erik Drost",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    size: [8199, 4340],
    // Key Tower's pyramid and spire are whole in the laptop band at 4%; at
    // 42% the pyramid was cut (band-laptop-4; focus sheets 2026-10-05).
    bandFocusY: 4,
  },
  // phoenix: chosen by eye from its own one-market sheet (skyline-sheet run
  // 35944782635, 2026-09-24), through the market band's own crop — the article's lead, an oblique aerial of the towers with the mountains beyond them — over a street corner and the airport's control tower, which are what the six-market sheet held, a hazy dusk from South Mountain and two night frames the band turns black.
  phoenix: {
    file: "Downtown Phoenix Aerial Looking Northeast (cropped).jpg",
    place: "Downtown Phoenix from the air, looking northeast to the mountains",
    credit: "DPPed",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    size: [3300, 2063],
  },
  // charlotte: chosen by eye from its own one-market sheet (skyline-sheet run
  // 35944863842, 2026-09-24), through the market band's own crop — the Duke Energy Center's violet and the Bank of America crown filling the band — over the article's daytime lead, whose crop loses its tallest tower's top, a monochrome strip too short for the band and a stadium aerial.
  charlotte: {
    file: "Charlotte night skyline 2016.jpg",
    place: "Uptown Charlotte's towers lit at night",
    credit: "Nan Palmero",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    size: [6480, 4320],
  },
  // san_diego: chosen by eye from its own one-market sheet (skyline-sheet run
  // 35944937703, 2026-09-24), through the market band's own crop — the view the city is known by, from its own tallest-buildings article — over a hazy night panorama, a sunrise panorama whose towers vanish under the words and two daytime frames that lose their tops.
  san_diego: {
    file: "San Diego skyline at dusk from Coronado 2015.jpg",
    place: "Downtown San Diego at dusk, across the bay from Coronado",
    credit: "russellstreet",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    size: [5289, 3537],
  },
  // orlando: chosen by eye from its own one-market sheet (skyline-sheet run
  // 35944984991, 2026-09-24), through the market band's own crop — Lake Eola, the picture the city is known by, with the fountain and the towers reflected — over a high aerial, a rooftop over a car park and the same lake under a storm sky.
  orlando: {
    file: "High-rises in Orlando from Lake Eola Park (May 2023) - 5 (cropped).JPG",
    place: "Downtown Orlando over Lake Eola and its fountain",
    credit: "Benoît Prieur",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    size: [4032, 2454],
    // The towers are whole in the laptop band at 16%, the fountain at the
    // scrim's edge; at 42% the band was half lake and the towers' tops cut
    // (band-laptop-4; focus sheets 2026-10-05).
    bandFocusY: 16,
  },
  // indianapolis: chosen by eye from its own one-market sheet (skyline-sheet run
  // 35945058692, 2026-09-24), through the market band's own crop — the monument at the city's centre against a sunset — over two midday panoramas where the city is a strip under the words and the stadium and reservoir aerials the six-market sheet held; the credit is the name the runner printed, without the permission link printed after it.
  indianapolis: {
    file: "Downtown Indianapolis panorama, 2015.jpg",
    place: "Downtown Indianapolis and the Soldiers' and Sailors' Monument at sunset",
    credit: "reddit user MikeSanborn",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    size: [4382, 2230],
    // The tallest tower and the flag on its neighbour are whole in the
    // laptop band at 22%, the monument above the scrim; at 42% the tower's
    // top was cut (band-laptop-5; focus sheets 2026-10-05).
    bandFocusY: 22,
  },
  // riverside: chosen by eye from its own one-market sheet (skyline-sheet run
  // 35945179705, 2026-09-24), through the market band's own crop — a real view of the place from the mountain over the campus — there is no skyline to photograph, and the convention-centre aerial and the San Bernardino station and airport frames were the alternatives.
  riverside: {
    file: "Riverside, California view from Box Springs.jpg",
    place: "Riverside from Box Springs Mountain, over the UC Riverside campus",
    credit: "vlasta2",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    size: [2512, 1844],
  },  // ── Metro areas the site reads no figures for (#472) ──────────────────────
  // Aguadilla, PR: skyline-sheet run 37287443715 — an article's lead, the town on its bay from the air in summer sun, a beach and a breakwater on turquoise water below houses climbing to green hills, a white block by the pier; no horizon, but the houses stand side-on in perspective over the sea, so it reads as a town, not a map (Hot Springs' case); a 1519px film scan, served at its own width as Erie's is. Over Rincón from a drone as a 2.8:1 panorama whose card is grey cloud with the town under the words, Crash Boat Beach's pier of bathers' backs under a flag, the beach under palms, palm fronds over a sunset beach and a bar's view of umbrellas and parked cars.
  "cbsa:10380": {
    file: "Aguadilla Pueblo.jpg",
    place: "Aguadilla on its bay from the air, a beach and a breakwater below houses climbing green hills",
    credit: "U.S. Corps of Engineers",
    license: "Public domain",
    licenseUrl: "",
    name: "Aguadilla, PR",
    size: [1519, 961],
  },
  // Akron, OH: skyline-sheet run 36782855933 — the skyline at a card's full height, over a warmer panorama too short for the deal page's frame.
  "cbsa:10420": {
    file: "AkronPanorama.jpg",
    place: "The Akron skyline",
    credit: "Sleepydre",
    license: "Public domain",
    licenseUrl: "",
    name: "Akron, OH",
    size: [3296, 1679],
  },
  // Albany, OR: skyline-sheet run 37387656865 — from Albany's category, an Oregon State Archives photograph: a green steel truss bridge over the river beyond a timber pier walkway with railings and a lamppost, autumn trees on the banks, a grey-white clouded sky; the trusses above the words in both crops, the 21:9 keeping the near arch whole with a little sky above it; crisp; soft overcast light. The credit is the photographer and the archive as printed (Daphne-Fairhope-Foley's precedent). Over the same bridge from a timber railing whose 21:9 cuts the arches' tops, the Linn County Courthouse with a flagpole the 21:9 cuts, 1st Ave SW under a signal arm and street signs, a street clock close, and an aerial its title places at Portland's Fremont Bridge.
  "cbsa:10540": {
    file: "Albany - DPLA - 06f3bb247d96d8dcd93b6e575b04adc7.jpg",
    place: "A green steel truss bridge over the river beyond a timber pier walkway",
    credit: "Gary Halvorson, Oregon State Archives",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Albany, OR",
    size: [2000, 1330],
  },
  // Albany, NY: skyline-sheet run 36779692322 — the plaza the city is known by; the one clear frame of seven.
  "cbsa:10580": {
    file: "EmpireStatePlazaPanorama.jpg",
    place: "The Empire State Plaza's towers, Albany",
    credit: "UpstateNYer",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Albany, NY",
    size: [6386, 3130],
  },
  // Keyed by the metro area's Census code (`areaSkylineId`), each reached
  // through a deal's county (lib/market-picture) — a card and the deal page,
  // never a /market band. Chosen by eye from skyline-sheet runs on
  // 2026-09-30, each file, credit and licence copied from the run's
  // index.json, and judged through the card's and the deal page's crops.
  // Albuquerque, NM: skyline-sheet run 36753099586 — the article's lead image, whole in every crop.
  "cbsa:10740": {
    file: "Albuquerque, New Mexico skyline.jpg",
    place: "Downtown Albuquerque from above",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Albuquerque, NM",
    size: [6560, 3690],
  },
  // Allentown, PA: skyline-sheet run 36782733907 — the city's own skyline, lit for Christmas, over a hazy distant view and street scenes of Bethlehem.
  "cbsa:10900": {
    file: "2017 - Hamilton Street Christmas Skyline - Allentown PA.jpg",
    place: "The Hamilton Street skyline at Christmas, Allentown",
    credit: "Atwngirl",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Allentown, PA",
    size: [2048, 1151],
  },
  // Altoona, PA: skyline-sheet run 37313470791 — an article's lead, the city from a hill in warm late-day light, a domed church, a white tower block and a water tower over brick blocks and houses, a long wooded ridge on the horizon with cloud on its top, whole in both crops (the 21:9 keeps the ridge and a strip of sky), crisp. Over Horseshoe Curve from straight above (a map), its park's lawn and benches as a 4.4:1 strip, the domed church at a street's end over a road and cars, a highway under cloud twice and a red cactus twice.
  "cbsa:11020": {
    file: "Altoona, Pennsylvania.jpg",
    place: "Altoona from a hill, a domed church and a white tower block over brick blocks and houses, a ridge beyond",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Altoona, PA",
    size: [7302, 4381],
  },
  // Amarillo, TX: skyline-sheet run 36818765688 — Palo Duro Canyon, the landmark the area is known by, its red-banded walls and mesas over juniper from the CCC overlook, sharp, the far rim whole at the 21:9's top; over downtown under a grey overcast behind a signal mast, the towers small under heavy cloud behind scrub and a fence, Cadillac Ranch tiny in a brown field from a drone, a street of signs, the canyon from high in the air, and a canyon strip too short for a phone's card.
  "cbsa:11100": {
    file: "Palo Duro Canyon from CCC Overlook 2024.jpg",
    place: "Palo Duro Canyon from the CCC overlook, its red walls and mesas over juniper",
    credit: "Larry D. Moore",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Amarillo, TX",
    size: [2999, 2000],
  },
  // Amherst Town-Northampton, MA: skyline-sheet run 37278011774 — an article's photograph, the UMass Amherst campus from a drone in autumn colour, its library tower and the high-rise halls among red and gold trees, the hills on the horizon under a deep blue sky, every top and the horizon whole in both crops; over the campus from its playing fields as a 3:1 strip, Amherst from the air (the 21:9 cuts the library tower's top), Northampton's rooftops (the 21:9 loses the sky and the horizon and reads as roofs), a 1912 newsboy, an alley's murals, an elm and a shopfront.
  "cbsa:11200": {
    file: "UMass Amherst campus aerial view.jpg",
    place: "The UMass Amherst campus from the air in autumn colour, hills on the horizon",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Amherst Town-Northampton, MA",
    size: [4827, 3137],
  },
  // Anchorage, AK: skyline-sheet run 36782967654 — the snow on the mountains behind downtown, over the city article's lead, a view from above whose card crop loses the mountains.
  "cbsa:11260": {
    file: "Anchorage eastward view from Hotel Captain Cook.jpg",
    place: "Looking east over downtown Anchorage from the Hotel Captain Cook",
    credit: "Joseph",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    name: "Anchorage, AK",
    size: [3663, 2108],
  },
  // Ann Arbor, MI: skyline-sheet run 36797923875 — the city article's skyline, whole in both crops under a clear sky, over the same towers in a washed-out haze, a night frame that goes dark under the card's shade, street corners, a bus station, a bank and a coffee shop.
  "cbsa:11460": {
    file: "Ann Arbor Skyline 2021.jpg",
    place: "Downtown Ann Arbor's rooftops and towers under a blue sky",
    credit: "WeaponizingArchitecture",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Ann Arbor, MI",
    size: [4024, 1901],
  },
  // Anniston-Oxford, AL: skyline-sheet run 37387656865 — the Anniston article's lead, a downtown street: a row of red brick and painted fronts with green awnings and arched windows, a lamppost, the street running to a tall pale office block, a blue sky with cumulus; the row's cornices above the words in both crops; crisp. The title is kept whole. The runner printed the author as "Rivers Langley; SaveRivers", a name and an account; the credit is the name in it, as Auburn-Opelika's "Rivers A. Langley; SaveRivers" is — zori probe_url run 37389642101 printed the file page's Author field as "Rivers Langley; SaveRivers" (the account's user page linked), and the file names no other attribution beside the licence. Over Oxford's corner under wires and signals hung on a wire, the county courthouse with a wire across it and its cupola cut at 21:9, a NARA record card of a foundry, and a stereoscopic card of a furnace (once as a PNG).
  "cbsa:11500": {
    file: "Anniston, Alabama.JPG",
    place: "A downtown Anniston street of brick fronts and green awnings under cumulus",
    credit: "Rivers Langley",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Anniston-Oxford, AL",
    size: [3915, 2090],
  },
  // Asheville, NC: skyline-sheet run 36782967654 — the city under its mountains, over a grey-sky cityscape and a washed-out panorama.
  "cbsa:11700": {
    file: "Asheville North Carolina Skyline July 2023.jpg",
    place: "The Asheville skyline and the mountains beyond",
    credit: "Asheville Photography",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Asheville, NC",
    size: [5679, 3838],
  },
  // Auburn-Opelika, AL: skyline-sheet run 37236686331 — an article's lead, Railroad Avenue in Opelika, the title's second city: painted brick fronts, awnings and iron balconies in sun under a clear sky, sharp, whole on the card, the deal page's crops cutting one parapet's urn finial and, at 21:9, its scrolled pediment and the top of its painted name; over Auburn's city hall behind a lamppost and bare trees, and five frames of a football game's band and dancers.
  // The runner printed the author as "Rivers A. Langley; SaveRivers", and the file page's own Author field is the same, a name and the photographer's Commons username, with no attribution template (zori probe_url run 37240971983); the credit is the name in it, as Duluth's and Dover's are.
  "cbsa:12220": {
    file: "Railroad Avenue Historic District Opelika Alabama.JPG",
    place: "Railroad Avenue's painted storefronts in downtown Opelika under a clear blue sky",
    credit: "Rivers A. Langley",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Auburn-Opelika, AL",
    size: [3329, 2302],
  },
  // Augusta, GA: skyline-sheet run 36782967654 — the city article's lead, the skyline in the evening light, over HDR street scenes.
  "cbsa:12260": {
    file: "Augusta, GA Downtown Skyline 2017.jpg",
    place: "Downtown Augusta across the Savannah River",
    credit: "c_live_lee",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Augusta, GA",
    size: [5448, 3737],
  },
  // Bakersfield, CA: skyline-sheet run 36783419278 — a one-market run's find, the city's skyline against the evening sky, over single buildings, the Fox Theater and a hazy panorama from the six-market sheet.
  "cbsa:12540": {
    file: "BakersfieldSkyline.jpg",
    place: "The Bakersfield skyline at twilight",
    credit: "Robert Hale",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    name: "Bakersfield, CA",
    size: [3088, 2048],
  },
  // Bangor, ME: skyline-sheet run 37278011774 — downtown across the river under a clear blue sky, a brick tower, a church spire and the old blocks among trees behind an iron rail bridge on stone piers, a motorboat on deep blue water, the city above the card's words and nothing tall for the 21:9 to cut; over the Penobscot through forest from a bridge's observatory, with no Bangor in the frame, and three winter frames: a street of parked trucks, a wet crossing under a signal's arm and a pub's sign.
  "cbsa:12620": {
    file: "BangorSkyline.jpg",
    place: "Downtown Bangor across the river under a clear blue sky, a rail bridge on stone piers in front",
    credit: "GambitMG at English Wikipedia",
    license: "Public domain",
    licenseUrl: "",
    name: "Bangor, ME",
    size: [2048, 1536],
  },
  // Barnstable Town, MA: skyline-sheet run 36816098960 — the Old Harbor Life Saving Station small on the dune line at sunset under heavy blue-grey cloud, golden grass across the foot, from the Cape Cod article, whole in both crops. Chosen over the sheet's first pick, White Crest Beach in Wellfleet: its photographer's attribution page (en.wikipedia User:MattWade/ImageAttribution, read from the runner in zori run 36817794786) asks for his name linked to his own user page, a link this credit line does not carry. Over Provincetown under a pale sky from the Pilgrim Monument and Chatham Light at night.
  "cbsa:12700": {
    file: "Old Harbor Life Saving Station, Sunset.JPG",
    place: "The Old Harbor Life Saving Station on the Cape Cod dunes at sunset, under heavy cloud",
    credit: "JCefaly",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Barnstable Town, MA",
    size: [3888, 2592],
  },
  // Bay City, MI: skyline-sheet run 37387656865 — the city article's lead, the riverfront across the Saginaw River: a low row of brick blocks, townhouses and a pale balconied block at the right, docks, grey water, a broad clouded sky with blue patches over the top two thirds; the row just above the words in both crops; crisp, light noise on the water; a modest pick, the buildings small in the frame. The runner printed the author as "WeaponizingArchitecture", an account name; zori probe_url run 37389642101 printed it as the file page's Author field, linking the account's user page, and the file names no other attribution beside the licence. Over the downtown historic district under wires and hung signals, a dusk frame of a thin row under an empty sky, the Masonic Temple in heavy processing with its roof cut at 21:9, a speedboat under a bridge, and an 1888 photograph of Saginaw.
  "cbsa:13020": {
    file: "Bay City, Michigan (2022).jpg",
    place: "Bay City's riverfront across the Saginaw River under a clouded sky",
    credit: "WeaponizingArchitecture",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Bay City, MI",
    size: [4030, 2267],
  },
  // Beckley, WV: skyline-sheet run 37313470791 — from the bridge's category, the New River Gorge Bridge's steel arch across the gorge from the low bridge below, under a deep blue sky with cumulus, the wooded walls falling to the river, the deck running off the left edge as the bridge does; whole in the card, and the only one of three frames whose deck the 21:9 keeps under a strip of sky; crisp; the bridge is in Fayette County, inside the metro area (the file name says so), so the picture is named for the metro area and its place says it is the bridge (Belton's rule). Over the same view half a minute either side (the 21:9 cuts the deck in both), the deck's roadway over fog (a road filling the frame, its author printed unknown) and a cabin in a meadow.
  "cbsa:13220": {
    file: "2017-09-08 13 59 38 View northwest down the New River towards the New River Gorge Bridge (U.S. Route 19) from the Tunney Hunsaker Bridge (Fayette County Route 82) over the New River between Fayette and South Fayette in Fayette County, West Virginia.jpg",
    place: "The New River Gorge Bridge's arch across the wooded gorge, under a blue sky with cumulus",
    credit: "Famartin",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Beckley, WV",
    size: [3264, 2448],
  },
  // Bellingham, WA: skyline-sheet run 36816430466 — an article's lead, downtown from a low drone under cumulus, the red-brick Old City Hall's clock tower and the downtown blocks in sun, forested hills and a ridge behind, every top whole in both crops. Over an aerial over the harbour's industrial waterfront with Mount Baker on the horizon, a 1972 slide of the harbour full of logs, a 1908 postcard with its printed title and a barge leaving the port under grey cloud.
  "cbsa:13380": {
    file: "Bellingham, Washington (cropped).jpg",
    place: "Downtown Bellingham and its red-brick Old City Hall from above, forested hills behind",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Bellingham, WA",
    size: [6475, 3887],
  },
  // Bend, OR: skyline-sheet run 36808230184 — the Deschutes beside Drake Park under a blue sky, its banks mirrored in the water, sharp and whole in both crops, over a downtown street at dawn under the Tower Theatre's sign with a bronze figure on a bench in its foreground, Mount Bachelor under a grey sky (the area's mountain, not the city), and two panoramas of the river 560 and 592px tall at their own width.
  "cbsa:13460": {
    file: "Drake Park, Bend (July 2012) - 1.JPG",
    place: "The Deschutes River beside Drake Park in Bend, its banks mirrored in the water",
    credit: "Another Believer",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Bend, OR",
    size: [4000, 3000],
  },
  // Billings, MT: skyline-sheet run 37236536465 — an article's lead, downtown from the air on a clear winter day, its tallest tower whole at the left and the Rims along the horizon, an oblique with a horizon, sharp; over the railyard's coal trains toward downtown under an overcast, a printed postcard, a bank's lit sign, a bus terminal, a street corner under a signal's arm and two dark night frames.
  "cbsa:13740": {
    file: "Billings, Montana skyline in 2024.jpg",
    place: "Downtown Billings on a clear winter day, the Rims along the horizon",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Billings, MT",
    size: [7855, 5145],
  },
  // Binghamton, NY: skyline-sheet run 36818942891 — downtown from the air on its river in warm summer light, wooded hills and a blue sky behind, an oblique with a horizon, sharp and whole in both crops; over a campus building behind streetlamps, the skyline small behind trees and power lines, and two hazy frames over pylons, wires and a wall.
  "cbsa:13780": {
    file: "Binghamton, New York skyline.jpg",
    place: "Downtown Binghamton from above on its river, wooded hills behind, under a blue sky",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Binghamton, NY",
    size: [8064, 5832],
  },
  // Birmingham, AL: skyline-sheet run 36754192984 — the Alabama article's lead, sharp under a clear sky, every tower whole on the card and the deal page's crop; the first run searched Birmingham, England's categories.
  "cbsa:13820": {
    file: "Birmingham, Alabama.jpg",
    place: "Downtown Birmingham's skyline beyond the rail corridor",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Birmingham, AL",
    size: [11551, 5574],
  },
  // Bismarck, ND: skyline-sheet run 37236951448 — the State Capitol's tower the city is known by, under a blue sky and cumulus, its roof and masts inside the 21:9's top edge; over the same photograph before its crop and a drone frame of the Capitol, each losing the tower's top at 21:9, the Capitol behind a stone sign with a date stamp, downtown from a drone that reads as a map, and a cigarette card's lithograph.
  "cbsa:13900": {
    file: "2009-0521-ND-StateCapitol (cropped).jpg",
    place: "The North Dakota State Capitol's tower in spring, under a blue sky and cumulus",
    credit: "Bobak Ha'Eri",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0",
    name: "Bismarck, ND",
    size: [3648, 1831],
  },
  // Blacksburg-Christiansburg-Radford, VA: skyline-sheet run 37330328150 — from Burruss Hall's category: Virginia Tech's Burruss Hall, its stone tower across the Drillfield's lawn among autumn trees and two flags, half the frame an empty deep blue sky; the tower above the card's words in both crops, the long name across the hall's base at 21:9; crisp; the round's modest pick with Sheboygan's, the subject small in the frame. The title is kept whole. Over a turreted Victorian house whose turret the 21:9 cuts, a downtown corner under signal arms (the article's lead), a book drop behind caution tape, a man talking, a manhole cover and a 7-Eleven.
  "cbsa:13980": {
    file: "Virginia Tech Burruss Hall from Drillfield.JPG",
    place: "Virginia Tech's Burruss Hall across the Drillfield in autumn",
    credit: "Eric T Gunther",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0",
    name: "Blacksburg-Christiansburg-Radford, VA",
    size: [3264, 2448],
  },
  // Bloomington, IL: skyline-sheet run 37349000346 — an article's lead, the white stone building with its portico, pediment and dark clock dome topped by a green lantern, under a clear blue sky (the file calls it the city hall); the card keeps the whole building and the dome above the words, the 21:9 keeps the dome and lantern whole a little below its top edge; crisp; converging verticals. Over an oblique aerial of subdivisions in haze, the Normal Theater's lettered marquee at dusk, and five locomotives in a yard.
  "cbsa:14010": {
    file: "Bloomington, IL city hall 1 (cropped).jpg",
    place: "Bloomington's domed stone building with its clock and lantern under a blue sky",
    credit: "Daniel Schwen",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Bloomington, IL",
    size: [4036, 2032],
  },
  // Bloomington, IN: skyline-sheet run 37236836751 — an article's lead, Kirkwood Avenue at sunset, its shops, lamps and trees running to the courthouse's dome under a lit sky, whole in both crops; over five portraits of the courthouse, each losing its dome's top at 21:9, two with cars along the foot, a portrait with a portable toilet and parked cars, and the dome's interior.
  "cbsa:14020": {
    file: "Bloomington IN Kirkwood.jpg",
    place: "Kirkwood Avenue at sunset, the Monroe County Courthouse's dome at its end",
    credit: "Yahala",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Bloomington, IN",
    size: [3004, 1993],
  },
  // Boise, ID: skyline-sheet run 36751130861 — the article's lead image, whole in every crop.
  "cbsa:14260": {
    file: "Boise, Idaho.jpg",
    place: "Downtown Boise at golden hour under the snow-dusted foothills",
    credit: "Jyoni Shuler",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Boise, ID",
    size: [3600, 2504],
  },
  // Boulder, CO: skyline-sheet run 36799416970 — the Flatirons in the evening light under gold clouds, the ridge and the snow behind whole in both crops above the words, over the campus and the Flatirons from the air, whose summit the deal page's 16:9 cuts and whose Flatirons its 21:9 cuts through, the slabs in fog, Pearl Street's corners, a black-and-white frame and a crane across the campus.
  "cbsa:14500": {
    file: "Flatirons view from Broomfield, Colorado.jpg",
    place: "The Flatirons at sunset, snow on the peaks behind, from Broomfield",
    credit: "Kpsudeep",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Boulder, CO",
    size: [5456, 3632],
  },
  // Bozeman, MT: skyline-sheet run 37236536465 — an article's lead, Main Street's brick and stone blocks in summer sun under a clear sky, the Hotel Baxter's rooftop sign down the street, whole in both crops but for a chimney's top the 21:9 cuts; over the Bridger Range behind a wheat field under a white sky, a lamppost's welcome banner over a car's roof, and three portraits of brick fronts behind parked cars.
  "cbsa:14580": {
    file: "Main St, Bozeman, Montana (1).JPG",
    place: "Main Street in downtown Bozeman under a clear sky, the Hotel Baxter's rooftop sign down the street",
    credit: "Chris06",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Bozeman, MT",
    size: [2048, 1536],
  },
  // Bridgeport, CT: skyline-sheet run 36750858237 — the principal city's lead image, whole in every crop.
  "cbsa:14860": {
    file: "Bridgeport, Connecticut downtown.jpg",
    place: "Downtown Bridgeport and its harbor from the air",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Bridgeport, CT",
    size: [8036, 5357],
  },
  // Brownsville-Harlingen, TX: skyline-sheet run 36787230817 — whole in both crops in clear daylight, where the other frame's tallest tower loses its crown in the wide crop under a hazy sky; the card names the metro area, since the beach is South Padre Island's.
  "cbsa:15180": {
    file: "South Padre Island beach panorama.jpg",
    place: "The South Padre Island beach, its umbrellas and kites, over the dunes",
    credit: "Spheroidite",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Brownsville-Harlingen, TX",
    size: [7328, 3274],
  },
  // Brunswick-St. Simons, GA: skyline-sheet run 37278486927 — the Sidney Lanier Bridge from a drone in the late light, its two cable-stayed pylons over the river and the marshes, the sea on the horizon under a blue sky, whole in both crops; over a car carrier on grey water, the bridge small under a pale haze from Jekyll, the bridge from the interstate behind a barrier, and two beach frames with the bridge a speck on the horizon.
  "cbsa:15260": {
    file: "Sidney Lanier Bridge Aerial.jpg",
    place: "The Sidney Lanier Bridge over the river and the marshes from the air, the sea on the horizon",
    credit: "Devin Morris",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Brunswick-St. Simons, GA",
    size: [4032, 3024],
  },
  // Buffalo, NY: skyline-sheet run 36752030741 — the one usable frame of fourteen; the band would clip Seneca One's top.
  "cbsa:15380": {
    file: "Buffalo, NY skyline.jpg",
    place: "Downtown Buffalo from above, its ballpark and City Hall",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Buffalo, NY",
    size: [4032, 2268],
  },
  // Burlington, NC: skyline-sheet run 37387656865 — the city article's lead, which its file calls the tallest building in Burlington: a pale tower among low brick blocks from a drone, autumn trees, a water tower on the horizon, a blue sky with thin cloud; an oblique with a horizon; the tower whole in the card, the 21:9 keeping its roof's parapet and cutting the flags and poles on the roof; crisp. The runner printed the author as "Ak1047", an account name; zori probe_url run 37389642101 printed it as the file page's Author field, an account whose user page was never created, and the file names no other attribution beside the licence. Over the Alamance County Courthouse in Graham with a Confederate monument's statue beside it (whole and crisp, passed over for the monument), an abandoned car showroom, and the train station under a lattice mast.
  "cbsa:15500": {
    file: "Tallest building in Burlington.jpg",
    place: "Burlington's tallest building among low brick blocks, from the air",
    credit: "Ak1047",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Burlington, NC",
    size: [5181, 2889],
  },
  // Canton-Massillon, OH: skyline-sheet run 36816207134 — the Pro Football Hall of Fame, an article's lead and the landmark the place is known by, its dome and bronze relief under a clear sky, whole on the card and at 16:9; the 21:9 crop sets the dome's cap against its top edge. Over downtown's skyline across warehouse roofs under a blue sky, downtown behind autumn leaves across a parking lot, City Hall's tower behind a signal pole and over a wall, a soft winter strip 513px tall, a 1909 plate of the fire station and a night postcard of the square.
  "cbsa:15940": {
    file: "Pro Football Hall of Fame (23945852607).jpg",
    place: "The Pro Football Hall of Fame, its white dome and bronze relief, under a clear sky",
    credit: "Erik Drost",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Canton-Massillon, OH",
    size: [6000, 4011],
  },
  // Fort Myers, FL: skyline-sheet run 36781668552 — a widened run's pick of twenty-one (Cape Coral and the Caloosahatchee searched beside Fort Myers), over the two downtown buildings the first runs found.
  "cbsa:15980": {
    file: "Caloosahatchee River sunset from Ford estate Ft Myers (15510875243).jpg",
    place: "Sunset over the Caloosahatchee River from the Ford estate, Fort Myers",
    credit: "Russ",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Fort Myers, FL",
    size: [5805, 3870],
  },
  // Cape Girardeau, MO-IL: skyline-sheet run 37388585938 — a one-market run's find, from the Bill Emerson Memorial Bridge's category (the bridge's other files in the run sit in Cape Girardeau's own category): the cable-stayed bridge from a riverside lawn, its near H-pylon and fans of white cables across a deep blue sky with cumulus, the far pylon at the left, a riverside yard with yellow machines; the near pylon whole in both crops with sky above its tip; crisp. The two-state title is cut to its first city and state. Over the same bridge from a dry bank under a plain sky, again with its tips at the 21:9's edge, in gold evening light, at night, the American Queen at the riverfront, a caboose, a brick house behind a fence and a college building behind bare trees. The six-market sheet (run 37387809602) held the courthouse up a street under a wire with its spire cut at 21:9, a FEMA flood photograph, and three Mississippi River views its titles place at Lake Pepin, Eunice (Arkansas) and the Guthrie Theater.
  "cbsa:16020": {
    file: "Bill Emerson Bridge.jpg",
    place: "The Bill Emerson Memorial Bridge's pylons and cable fans over the Mississippi",
    credit: "Daniel Schwen",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Cape Girardeau, MO",
    size: [5045, 2000],
  },
  // Carson City, NV: skyline-sheet run 37277388755 — an article's lead, the State Capitol's silver cupola from a low drone in early spring, its stone front and portico among bare trees, the foothills on the horizon under a blue sky with cumulus, the cupola and its finial whole in both crops and only the flagpole running off the 21:9's top; over downtown from a drone whose foreground is a parking lot and a substation, the Capitol behind frosted branches at 1600px, a cigarette card, an 1875 plate and one printed postcard twice.
  "cbsa:16180": {
    file: "Nevada State Capitol Building - Carson City.jpg",
    place: "The Nevada State Capitol's silver cupola among bare trees, the foothills beyond under a blue sky",
    credit: "Quintin Soloviev",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Carson City, NV",
    size: [7584, 5613],
  },
  // Casper, WY: skyline-sheet run 37277388755 — the city across the plain from Casper Mountain, framed by ponderosa pines under a clear sky, whole in both crops; the city is a band in the middle distance, a real view of the place as Riverside's from Box Springs Mountain is; over an over-processed 3.8:1 strip from the same mountain, the mountain's snow under a grey cloud and a farm of radio towers.
  "cbsa:16220": {
    file: "Casper from Casper Mountain.jpg",
    place: "Casper spread across the plain below Casper Mountain, framed by pines",
    credit: "Milonica",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Casper, WY",
    size: [4032, 1960],
  },
  // Cedar Rapids, IA: skyline-sheet run 36816207134 — downtown across the river under a grey sky, from the city's article, every tower whole in both crops, the water along the foot. Over the same skyline at night under a rising moon, whose card goes black above the towers and below the water, brick fronts from the pavement with a skywalk, a bridge's underside over a gravel bar and a highway bridge behind a railing.
  "cbsa:16300": {
    file: "Cedar Rapids Skyline (2022).jpg",
    place: "Downtown Cedar Rapids across the river under a grey sky",
    credit: "WeaponizingArchitecture",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Cedar Rapids, IA",
    size: [3855, 1554],
  },
  // Charleston, WV: skyline-sheet run 36816361727 — the West Virginia State Capitol from above the Kanawha, its gold dome against a wooded ridge and its reflection in the river, sky across the top, whole in both crops. Over the front at ground level, whose 21:9 takes its finial and half its lantern, a drone view of the front under an America 250 banner, whose 21:9 takes its lantern, the dome small beyond a running track and through blades of grass, and an 1891 engraving.
  "cbsa:16620": {
    file: "The Capitol from the air (35064567685).jpg",
    place: "The West Virginia State Capitol's gold dome over the Kanawha River, from above the water",
    credit: "Josh Stapler from Charleston, United States",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Charleston, WV",
    size: [4000, 2250],
  },
  // Charleston, SC: skyline-sheet run 36751130861 — the picture the city is known by; the credit is the name the runner printed, without the talk-page link printed after it.
  "cbsa:16700": {
    file: "Rainbow Row Panorama.jpg",
    place: "Rainbow Row's pastel houses, Charleston",
    credit: "Something Original",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Charleston, SC",
    size: [11446, 2950],
  },
  // Chattanooga, TN: skyline-sheet run 36780772501 — the clearest skyline of five; the article's lead is a mural.
  "cbsa:16860": {
    file: "Chattanooga Skyline.JPG",
    place: "Downtown Chattanooga's towers under a clear sky",
    credit: "James Pressley",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Chattanooga, TN",
    size: [4288, 1473],
  },
  // Chico, CA: skyline-sheet run 36819025201 — an article's lead: Upper Bidwell Park's canyon under cumulus clouds after the Park Fire, golden meadows on its floor and its rim far inside both crops, the oaks below in shade under the words; over Kendall Hall's dome behind a sunlit arcade, which the 21:9 cuts, an airliner's hazy view of Lake Oroville, a sculpture of two hands before a car park and a street corner of signs and signals.
  "cbsa:17020": {
    file: "Upper Bidwell Park after the Park Fire.jpg",
    place: "Upper Bidwell Park's canyon and rimrock under cumulus clouds after the Park Fire, oaks in shade below",
    credit: "9yz",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Chico, CA",
    size: [7298, 4277],
  },
  // Coeur d'Alene, ID: skyline-sheet run 37236536465 — the lakefront resort and marina the city is known by, Tubbs Hill and the lake behind, from the air in low winter sun, an oblique whose horizon the card keeps, sharp; over the same waterfront from the air in a PNG (never served), the lake at sunset with no town in it, Wallace's I-90 viaduct — another county's town — twice, the resort's holiday lights at night and a 1970s archive plate gone magenta.
  "cbsa:17660": {
    file: "Coeur d'Alene Resort (Main hotel; Facing southeast; 2023-02-16).jpg",
    place: "The Coeur d'Alene Resort and its marina on the lake, Tubbs Hill behind, from the air in winter sun",
    credit: "Locke Cole",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Coeur d'Alene, ID",
    size: [8064, 6048],
  },
  // Colorado Springs, CO: skyline-sheet run 36779692322 — the article's lead, taken March 2026; the Pikes Peak frame was haze and one search result was Los Angeles.
  "cbsa:17820": {
    file: "Colorado Springs, Colorado (cropped).jpg",
    place: "Downtown Colorado Springs from above, the mountains at its edge",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Colorado Springs, CO",
    size: [6479, 4322],
  },
  // Columbia, MO: skyline-sheet run 37236836751 — an article's lead, Jesse Hall's dome over the Francis Quadrangle and its six columns from a low drone in summer, an oblique with a horizon under textured cloud, the spire whole in both crops; over downtown's roofs from a garage under a radio mast, a church at dusk, a museum's lawn, a church and an apartment block cut by the crops, and two dim streets of parked cars.
  "cbsa:17860": {
    file: "Jesse Hall Aerial.jpg",
    place: "Jesse Hall's dome over the Francis Quadrangle and its six columns, from a low drone in summer",
    credit: "Lectrician2",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Columbia, MO",
    size: [4000, 2250],
  },
  // Columbia, SC: skyline-sheet run 36779692322 — the article's lead, over a night frame that goes dark under the card's shade.
  "cbsa:17900": {
    file: "Fall skyline of Columbia SC from Arsenal Hill.jpg",
    place: "Downtown Columbia's skyline in autumn, from Arsenal Hill",
    credit: "Akhenaton06",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Columbia, SC",
    size: [1844, 892],
  },
  // Columbus, GA: skyline-sheet run 36816361727 — an article's lead, the Chattahoochee's rapids over rock shelves below a row of brick mills with two chimneys and a water tower, autumn colour on the banks under a grey-blue sky; whole on the card and at 16:9, the 21:9 takes the chimneys' tops and half the water tower's tank. Over a hazy telephoto of office blocks, a zipline's timber tower backlit on the riverwalk and a highway bridge's underside.
  "cbsa:17980": {
    file: "Downtown Columbus, Georgia skyline.jpg",
    place: "Rapids on the Chattahoochee below downtown Columbus's brick mills and chimneys",
    credit: "PghPhxNfk",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Columbus, GA",
    size: [4032, 3021],
  },
  // Corpus Christi, TX: skyline-sheet run 36787138337 — the city article's lead, whole in both crops, over an aerial of the bay shore and hazy views from the bridge.
  "cbsa:18580": {
    file: "Corpus Christi skyline.jpg",
    place: "Downtown Corpus Christi's towers over the marina",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Corpus Christi, TX",
    size: [8064, 4827],
  },
  // Crestview-Fort Walton Beach-Destin, FL: skyline-sheet run 36808145480 — Destin's harbour, an article's lead, its boats and white sand under a blue sky with the condominium towers across the water, whole in both crops; the card names the metro area, since the harbour is Destin's. Over the harbour at night, black under the card's shade, Fort Walton Beach's city hall, two 1970s archive frames, sea oats before the Gulf 651px tall at 2400 wide, a volleyball net at dusk and gulls under a grey sky.
  "cbsa:18880": {
    file: "View of Destin, Florida from the Destin Harbor.jpg",
    place: "Destin's harbour, its boats and white sand, condominium towers across the water",
    credit: "Destin Vacation Boat Rentals",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Crestview-Fort Walton Beach-Destin, FL",
    size: [3872, 2022],
  },
  // Daphne-Fairhope-Foley, AL: skyline-sheet run 36818691850 — the resort coast the county is known by, a boat setting out from Orange Beach's docks with condominium towers across the water under a clear sky, bright, sharp and whole in both crops; over a hazy frame of Gulf Shores' crowded beach whose author field is a request to be credited, the county courthouse at Bay Minette between two oaks, and three PNG frames of a flyover video.
  "cbsa:19300": {
    file: "Alabama's Coastal Connection - Setting Out from Orange Beach - NARA - 7716828.jpg",
    place: "A boat setting out from Orange Beach's docks, condominium towers across the water",
    credit: "A. E. Crane, U.S. Department of Transportation",
    license: "Public domain",
    licenseUrl: "",
    name: "Daphne-Fairhope-Foley, AL",
    size: [2256, 1496],
  },
  // Davenport, IA: skyline-sheet run 36800398141 — the riverfront across the Mississippi under a clear sky, the clock tower and a white-cabled skybridge whole in every crop, over the article's lead, whose casino boat is the centre of the card, a grey-sky panorama, two street-level frames over trees and a road, Rock Island's riverfront and Moline's clock tower, which the card cuts.
  "cbsa:19340": {
    file: "2018 Davenport skyline 02 (cropped).jpg",
    place: "Downtown Davenport's riverfront across the Mississippi, its clock tower at the centre",
    credit: "Farragutful",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Davenport, IA",
    size: [4607, 1292],
  },
  // Dayton, OH: skyline-sheet run 36780772501 — the article's lead; the rest were aerials from a plane and a stadium.
  "cbsa:19430": {
    file: "Dayton Skyline - Sunset September 2022 (cropped).jpg",
    place: "Downtown Dayton's skyline at sunset",
    credit: "Blervis",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Dayton, OH",
    size: [3890, 2334],
  },
  // Daytona Beach, FL: skyline-sheet run 36783120462 — the beach and its towers, over the airport's runway, a city hall and a launch.
  "cbsa:19660": {
    file: "Daytona Beach looking north from pier.jpg",
    place: "Daytona Beach looking north from the pier",
    credit: "Dough4872",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Daytona Beach, FL",
    size: [4032, 3024],
  },
  // Des Moines, IA: skyline-sheet run 36751130861 — whole in every crop, where the article's lead lost 801 Grand's crown.
  "cbsa:19780": {
    file: "Skyline downtown Des Moines.jpg",
    place: "Downtown Des Moines through the arch of the Center Street footbridge",
    credit: "BarbaraLN",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    name: "Des Moines, IA",
    size: [2450, 1544],
  },
  // Dothan, AL: skyline-sheet run 37388036901 — the city article's lead (a 3:1 frame), downtown's cream tower topped by a lattice mast and a white radar dome, a ribbed office block beside it, low roofs with satellite dishes and trees, a clear blue sky; the tower and its dome whole in both crops; crisp; a modest pick, the drawn cover a fair alternative. The runner printed the author as "Prussian_Fool", an account name; zori probe_url run 37389642101 printed it as the file page's Author field, underscore and all, an account whose user page was never created, and the file names no other attribution beside the licence. Over two wider frames of the same view with the tower low under an empty sky, a street under poles and wires, the library and the post office across roads under wires, and a helicopter on a pole.
  "cbsa:20020": {
    file: "DowntownDothan02 (cropped).jpg",
    place: "Downtown Dothan's tower with its mast and radar dome under a clear sky",
    credit: "Prussian_Fool",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Dothan, AL",
    size: [4930, 1634],
  },
  // Dover, DE: skyline-sheet run 37237349944 — an article's lead, a downtown street of brick and painted shop fronts with awnings in winter sun under a blue sky, the card keeping the whole frame and the 21:9 trimming only the edge building's cornice and the trees' crowns, the parked cars under the words; over a race-day crowd at the speedway, a highway from an overpass and a highway's direction sign.
  // The runner printed the author as "Tim Kiser ( w:User:Malepheasant )", and the file page's own Author field is the same, a name and his Wikipedia user page, with no attribution template, and its description names the street, West Loockerman Street, on Dec 30, 2006 (zori probe_url run 37240141265); the credit is the name in it, as Duluth's is.
  "cbsa:20100": {
    file: "Dover Delaware.jpg",
    place: "West Loockerman Street's shops in downtown Dover, in winter sun under a blue sky",
    credit: "Tim Kiser",
    license: "CC BY-SA 2.5",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.5",
    name: "Dover, DE",
    size: [2624, 1640],
  },
  // Dubuque, IA: skyline-sheet run 37278011774 — an article's lead, downtown's steeples and towers in autumn under a blue sky with cumulus, the wooded bluffs beyond, the brush in front falling under the card's words, every top whole in both crops; over the Fenelon Place Elevator's tracks down a green slope with no sky and no city.
  "cbsa:20220": {
    file: "Dubuque IA - overview.jpg",
    place: "Downtown Dubuque's steeples and towers in autumn under a blue sky, wooded bluffs beyond",
    credit: "Dirk",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Dubuque, IA",
    size: [4152, 2246],
  },
  // Duluth, MN: skyline-sheet run 36818844258 — the lift bridge the city is known by, at dusk, its truss across the frame, sharp and whole at the top in both crops; over a drone frame of the canal's piers and the bridge under a flat grey overcast, downtown above the freeway's direction signs, two black-and-white plates, sled dogs and a rock cut. The runner printed the author as "Mfield , Matthew Field, http://www.photography.mattfield.com"; the file page's own Author field is the same, with no attribution template and an empty permission (zori probe_url run 37234876098); the credit is the name in it.
  "cbsa:20260": {
    file: "Aerial lift bridge duluth mn.jpg",
    place: "Duluth's Aerial Lift Bridge at dusk, its span lowered over the canal",
    credit: "Matthew Field",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Duluth, MN",
    size: [2000, 920],
  },
  // Durham, NC: skyline-sheet run 36782967654 — the skyline panorama, over the transit station, a highway and a night view.
  "cbsa:20500": {
    file: "Skyline Panorama of Durham, North Carolina.jpg",
    place: "The Durham skyline",
    credit: "DiscoA340",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Durham, NC",
    size: [11884, 3064],
  },
  // Eau Claire, WI: skyline-sheet run 37278486927 — an article's photograph, downtown from a drone in summer, the river curving round its point under footbridges, the blocks beyond to a wooded horizon, whole in both crops, a 2.73:1 frame a card asks for at 2400; over the same downtown across the river under heavy cumulus (one frame, cropped and whole) and a house under a wire and a pole.
  "cbsa:20740": {
    file: "Eau Claire, Wisconsin downtown zoomed.jpg",
    place: "Downtown Eau Claire from the air in summer, the river curving round its point under footbridges",
    credit: "Wikideas1",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Eau Claire, WI",
    size: [6946, 2544],
  },
  // Elizabethtown, KY: skyline-sheet run 37388036901 — an article's lead, the LaRue County Courthouse (its lettering says so; Larue County is in the metro area, the delineation's list): red brick, a white portico, a clock cupola with its cross, a tall flag at the right, a pine bough at the left edge, a lawn, a grey overcast; the cupola whole in both crops, the 21:9 cutting the flag's top; crisp; flat grey light; a modest pick, named for the metro area. The runner printed the author as "Antony-22", an account name; zori probe_url run 37389764574 printed it as the file page's Author field, linking the account's user page, and the file names no other attribution beside the licence. Over the Hardin County Courthouse with a flagpole through its front and the flags cut at 21:9, three houses, a church behind trees, City Hall under wires, and a postcard of Elizabethtown, North Carolina.
  "cbsa:21060": {
    file: "LaRue County Courthouse 2022a.jpg",
    place: "The LaRue County Courthouse's portico and clock cupola",
    credit: "Antony-22",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Elizabethtown, KY",
    size: [6240, 4160],
  },
  // Elmira, NY: skyline-sheet run 37388036901 — the city article's lead, Elmira on the Chemung River from a height: the river curving through green banks to the city's blocks and a bridge under a wooded ridge in autumn colour, teasel heads framing both edges, a blue sky with small clouds; the city just above the words in both crops; crisp. The runner printed the author as "DSKEO", an account name; zori probe_url run 37389642101 printed it as the file page's Author field, an account whose user page was never created, and the file names no other attribution beside the licence. Over the Chemung County Courthouse with three flagpoles through its front and its tower cut at 21:9, two river views their titles place at Corning's Brisco Bridge rather than Elmira, and an engraved letterhead.
  "cbsa:21300": {
    file: "Chemung River Elmira.jpg",
    place: "Elmira on the Chemung River under its wooded ridge in autumn",
    credit: "DSKEO",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Elmira, NY",
    size: [2776, 1851],
  },
  // El Paso, TX: skyline-sheet run 36779692322 — the article's lead, over a flatter midday aerial.
  "cbsa:21340": {
    file: "El Paso Cityscape (cropped).jpg",
    place: "Downtown El Paso, the mountains behind it",
    credit: "WmCheez",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "El Paso, TX",
    size: [3159, 1751],
  },
  // Erie, PA: skyline-sheet run 36816098960 — Presque Isle and its bay from the air in autumn, the city along the shore, an article's lead, an oblique with cloud and a horizon, whole in both crops; a 1500px slide scan, served at its own width as Belton's is. Over the downtown bayfront from the tower's deck, whose card is the pier's parking lot and its cars, its PNG original, downtown a sliver across the bay twice, a wooded creek, and Corry's painted wall behind a rail-crossing signal under an orange filter.
  "cbsa:21500": {
    file: "Presque Isle Pennsylvania aerial view.jpg",
    place: "Presque Isle curving round its bay into Lake Erie, the city along the shore, from the air in autumn",
    credit: "Ken Winters, U.S. Army Corps of Engineers",
    license: "Public domain",
    licenseUrl: "",
    name: "Erie, PA",
    size: [1500, 1052],
  },
  // Eugene-Springfield, OR: skyline-sheet run 36799416970 — the city among its evergreens from Skinner Butte under a clear sky, Spencer Butte behind, whole in both crops, over the same view under white and grey skies at 614 and 584px tall, Autzen Stadium from a drone and on a game day, a warehouse's signs over a parking lot, a park path and a 1908 print.
  "cbsa:21660": {
    file: "Eugene Oregon from Skinner Butte.JPG",
    place: "Downtown Eugene among its evergreens from Skinner Butte, Spencer Butte behind",
    credit: "Laura Alier",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Eugene-Springfield, OR",
    size: [3456, 2304],
  },
  // Evansville, IN: skyline-sheet run 36800398141 — the city's skyline across the Ohio River in autumn colour, every tower whole in both crops, over an arena behind its own sign, the Willard Library, whose gable the wide crop cuts, a church in fields under a grey sky 528px tall and a credit union's office behind a parked car.
  "cbsa:21780": {
    file: "EvansvilleSkyline.jpg",
    place: "Downtown Evansville across the Ohio River in autumn, red and gold trees in front",
    credit: "Vasiliymeshko",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Evansville, IN",
    size: [2200, 1020],
  },
  // Fairbanks-College, AK: skyline-sheet run 37278486927 — an article's lead, downtown under snow from a drone, the river and its bridges winding through, low sun on the blocks and a plume of steam on the horizon under a pastel sky, whole in both crops; over the river at blue hour whose subject is a chain hotel's lit name, the airport from a plane, a wing over the hills, a riverboat from above and three frames of a search-and-rescue exercise.
  "cbsa:21820": {
    file: "Aerial view of Fairbanks Alaska skyline (Quintin Soloviev).jpg",
    place: "Downtown Fairbanks under snow from the air, the river and its bridges winding through",
    credit: "Quintin Soloviev",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Fairbanks-College, AK",
    size: [3314, 2209],
  },
  // Fargo, ND: skyline-sheet run 36816207134 — downtown's historic storefronts in sun under a deep blue sky, every cornice and the pediment whole in both crops, the parked cars at the kerb under the card's words. Over an aerial whose deal-page crops lose the horizon and read as rooftops, an archive frame of passengers before a train, a street corner of signals and signs under a white sky, and two brick warehouses with water towers under a white sky.
  "cbsa:22020": {
    file: "Downtown Fargo District 01.jpg",
    place: "Downtown Fargo's historic brick and stone storefronts under a deep blue sky",
    credit: "P. Hughes",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Fargo, ND",
    size: [6048, 4024],
  },
  // Farmington, NM: skyline-sheet run 37313645151 — the Shiprock article's photograph, the rock rising off the desert floor under heavy broken cloud with blue between, its dike running off to the left, snow on far mountains at the right, whole in both crops above the words, crisp (the clouds a little over-processed); a 2.56:1 frame, served at 2400; Shiprock is in San Juan County, the metro area's one county, so the picture is named for the metro area and its place says it is Shiprock (Belton's rule); the credit is the name inside the "Dave Bunnell redirect" the runner printed, which is the file page's Author field whole (its metadata's Artist, an account with no user page: zori probe_url run 37329561789), the same page linking User:Dave Bunnell (run 37329450866). Over the rock close under a blue sky (the 21:9 cuts its summit), Bisti's hoodoos close, Aztec Ruins' low walls as a 4.5:1 strip, the city's lights at night from the air and the civic centre's front with a crowd.
  "cbsa:22140": {
    file: "Shiprock NM viewed from the north.jpg",
    place: "Shiprock rising off the desert floor under heavy broken cloud",
    credit: "Dave Bunnell",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Farmington, NM",
    size: [5762, 2250],
  },
  // Fayetteville, NC: skyline-sheet run 36798176732 — downtown's church spires and tree-lined street from above in clear daylight, every spire whole in both crops, over the Market House down Hay Street on a grey winter day through a heavy phone filter. The runner printed the author as "Public domain, City of Fayetteville"; the credit is the name in it.
  "cbsa:22180": {
    file: "Fayetteville, NC Downtown Skyline.jpg",
    place: "Downtown Fayetteville from above, its church spires over a tree-lined street",
    credit: "City of Fayetteville",
    license: "Public domain",
    licenseUrl: "",
    name: "Fayetteville, NC",
    size: [4239, 1600],
  },
  // Fayetteville, AR: skyline-sheet run 36786974652 — the hill and the town hold in both crops, where Old Main loses the top of its cupola in the wide frame and the article's lead is a hazy strip behind trees.
  "cbsa:22220": {
    file: "Mount Sequoyah and Fayetteville from University of Arkansas.jpg",
    place: "Mount Sequoyah and Fayetteville in autumn colour, from the University of Arkansas",
    credit: "Brandonrush",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Fayetteville, AR",
    size: [4000, 3000],
  },
  // Flagstaff, AZ: skyline-sheet run 37236536465 — an article's lead, the San Francisco Peaks over the city under fresh snow, the pines below frosted white and a cloud bank over the summits in a clear blue sky, whole in both crops; over a stitched 360-degree panorama from the Humphreys Peak trail, its ridges bent by the projection.
  "cbsa:22380": {
    file: "San Francisco Peaks.jpg",
    place: "The San Francisco Peaks under fresh snow over frosted pines, a cloud bank above",
    credit: "Tyler finvold",
    license: "Public domain",
    licenseUrl: "",
    name: "Flagstaff, AZ",
    size: [1600, 930],
  },
  // Flint, MI: skyline-sheet run 36816207134 — the city article's lead, downtown from above the river with the Vehicle City arch at its foot under cumulus, an oblique with a horizon, every tower whole in both crops. Over the tower with the globe and its neighbours, backlit over parked SUVs, downtown at dusk under heavy cloud across a plaza, the towers across the river 750px tall and soft, a dusk strip 375px tall with a seam in its sky, a road bridge with a van and a truck, and a White House photograph of President Obama sipping filtered water.
  "cbsa:22420": {
    file: "Flint, Michigan.jpg",
    place: "Downtown Flint from above the river, its Vehicle City arch over the street, under cumulus",
    credit: "WMrapids",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Flint, MI",
    size: [3989, 2244],
  },
  // Florence-Muscle Shoals, AL: skyline-sheet run 37382918468 — a one-market run for a round 15 market, from Florence's category: the O'Neal Bridge's white steel truss across the Tennessee at blue hour, lit by low sun, flags at a riverside plaza, the dark river and its reflections, a deep blue sky; the whole truss above the words in both crops; crisp. The bridge joins Florence (Lauderdale County) to Sheffield (Colbert County), both inside the metro area. The title is kept whole. The runner printed the author as "Noahmcdonald1", an account name; zori probe_url run 37383378486 printed it as the file page's Author field, an account with no user page; the file's own name says Noah McDonald, and the credit is the author Commons names (Milwaukee's precedent). Over Wilson Dam's powerhouse in low sun behind a dark slope of shrubs and a fence, the same bridge in evening light under a GFDL licence, a NARA aerial plate, a lettered Blues Trail marker, a mall's entrance and a creek mouth near Sheffield. Round 15's sheet (run 37330328150) held a roof before a tower block, a street of parked cars, a postcard and two frames outside the metro area.
  "cbsa:22520": {
    file: "Florence, Alabama O'Neal Bridge by Noah McDonald.jpg",
    place: "The O'Neal Bridge's white truss across the Tennessee at blue hour",
    credit: "Noahmcdonald1",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Florence-Muscle Shoals, AL",
    size: [5184, 3456],
  },
  // Fort Wayne, IN: skyline-sheet run 36787230817 — its tallest towers and a domed clock tower whole in both crops under a clear sky, over the same skyline smaller behind Promenade Park.
  "cbsa:23060": {
    file: "Downtown Fort Wayne, Indiana Skyline from Old Fort, May 2014.jpg",
    place: "Downtown Fort Wayne's skyline from the Old Fort",
    credit: "Momoneymoproblemz",
    license: "Public domain",
    licenseUrl: "",
    name: "Fort Wayne, IN",
    size: [2880, 1304],
  },
  // Fresno, CA: skyline-sheet run 36816641545 — a one-market run's pick of ten: downtown's towers at dusk under a clear sky, the streets lit below them and the freeway's light trails along the foot, whole in both crops; over the Security Bank tower close up, its mast cut by every crop and a dark strip down the file's edge, a backlit roofline, a dusk panorama 544px tall at 2400 wide, two hazy views from an airliner, a car park under a water tower, a hotel's balconies, the courthouse's grille and a gas station's signs in Oakhurst.
  "cbsa:23420": {
    file: "Downtown Fresno Skyline.jpg",
    place: "Downtown Fresno's towers at dusk, over the freeway's light trails",
    credit: "JMora24",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Fresno, CA",
    size: [4052, 1348],
  },
  // Gadsden, AL: skyline-sheet run 37388036901 — from Noccalula Falls' category: the falls' two white long-exposure cascades over a dark rock ledge into a pool, dark pines, a deep blue sky; whole in both crops; crisp; the whole frame in a strong blue-cyan cast, which reads as dusk; a modest pick. The credit is the photographer and the agency as printed (Daphne-Fairhope-Foley's precedent). Over steep aerials of downtown that read as maps (one in black and white), an oblique of the town on the Coosa with no sky, three airliner frames over cloud, and autumn trees on a riverbank that names no town.
  "cbsa:23460": {
    file: "View of Nocolulu falls from the shore in Godsden Alabama.jpg",
    place: "Noccalula Falls' two cascades over their rock ledge",
    credit: "Gentry George, U.S. Fish and Wildlife Service",
    license: "Public domain",
    licenseUrl: "",
    name: "Gadsden, AL",
    size: [4936, 3324],
  },
  // Gainesville, FL: skyline-sheet run 36808459092 — a one-market run's pick of nineteen: Sweetwater Wetlands Park from above under a sky of cumulus, an oblique with a horizon, sharp and whole in both crops, over Century Tower, whose crown the wide crop cuts, the county's buildings behind signals and street signs, a museum at the card's foot, a camera's viewfinder and a coastal lab's sign; the six-market sheet had held parked cars under a crane, a steep aerial of Depot Park and a watermarked drone frame.
  "cbsa:23540": {
    file: "Sweetwater Wetlands Park.jpg",
    place: "Sweetwater Wetlands Park's pools and levee path from above, marsh and forest to the horizon",
    credit: "Flatwoods 36",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Gainesville, FL",
    size: [3992, 2242],
  },
  // Gettysburg, PA: skyline-sheet run 37279345706 — a one-market run's find of eighteen, an article's lead: cannons on Seminary Ridge in the evening light by a split-rail fence and a stone wall, under leaning trees and a blue sky, the gun's wheel standing above the card's words, whole in both crops; over the field from Little Round Top (handsome, and at a card's size a field), Devil's Den behind a road of parked cars, Forbes Rock in snowy woods, a farmhouse and its barns, a regiment's monument, engravings and a painting, a museum case and a ranger under a tent. The six-market sheet (run 37278011774) held only the two Little Round Top frames.
  "cbsa:23900": {
    file: "15-23-0291, artillery on seminary ridge - panoramio.jpg",
    place: "Cannons on Seminary Ridge at Gettysburg in evening light, by a split-rail fence and a stone wall",
    credit: "David Dugan",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Gettysburg, PA",
    size: [2048, 1367],
  },
  // Glens Falls, NY: skyline-sheet run 37278011774 — an article's lead, Lake George from a drone between forested hills, boats' wakes on deep blue water and mountains beyond under a bright sky with cumulus, an oblique with a horizon, whole in both crops; the lake lies between the metro area's two counties, Warren and Washington, so the picture is named for the metro area and its place says it is the lake (Belton's and Cocoa Beach's rule). Over the lake from Black Mountain under grey cloud, downtown Glens Falls by telephoto (the 21:9 loses its horizon and reads as rooftops), a fountain at a roundabout under crossing signs, a sunrise panorama whose village falls dark under the words, a 1782 book's plate and a camp's wooded point under haze.
  "cbsa:24020": {
    file: "Lake George aerial view 2025.jpg",
    place: "Lake George from the air between forested hills, mountains beyond under a bright sky",
    credit: "Hayden Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Glens Falls, NY",
    size: [4000, 3000],
  },
  // Grand Junction, CO: skyline-sheet run 37236536465 — an article's lead, the city across its valley under the Book Cliffs and a storm-dark sky lit warm at the horizon, a bluff and junipers before it, whole in both crops; over the cliffs over downtown shot through tinted glass with a smudge in the sky, a city bus and the national monument's entrance sign.
  "cbsa:24300": {
    file: "Grand-junction-skyline.jpg",
    place: "Grand Junction across its valley under the Book Cliffs, a stormy sky above",
    credit: "Eleaf",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Grand Junction, CO",
    size: [2900, 1642],
  },
  // Grand Rapids, MI: skyline-sheet run 36750858237 — blue hour with the lit bridge, sharp and whole.
  "cbsa:24340": {
    file: "Grand Rapids, Michigan skyline May 2022.jpg",
    place: "Downtown Grand Rapids over the Grand River at dusk",
    credit: "WMrapids",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Grand Rapids, MI",
    size: [4000, 1475],
  },
  // Great Falls, MT: skyline-sheet run 37279768946 — a one-market run's find of twenty, from the Great Falls of the Missouri River's category: the falls the city is named for, pouring over rock ledges below a dam's curved spillway beside a brick powerhouse, under a deep blue summer sky with cumulus, the spillway and the falls above the card's words, whole in both crops; over the same falls from the riverbed with the cascade under the words, downtown under snow as a flat strip under a grey sky, another town's main street, a bulletin board, a cattle drive, a town hall, a burger restaurant and a weather station's group photo. The six-market sheet (run 37277388755) held a winter street of signals, the dam under power lines and the river's ledges with no sky.
  "cbsa:24500": {
    file: "Great Falls of the Missouri River (1).jpg",
    place: "The Great Falls of the Missouri River over rock ledges below a dam's curved spillway, under a summer sky",
    credit: "Chris06",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Great Falls, MT",
    size: [2048, 1536],
  },
  // Greeley, CO: skyline-sheet run 36816430466 — downtown's historic fronts in sun under a clear sky, a brick block with arched windows under a white cornice beside a cream one under a green cornice, a painted sign on the wall behind; the card clips the white cornice's corner and the 21:9 most of its length. Over pear trees in blossom before a storefront with bicycles and parked cars, a winter street corner of crossing signs under a white sky, the town's green sign with a sculpture and people (and again at a tilt), a shoe store's sign, two streets of parked cars and signs under a white sky, and Denver's skyline from Westminster behind a freight trailer.
  "cbsa:24540": {
    file: "Downtown Greeley.JPG",
    place: "Downtown Greeley's historic brick and painted storefronts under a clear blue sky",
    credit: "Peter Romero",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Greeley, CO",
    size: [4000, 3000],
  },
  // Green Bay, WI: skyline-sheet run 36800398141 — an article's lead, downtown and its riverfront crowd along the Fox River in low sun with the bridges and the horizon beyond, an oblique that reads as a photograph, over Lambeau Field's atrium and its brand logos, the bowl over a crowd's heads, an aerial view across its parking lots, an over-processed empty bowl, the atrium at night in fog, a distant grey view and a panorama 579px tall at 2400 wide.
  "cbsa:24580": {
    file: "Downtown Green Bay CityDeck along the Fox River.jpg",
    place: "Downtown Green Bay's CityDeck along the Fox River in low summer sun, from above",
    credit: "Chris Rand",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Green Bay, WI",
    size: [6000, 4000],
  },
  // Greensboro, NC: skyline-sheet run 36782733907 — the skyline from the Depot at 2,703px wide, over the city article's 1,500px lead of the same towers.
  "cbsa:24660": {
    file: "Greensboro skyline from the Depot.jpg",
    place: "The Greensboro skyline from the Depot",
    credit: "Mx._Granger",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Greensboro, NC",
    size: [2703, 953],
  },
  // Greenville, NC: skyline-sheet run 37330328150 — an article's lead, the city from a rooftop at sunset, orange and violet cloud over a radio mast, a street of brick blocks running away under its lights and signals, a new hotel block at the right; the card keeps the sunset, the mast and the hotel whole, the 21:9's top meets the hotel's flat roof with nothing lost; crisp, an HDR look. The runner printed the author as "Aaron Hines/City of Greenville", a photographer and an agency, credited as printed as Daphne-Fairhope-Foley's is. Over a steep drone frame of the same blocks at dusk with no horizon (a map) and a PNG of residence halls behind signal arms.
  "cbsa:24780": {
    file: "Greenville, North Carolina - 2026 9.jpg",
    place: "Greenville from a rooftop at sunset, a street of brick blocks running away under its lights",
    credit: "Aaron Hines/City of Greenville",
    license: "Public domain",
    licenseUrl: "",
    name: "Greenville, NC",
    size: [5237, 3489],
  },
  // Greenville, SC: skyline-sheet run 36750858237 — the picture the city is known by and its only usable file; credited as Commons names the author (the filename names Yousef AbdulHusain).
  "cbsa:24860": {
    file: "2024-4-12-Falls Park Waterfall Greenville South Carolina by Yousef AbdulHusain.jpg",
    place: "The waterfall in Falls Park, downtown Greenville",
    credit: "CantoV",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Greenville, SC",
    size: [4080, 3072],
  },
  // Harrisburg, PA: skyline-sheet run 36782855933 — the view the city is known by, 10,824px wide.
  "cbsa:25420": {
    file: "Harrisburg, PA Skyline 2021.jpg",
    place: "The Harrisburg skyline over the Susquehanna River",
    credit: "Jeffrey Hayes",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Harrisburg, PA",
    size: [10824, 3608],
  },
  // Hartford, CT: skyline-sheet run 36750496544 — the article's lead image, whole in every crop.
  "cbsa:25540": {
    file: "Hartford, CT skyline (cropped).jpg",
    place: "Downtown Hartford and the State Capitol's gold dome in autumn",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Hartford, CT",
    size: [7096, 3548],
  },
  // Hickory-Lenoir-Morganton, NC: skyline-sheet run 36816286360 — an article's lead, Morganton's depot in clear light, yellow clapboard and white brackets under a red-trimmed roof and three brick chimneys, whole on the card and at 16:9, the tallest chimney's cap flush on the 21:9's top edge. Over two civic buildings in Hickory in evening sun across an empty road, and another city's street (Castro Street in Mountain View, California).
  "cbsa:25860": {
    file: "Train Depot, Morganton, North Carolina (2008).jpg",
    place: "Morganton's railway depot, yellow with a red-trimmed roof, under a blue sky",
    credit: "Ron Reiring",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Hickory-Lenoir-Morganton, NC",
    size: [3008, 2000],
  },
  // Hilton Head Island-Bluffton-Port Royal, SC: skyline-sheet run 36818691850 — the lighthouse the island is known by, red and white over Harbour Town's marina, from the water under a clear sky, whole in both crops; over the island from high in the air, which reads as a map, Beaufort's Bay Street lined with parked cars, its waterfront's trees under a flat white sky, a swing bridge past the waterfront's pilings, a trawler before a highway bridge, and a 1972 street photograph that is a PNG.
  "cbsa:25940": {
    file: "Hilton Head Harbor (3926567515).jpg",
    place: "Harbour Town Lighthouse and its marina on Hilton Head Island, from the water",
    credit: "fw_gadget",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    name: "Hilton Head Island-Bluffton-Port Royal, SC",
    size: [3072, 2304],
  },
  // Homosassa Springs, FL: skyline-sheet run 37321374937 — a one-market run's find of twenty-eight, from Three Sisters Springs' category: the spring run's clear turquoise water over pale sand under a deep blue sky, the hammock's trees and palms with moss along both banks, kayakers far up the run and one close at the right beside the card's words, whole in both crops (the 21:9 keeps a band of sky), crisp; the springs are in Crystal River, in Citrus County, the metro area's one county, so the picture is named for the metro area and its place says it is Three Sisters Springs (Belton's rule). Over the spring pool under the hammock with no sky and a log under the words, manatees in turquoise water with no shore, the state park's visitor building, murals, observatory, fountain and gift shop, Crystal River's docks, canals and signs, and Yellowstone's geyser basin filed under the springs. The six-market sheet (run 37313645151) held only a white elk wading, highway signs, a footbridge and the visitor centre's interior.
  "cbsa:26140": {
    file: "Three Sister Springs.jpg",
    place: "Three Sisters Springs' clear turquoise run under the hammock, kayakers on the water",
    credit: "CityofCrystalRiver",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Homosassa Springs, FL",
    size: [3936, 2624],
  },
  // Hot Springs, AR: skyline-sheet run 37277388755 — an article's photograph, downtown from the air in summer, a twin-towered hotel and a brick tower in sun in a valley of forested mountains, the town running on up the valley; no horizon, but the buildings stand side-on with their faces lit, so it reads as a photograph, not a map, every top whole in both crops; over Central Avenue from a high window at dawn behind a plain hotel, a hooded figure in a spring's steam at night and a historical marker.
  "cbsa:26300": {
    file: "Downtown Hot Springs, Arkansas (aerial).jpg",
    place: "Downtown Hot Springs among its forested mountains from the air, a twin-towered hotel in sun",
    credit: "Samuel Grant",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Hot Springs, AR",
    size: [3872, 2592],
  },
  // Huntsville, AL: skyline-sheet run 36782967654 — the downtown towers over the park's water, over two aerials of the interstate. The runner printed the author as "No machine-readable author provided. Anivron assumed (based on copyright claims)."; the credit is the name in it, without Commons' sentence around it.
  "cbsa:26620": {
    file: "Downtown Huntsville, Alabama.jpg",
    place: "Downtown Huntsville across the water",
    credit: "Anivron",
    license: "CC BY-SA 3.0",
    licenseUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
    name: "Huntsville, AL",
    size: [2032, 1524],
  },
  // Iowa City, IA: skyline-sheet run 37236836751 — Capitol Street toward the Old Capitol's gilded dome under a clear blue sky, the dome whole and central in both crops between a slatted grey building and a brick one; over the south skyline's roofs under a grey overcast and three frames of a block party's crowd.
  "cbsa:26980": {
    file: "Capitol Street, Iowa City, IA.jpg",
    place: "Capitol Street toward the Old Capitol's gilded dome, under a clear blue sky",
    credit: "w_lemay",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    name: "Iowa City, IA",
    size: [3840, 2880],
  },
  // Ithaca, NY: skyline-sheet run 37236836751 — Cornell's West Campus and Cayuga Lake from McGraw Tower in spring under a clear sky, the town and its hills beyond, an oblique whose sky both crops keep; over the campus in autumn from the same tower, whose 21:9 keeps no sky and reads as roofs, the lake from a wooded hill with no town in it, and four street frames of the Commons behind a gateway's signs or in shade.
  "cbsa:27060": {
    file: "Cornell West Campus from McGraw Tower.jpg",
    place: "Cornell's West Campus and Cayuga Lake from McGraw Tower, in spring",
    credit: "Andrew Parmet",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0",
    name: "Ithaca, NY",
    size: [2944, 1281],
  },
  // Jackson, MS: skyline-sheet run 36782967654 — the Capitol with downtown behind it, over a parking deck's view and a foggy parking lot.
  "cbsa:27140": {
    file: "JacksonMS Downtown Panorama.jpg",
    place: "Downtown Jackson and the State Capitol",
    credit: "chmeredith from Jackson, MS, USA",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Jackson, MS",
    size: [2247, 822],
  },
  // Janesville-Beloit, WI: skyline-sheet run 37349000346 — the Beloit article's lead, downtown Beloit from a brick-paved intersection: a pale green Art Deco block with a flag, red brick blocks and a white cupola beyond, a lamppost and a tree, a blue sky with cumulus; the blocks above the words in both crops, the green block's flag at the 21:9's top edge; crisp, saturated colour. The title is kept whole, the photograph the second city's (Auburn-Opelika's precedent). The runner printed the author as "Visit Beloit", an organisation's account; zori probe_url run 37382024313 printed it as the file page's Author field, an account whose user page was never created, and the file names no other attribution beside the licence. Over Beloit's ironworks behind trees across the river, a wide Janesville street, a car park twice, Beloit at night in snow under a signal arm, and Janesville's Town Square, a low row of blocks under a grey sky.
  "cbsa:27500": {
    file: "Downtown Beloit, Wisconsin.jpg",
    place: "Downtown Beloit, a pale green Art Deco block and red brick blocks over a brick-paved street",
    credit: "Visit Beloit",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Janesville-Beloit, WI",
    size: [4928, 3264],
  },
  // Jefferson City, MO: skyline-sheet run 37279496897 — a one-market run's find of seventeen, from the Capitol's category: the State Capitol from the air in late autumn, its dome and the statue on its lantern whole in both crops (the 21:9 with a small margin), the river behind it and bare trees around; no horizon, but the building stands in elevation and fills the frame, so it reads as the Capitol, not a map. Over the article's lead, whose 21:9 cuts the statue (Topeka's fault), the Capitol in its 2019 scaffolding, two views from its rotunda over a parapet or a railyard and a substation, a panorama of another city from a memorial arch, archive plates, engravings, chrysanthemums and a parking truck. The six-market sheet (run 37278486927) held only the lead, the scaffolding, a rotunda view and a cigarette card.
  "cbsa:27620": {
    file: "AP of Missouri State Capitol Building.jpg",
    place: "The Missouri State Capitol from the air in late autumn, the river behind it",
    credit: "KTrimble at English Wikipedia",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Jefferson City, MO",
    size: [4288, 2773],
  },
  // Johnson City, TN: skyline-sheet run 37236686331 — downtown at dusk, a lit church steeple and a brick tower against a sky fading from blue to orange, the mountains behind, a 2.64:1 strip whose full height both crops keep, served whole at its own width; over the same view by day under bare branches, a street of parked cars under a tree, another town's main street, and four frames of Virginia's Skyline Drive.
  "cbsa:27740": {
    file: "Downtown Johnson City Sunset.jpg",
    place: "Downtown Johnson City at dusk, a lit church steeple and a brick tower against an orange sky, mountains behind",
    credit: "Lwowen18",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Johnson City, TN",
    size: [2353, 892],
  },
  // Johnstown, PA: skyline-sheet run 37314140256 — from the Inclined Plane's category: the city from the incline's hill, downtown's brick blocks, a stone church and the taller towers on the valley's floor, long brick mill sheds beyond and wooded ridges all round under a white sky, the incline's bridge over the river at the foot; the card and the 21:9 both keep the ridges and a strip of sky; crisp; the view the city is known by, from its own landmark. Over two more frames from the same spot framed lower (one loses the sky at 21:9), the same view as a 4.65:1 strip 1810px tall, the article's lead in haze, a snowy hill over a frozen river, two airliner aerials and a drawn bird's-eye map.
  "cbsa:27780": {
    file: "Johnstown, Pennsylvania from the Inclined Plane, 09-12-2026 3.jpg",
    place: "Johnstown from the Inclined Plane's hill, downtown and the mills in the valley among wooded ridges",
    credit: "Cutlass",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Johnstown, PA",
    size: [6000, 4000],
  },
  // Kahului-Wailuku, HI: skyline-sheet run 36816430466 — Iao Valley's green ridges above Wailuku under a blue sky and cumulus, sharp, the summit whole with room in both crops; a crop of the photographer's own stitched panorama, without its black corners. Over that panorama and another whose unfilled black corners show in both crops, a tighter crop credited to a sentence naming a file, the Iao Needle under a mist that leaves half the card blank, a hazy view of West Maui from Haleakala's road, and two frames of Kahului Harbor's water and breakwater.
  "cbsa:27980": {
    file: "2011 Oct 02 Iao Valley Mountainside Panorama crop.jpg",
    place: "The green ridges of Iao Valley in the West Maui Mountains, under a blue sky and cumulus",
    credit: "Mark Fickett",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0",
    name: "Kahului-Wailuku, HI",
    size: [3901, 1684],
  },
  // Kennewick-Richland, WA: skyline-sheet run 36816430466 — from the Tri-Cities article, downtown Richland's blocks on the Columbia from a height in warm low sun, farmland and bluffs across the water, a hazy sky that the card keeps and the 21:9 does not. Over an aerial over Kennewick and the river in dim greenish light (an article's lead), Richland's flat suburbs from Badger Mountain in a strip 544px tall at 2400 wide, a brewery's storefront and sign, a view from the space station that reads as a map, a pergola at a road junction under wires, and a footbridge in a cave filed under the Cable Bridge.
  "cbsa:28420": {
    file: "Downtown Richland.jpg",
    place: "Downtown Richland and the Columbia River from a height, in low sun",
    credit: "Corbin Harder",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Kennewick-Richland, WA",
    size: [3919, 2618],
  },
  // Kenosha, WI: skyline-sheet run 37287680216 — an article's lead, the red North Pier lighthouse at the end of its pier on blue water under a blue sky with cumulus, the tower standing above the card's words, whole in both crops; the credit "Wrongdave at English Wikipedia" as printed (Bangor's form). Over the harbour and its far shore as a 3.4:1 panorama whose walkers stand under the words, a street with a motorcycle and parked cars, a grey street of snowbanks and SUVs, an empty street under a gym's sign and a survey plate of the harbour.
  "cbsa:28450": {
    file: "Kenosha North Pier Lighthouse.jpg",
    place: "Kenosha's red North Pier lighthouse at the end of its pier under a blue sky with cumulus",
    credit: "Wrongdave at English Wikipedia",
    license: "Public domain",
    licenseUrl: "",
    name: "Kenosha, WI",
    size: [2016, 1512],
  },
  // Killeen-Temple, TX: skyline-sheet run 36787138337 — a domed courthouse under a clear sky, whole in both crops and 926px tall, over a distant strip of Temple's towers behind trees and grey street corners; the card names the metro area, since the photograph is Belton's.
  "cbsa:28660": {
    file: "Downtown belton.jpg",
    place: "Downtown Belton",
    credit: "NativeTexan55",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Killeen-Temple, TX",
    size: [1491, 926],
  },
  // Kingsport, TN: skyline-sheet run 36816361727 — an article's lead, State Street in Bristol in sun under cumulus, its brick and stone fronts, flags and awnings and the Paramount's vertical sign, whole in both crops, the road and a crosswalk under the card's words. Over Kingsport's Broad Street shot into a low sun with a flare beside its street clock, and an aerial of a chemical plant.
  "cbsa:28700": {
    file: "State Street - Bristol, TN-VA.jpg",
    place: "State Street in Bristol, its storefronts and flags under a blue sky",
    credit: "AppalachianCentrist",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Kingsport, TN",
    size: [4032, 2687],
  },
  // Kiryas Joel-Poughkeepsie-Newburgh, NY: skyline-sheet run 36800324942 — an article's lead, Poughkeepsie's riverfront on the Hudson under a clear evening sky with a balloon rising, whole in every crop, over the Walkway over the Hudson from the shore under bare trees, the same bridge in winter ice, Newburgh's waterfront from Beacon, a Hudson Highlands view whose author is unknown, a military photograph and an 1834 engraving.
  "cbsa:28880": {
    file: "Poughkeepsie, NY with evening balloon take-off-crop.jpg",
    place: "Poughkeepsie's Hudson riverfront at evening, hot-air balloons rising over it",
    credit: "Juliancolton",
    license: "Public domain",
    licenseUrl: "",
    name: "Kiryas Joel-Poughkeepsie-Newburgh, NY",
    size: [3092, 1980],
  },
  // Knoxville, TN: skyline-sheet run 36751130861 — keeps the Sunsphere, where the alternative was grey and lost it.
  "cbsa:28940": {
    file: "Knoxville Skyline from Marriott - panoramio.jpg",
    place: "Downtown Knoxville and the Sunsphere in evening light",
    credit: "Bohao Zhao",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0",
    name: "Knoxville, TN",
    size: [5374, 3583],
  },
  // La Crosse-Onalaska, WI-MN: skyline-sheet run 37278011774 — an article's photograph, downtown along the river from a drone, its brick blocks, a blue bridge and the bluffs on the horizon under a clear sky, whole in both crops; a 4.78:1 frame, the table's widest, which a card asks for at 2400 and a 3x phone draws about 1.3x (Louisville's 4.18:1 draws 1.17x). Over the bluff's face as a 180-degree panorama twice, a hazy park from above with no horizon, Onalaska's dark hills over the lake, an arena's roof, the bridge from the bluff in black and white and two frames of a roadside camera.
  "cbsa:29100": {
    file: "La Crosse panoramic aerial.jpg",
    place: "Downtown La Crosse along the river from the air, a blue bridge and the bluffs beyond",
    credit: "Wikideas1",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "La Crosse, WI",
    size: [10504, 2196],
  },
  // Lafayette, LA: skyline-sheet run 36808145480 — the city article's lead, downtown's towers from a rooftop under a clear sky, whole in both crops, over the same rooftops from other angles, a panorama whose card keeps neither tower whole, a PNG (never served), a 2008 parking lot under a white sky, a 2008 tower close up under haze, and a bank tower over a parking lot.
  "cbsa:29180": {
    file: "Downtown Lafayette LA 2021.jpg",
    place: "Downtown Lafayette's towers, one wrapped in a mural, from a rooftop under a clear sky",
    credit: "TheLionHasSeen",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Lafayette, LA",
    size: [8000, 6000],
  },
  // Lake Havasu City-Kingman, AZ: skyline-sheet run 37277388755 — an article's lead, London Bridge from the water, one arch framing the channel, its stone pier and balustrade in sun and shadow under a broken sky, whole in both crops; wreaths hang on its piers (the file is dated Nov 27, 2025). Over the bridge from above among parking lots with no horizon, a 1973 scan through a plane's window, the lake from a hotel's balcony, a lizard, a bare tree over a marsh and the lake at dusk over a road sign.
  "cbsa:29420": {
    file: "20251127 LondonBridge.jpg",
    place: "London Bridge at Lake Havasu City from the water, an arch over the channel",
    credit: "Guninvalid",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Lake Havasu City-Kingman, AZ",
    size: [4000, 1848],
  },
  // Lakeland, FL: skyline-sheet run 36786974652 — the towers, fountain and waterside arches whole in both crops, over a softer daylight frame of the same shore and grey, distant views from Lake Morton.
  "cbsa:29460": {
    file: "Downtown-Lakeland.jpg",
    place: "Downtown Lakeland's lit towers and a fountain across the lake",
    credit: "Nkadambi",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Lakeland, FL",
    size: [4032, 2268],
  },
  // Lancaster, PA: skyline-sheet run 36782855933 — the city article's lead, over street scenes on a grey December day.
  "cbsa:29540": {
    file: "Lancaster Pennsylvania downtown.jpg",
    place: "Downtown Lancaster",
    credit: "Randolph Carney",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Lancaster, PA",
    size: [2011, 1114],
  },
  // Lansing-East Lansing, MI: skyline-sheet run 36797923875 — the city article's skyline, its clock tower and the Capitol's dome whole in both crops, though it is 574px tall at 2400 wide, as Louisville's is; the Capitol's own portrait loses its lantern and finial in the wide crop under a grey sky, and the third file is a cigarette card.
  "cbsa:29620": {
    file: "Lansing Skyline 2022.jpg",
    place: "Downtown Lansing's skyline under a bright cloudy sky, the Capitol's dome among its towers",
    credit: "WeaponizingArchitecture",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Lansing-East Lansing, MI",
    size: [2618, 626],
  },
  // Las Cruces, NM: skyline-sheet run 36819025201 — the Organ Mountains' needles in low sun from Aguirre Spring Road, the moon above, whole in both crops; over the range under snow and cloud, a strip of it 528px tall at its own 1400px width, two of the national monument's frames whose crests the 21:9 cuts, a ruin at Dripping Springs in shade and the university's library behind trees.
  "cbsa:29740": {
    file: "Organ Mountains from Aguirre Spring Road.JPG",
    place: "The Organ Mountains' needles in low sun from Aguirre Spring Road, the moon above",
    credit: "Fredlyfish4",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Las Cruces, NM",
    size: [5346, 2288],
  },
  // Lawrence, KS: skyline-sheet run 37236836751 — an article's lead, downtown's main street from above in late summer, a stone clock tower beside it and church spires beyond, wooded hills to a far horizon under a clear sky, an oblique whose every top both crops keep; over the same street with its tower from a rooftop, a winter street of parked cars and two highway bridges over the river.
  "cbsa:29940": {
    file: "Lawrence, KS August 2025.jpg",
    place: "Downtown Lawrence's main street from above, a stone clock tower and church spires under a clear sky",
    credit: "Shannon Beat",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Lawrence, KS",
    size: [3000, 1688],
  },
  // Lawton, OK: skyline-sheet run 37321853635 — a one-market run's find of twenty-six, from the Wichita Mountains Wildlife Refuge's category: the Wichitas' low granite profile on the horizon at a winter sunrise across a frosted prairie, a big sky of streaked cloud with the sun's glare at the left, the mountains above the card's words in both crops, crisp; the refuge is in Comanche County, inside the metro area, so the picture is named for the metro area and its place says it is the refuge (Belton's rule). Over a granite gorge's pool between lichened cliffs (no sky at 21:9), a fishing pier running into the words twice, a coreopsis valley with no mountain, the old high school whose dome the card cuts, Mount Scott's summit road, hazy views of the lake and the plain, a storm view in heavy HDR soft at 1:1, a dusk view whose author is printed unknown, a lizard, anglers and seven bison. The six-market sheet (run 37313645151) held only Mount Scott's views.
  "cbsa:30020": {
    file: "A sunrise in winter, Wichita Mountains Wildlife Refuge, SW Oklahoma, U.S.jpg",
    place: "The Wichita Mountains on the horizon at a winter sunrise, across the refuge's frosted prairie",
    credit: "Larry Smith",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Lawton, OK",
    size: [4000, 2573],
  },
  // Lewiston-Auburn, ME: skyline-sheet run 37389070836 — a one-market run for a round 16 market, from Auburn's category: the Lewiston-Auburn Railroad Bridge (its title), a rust-red steel truss footbridge straight ahead along a railed walkway with two walkers, bare trees down the left third, brick mill buildings and their stacks across the river at the right, a clear blue sky; the truss portal whole in both crops with sky above it; crisp. The title is kept whole. Over a hospital campus under many wires, Lewiston from a height behind a utility pole and wires, a mall's front, a sewage plant under construction, and Androscoggin River views that name no town in the metro area or lie in New Hampshire. Round 16's sheet (run 37349271496) held two drone frames whose 21:9 had no sky and a frame of Brunswick.
  "cbsa:30340": {
    file: "Approaching the Lewiston-Auburn Railroad Bridge, Auburn ME.jpg",
    place: "The Lewiston-Auburn Railroad Bridge, a rust-red truss footbridge, under a blue sky",
    credit: "John Phelan",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Lewiston-Auburn, ME",
    size: [3072, 2304],
  },
  // Lexington, KY: skyline-sheet run 36780959488 — the landmark the city is known by, sharp at dusk; the downtown aerial was 1544px and dated.
  "cbsa:30460": {
    file: "Rupp Arena view from Triangle Park.jpg",
    place: "Rupp Arena at dusk, from Triangle Park",
    credit: "Ezugger",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Lexington, KY",
    size: [6088, 4059],
  },
  // Lexington Park, MD: skyline-sheet run 37288974243 — a one-market run's find of thirty-one, from Calvert Cliffs State Park's category: the sandstone cliffs in morning sun with trees on their top, driftwood on the beach and the bay with a further headland under a deep blue sky, whole in both crops; a phone's frame, a little smoothed at 1:1 and clean at card size; the park is in Calvert County, inside the metro area, so the picture is named for the metro area and its place says it is the cliffs (Belton's rule), the round's weakest with Houma's. Over the park's own lead, the headland under a flat white sky, cliff faces under haze, a pond and a trail marker, Point Lookout's riprap and open water, the Patuxent at sunset from a bridge and Solomons' roads under wires and signs. The six-market sheet (run 37287443715) held only the Patuxent and Point Lookout frames.
  "cbsa:30500": {
    file: "2016-07-20 10 10 04 Cliffs to the north of Grays Creek in Calvert Cliffs State Park, Calvert County, Maryland.jpg",
    place: "The cliffs of Calvert Cliffs State Park over the beach and the bay in morning sun",
    credit: "Famartin",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Lexington Park, MD",
    size: [3200, 2380],
  },
  // Lincoln, NE: skyline-sheet run 36800019700 — the State Capitol's tower over downtown under a clear sky, the Sower whole in every crop; the Capitol's own portraits lose the Sower in the deal page's crops, the same skyline's other frames are smaller, paler or put a crane against the tower, the night frames are blown by floodlights, and the rest are rooftops, street corners, a theatre, a hotel's canopy and two congressmen.
  "cbsa:30700": {
    file: "Skyline of Downtown Lincoln, Nebraska, U.S. (2021 photograph).jpg",
    place: "Downtown Lincoln across a field, the Nebraska State Capitol's tower above its skyline",
    credit: "Hanyou23",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Lincoln, NE",
    size: [2357, 1326],
  },
  // Little Rock, AR: skyline-sheet run 36780772501 — the article's lead; one search result was Buffalo.
  "cbsa:30780": {
    file: "Little Rock, Arkansas skyline.jpg",
    place: "Downtown Little Rock from above, the river beyond",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Little Rock, AR",
    size: [7102, 4735],
  },
  // Louisville, KY: skyline-sheet run 36750289515 — whole in every crop; the night lead is 1415px wide.
  "cbsa:31140": {
    file: "Panorama de Louisville.jpg",
    place: "Downtown Louisville across the Ohio River",
    credit: "Anindya Chakraborty",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Louisville, KY",
    size: [9640, 2304],
  },
  // Lynchburg, VA: skyline-sheet run 36816361727 — downtown on its hill above the James, its dark office tower whole in both crops under cirrus in a deep blue sky, green trees at the sides and the river under the card's words. Over the same view wider, a dense brick downtown under a white sky in winter, downtown at dusk across a dark slope of grass, a railway trestle through branches and the library's front under wires.
  "cbsa:31340": {
    file: "Downtown Lynchburg zoomed in.jpg",
    place: "Downtown Lynchburg above the James River, under a blue sky streaked with cloud",
    credit: "Northern-Virginia-Photographer",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Lynchburg, VA",
    size: [4032, 3024],
  },
  // Macon-Bibb County, GA: skyline-sheet run 36818691850 — the city at dusk its article shows, the lights coming on under a pink and violet sky, a brick tower and a church's twin spires on the skyline, sharp, a strip whose full height both crops keep; over the city from high in the air, which reads as a map, a linen postcard, the towers small over trees and a field under a white sky, and three street corners under traffic signals.
  "cbsa:31420": {
    file: "Macon night skyline2.JPG",
    place: "Macon at dusk from a rooftop, its lights coming on under a pink and violet sky",
    credit: "Alexdi at English Wikipedia",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Macon-Bibb County, GA",
    size: [4000, 1365],
  },
  // Madison, WI: skyline-sheet run 36816573981 — a one-market run's pick of twenty-seven: the State Capitol's dome over downtown, across a frozen lake in low winter light under a clear sky, whole in both crops; over a drone's view of the Capitol whose crops cut its statue, the dome up the boulevard under a white sky with its statue cut at 21:9, Monona Terrace from the water, Bascom Hill in autumn with the dome small, Bascom Mall in black and white, power lines across the dome, the lake's open water, haze and algae, an 1855 lithograph and an old frame of a train. The runner printed the licence as "Public Domain" with a link to the Internet Archive's copy of Creative Commons' retired public-domain page; it is written here as the table's other public-domain rows are, with no link, since public domain asks for none.
  "cbsa:31540": {
    file: "Gfp-wisconsin-madison-city-skyline-in-the-winter.jpg",
    place: "The State Capitol's dome over downtown Madison, across a frozen lake in winter light",
    credit: "Yinan Chen",
    license: "Public domain",
    licenseUrl: "",
    name: "Madison, WI",
    size: [2500, 1667],
  },
  // Manchester-Nashua, NH: skyline-sheet run 36800324942 — the mills along the river and downtown's towers behind them under a clear sky in full leaf, from the city's article, every top well inside both crops, over the article's lead, a winter view from above of rowhouses over a flat roof, Nashua's millyard on the water, whose clock tower the wide crop takes, a night highway, a frame where the city is a strip under cloud and backlit towers over a parking lot.
  "cbsa:31700": {
    file: "Skyline of Manchester, New Hampshire, USA.jpg",
    place: "Downtown Manchester's towers behind the Amoskeag Millyard on the Merrimack River",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Manchester-Nashua, NH",
    size: [8064, 5376],
  },
  // Mankato, MN: skyline-sheet run 37349000346 — from Mankato's category: the Union Depot's canopy and brick gabled building beyond two railway tracks, a parking garage at the left edge, a blue sky with cumulus; the depot above the words in both crops, the tracks and ballast under them; crisp, clean midday light; the round's modest pick, the drawn cover a fair alternative. Over a drone frame of downtown whose 21:9 loses the sky and reads as rooftops, a NARA aerial its title places at New Ulm, and three sepia photographs of a hardware store's interior.
  "cbsa:31860": {
    file: "2009-0805-Mankato-UnionDepot.jpg",
    place: "Mankato's Union Depot beyond its tracks under cumulus",
    credit: "Bobak Ha'Eri",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0",
    name: "Mankato, MN",
    size: [3462, 2256],
  },
  // Mayagüez, PR: skyline-sheet run 37288750601 — a one-market run's find of twenty-three, from the lighthouse's category: Los Morrillos lighthouse at Cabo Rojo from above in warm late light, on its limestone cliffs over the sea, the lagoons and the hills beyond under a soft blue sky, the lighthouse above the card's words and whole in both crops (the 21:9 keeps the lagoons' far shore and loses the hills); Cabo Rojo is in the metro area, so the picture is named for the metro area and its place says it is Cabo Rojo (Belton's rule). Over the same lighthouse under a dramatic sky and two more frames whose 21:9 cuts its lantern, one with a photographer's watermark, the lighthouse small across grey water, seven frames of the cliffs and surf with no sky, the plaza's fountain and statue (the 21:9 cuts its head), the theatre's front (the 21:9 cuts its dome), a drone frame centred on a brewery's painted advertisement, mid-rise blocks under overcast and seven 1898 plates. The six-market sheet (run 37287552719) held the brewery, the overcast blocks and four of the plates.
  "cbsa:32420": {
    file: "Faro de Los Morrillos, Cabo Rojo.jpg",
    place: "Los Morrillos lighthouse on its cliffs at Cabo Rojo from above, lagoons and hills beyond",
    credit: "Jerjes Medina Albino",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Mayagüez, PR",
    size: [4000, 3000],
  },
  // McAllen, TX: skyline-sheet run 36782733907 — the city article's lead, over a cityscape led by a parking lot.
  "cbsa:32580": {
    file: "Skyline of McAllen.jpg",
    place: "The McAllen skyline",
    credit: "Theunderratedtaco",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "McAllen, TX",
    size: [4032, 2268],
  },
  // Memphis, TN: skyline-sheet run 36750289515 — the article's lead image, whole in every crop.
  "cbsa:32820": {
    file: "Skyline of Memphis, TN.jpg",
    place: "Downtown Memphis along the Mississippi River",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Memphis, TN",
    size: [5979, 2988],
  },
  // Michigan City-La Porte, IN: skyline-sheet run 37314140256 — from Washington Park's category: the pierhead lighthouse at dusk from a drone, white with its red roof and black lantern at the end of its catwalk and breakwater, a boat's wake beside it, the harbour's lights along the shore and a power station's stack and cooling tower at the right under a blue-grey sky; an oblique with a horizon, the lantern standing above the card's words and whole in both crops (116 px under the 21:9's top), crisp. Over the lighthouse lit against a rose dusk (the 21:9 cuts its vane), the old lighthouse museum under overcast (the 21:9 cuts its lantern), the museum under a blue sky with a flagpole and its historical marker.
  "cbsa:33140": {
    file: "Michigan City East Lighthouse aerial 2021 - Michigan City, Indiana.jpg",
    place: "Michigan City's pierhead lighthouse at dusk from the air, the harbour's lights along the shore",
    credit: "Dan Previte",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Michigan City-La Porte, IN",
    size: [5464, 3640],
  },
  // Midland, MI: skyline-sheet run 37381601175 — a one-market run's find of twenty-four, from The Tridge's category: the Tridge at dusk, its lit arches each strung with lamps over still water at blue hour, reflected whole, dark trees between, a deep blue sky; the place the city is known by; both arches and their reflections whole in both crops; crisp in the lamps, a little soft in the dark trees. Over the same bridge from its deck with the pylon's top cut in both crops, the bridge in snow under a grey sky, its railing close, and Dow Gardens' pavilions, barn and bridges in snow. The six-market sheet (run 37349000346) held the Alden Dow House across a pond with its chimney cut at 21:9, Dow Gardens' flowering tree by a footbridge, the courthouse behind a tree trunk, a PNG of the 2020 flood and an airliner's view of the Dow plant.
  "cbsa:33220": {
    file: "Tridge At Dusk.jpg",
    place: "The Tridge's lit arches reflected in the river at dusk",
    credit: "Phil Squattrito",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Midland, MI",
    size: [2981, 1959],
  },
  // Midland, TX: skyline-sheet run 36818765688 — the downtown towers the city is known by, in low sun from a drone, an oblique with the plain running out to a horizon, sharp, the towers whole in both crops; over the courthouse square through a window, a black mullion down the middle of both crops.
  "cbsa:33260": {
    file: "Midland, TX skyline (cropped).jpg",
    place: "Downtown Midland's towers in low sun, the plain running out to the horizon",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Midland, TX",
    size: [10974, 6173],
  },
  // Milwaukee, WI: skyline-sheet run 36750289515 — the one frame that keeps every tower whole; credited as Commons names the author (the filename names Isaac Rowlett).
  "cbsa:33340": {
    file: "Milwaukee Skyline Looking Southeast Towards Lake Michigan From Northwest by Isaac Rowlett.jpg",
    place: "Downtown Milwaukee and Lake Michigan, looking southeast from the northwest side",
    credit: "Bfkenney",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Milwaukee, WI",
    size: [2048, 1338],
  },
  // Mobile, AL: skyline-sheet run 36797923875 — the article's lead, every tower and crown whole on the card and at 16:9; the 21:9 crop trims only the needle above the tallest tower's crown, where the 2008 river skyline holds whole but small under a sky that fills half the card, and the 2008 ground-level frame cuts both crowns in the wide crop.
  "cbsa:33660": {
    file: "Mobile, Alabama skyline.jpg",
    place: "Downtown Mobile's towers from above, the river and the port beyond",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Mobile, AL",
    size: [10379, 6487],
  },
  // Modesto, CA: skyline-sheet run 36783579706 — the city article's lead and the landmark the city is known by, found only in a one-market run, over ten street views with a date stamp in the corner.
  "cbsa:33700": {
    file: "Modesto Arch.JPG",
    place: "The Modesto Arch",
    credit: "Carl Skaggs",
    license: "Public domain",
    licenseUrl: "",
    name: "Modesto, CA",
    size: [3456, 2304],
  },
  // Montgomery, AL: skyline-sheet run 36808145480 — downtown and its riverfront from the air in warm light, the article's lead, an oblique with a horizon, whole in both crops, over Commerce Street's brick fronts with parked cars along the road, the State Capitol small under a pale overcast sky, and a book's black-and-white plate of the Capitol.
  "cbsa:33860": {
    file: "Aerial view of Montgomery, Alabama LCCN2011646683.jpg",
    place: "Downtown Montgomery and its riverfront from the air, in warm afternoon light",
    credit: "Carol M. Highsmith",
    license: "Public domain",
    licenseUrl: "",
    name: "Montgomery, AL",
    size: [4734, 3282],
  },
  // Morgantown, WV: skyline-sheet run 37237349944 — the city on its hillside across the Monongahela from the west bank, the riverfront's brick blocks and the hill's buildings and trees under a pale sky, every top inside all three crops; over a drone frame whose horizon the 21:9 cuts, leaving a map, the riverfront under a clear sky behind a wall of painted advertisements and a car park, a steep aerial, and four street views of wires, signs and parked cars.
  "cbsa:34060": {
    file: "City of Morgantown from the west side of the Monongahela River, May 2012.jpg",
    place: "Morgantown climbing its hillside above the Monongahela River, from the river's west bank",
    credit: "Jae69376",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Morgantown, WV",
    size: [2848, 1709],
  },
  // Mount Vernon-Anacortes, WA: skyline-sheet run 37313645151 — an article's lead, the Skagit Valley's tulip fields in bands of orange and yellow running to red barns and a white gambrel barn, the foothills under cloud beyond; the card keeps the barns and the hills, the 21:9 loses the hills and trims the red barn's roof at its top edge, the tulips filling it; an older camera's 1600px frame, a little soft at 1:1, vivid at card size; the valley's fields are in Skagit County, the metro area's one county, so the picture is named for the metro area and its place says it is the Skagit Valley (Belton's rule). Over Mount Vernon from a drone over the Skagit (crisp, but the 21:9 loses the horizon and reads as rooftops), Anacortes under a grey overcast, an intersection of signals and cars, the river in flood at the floodwall, and Deception Pass, which straddles Island County, at dusk and from the air.
  "cbsa:34580": {
    file: "Skagit Valley 1.JPG",
    place: "Tulip fields in the Skagit Valley, bands of orange and yellow running to red barns",
    credit: "Gina from Kent, WA, USA",
    license: "CC BY-SA 3.0",
    licenseUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
    name: "Mount Vernon-Anacortes, WA",
    size: [1600, 1200],
  },
  // Muskegon-Norton Shores, MI: skyline-sheet run 37314140256 — an article's lead, downtown across Muskegon Lake on a clear evening, a tall brick tower with green roofs, a white office block and a red clock tower over the breakwall under a pale sky, whole in both crops, crisp at 1:1; a soft willow fills the right third and grass the foreground under the words, the round's weakest with Wenatchee's and Wheeling's. Over the harbour's breakwaters and channel from the air (a 1500px film scan whose 21:9 reads close to a map, its printed credit two lines on a card), three 1911 negatives of the harbour, a garbage truck and a lettered postcard; a one-market run (37321177414) found only the same postcard twice more, two 1911 negatives of a lightship, two men in a bed and the lake from the space station.
  "cbsa:34740": {
    file: "Muskegon skyline and lake.jpg",
    place: "Downtown Muskegon across Muskegon Lake, a tall brick tower over the breakwall",
    credit: "bigmikesndtech",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Muskegon-Norton Shores, MI",
    size: [3072, 2048],
  },
  // Myrtle Beach, SC: skyline-sheet run 36787138337 — the towers and the beach whole in both crops in daylight, over a hazy high view up the strand to Cherry Grove Pier.
  "cbsa:34820": {
    file: "Panorama of the Myrtle Beach Beachfront 3 (cropped).jpg",
    place: "The Myrtle Beach beachfront and its hotel towers",
    credit: "DiscoA340",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Myrtle Beach, SC",
    size: [6515, 2356],
  },
  // Napa, CA: skyline-sheet run 36816430466 — a vineyard in full summer leaf under a clear sky, red roses at the ends of its rows and wooded hills behind, from the category of Napa County's vineyards, the hills whole in both crops. Over the town's riverfront blocks behind a street lamp (an article's lead), a winter vineyard backlit and bare, a night harvest under floodlights that goes black on the card, a high aerial and an airliner's view that read as maps, and San Francisco and the Golden Gate Bridge.
  "cbsa:34900": {
    file: "Napawineryvines.jpg",
    place: "A Napa County vineyard in summer leaf, red roses at the ends of its rows, below wooded hills",
    credit: "Fluous",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Napa, CA",
    size: [2592, 1944],
  },
  // Naples-Marco Island, FL: skyline-sheet run 36798176732 — the Naples Pier, the landmark the city is known by, whole in both crops at sunset, over a sunset at Clam Pass whose subject is a sailboat run aground (623px tall at 2400 wide), a canal-side villa whose roof the deal page's crops cut under a white sky, the Gulf over a railing, a dolphin and four press photographs of officials on the damaged pier.
  "cbsa:34940": {
    file: "Naples FL pier seen from 8th Avenue Beach at sunset.jpg",
    place: "The Naples Pier from 8th Avenue Beach at sunset",
    credit: "P,TO 19104",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Naples-Marco Island, FL",
    size: [4032, 3024],
  },
  // New Haven, CT: skyline-sheet run 36782733907 — the city article's lead, downtown over the autumn trees.
  "cbsa:35300": {
    file: "New Haven, Connecticut skyline (cropped).jpg",
    place: "The New Haven skyline in autumn",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "New Haven, CT",
    size: [6818, 3409],
  },
  // New Orleans, LA: skyline-sheet run 36752856482 — the frame that keeps the towers is a 1704x558 phone panorama.
  "cbsa:35380": {
    file: "New Orleans from the Air September 2019 - Central Business District Skyline (cropped).jpg",
    place: "The Central Business District of New Orleans from the air, the Mississippi behind",
    credit: "George Bannister",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "New Orleans, LA",
    size: [2762, 2092],
  },
  // Sarasota, FL: skyline-sheet run 36780959488 — it says Sarasota where the skyline frame was mostly water; one search result was 1963 Pittsburgh.
  "cbsa:35840": {
    file: "Ringling Causeway from Bird Key.jpg",
    place: "The Ringling Causeway from Bird Key, under palms",
    credit: "The Grid",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Sarasota, FL",
    size: [4032, 3024],
  },
  // Norwich-New London-Willimantic, CT: skyline-sheet run 36816098960 — an article's lead, Norwich's harbour, downtown and the hills from the air in low sun, an oblique with a horizon, whole in both crops; the card names the metro area, Norwich its first-named city. Over New London's waterfront across the water (on the card a band between sky and water), New London from the air under an overcast sky, the Garde Arts Center's marquee, Mystic from the air with its horizon lost at 21:9 over parked cars, the harbour at night and a linen postcard of Mystic's drawbridge.
  "cbsa:35980": {
    file: "Norwich, Connecticut 2.jpg",
    place: "Norwich's harbour and downtown from the air in low sun, wooded hills behind",
    credit: "Hayden Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Norwich-New London-Willimantic, CT",
    size: [4000, 3000],
  },
  // Ogden, UT: skyline-sheet run 36786974652 — the mountains, downtown and a church spire whole in both crops, over a street view that is half asphalt.
  "cbsa:36260": {
    file: "Ogden Utah downtown.jpg",
    place: "Downtown Ogden under the snow-covered mountains",
    credit: "Scott Catron from Sandy, Utah, USA",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    name: "Ogden, UT",
    size: [2805, 1863],
  },
  // Oklahoma City, OK: skyline-sheet run 36751888862 — the sharpest frame; the Devon Tower is whole on the card (a strip-safe alternative carries a burned-in watermark).
  "cbsa:36420": {
    file: "Oklahoma City skyline from drone.jpg",
    place: "Downtown Oklahoma City and the Devon Tower, from a drone",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Oklahoma City, OK",
    size: [7357, 4157],
  },
  // Omaha, NE: skyline-sheet run 36750858237 — the article's lead image, at ground level, whole in every crop.
  "cbsa:36540": {
    file: "City of Omaha, Nebraska Skyline on the Missouri River (30899969517).jpg",
    place: "Downtown Omaha across the Missouri River from Council Bluffs",
    credit: "Tony Webster from Minneapolis, Minnesota, United States",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Omaha, NE",
    size: [7279, 4652],
  },
  // Owensboro, KY: skyline-sheet run 37349135113 — an article's lead, the cable-stayed Natcher Bridge across the Ohio from a drone, its two pylons and fans of cables, barges and a power plant's cooling tower and stack on the flat far shore, a band of blue sky; an oblique with a horizon; both pylons above the words in both crops; crisp, light JPEG blocking on the water. Over a brick block at a corner under signal arms and an autumn tree over low buildings.
  "cbsa:36980": {
    file: "US 231 Natcher Bridge - Up River.jpg",
    place: "The Natcher Bridge across the Ohio from the air, its two pylons and cable fans",
    credit: "Thomas Hughes",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Owensboro, KY",
    size: [4000, 3000],
  },
  // Oxnard, CA: skyline-sheet run 36782733907 — the harbour's boats and palms, over an aerial of the Ventura coast in oversaturated colour.
  "cbsa:37100": {
    file: "CI Harbor Panorama (cropped).jpg",
    place: "Channel Islands Harbor, Oxnard",
    credit: "Fettlemap",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Oxnard, CA",
    size: [3954, 1326],
  },
  // Palm Bay-Melbourne-Titusville, FL: skyline-sheet run 36786974652 — the pier whole in both crops in clear daylight, over a Titusville pier whose Kennedy Space Center view is a speck on the horizon; the card names the metro area, since the pier is Cocoa Beach's.
  "cbsa:37340": {
    file: "Cocoa Beach Pier from the beach 2023-05-19 (2).JPG",
    place: "Cocoa Beach Pier from the beach",
    credit: "Benoît Prieur",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Palm Bay-Melbourne-Titusville, FL",
    size: [4032, 3024],
  },
  // Panama City-Panama City Beach, FL: skyline-sheet run 36818691850 — the emerald water the coast is known by, from St. Andrews State Park toward the beach's condominium towers under a deep blue sky, sharp and whole in both crops; over a high panorama whose beach falls under the scrim, the beach from a pier whose tallest tower the 21:9 cuts, two people on a jet ski, a storm-dark sky over the Gulf, the park's beach and the bay under grey skies, and City Hall's lettered front.
  "cbsa:37460": {
    file: "Emerald Coast Waters from St Andrews State Park.jpg",
    place: "The Gulf's emerald water from St. Andrews State Park, the beach and its condominium towers beyond",
    credit: "Royalbroil",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Panama City-Panama City Beach, FL",
    size: [5472, 3648],
  },
  // Parkersburg-Vienna, WV: skyline-sheet run 37349271496 — an article's lead, the white Blennerhassett Mansion on its island in the Ohio (Wood County), both wings joined by curved colonnades, every chimney, spring trees behind, a blue sky, the lawn and a gravel path in tree shadow in front; the mansion whole above the words in both crops; crisp, clean light; named for the metro area. The runner printed the author as "WVhybrid", an account name; zori probe_url run 37382024313 printed it as the file page's Author field, linking the account's English Wikipedia user page, and the file names no other attribution beside the licence. Over the brown Little Kanawha between wooded banks, a carved datestone, two roads and a 7-Eleven.
  "cbsa:37620": {
    file: "Blennerhassett Mansion.JPG",
    place: "The Blennerhassett Mansion on its island in the Ohio, its wings and colonnades",
    credit: "WVhybrid",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Parkersburg-Vienna, WV",
    size: [3456, 2304],
  },
  // Pensacola, FL: skyline-sheet run 36783120462 — the white sand the area is known by (an article's lead), over an aerial of the bay.
  "cbsa:37860": {
    file: "Pensacola Beach, United States (Unsplash).jpg",
    place: "Pensacola Beach",
    credit: "Fede Casanova fedecasanova",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Pensacola, FL",
    size: [5832, 3888],
  },
  // Peoria, IL: skyline-sheet run 36800398141 — the skyline across the Illinois River from the article, every top whole in all three crops, over the same photograph's wider cuts — one keeping less of the skyline on the card, one 589px tall at 2400 wide — the Murray Baker Bridge with no city in its frame and a distant view over a warehouse roof.
  "cbsa:37900": {
    file: "Peoria Illinois Skyline (cropped) (cropped).jpg",
    place: "Downtown Peoria's skyline across the Illinois River",
    credit: "Scott Tranchitella from West Peoria, Illinois, USA",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    name: "Peoria, IL",
    size: [2802, 1207],
  },
  // Pittsfield, MA: skyline-sheet run 37237349944 — Park Square and downtown from above in clear autumn light, the stone church, the brick and stone blocks and the park's turning trees under hills on the horizon, every top inside all three crops; over the city article's lead, a drone frame toward the mountains whose summit sits on the card's top edge and which the 21:9 cuts with all its sky, and an 1886 print of the square.
  "cbsa:38340": {
    file: "Downtown and Park Square, Pittsfield, Massachusetts.jpg",
    place: "Park Square and downtown Pittsfield in autumn colour, hills on the horizon",
    credit: "Protophobic",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Pittsfield, MA",
    size: [4000, 2000],
  },
  // Ponce, PR: skyline-sheet run 37288646346 — a one-market run's find of fifteen, from search: the port of Ponce and its marina point from the air, sailboats in the harbour and a container ship at the quay, the city along the far shore and the mountains on the horizon under a pale sky; the card keeps the mountains, the 21:9 loses them and keeps the far shore, so it still reads as a harbour in perspective, not a map; a 1511px film scan, served at its own width as Erie's is. Over a 1977 survey plate of the firehouse and the cathedral, the city hall behind trees and a lamppost, Castillo Serrallés on its hill under a white sky (the 21:9 cuts its tower), a 1960s aerial of a hotel, a lettered university postcard, a dam's construction site, a carnival float and a crafts fair at night, a painted lion, a grackle, an iguana, an 1898 landing painted and a tug from a warship's deck. The six-market sheet (run 37287443715) held the plate, the city hall, Castillo Serrallés, the grackle and a book's plate of the plaza.
  "cbsa:38660": {
    file: "Ponce Puerto Rico port aerial view.jpg",
    place: "The port of Ponce from the air, its marina and harbour, the mountains beyond",
    credit: "Tony Santana, U.S. Army Corps of Engineers",
    license: "Public domain",
    licenseUrl: "",
    name: "Ponce, PR",
    size: [1511, 998],
  },
  // Portland, ME: skyline-sheet run 36782855933 — a picture from the city's own article, the marina in front of downtown, over an aerial and a grey view from the islands.
  "cbsa:38860": {
    file: "Skyline waterfront.jpg",
    place: "The Portland skyline over the waterfront",
    credit: "Metrodogmedia",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Portland, ME",
    size: [4323, 1431],
  },
  // Port St. Lucie, FL: skyline-sheet run 36791449560 — the Fort Pierce article's lead, the inlet, its beaches and the town whole in both crops with a horizon, so it reads as a photograph, not a map; Stuart's downtown would print STUART on a card named Port St. Lucie, and the river view is mostly sky.
  "cbsa:38940": {
    file: "Fort Pierce Inlet State Park.jpg",
    place: "The Fort Pierce Inlet and its beaches from above",
    credit: "JonathanPuello",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Port St. Lucie, FL",
    size: [5318, 3542],
  },
  // Prescott Valley, AZ: skyline-sheet run 36819025201 — an article's lead: Watson Lake's boulders lit warm over deep blue water under a clear sky, whole in both crops, the card named for the title's first city; over Sedona's Cathedral Rock, another town's, whose cap the 21:9 cuts, the courthouse square's county sign on a lawn, the civic centre small under white cloud, the dells at dusk and behind a highway, and the courthouse's statue in shade.
  "cbsa:39150": {
    file: "Watson Lake 2.JPG",
    place: "Watson Lake's weathered boulders over deep blue water, under a clear sky",
    credit: "Benjamin Cody",
    license: "CC BY-SA 3.0",
    licenseUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
    name: "Prescott Valley, AZ",
    size: [2592, 1944],
  },
  // Providence, RI: skyline-sheet run 36750289515 — the article's lead image; the river, bridge and skyline stay whole in every crop.
  "cbsa:39300": {
    file: "Providence RI skyline.jpg",
    place: "Downtown Providence beyond the Providence River Bridge",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Providence, RI",
    size: [4003, 2714],
  },
  // Provo, UT: skyline-sheet run 36786974652 — the one ground-level view of the city, whole in both crops, over hazy views down from the hillside, aerials and a plane window. The runner printed the author as "Creator: Javin Weaver" (Commons' Creator template); the credit is the name in it.
  "cbsa:39340": {
    file: "Downtown Provo.jpg",
    place: "Downtown Provo's clock-tower block under snow-capped mountains",
    credit: "Javin Weaver",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Provo, UT",
    size: [5248, 2952],
  },
  // Pueblo, CO: skyline-sheet run 37340733360 — a one-market run's find of twenty-three, from the Historic Arkansas Riverwalk's category: the Riverwalk's channel curving away past a café promenade and its trees, brick blocks with arched windows and a flag beyond, a small cascade at the far end, under a blue sky with cloud; the card keeps the channel and the blocks, the 21:9 the brick block, the flag and a strip of sky; crisp; the place the city is known by. Over the Veterans' footbridge with the sky most of the card, the steel mill's sheds and a rusted stack from a drone (the 21:9 cuts its crown), the channel busy with a crane and brush, children in a fountain, a quilt sculpture, the railyard's ruins and a painted advertisement. The six-market sheet (run 37330183778) held the courthouse's dome over a car park with its spires cut at 21:9, a drone frame whose 21:9 reads as rooftops, and cottonwoods on a river whose file names no place.
  "cbsa:39380": {
    file: "Historic Arkansas Riverwalk of Pueblo.JPG",
    place: "The Historic Arkansas Riverwalk's channel curving between trees and brick blocks",
    credit: "Jeffrey Beall",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Pueblo, CO",
    size: [6000, 4000],
  },
  // Racine-Mount Pleasant, WI: skyline-sheet run 37287680216 — an article's photograph, Wind Point Lighthouse from a drone, the white tower and its red lantern over the keeper's red-roofed house among trees, the lake beyond under mist and a grey sky; an oblique with a horizon, the lantern whole in both crops (the 21:9 with a small margin), crisp. Over the article's lead, the Research Tower over the brick Administration Building under a blue sky (a company's headquarters), the lighthouse from the ground (the 21:9 cuts its lantern), twice behind pines across a lawn, and a coloured postcard of a square.
  "cbsa:39540": {
    file: "Aerial view of Wind Point Lighthouse, Wisconsin, US julesvernex2.jpg",
    place: "Wind Point Lighthouse and the keeper's house from the air, the lake beyond under mist",
    credit: "Jules Verne Times Two",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Racine-Mount Pleasant, WI",
    size: [8052, 5871],
  },
  // Rapid City, SD: skyline-sheet run 37236951448 — downtown in warm low sun under the foothills of the Black Hills, the city and the ridge above it whole in both crops; over a drone frame of a highway, a gas station and car parks under a hazy sky, downtown from the hillside with treetops across half the card and flat ground behind, a sky of cloud over a sliver of plain, the Needles from Harney Peak, a street front behind a tree's trunk, office towers through blurred pine and a winter aerial that reads as a map.
  "cbsa:39660": {
    file: "Rapid City Skyline (2022).jpg",
    place: "Downtown Rapid City in warm low sun, the foothills of the Black Hills behind it",
    credit: "WeaponizingArchitecture",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Rapid City, SD",
    size: [3353, 1885],
  },
  // Reno, NV: skyline-sheet run 36780959488 — the one clear frame; the rest were a freeway and airplane windows.
  "cbsa:39900": {
    file: "Downtown Reno 2.jpg",
    place: "Downtown Reno's towers under a clear sky",
    credit: "Downtowngal",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Reno, NV",
    size: [4159, 1254],
  },
  // Roanoke, VA: skyline-sheet run 36816286360 — an article's lead and the view the city is known by, from the Mill Mountain Star: downtown at dusk, its domed tower lit and the interstate's light trails curving through, the Blue Ridge in silhouette under a deep blue sky, the ridge with sky above it in both crops. Over the same view in daylight as a panorama whose downtown falls under the card's words, in low afternoon sun behind bare branches with its mountains lost at 21:9, two telephotos of downtown with no sky (one a PNG), an industrial district under a mountain, the city at night through bare trees, the tower over a rail yard and a parking lot, and a tavern's neon signs.
  "cbsa:40220": {
    file: "Roanoke City (Virginia) from Mill Mountain Star at Dusk.jpg",
    place: "Downtown Roanoke at dusk from the Mill Mountain Star, the Blue Ridge beyond",
    credit: "Joe Ravi",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Roanoke, VA",
    size: [2668, 1808],
  },
  // Rochester, MN: skyline-sheet run 36818844258 — the Mayo Clinic the city is known by, its carved stone tower against a clear blue sky between the clinic's blocks, a strip whose full height both crops keep; over the same frame before its crop above a brick wall, three drone frames whose cards are flat roofs and parking lots, towers mirrored in a winter river whose white tower's crown the 21:9 cuts, and the clinic's blocks over houses' roofs.
  "cbsa:40340": {
    file: "Mayo Clinic skyline2 (cropped).jpg",
    place: "The Mayo Clinic in downtown Rochester, its carved stone tower against a clear blue sky",
    credit: "Michael Hicks from Saint Paul, MN, USA",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Rochester, MN",
    size: [3236, 896],
  },
  // Rochester, NY: skyline-sheet run 36781253352 — a one-market run's pick of twenty-four; the six-market sheet held an airport, a dated overhead and a washed-out sky.
  "cbsa:40380": {
    file: "Skyline Rochester, NY.jpg",
    place: "Downtown Rochester's towers behind an arched river bridge",
    credit: "Evilarry at English Wikipedia",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Rochester, NY",
    size: [3601, 1760],
  },
  // Rockford, IL: skyline-sheet run 36800398141 — downtown across the Rock River in warm low light, the river and the sky calm and every roof whole in both crops, over the same river's bridge from a dock under a white sky, two street views down East State Street with parked cars and a pickup, and two postcards of Virginia motor courts that the search returned for the word Skyline.
  "cbsa:40420": {
    file: "Rockford, IL Downtown 02.JPG",
    place: "Downtown Rockford across the Rock River in low sun, a bridge's arches at the right",
    credit: "Ben Jacobson ( Kranar Drogin )",
    license: "CC BY 2.5",
    licenseUrl: "https://creativecommons.org/licenses/by/2.5",
    name: "Rockford, IL",
    size: [3456, 2304],
  },
  // Saginaw, MI: skyline-sheet run 37287680216 — an article's lead, downtown across the river in the evening under a blue sky, a tall old block and an Art Deco tower over the riverbank's buildings, a bridge and a boat's wake at the right, whole in both crops; a little smoothed at 1:1, clean at card and header size, a windowless white wall at the left edge. Over the Castle Museum (the 21:9 cuts a tower's lantern), a speedboat's wake under two bridges at 1600px, a concert on a lawn from above and three archive plates of 1888, 1912 and 1915.
  "cbsa:40980": {
    file: "Saginaw, Michigan Skyline (2022).jpg",
    place: "Downtown Saginaw across the river in the evening, a bridge at the right",
    credit: "WeaponizingArchitecture",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Saginaw, MI",
    size: [3706, 2084],
  },
  // St. George, UT: skyline-sheet run 36808230184 — the city below its red sandstone bluffs, snow-capped mountains under cloud beyond, an article's lead, whole in both crops, over four views of Snow Canyon State Park — red and white sandstone and sage, the park rather than the city, one with a dark shadow across a third of the card.
  "cbsa:41100": {
    file: "EM ST. GEORGE, UTAH (2624012794).jpg",
    place: "St. George below its red sandstone bluffs, snow-capped mountains under cloud beyond",
    credit: "Eddie Maloney from North Las Vegas, USA",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
    name: "St. George, UT",
    size: [3872, 2592],
  },
  // Salem, OR: skyline-sheet run 36787138337 — the city article's lead, its spire whole in both crops, over buses at the transit centre and railway aerials.
  "cbsa:41420": {
    file: "Salem Oregon downtown.JPG",
    place: "Downtown Salem among the trees, a church spire at its centre and hills behind",
    credit: "M.O. Stevens",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Salem, OR",
    size: [3796, 2473],
  },
  // San Angelo, TX: skyline-sheet run 37330183778 — an article's lead, the Concho River through town between grassy banks, a promenade on the left, a road bridge and a footbridge beyond, cumulus reflected in the still water; the water under the card's words, the bridges, trees and sky above them in both crops; crisp, a few thin wires behind the road bridge faint at card size. Over a road off a bridge with a lamppost up the frame and the Cactus Hotel's lettered roof, the Art Deco city hall whose roof the 21:9 meets, Fort Concho's barracks whose chimneys it cuts, and the river at a weir under a white overcast.
  "cbsa:41660": {
    file: "San Angelo September 2019 66 (Concho River).jpg",
    place: "The Concho River through San Angelo, its bridges under cumulus reflected in still water",
    credit: "Michael Barera",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "San Angelo, TX",
    size: [6000, 4000],
  },
  // Sandusky, OH: skyline-sheet run 37313470791 — the Cedar Point article's photograph, the peninsula from a plane, its beach and breakwater, the coasters among trees and the parking lots at its root, the bay and its far shore on the horizon under a blue sky with a line of cumulus; an oblique with a horizon, whole in both crops; a little soft at 1:1, the coasters small and legible at card size. Over riders over the park's "Welcome to Cedar Point" sign, two coasters close, and Kelleys Island from high above in glare (a map). Marblehead Lighthouse's article and category gave nothing on the sheet.
  "cbsa:41780": {
    file: "Cedar Point from the air.jpg",
    place: "Cedar Point's peninsula from the air, its beach and coasters, the bay beyond",
    credit: "Nyttend",
    license: "Public domain",
    licenseUrl: "",
    name: "Sandusky, OH",
    size: [2816, 2112],
  },
  // San Jose-Sunnyvale-Santa Clara, CA: skyline-sheet run 36816505479 — a one-market run's pick of twenty-eight: downtown's towers lit against a violet night sky, sharp and whole in both crops, the crane and every tower with sky above; over the same frame uncropped, downtown small across the valley floor from a height, a look up at the Hotel De Anza with parked cars and a one-way sign at its foot, a steep look down in hazy midday light, a hazy strip 501px tall at 2400 wide, suburbs under green hills, Santana Row's shopping street, a crowd at the Civic, storefronts and a theatre's marquee, two hazy views from airliners, San Francisco's Golden Gate and Alviso's fireworks. The card names the Census title's first city, as Oxnard's, Bakersfield's and Stockton's do: the whole title ran into the credit on a phone's card.
  "cbsa:41940": {
    file: "Downtown SJ at Night cropped1.jpg",
    place: "Downtown San Jose's towers lit at night, over a field of yellow flowers",
    credit: "Ben Loomis",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "San Jose, CA",
    size: [3831, 2611],
  },
  // San Juan-Bayamón-Caguas, PR: skyline-sheet run 36797923875 — El Morro, the picture the city is known by, whole in both crops with a horizon, so it reads as a photograph, not a map; the fort's lawn panorama is 524px tall at 2400 wide, the plane's view of the islet reads as a map, and the rest are hazy views across the water and green hills with the city a strip on the horizon.
  "cbsa:41980": {
    file: "Castillo San Felipe del Morro aerial, May 2024 - 01.jpg",
    place: "Castillo San Felipe del Morro on its headland, Old San Juan behind it, from the air",
    credit: "Nils Huenerfuerst",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "San Juan-Bayamón-Caguas, PR",
    size: [4032, 2268],
  },
  // San Luis Obispo-Paso Robles, CA: skyline-sheet run 36808230184 — the Mission, an article's lead, in warm evening light beside its eucalyptus, whole on the card and at 16:9; the 21:9 crop takes the head and arms of the cross on its gable, where the gable stays whole. Over the Mission's side in hard sun with its gable cut on the card, Bishop Peak behind a passenger train under a white sky, a hotel corner under a tree's shadow, a courtyard under a white sky, a c.1900 photograph and a 1920 book plate.
  "cbsa:42020": {
    file: "Mission San Luis Obispo (cropped).jpg",
    place: "Mission San Luis Obispo de Tolosa in warm evening light, eucalyptus beside it",
    credit: "Rennett Stowe",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "San Luis Obispo-Paso Robles, CA",
    size: [3888, 2047],
  },
  // Santa Cruz-Watsonville, CA: skyline-sheet run 36808230184 — the harbour's sailboats under a blue sky with cloud, sharp and whole in both crops, over downtown's clock tower with its spire cut by the file's own top edge in hazy light, the Boardwalk across the water under a grey overcast, the bay from the wharf that is mostly open water on the card, a trolley, men on a dock and an old boat.
  "cbsa:42100": {
    file: "Boats in Santa Cruz Harbor (6868331295).jpg",
    place: "Sailboats moored in Santa Cruz Harbor under a blue sky with cloud",
    credit: "Don DeBold from San Jose, CA, USA",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Santa Cruz-Watsonville, CA",
    size: [4288, 2848],
  },
  // Santa Fe, NM: skyline-sheet run 36808230184 — the Palace of the Governors' portal on the Plaza, an article's lead and the picture the city is known by, under a blue sky with cumulus, whole in both crops, over the Plaza's obelisk among trees, the rail depot over parked cars, an 1866 photograph, a c.1930 painting and two 1982 slides.
  "cbsa:42140": {
    file: "Palace of the Governors.jpg",
    place: "The Palace of the Governors' portal on the Plaza under a blue sky with cumulus",
    credit: "Tony Hisgett from Birmingham, UK",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Santa Fe, NM",
    size: [5050, 2318],
  },
  // Santa Maria-Santa Barbara, CA: skyline-sheet run 36799416970 — the palms, the red-roofed town and the mountains behind, whole in both crops under a clear sky, over the harbour's fishing boats at golden hour, whose ridge the wide crop clips, a drone's view of the harbour and the wharf under a washed-out haze, a shopping plaza and a hazy view across the rooftops.
  "cbsa:42200": {
    file: "View of Santa Barbara, California from the Stearns Wharf.jpg",
    place: "Santa Barbara's palm-lined beach under the Santa Ynez Mountains, from Stearns Wharf",
    credit: "Gatorfan252525",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Santa Maria-Santa Barbara, CA",
    size: [4032, 3024],
  },
  // Santa Rosa-Petaluma, CA: skyline-sheet run 36791355974 — the Sonoma County article's lead, whole in both crops under a blue sky; the county's coast (Arched Rock, Bodega Head) is as fine but farther from the market, and the rest were a train platform, San Francisco and a downtown sign.
  // The runner printed the author as "w:en:User:Anlace" (a link to the
  // English Wikipedia user); the credit is the name in it.
  "cbsa:42220": {
    file: "Sonomamtnvineyard.jpg",
    place: "A Sonoma County vineyard below the mountains",
    credit: "Anlace",
    license: "CC BY-SA 3.0",
    licenseUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
    name: "Santa Rosa-Petaluma, CA",
    size: [2816, 1508],
  },
  // Savannah, GA: skyline-sheet run 36782855933 — the picture the city is known by, over its houses and a park path.
  "cbsa:42340": {
    file: "Forsyth fountain 2019.jpeg",
    place: "The fountain in Forsyth Park, Savannah",
    credit: "Seasider53",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Savannah, GA",
    size: [3869, 2248],
  },
  // Scranton, PA: skyline-sheet run 36783120462 — the city article's lead, downtown in warm light, over a night traffic view and two purple-tinted aerials.
  "cbsa:42540": {
    file: "Scranton - Downtown (48472890492).jpg",
    place: "Downtown Scranton",
    credit: "Ajay Suresh from New York, NY, USA",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Scranton, PA",
    size: [4177, 2350],
  },
  // Sheboygan, WI: skyline-sheet run 37330877189 — an article's lead, the city's riverfront: a railing promenade with lampposts and a gazebo, condominium blocks among trees and a tower with a lettered crown behind, under a pale sky that fills half the frame; the blocks and the tower above the words in both crops, the water under them; crisp, flat light; the round's modest pick with Blacksburg's. The runner printed the author as "AsherHeimermann", and the file page's Author field is that account, its user page never created (zori probe_url run 37343970376). Over Lake Michigan's beach and a rowboat in a file with a black border down both edges, a street of parked cars under wreathed lampposts, and two trains.
  "cbsa:43100": {
    file: "Sheboygan Riverfront.jpg",
    place: "Sheboygan's riverfront, a promenade with lampposts, blocks among trees and a tower behind",
    credit: "AsherHeimermann",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Sheboygan, WI",
    size: [4608, 2762],
  },
  // Sherman-Denison, TX: skyline-sheet run 37349135113 — the Denison article's lead, Main Street: a receding row of red, tan and brown brick fronts with arched windows, a striped awning, wreathed lampposts, a distant theatre's lettered marquee and two parked cars, a pale sky at the top right; no wires or signal arms; the row above the words in both crops, the 21:9 cutting the nearest front's arched window at its top left; crisp. The title is kept whole, the photograph the second city's. The runner printed the author as "Renelibrary", an account name; zori probe_url run 37382024313 printed it as the file page's Author field, an account whose user page was never created, and the file names no other attribution beside the licence. Over Sherman's stone building whose eave the 21:9 meets, Lake Texoma's grey water with no sky at 21:9, two 1896 tornado PNGs, a college plate and a private house.
  "cbsa:43300": {
    file: "DenisonTexas1.jpg",
    place: "Denison's Main Street, a row of brick fronts with arched windows",
    credit: "Renelibrary",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Sherman-Denison, TX",
    size: [4272, 2848],
  },
  // Shreveport-Bossier City, LA: skyline-sheet run 36797923875 — both banks of the river at golden hour, every tower whole in both crops, an oblique with a horizon; the bureau's other drone frame carries a dark propeller-shaped blur in its corner, the panorama is a grey sky behind a highway barrier, and the Regions tower loses its top in the wide crop over a rooftop.
  "cbsa:43340": {
    file: "Shreveport-Bossier City Skyline over Red River.jpg",
    place: "The Shreveport-Bossier City skyline over the Red River at golden hour, from above",
    credit: "Shreveport-Bossier Convention and Tourist Bureau",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Shreveport-Bossier City, LA",
    size: [3840, 2160],
  },
  // Sioux Falls, SD: skyline-sheet run 36816207134 — Falls Park and downtown under a clear sky, the falls running over pink rock between green lawns, every building whole in both crops, two cranes small beside the tallest block. Over the article's lead, the same view in March under grey cloud with bare trees, two frames of the falls under tower cranes and a building's frame (one in snow), downtown across a highway barrier, a street at dusk behind a parking sign and a 1908 panorama.
  "cbsa:43620": {
    file: "Falls Park and Downtown 09-17-23.jpg",
    place: "The falls in Falls Park and downtown behind them, under a clear sky",
    credit: "Maxpower2727",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Sioux Falls, SD",
    size: [4000, 2252],
  },
  // South Bend, IN: skyline-sheet run 36800398141 — Notre Dame's Golden Dome and the Basilica's spire against an orange sky, the picture the area is known by, whole in every crop, over downtown on its river in soft light (an article's lead, the owner's alternative), two aerial views of the river, one steep enough to read as a map and one under a white haze, a riverbank with a date burned into its corner and the river's lights at night.
  "cbsa:43780": {
    file: "North Quad from Fr. Hesburgh's Office in the Hesburgh Library.JPG",
    place: "The University of Notre Dame's Golden Dome and the Basilica's spire against an orange sky, from the Hesburgh Library",
    credit: "Know1one1",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "South Bend, IN",
    size: [4000, 3000],
  },
  // Spartanburg, SC: skyline-sheet run 36798176732 — the city's skyline under a clear sky, every roof whole in both crops, over a Main Street corner whose cupola the wide crop cuts, a mural of words (the article's lead), a cultural centre's façade 522px tall at 2400 wide, a street of parked cars, a corporate tower and its logo, the airport's terminal sign and a postcard.
  "cbsa:43900": {
    file: "Spartanburg skyline - Sept. 2025.jpg",
    place: "Downtown Spartanburg under a clear sky, a brick tower at its centre",
    credit: "PegasusRacer28",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Spartanburg, SC",
    size: [3954, 1572],
  },
  // Spokane, WA: skyline-sheet run 36780772501 — the article's lead.
  "cbsa:44060": {
    file: "Spokane, Washington skyline (cropped).jpg",
    place: "Downtown Spokane and its river gorge from above",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Spokane, WA",
    size: [6933, 3813],
  },
  // Springfield, MA: skyline-sheet run 36800324942 — an article's lead, downtown across the river under a clear winter sky, every tower whole on the card and at 16:9; at 21:9 the glass tower's crown sits flush with the top edge and its rooftop masts are trimmed, where the same photographer's closer frame is whole with headroom but its river is a white field of ice, an autumn frame from above, cropped and not, centres on a large flag over a park, the uncropped original leaves the city a thin band between sky and water, a 4.15:1 panorama is 578px tall at 2400 wide and a dusk frame is a heavily processed roadway.
  "cbsa:44140": {
    file: "Springfield, MA city skyline 2026 (cropped).jpg",
    place: "Downtown Springfield across the Connecticut River in winter, a bridge's pylons in front",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Springfield, MA",
    size: [7497, 5001],
  },
  // Stockton, CA: skyline-sheet run 36783120462 — the city article's lead, downtown in the evening light, over six crops of one waterfront view.
  "cbsa:44700": {
    file: "Aerial view of Stockton, California skyline.jpg",
    place: "An aerial view of downtown Stockton",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Stockton, CA",
    size: [5068, 3126],
  },
  // Syracuse, NY: skyline-sheet run 36780772501 — the article's lead; the rest were highways and a haze.
  "cbsa:45060": {
    file: "Syracuse, New York skyline (cropped).jpg",
    place: "Downtown Syracuse from above",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Syracuse, NY",
    size: [10019, 5567],
  },
  // Tallahassee, FL: skyline-sheet run 36791060658 — the downtown towers whole in both crops under a clear sky, over the Capitol tower cut at its top, a street corner and a hazy view from high above.
  "cbsa:45220": {
    file: "TallahasseeSkyline2.JPG",
    place: "Downtown Tallahassee's towers over the trees under a blue sky",
    credit: "UrbanTallahassee",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Tallahassee, FL",
    size: [3093, 1779],
  },
  // Toledo, OH: skyline-sheet run 36780959488 — sharp and vivid; the evening skyline is 354px tall and would be soft on every card.
  "cbsa:45780": {
    file: "Anthony Wayne Bridge, Toledo, OH from Middlegrounds Metropark Full Span.jpg",
    place: "The Anthony Wayne Bridge from Middlegrounds Metropark",
    credit: "Limpfster94",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Toledo, OH",
    size: [5184, 3456],
  },
  // Traverse City, MI: skyline-sheet run 37236836751 — downtown from above in summer under a clear blue sky, its tallest tower's green copper roof at the left and a red dome at the right, whole in both crops; over a hazy telephoto of the same tower in early spring behind a crane, the city as a thin strip across the bay, a crossroads in slush, a hazy marina and two shores in another county.
  "cbsa:45900": {
    file: "Traverse City Skyline.jpg",
    place: "Downtown Traverse City from above under a clear summer sky",
    credit: "Phoenix-Five",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Traverse City, MI",
    size: [4032, 3024],
  },
  // Trenton-Princeton, NJ: skyline-sheet run 36800324942 — the State House, the picture a capital is known by, its dome whole in every crop under a clear sky, over the same building from the north with its dome cut by the wide crop behind a tree, City Hall under a grey sky, the falls of the Delaware with downtown a pale strip, the Trenton Makes bridge's lettering at night, the freeway and a canal under a billboard.
  "cbsa:45940": {
    file: "2014-12-27 15 54 11 Panorama of the front of the New Jersey State House on West State Street in Trenton, New Jersey.JPG",
    place: "The New Jersey State House on West State Street, Trenton, on a winter afternoon",
    credit: "Famartin",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Trenton-Princeton, NJ",
    size: [3699, 1878],
  },
  // Tucson, AZ: skyline-sheet run 36750496544 — the article's lead image, whole in every crop.
  "cbsa:46060": {
    file: "View of Tucson from Sentinel Peak 2.jpg",
    place: "Downtown Tucson from Sentinel Peak, the mountains behind",
    credit: "John Diebolt",
    license: "Public domain",
    licenseUrl: "",
    name: "Tucson, AZ",
    size: [4000, 3000],
  },
  // Tulsa, OK: skyline-sheet run 36752971792 — whole in every crop, where a ground-level frame cut the BOK Tower.
  "cbsa:46140": {
    file: "Tulsa skyline aerial, April 2023.jpg",
    place: "Downtown Tulsa from the air",
    credit: "Nils Huenerfuerst",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Tulsa, OK",
    size: [4000, 3000],
  },
  // Twin Falls, ID: skyline-sheet run 37313470791 — the Shoshone Falls article's photograph, the falls in their basalt amphitheatre at July's low water, white veils down the columns into the dark pool, the canyon's far rim and its trees with a strip of sky; the card keeps the sky, the 21:9 loses it and keeps the falls and the rim in perspective; a 2013 phone frame, a little soft at 1:1, clean at card size; the falls are on the Snake where it parts Twin Falls and Jerome counties, both in the metro area, so the picture is named for the metro area and its place says it is Shoshone Falls (Belton's rule). Over the canyon from the Perrine Bridge in evening light (the runner-up, a canyon rather than the falls), the same in April, houses on the gorge's floor, dark walls under power lines, a street of pickups under trees and a 1400px strip of the canyon.
  "cbsa:46300": {
    file: "2013-07-07 17 41 52 Shoshone Falls in Idaho viewed from the northwest.jpg",
    place: "Shoshone Falls in its basalt canyon, the dark pool below",
    credit: "Famartin",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Twin Falls, ID",
    size: [3264, 2448],
  },
  // Honolulu, HI: skyline-sheet run 36750858237 — the article's lead image, whole in every crop.
  "cbsa:46520": {
    file: "2022 Views from Diamond Head 02.jpg",
    place: "Waikiki and Honolulu along the shore, from Diamond Head",
    credit: "Farragutful",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Honolulu, HI",
    size: [6000, 4000],
  },
  // Utica-Rome, NY: skyline-sheet run 36818942891 — an article's lead, Union Station's stone corner under a blue sky with white cloud, sharp, whole on the card and at 16:9, the near corner's top just past the 21:9's edge; over downtown from a drone in soft evening light, its card a lawn, rail tracks and parking lots, the harbor lock's gantry under poles, a stamp's first-day cover and highway signs.
  "cbsa:46540": {
    file: "Utica Union Station, New York.jpg",
    place: "Utica's Union Station under a blue sky with white cloud",
    credit: "Kenneth C. Zirkel",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Utica-Rome, NY",
    size: [3600, 1904],
  },
  // Valdosta, GA: skyline-sheet run 37382707897 — a one-market run for a round 15 market, from the Lowndes County Courthouse's category: the courthouse's front, garlanded columns, its side domes and the central cupola and lantern under blue sky and cumulus, trees at either side; the whole building above the card's words; the 21:9 keeps the lantern but its top edge cuts the thin finial rod above it (seen at 2x); crisp; a modest pick, the drawn cover a fair alternative. Over the same front under a white overcast whose 21:9 cuts the cupola, its corner with the lantern cut at 21:9, the front close at night, Christmas trees, a linen postcard, bicycle racks, shopfronts and a dashcam frame. Round 15's sheet (run 37330328150) held the dome down a street under a signal arm, the courthouse close with its dome cut, an airliner's map and trail paths.
  "cbsa:46660": {
    file: "Front of Lowndes County Courthouse.JPG",
    place: "The Lowndes County Courthouse's front, its domes and cupola under cumulus",
    credit: "Daniel Mayer",
    license: "CC BY-SA 3.0",
    licenseUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
    name: "Valdosta, GA",
    size: [2795, 1643],
  },
  // Vallejo, CA: skyline-sheet run 36787230817 — the ferries and the old brick waterfront whole in both crops under a grey sky, over aerials, a theme park's coasters and San Francisco's Golden Gate.
  "cbsa:46700": {
    file: "Mare Island Ferry Terminal from Vallejo, May 2019.JPG",
    place: "Ferries at the Mare Island Ferry Terminal, from Vallejo",
    credit: "Pi.1415926535",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "Vallejo, CA",
    size: [4573, 3053],
  },
  // Visalia, CA: skyline-sheet run 36791296577 — the one view of the city, whole in both crops under a clear sky, over the county article's Sierra landscapes (Columbine Lake, Mount Whitney), which are the county's mountains, not the market.
  "cbsa:47300": {
    file: "Visalia CA downtown 2.jpg",
    place: "Downtown Visalia from a rooftop",
    credit: "Original uploader was VisalianNsf at en.wikipedia",
    license: "CC BY-SA 3.0",
    licenseUrl: "http://creativecommons.org/licenses/by-sa/3.0/",
    name: "Visalia, CA",
    size: [1818, 1228],
  },
  // Waterbury-Shelton, CT: skyline-sheet run 36816098960 — an article's lead, downtown and the Union Station clock tower from the air on a clear day, an oblique with a horizon, whole in both crops, over a winter street whose church spire the deal page's 21:9 cuts, with traffic signals, cars and a gas station's price sign across its foot.
  "cbsa:47930": {
    file: "Waterbury, Connecticut 3.jpg",
    place: "Downtown Waterbury and its Union Station clock tower from the air, wooded hills behind",
    credit: "Hayden Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Waterbury-Shelton, CT",
    size: [4000, 3000],
  },
  // Waterloo-Cedar Falls, IA: skyline-sheet run 37330877189 — an article's lead, downtown Waterloo across the frozen river in winter, a covered footbridge on its piers, the hotel block with its lettered rooftop sign, an orange-roofed bank and a red brick block under a white sky, ice and dark water in front; the blocks above the words in both crops, a flagpole's tip near the 21:9's top; crisp, a little over-sharpened. The title is kept whole, the photograph the first city's. The credit is the Flickr-style "from" form the runner printed, as Mount Vernon-Anacortes' is. Over a corner of shopfronts and signals in Cedar Falls (that article's lead) and a street of tall brick blocks behind a signal pole in grey light.
  "cbsa:47940": {
    file: "Waterloo, Iowa (2014) (cropped).jpg",
    place: "Downtown Waterloo across the frozen river in winter, a covered footbridge in front",
    credit: "David Wilson from Oak Park, Illinois, USA",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Waterloo-Cedar Falls, IA",
    size: [2642, 1390],
  },
  // Wausau, WI: skyline-sheet run 37330877189 — from the Wausau article: downtown at dusk from a drone over the river, two lit causeways running past an island park to the white domed tower and the lit blocks, wooded hills and a thin band of dusk sky at the top; an oblique with a horizon, the tower above the card's words in both crops; crisp; a 2.89:1 frame, which a card asks for at 2400. The runner printed the author as "Wikideas1", and the file page's Author field is that account's user page (zori probe_url run 37343970376); the file is CC0. Over downtown across a wooded valley with no sky, the 400 Block's lawn with traffic cones, a hazy view from Rib Mountain over a bench, and the quarry's cliffs.
  "cbsa:48140": {
    file: "Wausau, Wisconsin downtown.jpg",
    place: "Downtown Wausau at dusk from the air, lit causeways crossing the river to the domed tower",
    credit: "Wikideas1",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Wausau, WI",
    size: [7364, 2552],
  },
  // Wenatchee-East Wenatchee, WA: skyline-sheet run 37313645151 — the Lake Chelan article's photograph, uplake from the south shore in winter, snowy ridges in alpenglow above the dark lake under pink cloud, whole in both crops, crisp; Lake Chelan is in Chelan County, inside the metro area, so the picture is named for the metro area and its place says it is Lake Chelan, as Glens Falls' is Lake George; nothing of Wenatchee itself reached the sheet, the round's weakest with Muskegon's and Wheeling's. Over snowy vineyard rows across the lake under a grey sky, a boat at a dock and a tent, data centres' roofs in brown hills from the air and the Columbia from an airliner (maps).
  "cbsa:48300": {
    file: "Uplake from the south shore Lake Chelan.jpg",
    place: "Lake Chelan in winter, snowy ridges in alpenglow above the dark lake",
    credit: "Themerganser",
    license: "CC BY 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by/3.0",
    name: "Wenatchee-East Wenatchee, WA",
    size: [3072, 2304],
  },
  // Wheeling, WV: skyline-sheet run 37313470791 — from Downtown Wheeling's category: downtown across the Ohio from Wheeling Island under a heavy, textured grey sky, brick towers and the Capitol Music Hall's painted wall at the left, the wooded hill behind and the river in front, whole in both crops; a phone frame with an HDR look, a little smoothed at 1:1, clean at card size, leaves at the left edge. Over the same shore smaller behind bushes and a dock's pilings as a 2.4:1 panorama, the Suspension Bridge from its own deck between traffic signals and under its cables, a stereoview card and its PNG, and a street of brick warehouses under wires and stop signs.
  "cbsa:48540": {
    file: "Downtown Wheeling, WV - 20200628 - 14 - Skyline from Wheeling Island.jpg",
    place: "Downtown Wheeling across the Ohio River under a heavy grey sky",
    credit: "Andre Carrotflower",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Wheeling, WV",
    size: [4032, 3024],
  },
  // Wichita, KS: skyline-sheet run 36780959488 — the article's lead.
  "cbsa:48620": {
    file: "Wichita, Kansas skyline.jpg",
    place: "Downtown Wichita and the river in evening light",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Wichita, KS",
    size: [4654, 2792],
  },
  // Wilmington, NC: skyline-sheet run 36798176732 — the downtown riverfront on the Cape Fear River, sharp and whole in both crops under a clear sky, over Wrightsville Beach's strand (as fine, and the next town's), a drone's dusk view of its channel that is mostly water on the card, a highway past strip malls and an engraving.
  "cbsa:48900": {
    file: "BRIDGE 2024-05-07 Cape Fear Memorial Bridge Press Conf-831-155 (cropped).jpg",
    place: "Downtown Wilmington's riverfront along the Cape Fear River",
    credit: "NCDOTcommunications",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
    name: "Wilmington, NC",
    size: [1753, 1093],
  },
  // Winchester, VA: skyline-sheet run 37237349944 — Old Town's walking mall, its brick and painted fronts with flags and awnings under a blue sky with cloud, the fronts whole in both crops and only the edge building's end wall and a bare tree's crown trimmed at 21:9; over the same mall in summer, whose yellow building's cornice every crop cuts, a church whose spire the deal page's crops cut, and one shop front behind a tree.
  "cbsa:49020": {
    file: "100 block of North Loudoun Street - 2.jpg",
    place: "Old Town Winchester's Loudoun Street Mall, its brick and painted fronts hung with flags",
    credit: "APK",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Winchester, VA",
    size: [2094, 1502],
  },
  // Winston-Salem, NC: skyline-sheet run 36782855933 — the city article's lead, over aerials of an interchange.
  "cbsa:49180": {
    file: "Winston-Salem skyline.jpg",
    place: "The Winston-Salem skyline",
    credit: "Indy beetle",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
    name: "Winston-Salem, NC",
    size: [3660, 2306],
  },
  // Worcester, MA: skyline-sheet run 36781435010 — a one-market run's pick of fifteen; the six-market sheet held storefronts and an overcast panorama.
  "cbsa:49340": {
    file: "Worcester, Massachusetts.jpg",
    place: "Downtown Worcester's towers from above",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Worcester, MA",
    size: [7154, 3974],
  },
  // Yakima, WA: skyline-sheet run 36819025201 — an article's lead: downtown from above under a soft overcast, its brick blocks and tower sharp, trees in blossom, the ridges behind whole with sky above them in both crops; over a farmers' market's apple-cut barrier, the library's corner, and four valley views (Red Mountain, the valley from it, a vineyard, and the river between Cle Elum and Thorp) that nothing in their files or category places in Yakima County.
  "cbsa:49420": {
    file: "Yakima, Washington skyline.jpg",
    place: "Downtown Yakima from above, trees in blossom and the ridges behind",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
    name: "Yakima, WA",
    size: [6818, 4090],
  },
  // York-Hanover, PA: skyline-sheet run 36791223837 — the Hanover article's lead, whole in both crops in warm light; the search's only other result was New York City's skyline.
  "cbsa:49620": {
    file: "Hanover, PA 17331, USA - panoramio (2).jpg",
    place: "Shops on a tree-lined street in Hanover",
    credit: "Idawriter",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
    name: "York-Hanover, PA",
    size: [3968, 2976],
  },
  // Youngstown-Warren, OH: skyline-sheet run 36799416970 — downtown's towers under a blue sky with the city's name in letters on the lawn before them, its full height in every crop, over a tower whose top the card cuts, the university's tower under a grey sky, a snowy lot's parking sign and two plane-window views of the interchanges under cloud.
  "cbsa:49660": {
    file: "Youngstown skyline Wean Park.jpg",
    place: "Downtown Youngstown beyond the Youngstown letters in Wean Park",
    credit: "Dblcut3",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    name: "Youngstown-Warren, OH",
    size: [1936, 733],
  },
};

/**
 * A market's photograph, or null. The id may come straight off a URL (the
 * skyline route, the link preview's card), so only the table's OWN keys
 * answer: an indexed read or `in` also finds what every object inherits,
 * and "constructor", "__proto__" or "toString" read as a photograph with
 * no file — a request to Commons for nothing, or a 500.
 */
export function skylineFor(id: string): SkylineShot | null {
  return Object.hasOwn(SKYLINES, id) ? SKYLINES[id] : null;
}

/** Does this market have a verified photograph yet? */
export function hasSkyline(id: string): boolean {
  return Object.hasOwn(SKYLINES, id);
}

/**
 * The range Commons is ever asked within, so no caller can ask it for a
 * 12000px render of every tile, and the width a request that names none is
 * served at. The widths the route actually serves are `SKYLINE_WIDTHS`
 * (below), each inside this range.
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
  const shot = skylineFor(id);
  if (!shot) return "0";
  let h = 2166136261;
  for (let i = 0; i < shot.file.length; i++) {
    h ^= shot.file.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

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
 * Every width the skyline route serves (the security review of 2026-09-30):
 * the srcset's steps above, the one-file widths a page asks for beside them
 * (CityPhoto's `width`: 480 for a tile, 1400 for a band) and a card's
 * (lib/market-picture: 1600, or 2400 for a wide panorama) — and nothing
 * else. Any other width is snapped to the nearest of these rather than
 * refused, so a page cached before a width changed still gets its picture,
 * and Commons is asked for a market at most once a width per process
 * whatever widths a caller types.
 */
export const SKYLINE_WIDTHS = [480, 960, 1400, 1600, 2400] as const;

/**
 * A requested width as the route serves it: the nearest of
 * `SKYLINE_WIDTHS`, the larger on a tie so a picture is never softer than
 * asked. A MISSING width is the default, not the smallest: `Number(null)`
 * and `Number("")` are both 0, which is finite, and a request with no `?w=`
 * once came back a thumbnail behind a full-width band.
 */
export function skylineWidth(raw: number | string | null | undefined): number {
  const n = typeof raw === "number" ? raw : raw == null || raw.trim() === "" ? Number.NaN : Number(raw);
  if (!Number.isFinite(n)) return SKYLINE_WIDTH.default;
  let best: number = SKYLINE_WIDTHS[0];
  for (const w of SKYLINE_WIDTHS) {
    const d = Math.abs(w - n);
    const bestD = Math.abs(best - n);
    if (d < bestD || (d === bestD && w > best)) best = w;
  }
  return best;
}

/** A market's skyline as an `<img srcset>`: one candidate a width, each
 *  carrying the photograph's cache token. */
export function skylineSrcSet(id: string): string {
  const tag = skylineTag(id);
  return SKYLINE_SRCSET.map((w) => `/api/imagery/skyline/${id}?w=${w}&v=${tag} ${w}w`).join(", ");
}

/**
 * How wide a photograph is drawn to cover a box `height` px tall, from its
 * recorded size: a panorama cut to a squarer box is covered by its HEIGHT,
 * so it is drawn wider than the box (#446). Null where the size is not
 * recorded. The one copy of that arithmetic: a pipeline card's width
 * (lib/market-picture's `marketPhotoWidth`) and a band's `sizes`
 * (`bandSizes`) both read it.
 */
export function coverWidth(shot: Pick<SkylineShot, "size">, height: number): number | null {
  const [w, h] = shot.size ?? [0, 0];
  return w > 0 && h > 0 ? (height * w) / h : null;
}

/** A band's picture box from one window width up: the band's width (its
 *  column's, in px, or the window's) and its height (in px, at the least
 *  the band is drawn, or the window's). */
export interface BandBox {
  /** the window width this box holds from, in px (0 for the base) */
  min: number;
  width: number | "100vw";
  height: number | "100vh";
}

/**
 * `sizes` for a photograph covering a band — #446's card rule for a band.
 * A band's height is set in pixels, not by its width, so a panorama covers
 * it by its height and is drawn wider than the band (`coverWidth`): where a
 * band said only its width ("100vw"), Portland's 3.75:1 panorama on a
 * phone's band was asked for at a phone's width and drawn 1.69× its file,
 * and the sign-in page's Baltimore 3.6×. So each breakpoint says the wider
 * of the band's width and the width that covers its height, with a media
 * condition where the window decides which (`min-width` for a band of set
 * height, `max-aspect-ratio` for one the window's height — the viewer's own
 * rule, lib/photo-srcset). Plain lengths and `calc()` only, which every
 * browser's `sizes` reads. Without a recorded size, the band's width alone,
 * as before.
 */
export function bandSizes(shot: Pick<SkylineShot, "size"> | null, boxes: readonly BandBox[]): string {
  const [w, h] = shot?.size ?? [0, 0];
  const known = w > 0 && h > 0;
  const px = (n: number) => `${Math.ceil(n)}px`;
  const width = (b: BandBox) => (b.width === "100vw" ? "100vw" : px(b.width));
  const sorted = [...boxes].sort((a, b) => b.min - a.min);
  const entries: Array<{ media: string[]; value: string }> = [];
  sorted.forEach((box, i) => {
    const upper = i === 0 ? Infinity : sorted[i - 1].min;
    const from = box.min > 0 ? [`(min-width: ${box.min}px)`] : [];
    if (!known || !shot) {
      entries.push({ media: from, value: width(box) });
      return;
    }
    if (box.height === "100vh") {
      // Covered by the window's height wherever the window is narrower than
      // the photograph's shape (or than the band's own width at that height).
      const k = Math.ceil((w / h) * 1000) / 1000;
      const byHeight = `calc(100vh * ${k})`;
      const narrower = box.width === "100vw" ? `(max-aspect-ratio: ${w}/${h})` : `(min-height: ${Math.ceil((box.width * h) / w)}px)`;
      entries.push({ media: [...from, narrower], value: byHeight });
      entries.push({ media: from, value: width(box) });
      return;
    }
    const cover = coverWidth(shot, box.height)!;
    if (box.width !== "100vw") {
      entries.push({ media: from, value: px(Math.max(box.width, cover)) });
    } else if (cover <= box.min) {
      entries.push({ media: from, value: "100vw" });
    } else if (cover >= upper) {
      entries.push({ media: from, value: px(cover) });
    } else {
      // The window decides: wider than the cover width, the band's width.
      entries.push({ media: [`(min-width: ${Math.ceil(cover)}px)`], value: "100vw" });
      entries.push({ media: from, value: px(cover) });
    }
  });
  // An entry saying what the next one says adds nothing: the next one holds
  // from a smaller width and answers the same.
  const kept = entries.filter((e, i) => {
    const next = entries[i + 1];
    return !(next && next.value === e.value && e.media.length === 1 && next.media.length <= 1);
  });
  return kept.map((e) => (e.media.length ? `${e.media.join(" and ")} ${e.value}` : e.value)).join(", ");
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
  const line = galleryCreditLine(ids);
  return line ? creditText(line) : "";
}

/**
 * What a Creative Commons licence asks a credit to carry (CC BY-SA 4.0
 * §3(a)(1)): the creator, a link to the work "to the extent reasonably
 * practicable", the licence with a link to it, and whether the work was
 * modified — and every surface here but the full-screen viewer crops these
 * photographs to its frame. The credits said the name and the licence's
 * short name as plain text and nothing else (the pre-ship pass of
 * 2026-09-30); `app/photo-credit.tsx` draws these parts with the links, and
 * the plain lines below say the same words, so a caption and its test read
 * one sentence. The parts themselves are lib/credit-parts', which imports
 * nothing, so a client handed a credit as data never loads this table.
 */
export {
  CROPPED_WORDS,
  type CreditLink,
  type CreditPart,
  type GalleryAuthor,
  type GalleryPhoto,
  type PhotoCredit,
} from "./credit-parts";

/** One photograph's credit, in parts. */
export function skylineCredit(shot: SkylineShot): { place: string; author: CreditLink; license: CreditLink } {
  return {
    place: shot.place,
    author: { name: authorOf(shot), url: commonsPage(shot.file) },
    license: { name: shot.license, url: shot.licenseUrl },
  };
}

/** `creditLine`'s words as parts: the place, then the photographer linked
 *  to the file's page and the licence to its text, and that it is cropped. */
export function skylineCreditParts(shot: SkylineShot): CreditPart[] {
  const c = skylineCredit(shot);
  return [`${c.place} · `, ...photographerParts(c.author, c.license, true)];
}

/** The photographs the markets named have, in the order named. */
function shotsOf(ids: readonly string[]): SkylineShot[] {
  return ids.map((id) => skylineFor(id)).filter((s): s is SkylineShot => Boolean(s));
}

/** A grid's credit, in parts, for the markets named (lib/credit-parts
 *  `galleryCreditPartsOf`). Null where no market named has a photograph. */
export function galleryCreditParts(ids: readonly string[]): { authors: GalleryAuthor[]; licenses: CreditLink[] } | null {
  return galleryCreditPartsOf(shotsOf(ids).map(skylineCredit));
}

/** The grid's one line, as parts, for the markets named (lib/credit-parts
 *  `galleryCreditLineOf`). Null where no market named has a photograph. */
export function galleryCreditLine(ids: readonly string[]): CreditPart[] | null {
  return galleryCreditLineOf(shotsOf(ids).map(skylineCredit));
}

function authorOf(shot: SkylineShot): string {
  return shot.credit && shot.credit !== "unknown" ? shot.credit : "Wikimedia Commons";
}

/**
 * The overhead frames' line under a grid of market pictures: public domain
 * and owed nobody, and said anyway, so a reader knows an overhead from a
 * photograph. One string for every grid that shows them.
 */
export const OVERHEAD_GRID_CREDIT =
  "Overhead frames: USGS The National Map (public domain), each centred on that market's business district.";

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
  return creditText(skylineCreditParts(shot));
}

/**
 * The same credit without the place, for a surface that says the place in
 * words of its own — a pipeline card names the market beside the picture
 * and carries the place in its alt text (#438) — so its corner holds the
 * photographer and the licence, which are what the licence obliges.
 */
export function photographerLine(shot: SkylineShot): string {
  const c = skylineCredit(shot);
  return creditText(photographerParts(c.author, c.license, true));
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
