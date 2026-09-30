import Link from "next/link";
import metrosSeed from "@/data/research/metros.json";
import { METRO_VIEWS } from "@/lib/metro-imagery";
import { MARKET_COUNT, metroFact, researchAsOf } from "./markets-marquee";
import { CityPhoto } from "./city-photo";
import { OVERHEAD_GRID_CREDIT, galleryCredit, hasSkyline } from "@/lib/skyline";

// Server-component module only: it pulls a research seed JSON, which must
// never ride into a client bundle.

/**
 * The covered markets, as real aerial photographs of the actual downtowns.
 *
 * The homepage had no photography at all — 2,300 lines of drawn icons, CSS
 * bands and text. This is the honest fix for a product about real buildings
 * in real places: show the places.
 *
 * Every tile is a real USGS frame of that market's business district (see
 * lib/metro-imagery for why USGS is sharp at this scale and needs no key),
 * carrying the same research fact the marquee shows, with the research
 * file's own date for it (dated research, not a feed), and linking to the
 * same market brief. It is navigation with a picture on it, not decoration.
 *
 * A tile whose image 404s still renders: the name and the fact are the
 * content, the photograph is the context. That is also why the <img> sits
 * behind the text rather than above it.
 */
export function MarketsGallery() {
  const items = (metrosSeed.metros ?? [])
    .map((m, i) => {
      const entry = m as { id: string; name: string; region?: string };
      const fact = metroFact(m, i);
      return {
        id: entry.id,
        name: entry.name,
        fact: fact?.text ?? entry.region ?? "covered market",
        asOf: fact?.asOf ?? null,
        place: METRO_VIEWS[entry.id]?.place ?? null,
      };
    })
    // A market with no coordinates would render an empty frame — leave it to
    // the marquee rather than show a hole.
    .filter((m) => m.place !== null);

  // The one attribution line this grid owes, built from the table itself
  // (lib/skyline) so a market added or a photograph swapped can never leave
  // a photographer's name behind on the page.
  const credit = galleryCredit(items.map((m) => m.id));
  const anyOverhead = items.some((m) => !hasSkyline(m.id));

  if (!items.length) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
      <p className="text-xs font-medium uppercase tracking-wider text-muted">Coverage</p>
      <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        The {MARKET_COUNT} covered markets.
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-muted">
        The skyline behind each set of benchmarks — tap one for its brief.
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((m) => (
          <li key={m.id}>
            <Link
              href={`/market?metro=${m.id}`}
              className="group relative block overflow-hidden rounded-xl border border-line outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              {/* A 4:3 tile filled by a panorama up to 2.5:1 wide is covered by
                  its height, so the width a tile must be drawn at is up to
                  1.9 times the tile's own (#446): a phone's two columns, a
                  tablet's three, a laptop's four inside the 72rem column.
                  Measured in Chromium at seven screens against a 2.5:1 file:
                  no tile is drawn more than 1.09 times its pixels, where the
                  one 480px file had been stretched 1.9 to 2.2 times on every
                  phone and dense laptop. */}
              <CityPhoto
                metro={m.id}
                width={480}
                height={360}
                sizes="(min-width: 1200px) 400px, (min-width: 1024px) calc(37.5vw - 32px), (min-width: 640px) calc(50vw - 36px), calc(94vw - 56px)"
                alt={`${m.name} skyline`}
                showCredit={false}
                className="aspect-[4/3] w-full bg-faint object-cover transition-transform duration-300 group-hover:scale-105"
              />
              {/* The scrim is what keeps the label legible over a photograph
                  whose brightness we do not control. */}
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent" />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
                <p className="text-sm font-semibold leading-tight text-white">
                  {m.name}
                </p>
                <p className="mt-0.5 font-mono text-[11px] leading-snug text-white/80">
                  {m.fact}
                </p>
                {m.asOf && (
                  <p className="mt-0.5 text-[10px] leading-snug text-white/80" data-qa="fact-date">
                    {researchAsOf(m.asOf)}
                  </p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>

      {/* One credit line for the whole grid rather than eighteen captions.
          Each Creative Commons photograph obliges us to name its
          photographer AND its licence; naming them together under the grid
          discharges both and keeps the tiles clean, which is how every
          publication that runs a photo grid handles it. The USGS line stays
          only while some market still shows its overhead frame. */}
      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        {credit ? <>{credit} </> : null}
        {anyOverhead ? OVERHEAD_GRID_CREDIT : null}
      </p>
    </section>
  );
}
