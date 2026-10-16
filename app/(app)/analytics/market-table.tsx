import Link from "next/link";
import { fmtUsdCompact, middleRead, middleText, type MarketRow, type MiddleRead } from "@/lib/analytics";
import { metroForName } from "@/lib/market-match";
import { marketPath } from "@/lib/public-pages";
import { OVERHEAD_GRID_CREDIT, galleryCredit, hasSkyline } from "@/lib/skyline";
import { pctText } from "@/lib/plan-facts";
import { GalleryCreditText } from "@/app/photo-credit";
import { CityPhoto } from "@/app/city-photo";

/**
 * The analytics page's "By market" table: the markets grouped as /market's
 * memory groups them (lib/analytics `marketRows`), each row wearing a small
 * picture of its market where the label names one the site has a page for
 * (`metroForName`, the reader /market's cards use — nothing guessed), its
 * name linked to the market's brief, and one credit line under the table
 * naming every photographer shown, as the submarket cards' does.
 *
 * Pure: the page groups the deals and hands the rows in, so the render test
 * draws this on a fixture.
 */
export function MarketTable({ rows, planNote }: { rows: readonly MarketRow[]; planNote: boolean }) {
  const shown = rows.map((r) => ({
    r,
    place: metroForName(r.market),
    cap: middleRead(r.deals.map((d) => d.capPct).filter((v): v is number => v != null)),
    unit: middleRead(r.deals.map((d) => d.perUnit).filter((v): v is number => v != null)),
    go: r.deals.filter((d) => d.verdict === "pass").length,
  }));
  const pictured = [...new Set(shown.flatMap((s) => (s.place ? [s.place.id] : [])))];
  const credit = galleryCredit(pictured);
  const anyOverhead = pictured.some((id) => !hasSkyline(id));
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm" data-qa="by-market">
      <h2 className="text-sm font-semibold tracking-tight">By market</h2>
      <div className="scroll-shadows-x mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wider text-muted">
              <th className="py-2 pr-3 font-medium">Market</th>
              <th className="py-2 pr-3 text-right font-medium">Screens</th>
              <th className="py-2 pr-3 text-right font-medium">Cap</th>
              <th className="py-2 pr-3 text-right font-medium">$/unit</th>
              <th className="py-2 text-right font-medium">Go calls</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ r, place, cap, unit, go }) => (
              <tr key={r.key || "unlabeled"} className="border-b border-line/60">
                <td className="max-w-[18rem] py-2 pr-3">
                  <span className="flex items-center gap-2.5">
                    {place ? (
                      <span className="relative h-9 w-14 shrink-0 overflow-hidden rounded-md bg-faint" data-picture="analytics-market">
                        <CityPhoto
                          metro={place.id}
                          width={480}
                          height={360}
                          showCredit={false}
                          className="h-full w-full object-cover object-[50%_42%]"
                        />
                      </span>
                    ) : (
                      <span aria-hidden className="h-9 w-14 shrink-0 rounded-md border border-dashed border-line" />
                    )}
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{r.market}</span>
                      {place ? (
                        <Link
                          href={marketPath(place.id)}
                          className="block truncate text-[11px] text-brand hover:underline"
                        >
                          {`${place.name} brief`}
                        </Link>
                      ) : null}
                    </span>
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{r.deals.length}</td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  <MiddleCell read={cap} fmt={pctText} />
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">
                  <MiddleCell read={unit} fmt={fmtUsdCompact} />
                </td>
                <td className="py-2 text-right tabular-nums">{go}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-muted">
        Each figure is the market&rsquo;s median from three deals up; a
        market with one or two shows those deals&rsquo; own, marked.
        Deals whose figures didn&rsquo;t parse are counted in Screens
        but not in the figures.
        {planNote && " Plan deals are judged on yield on total cost and sit outside the cap figures."}
      </p>
      {credit || anyOverhead ? (
        <p className="mt-1 text-[11px] leading-relaxed text-muted" data-qa="market-credit">
          {credit ? (
            <>
              <GalleryCreditText ids={pictured} linkClassName="underline decoration-dotted underline-offset-2 hover:text-ink" />{" "}
            </>
          ) : null}
          {anyOverhead ? OVERHEAD_GRID_CREDIT : null}
        </p>
      ) : null}
    </section>
  );
}

/** A market's cap or $/unit cell: its median from three deals, and under
 *  that the deals' own figures, marked with how many there are. */
function MiddleCell({ read, fmt }: { read: MiddleRead; fmt: (n: number) => string }) {
  const text = middleText(read, fmt);
  if (text == null) return <>—</>;
  if (read.kind === "median") return <>{text}</>;
  return (
    <>
      {text}{" "}
      <span className="text-[11px] text-muted">{read.kind === "one" ? "1 deal" : "2 deals"}</span>
    </>
  );
}
