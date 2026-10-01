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

import { CROPPED_WORDS, creditText, photographerParts, type CreditLink, type CreditPart } from "./credit-parts";

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
  },
  atlanta: {
    file: "Atlanta, Georgia Skyline.jpg",
    place: "Atlanta",
    credit: "Shawn M. Kent",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
    size: [1920, 1280],
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
export { CROPPED_WORDS, type CreditLink, type CreditPart } from "./credit-parts";

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

/** One photographer in a grid's credit, with every one of their photographs
 *  the grid shows, each by what it shows and linked to its own page. */
export interface GalleryAuthor {
  name: string;
  photos: CreditLink[];
}

/**
 * A grid's credit, in parts: each photographer once, with every photograph
 * of theirs the grid shows linked to its own file's page — the first cut
 * linked a photographer's name to their first file only, so on the
 * homepage, where Bruce Emmerling took both Richmond's and Norfolk's,
 * Norfolk's photograph was linked nowhere — and each licence once, linked to
 * its text. Null where no market shown has a photograph.
 */
export function galleryCreditParts(ids: readonly string[]): { authors: GalleryAuthor[]; licenses: CreditLink[] } | null {
  const shots = ids.map((id) => skylineFor(id)).filter((s): s is SkylineShot => Boolean(s));
  if (shots.length === 0) return null;
  const authors = new Map<string, GalleryAuthor>();
  for (const s of shots) {
    const name = authorOf(s);
    const author = authors.get(name) ?? { name, photos: [] };
    const url = commonsPage(s.file);
    if (!author.photos.some((p) => p.url === url)) author.photos.push({ name: s.place, url });
    authors.set(name, author);
  }
  const licenses = new Map<string, CreditLink>();
  for (const s of shots) if (!licenses.has(s.license) || (!licenses.get(s.license)!.url && s.licenseUrl)) licenses.set(s.license, { name: s.license, url: s.licenseUrl });
  return {
    authors: [...authors.values()],
    licenses: [...licenses.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)),
  };
}

/**
 * The grid's one line, as parts: a photographer with one photograph shown is
 * their name linked to it; one with several is their name, then each of
 * those photographs by what it shows, linked to its own page — "Bruce
 * Emmerling (Downtown Richmond; Downtown Norfolk from the Elizabeth River)",
 * semicolons because a place can hold a comma. Then each licence, linked to
 * its text, and that the photographs are cropped. Null where no market shown
 * has a photograph. "Photographs", not "Skyline photographs": a market is
 * shown by the photograph it is known by, which may be a memorial, a wheel
 * on the river or a row of houses.
 */
export function galleryCreditLine(ids: readonly string[]): CreditPart[] | null {
  const parts = galleryCreditParts(ids);
  if (!parts) return null;
  const out: CreditPart[] = ["Photographs by "];
  parts.authors.forEach((a, i) => {
    if (i) out.push(", ");
    if (a.photos.length === 1) {
      out.push({ name: a.name, url: a.photos[0].url });
      return;
    }
    out.push(`${a.name} (`);
    a.photos.forEach((p, j) => {
      if (j) out.push("; ");
      out.push(p);
    });
    out.push(")");
  });
  out.push(" — via Wikimedia Commons, ");
  parts.licenses.forEach((l, i) => {
    if (i) out.push(" / ");
    out.push(l);
  });
  out.push(`, ${CROPPED_WORDS}.`);
  return out;
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
