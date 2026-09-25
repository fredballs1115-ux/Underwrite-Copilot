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
  },
  // pittsburgh: chosen by eye from contact sheet 7 (skyline-sheet run
  // 35943054619, 2026-09-24) — the golden-hour view over the Monongahela with PPG Place lit, the picture the city is known by — over a winter overlook framed by a bare tree and two night panoramas too short for the band.
  pittsburgh: {
    file: "Downtown Pittsburgh seen from Mt. Washington.jpg",
    place: "Downtown Pittsburgh at the Point, from Mount Washington",
    credit: "EEJCC",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // denver: chosen by eye from contact sheet 7 (skyline-sheet run
  // 35943054619, 2026-09-24) — the article's own lead, the towers against the snow on the Front Range at 6782px — over a 2048×580 midnight panorama and a stadium aerial.
  denver: {
    file: "Denver, Colorado skyline (cropped 3x5).jpg",
    place: "Downtown Denver against the Front Range",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
  },
  // nashville: chosen by eye from contact sheet 7 (skyline-sheet run
  // 35943054619, 2026-09-24) — the article's lead, downtown over the Cumberland with the river bridges in the frame at 6850px — over three drone aerials of the riverfront.
  nashville: {
    file: "Nashville, Tennessee (cropped).jpg",
    place: "Downtown Nashville over the Cumberland River",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
  },
  // austin: chosen by eye from contact sheet 7 (skyline-sheet run
  // 35943054619, 2026-09-24) — the article's lead, the tower cluster over Lady Bird Lake at 10242px — over the pedestrian-bridge view and a sunset frame from 2011.
  austin: {
    file: "Skyline of Austin, Texas (cropped).jpg",
    place: "Downtown Austin over Lady Bird Lake",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
  },
  // houston: chosen by eye from contact sheet 8 (skyline-sheet run
  // 35943350787, 2026-09-24) — the article's lead, the tower cluster over the bayou's trees at 4320px — over a 3587×1202 strip and street-level frames of the aquarium and the transit centre.
  houston: {
    file: "Downtown Houston, TX Skyline - 2018.jpg",
    place: "Downtown Houston from Buffalo Bayou",
    credit: "David Daniel Turner",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
  },
  // minneapolis: chosen by eye from contact sheet 8 (skyline-sheet run
  // 35943350787, 2026-09-24) — the article's lead, the skyline over the river at 4828px — over St. Anthony Falls at dusk, which is the falls rather than the city, and a 5168×1528 strip.
  minneapolis: {
    file: "Minneapolis Skyline looking south.jpg",
    place: "Downtown Minneapolis over the Mississippi, looking south",
    credit: "BpA9543",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // las_vegas: chosen by eye from contact sheet 8 (skyline-sheet run
  // 35943350787, 2026-09-24) — the Strip lit at night from above at 6144px, the picture the place is known by — over a daytime aerial of downtown and the mountains, which is a city rather than Las Vegas.
  las_vegas: {
    file: "Night aerial view, Las Vegas, Nevada, 04649u.jpg",
    place: "The Las Vegas Strip at night, from the air",
    credit: "Carol M. Highsmith",
    license: "Public domain",
    licenseUrl: "",
  },
  // tampa: chosen by eye from contact sheet 8 (skyline-sheet run
  // 35943350787, 2026-09-24) — the article's lead, the towers across the river under a blue sky at 4810px — over two Gasparilla-festival frames from 2002 and a 1913 photograph.
  tampa: {
    file: "Downtown Tampa, Florida.jpg",
    place: "Downtown Tampa across the Hillsborough River",
    credit: "Clément Bardot",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // raleigh: chosen by eye from contact sheet 9 (skyline-sheet run
  // 35943520435, 2026-09-24) — the article's lead, the tower cluster and the amphitheatre lit low from the west at 4000px — over two panoramio street views, a Fayetteville Street frame and, from the search, a photograph of Kyiv by a Raleigh photographer.
  raleigh: {
    file: "Raleigh Skyline.jpg",
    place: "Downtown Raleigh at golden hour, from the air",
    credit: "Abhiram Juvvadi",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
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
  },
  // san_antonio: chosen by eye from contact sheet 9 (skyline-sheet run
  // 35943520435, 2026-09-24) — the city from its own observation tower at 4032px, the Grand Hyatt in the foreground — over a 2000×735 strip and a campus frame.
  san_antonio: {
    file: "Downtown San Antonio view from The Tower of the Americas.jpg",
    place: "Downtown San Antonio from the Tower of the Americas",
    credit: "Jouaienttoi",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // sacramento: chosen by eye from contact sheet 9 (skyline-sheet run
  // 35943520435, 2026-09-24) — the article's lead, the gold Tower Bridge with the skyline behind at 7967px — over a ballpark frame and two aerials.
  sacramento: {
    file: "Sacramento, CA skyline (cropped).jpg",
    place: "The Tower Bridge and downtown Sacramento over the Sacramento River",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
  },
  // columbus: chosen by eye from contact sheet 9 (skyline-sheet run
  // 35943520435, 2026-09-24) — the article's lead, the LeVeque Tower and the river at 6188px, public domain — over the same view in two other crops and a rooftop frame from the tower.
  columbus: {
    file: "Downtown Columbus View from Main St Bridge - edit1.jpg",
    place: "Downtown Columbus from the Main Street Bridge over the Scioto",
    credit: "Paul Wasneski",
    license: "Public domain",
    licenseUrl: "",
  },  // kansas_city: chosen by eye from contact sheet 10 (skyline-sheet run
  // 35943694349, 2026-09-24), through the market band's own crop — the downtown article's own view, the towers and the Kauffman Center over Union Station's roof, 3264px — over a tight tower crop that loses its tops in the band, and an Army Corps aerial of Kansas City, Kansas.
  kansas_city: {
    file: "View from base of the Liberty Memorial.jpg",
    place: "Downtown Kansas City over Union Station, from the Liberty Memorial",
    credit: "Brit By Birth",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // st_louis: chosen by eye from contact sheet 10 (skyline-sheet run
  // 35943694349, 2026-09-24), through the market band's own crop — the article's lead, the Arch framing the courthouse dome, 3133px — over the Arch Overlook frame (a PNG, never served), a 2007 skyline strip too short for the band at 1139px, and a 1908 postcard.
  st_louis: {
    file: "Runner Fountain and Old Courthouse and Arch (5618845531).jpg",
    place: "The Gateway Arch over the Old Courthouse, St. Louis",
    credit: "Jefferson National Expansion Memorial, NPS from St. Louis, MO, USA",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
  },
  // cincinnati: chosen by eye from contact sheet 10 (skyline-sheet run
  // 35943694349, 2026-09-24), through the market band's own crop — the article's lead at 5568px, the towers, the stadium and the river in one frame — over the Roebling Bridge frame (a tower of the bridge and a sky) and the same photographer's view from Mt. Adams.
  cincinnati: {
    file: "Downtown Cincinnati viewed from Devou Park (cropped).jpg",
    place: "Downtown Cincinnati across the Ohio River from Devou Park, Kentucky",
    credit: "EEJCC",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // jacksonville: chosen by eye from contact sheet 10 (skyline-sheet run
  // 35943694349, 2026-09-24), through the market band's own crop — the article's lead at 7823px — over the Fuller Warren Bridge panorama, which in the band is an overpass, and a stadium aerial.
  jacksonville: {
    file: "Jacksonville skyline.jpg",
    place: "Downtown Jacksonville's Northbank from the air",
    credit: "Quintin Soloviev",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
  },
  // detroit: chosen by eye from contact sheet 10 (skyline-sheet run
  // 35943694349, 2026-09-24), through the market band's own crop — the article's lead at 4773px — over a night frame from 2021 whose Renaissance Center falls out of the phone's crop, a Gordie Howe Bridge aerial and a 1929 panorama (a PNG).
  detroit: {
    file: "Detroit Skyline from Windsor 2025-09-01.jpg",
    place: "Downtown Detroit and the Renaissance Center across the river from Windsor",
    credit: "TheWxResearcher",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
  },
  // portland: chosen by eye from contact sheet 11 (skyline-sheet run
  // 35943831078, 2026-09-24), through the market band's own crop — the view the city is known by, downtown under Mount Hood at 22500px and 3.75:1, the band's own shape — over the article's lead aerial, whose crop loses the mountain, and a night skyline on the Willamette that could be any river town.
  portland: {
    file: "Portland from Pittock Mansion October 2019 panorama 2.jpg",
    place: "Portland and Mount Hood from Pittock Mansion at dusk",
    credit: "King of Hearts",
    license: "CC BY-SA 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0",
  },
  // cleveland: chosen by eye from contact sheet 11 (skyline-sheet run
  // 35943831078, 2026-09-24), through the market band's own crop — the article's lead at 8199px, the Key Tower and the Terminal Tower tall in frame — over a sunrise panorama whose towers vanish under the words and the same view in June 2024, which loses the Key Tower's top.
  cleveland: {
    file: "Cleveland skyline from Lakewood Park, January 2026.jpg",
    place: "The Cleveland skyline across Lake Erie from Lakewood Park",
    credit: "Erik Drost",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
  },
  // phoenix: chosen by eye from its own one-market sheet (skyline-sheet run
  // 35944782635, 2026-09-24), through the market band's own crop — the article's lead, an oblique aerial of the towers with the mountains beyond them — over a street corner and the airport's control tower, which are what the six-market sheet held, a hazy dusk from South Mountain and two night frames the band turns black.
  phoenix: {
    file: "Downtown Phoenix Aerial Looking Northeast (cropped).jpg",
    place: "Downtown Phoenix from the air, looking northeast to the mountains",
    credit: "DPPed",
    license: "CC BY-SA 3.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/3.0",
  },
  // charlotte: chosen by eye from its own one-market sheet (skyline-sheet run
  // 35944863842, 2026-09-24), through the market band's own crop — the Duke Energy Center's violet and the Bank of America crown filling the band — over the article's daytime lead, whose crop loses its tallest tower's top, a monochrome strip too short for the band and a stadium aerial.
  charlotte: {
    file: "Charlotte night skyline 2016.jpg",
    place: "Uptown Charlotte's towers lit at night",
    credit: "Nan Palmero",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
  },
  // san_diego: chosen by eye from its own one-market sheet (skyline-sheet run
  // 35944937703, 2026-09-24), through the market band's own crop — the view the city is known by, from its own tallest-buildings article — over a hazy night panorama, a sunrise panorama whose towers vanish under the words and two daytime frames that lose their tops.
  san_diego: {
    file: "San Diego skyline at dusk from Coronado 2015.jpg",
    place: "Downtown San Diego at dusk, across the bay from Coronado",
    credit: "russellstreet",
    license: "CC BY-SA 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0",
  },
  // orlando: chosen by eye from its own one-market sheet (skyline-sheet run
  // 35944984991, 2026-09-24), through the market band's own crop — Lake Eola, the picture the city is known by, with the fountain and the towers reflected — over a high aerial, a rooftop over a car park and the same lake under a storm sky.
  orlando: {
    file: "High-rises in Orlando from Lake Eola Park (May 2023) - 5 (cropped).JPG",
    place: "Downtown Orlando over Lake Eola and its fountain",
    credit: "Benoît Prieur",
    license: "CC0",
    licenseUrl: "http://creativecommons.org/publicdomain/zero/1.0/deed.en",
  },
  // indianapolis: chosen by eye from its own one-market sheet (skyline-sheet run
  // 35945058692, 2026-09-24), through the market band's own crop — the monument at the city's centre against a sunset — over two midday panoramas where the city is a strip under the words and the stadium and reservoir aerials the six-market sheet held; the credit is the name the runner printed, without the permission link printed after it.
  indianapolis: {
    file: "Downtown Indianapolis panorama, 2015.jpg",
    place: "Downtown Indianapolis and the Soldiers' and Sailors' Monument at sunset",
    credit: "reddit user MikeSanborn",
    license: "CC BY 4.0",
    licenseUrl: "https://creativecommons.org/licenses/by/4.0",
  },
  // riverside: chosen by eye from its own one-market sheet (skyline-sheet run
  // 35945179705, 2026-09-24), through the market band's own crop — a real view of the place from the mountain over the campus — there is no skyline to photograph, and the convention-centre aerial and the San Bernardino station and airport frames were the alternatives.
  riverside: {
    file: "Riverside, California view from Box Springs.jpg",
    place: "Riverside from Box Springs Mountain, over the UC Riverside campus",
    credit: "vlasta2",
    license: "CC BY 2.0",
    licenseUrl: "https://creativecommons.org/licenses/by/2.0",
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
