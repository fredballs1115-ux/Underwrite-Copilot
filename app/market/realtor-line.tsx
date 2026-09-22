import { HOTNESS_METROS, REALTOR_CREDIT, REALTOR_SOURCE_URL, type HotnessRead, type RealtorRead } from "@/lib/realtor";
import { monthOf } from "@/lib/zori";

/**
 * The for-sale market this month — the median list price, the active
 * listings and the days a listing sits, each against a year ago — under
 * the Zillow line, which already says what a typical home costs in years
 * of rent. Together they are the demand side an apartment underwrite is
 * quietly assuming: a loosening for-sale market is one a renter can buy
 * into, a tightening one keeps them renting.
 *
 * Pure: the page reads the rows and hands the figure in, so this renders
 * on a fixture. Nothing renders with no figure, and a figure the pull did
 * not have is simply absent. Realtor.com's condition for using the data is
 * attribution, so the credit is part of the component.
 */
export function RealtorLine({ r }: { r: RealtorRead | null }) {
  if (!r) return null;
  // One string, so React puts no separators inside a sentence live-verify greps.
  const call =
    r.direction === "loosening"
      ? "More homes for sale and longer to sell them than a year ago: the for-sale market is loosening, and a loosening market is one a renter can buy into."
      : r.direction === "tightening"
        ? "Fewer homes for sale and faster to sell them than a year ago: the for-sale market is tightening, which keeps a renter renting."
        : r.direction === "mixed"
          ? "Listings and time to sell moved opposite ways from a year ago, so the for-sale market is not clearly loosening or tightening."
          : "";
  const sentence =
    "The list price is what sellers are asking, not what buyers paid; the listings and the days on market are the flow behind it, and the flow is what says whether a renter can buy into this market." +
    (call ? ` ${call}` : "") +
    (r.shared ? " The figures are the metro area's, shared across the MSA." : "");
  return (
    <div className="text-sm">
      <div>
        <span className="text-[11px] uppercase tracking-wide text-muted">For sale, median list</span>{" "}
        <span className="font-mono font-semibold tabular-nums">${r.medianListPrice.toLocaleString("en-US")}</span>
        <Change pct={r.medianListPriceYoyPct} />
        <span className="ml-2 text-xs text-muted">{monthOf(r.asOf)}</span>
        <a
          href={REALTOR_SOURCE_URL}
          target="_blank"
          rel="noreferrer"
          className="ml-2 text-[11px] text-muted underline decoration-dotted underline-offset-2 hover:text-ink"
        >
          {REALTOR_CREDIT}
        </a>
      </div>
      {(r.activeListings !== null || r.daysOnMarket !== null) && (
        <div className="mt-0.5 flex flex-wrap gap-x-4 text-xs text-muted">
          {r.activeListings !== null && (
            <span>
              <span className="font-mono font-semibold tabular-nums text-ink">{r.activeListings.toLocaleString("en-US")}</span>
              {" active listings"}
              <Change pct={r.activeListingsYoyPct} />
            </span>
          )}
          {r.daysOnMarket !== null && (
            <span>
              <span className="font-mono font-semibold tabular-nums text-ink">{r.daysOnMarket}</span>
              {" days on market"}
              <Change pct={r.daysOnMarketYoyPct} />
            </span>
          )}
        </div>
      )}
      {r.hotness && <HotnessRow h={r.hotness} sameMonth={r.hotness.asOf === r.asOf} />}
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        {sentence}
        {r.hotness ? ` ${HOTNESS_SENTENCE}` : ""}
      </p>
    </div>
  );
}

/** What the rank is, said once, in one string, so live-verify can grep it. */
const HOTNESS_SENTENCE =
  `Hotness ranks the ${HOTNESS_METROS} largest metros by how many buyers look at each listing and how fast homes sell, each against the country; ` +
  "a hot for-sale market is one where buyers compete for homes, and the ones who lose out keep renting.";

/**
 * The rank, its move on the year and its two parts, each phrase one JS
 * string: "Hotness #154 of 300 metros · 12 places cooler than a year ago ·
 * listing views per property 35% under the U.S. · sells 17 days faster
 * than the U.S." A part the pull did not have is simply absent.
 */
function HotnessRow({ h, sameMonth }: { h: HotnessRead; sameMonth: boolean }) {
  const parts: string[] = [];
  if (h.move) {
    parts.push(
      h.move.direction === "unchanged"
        ? "the same rank as a year ago"
        : `${Math.abs(h.move.places)} place${Math.abs(h.move.places) === 1 ? "" : "s"} ${h.move.direction} than a year ago`,
    );
  }
  if (h.viewsVsUs !== null) {
    const pct = Math.round(Math.abs(1 - h.viewsVsUs) * 100);
    parts.push(
      pct === 0
        ? "listing views per property at the U.S. average"
        : `listing views per property ${pct}% ${h.viewsVsUs < 1 ? "under" : "over"} the U.S.`,
    );
  }
  if (h.domVsUsDays !== null) {
    const d = Math.abs(h.domVsUsDays);
    parts.push(
      h.domVsUsDays === 0
        ? "sells as fast as the U.S."
        : `sells ${d} day${d === 1 ? "" : "s"} ${h.domVsUsDays < 0 ? "faster" : "slower"} than the U.S.`,
    );
  }
  const head = `Hotness #${h.rank} of ${HOTNESS_METROS} metros`;
  return (
    <div className="mt-0.5 text-xs text-muted">
      <span className="font-semibold text-ink">{head}</span>
      {parts.length > 0 ? ` · ${parts.join(" · ")}` : ""}
      {!sameMonth ? ` · ${monthOf(h.asOf)}` : ""}
    </div>
  );
}

/** "▲ 2.3% on a year ago", with the direction read aloud; nothing without a figure. */
function Change({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  return (
    <span className="ml-2 text-xs text-muted">
      <span aria-hidden="true">{pct > 0 ? "▲" : pct < 0 ? "▼" : "•"}</span>
      <span className="sr-only">{pct > 0 ? "up " : pct < 0 ? "down " : "unchanged, "}</span>{" "}
      <span className="tabular-nums">{Math.abs(pct).toFixed(1)}%</span> on a year ago
    </span>
  );
}
