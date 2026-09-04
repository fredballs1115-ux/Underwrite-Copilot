import Link from "next/link";
import metrosSeed from "@/data/research/metros.json";
import { METRO_VIEWS } from "@/lib/metro-imagery";
import { MARKET_COUNT, metroFact } from "./markets-marquee";

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
 * carrying the same live research fact the marquee shows, and linking to the
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
      return {
        id: entry.id,
        name: entry.name,
        fact: metroFact(m, i) ?? entry.region ?? "covered market",
        place: METRO_VIEWS[entry.id]?.place ?? null,
      };
    })
    // A market with no coordinates would render an empty frame — leave it to
    // the marquee rather than show a hole.
    .filter((m) => m.place !== null);

  if (!items.length) return null;

  return (
    <section className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        The {MARKET_COUNT} covered markets, from above
      </h2>
      <p className="mt-2 max-w-2xl text-muted">
        Every screen is anchored to a real place. These are the business
        districts behind the benchmarks — actual aerial photography, not
        illustrations.
      </p>

      <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {items.map((m) => (
          <li key={m.id}>
            <Link
              href={`/market?metro=${m.id}`}
              className="group relative block overflow-hidden rounded-xl border border-line outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- a
                  proxied route that sets its own immutable cache headers;
                  next/image would add a second cache layer over it */}
              <img
                src={`/api/imagery/metro/${m.id}?w=480&h=360`}
                alt={`Aerial view of ${m.place}`}
                width={480}
                height={360}
                loading="lazy"
                decoding="async"
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
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <p className="mt-4 text-[11px] text-muted">
        Aerial imagery: USGS The National Map (public domain). Each tile is
        centred on that market&apos;s business district.
      </p>
    </section>
  );
}
