import { datedLong } from "@/lib/debt-index";
import type { ExampleListing } from "@/lib/example-listings";
import { researchAge, staleMark } from "@/lib/research-age";

/**
 * The example properties a market brief shows from the research
 * (lib/example-listings `examplesFor`): each listing with the day the
 * research saw it listed and the source the file names, as the file states
 * them, and only on the market it is in — and, past the research rule's
 * limit on `today` (lib/research-age), that day's age and the stale mark: a
 * listing seen half a year ago may long since have sold. Pure, so it renders
 * in lib/views.render.test.ts.
 */
export function ExampleListings({ examples, today }: { examples: readonly ExampleListing[]; today: string }) {
  if (examples.length === 0) return null;
  return (
    <div>
      <h3 className="text-[11px] uppercase tracking-wide text-muted">Example properties from the research</h3>
      <ul className="mt-2 space-y-1.5">
        {examples.map((e) => {
          const stale = staleMark(researchAge(e.asOf, today));
          return (
            <li key={e.address} className="text-sm" data-listing>
              <span className="font-medium">{e.address}</span>
              {e.price !== null && (
                <>
                  {" "}
                  <span className="ml-1 font-mono tabular-nums">{`$${e.price.toLocaleString("en-US")}`}</span>
                </>
              )}{" "}
              <span className="ml-1 text-xs text-muted">{`${e.metric}${e.note ? ` — ${e.note}` : ""}`}</span>
              <span className="block text-[11px] text-muted" data-qa="listing-provenance">
                {e.asOf ? `listed as of ${datedLong(e.asOf)}` : "listing date not recorded"}
                {stale && (
                  <span className="text-caution" data-qa="research-stale">
                    {` (${stale})`}
                  </span>
                )}
                {` · source: ${e.source || "not recorded"}`}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
