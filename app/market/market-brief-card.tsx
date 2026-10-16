import Link from "next/link";
import { marketPath } from "@/lib/public-pages";
import { CityPhoto } from "@/app/city-photo";

/**
 * "Covered market": a deal's or an address's market as a small card — its
 * photograph (the skyline it is known by, its overhead where it has none),
 * its name, and the way to its brief — where a text chip had stood beside a
 * picture the site already held (the deal's research panel, the comps page).
 *
 * The photograph's credit is the one `CityPhoto` draws, so it follows the
 * picture that actually rendered (a skyline that fails hands its place and
 * its credit to the overhead), in a row of its own under the card: the
 * licence's links are never inside the card's link. The link's own box
 * covers the card, picture included, and the credit row sits above it.
 *
 * Pure (a server component that looks the picture up and hands the client
 * half its data), so the research panel's render test draws it.
 */
export function MarketBriefCard({
  metro,
  className = "mt-2",
}: {
  /** the covered market (lib/market-match `metroForAddress`) */
  metro: { id: string; name: string };
  className?: string;
}) {
  return (
    <div
      data-picture="covered-market"
      className={`relative grid max-w-md grid-cols-[6.5rem_minmax(0,1fr)] overflow-hidden rounded-lg border border-brand/30 bg-brand/5 transition-colors hover:bg-brand/10 ${className}`}
    >
      <CityPhoto
        metro={metro.id}
        width={480}
        height={288}
        // A 104 × 80 frame covered by a panorama's height draws it about
        // 200 CSS px wide.
        sizes="240px"
        describe
        showCredit
        layer="relative col-start-1 row-start-1 h-20 bg-faint"
        creditLayer="relative z-10 col-span-2 row-start-2 border-t border-brand/15 bg-surface/70"
        creditClassName="pointer-events-auto px-2.5 py-1 text-[10px] leading-snug text-muted"
        creditLinkClassName="underline decoration-dotted underline-offset-2 hover:text-ink"
        className="h-full w-full object-cover object-[50%_42%]"
      >
        <Link
          href={marketPath(metro.id)}
          className="col-start-2 row-start-1 flex min-w-0 flex-col justify-center gap-0.5 px-3 py-2 outline-none after:absolute after:inset-0 after:rounded-lg after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-brand/40"
        >
          {/* The punctuation between the lines is for a screen reader, which
              reads the card as one sentence: a flex column draws none of it. */}
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted">
            Covered market<span className="sr-only">:</span>
          </span>{" "}
          <span className="truncate text-sm font-semibold text-ink">{metro.name}</span>
          <span className="sr-only">{" — "}</span>{" "}
          <span className="text-[11px] font-medium text-brand">Open the market brief →</span>
        </Link>
      </CityPhoto>
    </div>
  );
}
