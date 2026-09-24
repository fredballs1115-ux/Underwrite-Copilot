import Link from "next/link";
import { PlaceBackdrop } from "@/app/place-band";
import type { DataMetro } from "@/lib/market-match";
import type { LiveRate } from "@/lib/live-rates";
import type { ZoriRead } from "@/lib/zori";
import type { RealtorRead } from "@/lib/realtor";
import { MetroLive } from "./metro-live";
import { ZoriLine } from "./zori-line";
import { RealtorLine } from "./realtor-line";

/**
 * The market page for a metro area the site reads without a brief (#404):
 * the place, one sentence saying what the page is and is not, and then
 * exactly what the site holds for it — Zillow's asking rents, Realtor.com's
 * for-sale market, and the metro's own FRED, BLS and Census figures with
 * the demand and supply pictures — drawn by the same components a briefed
 * market's page draws them with. Nothing else: no research note, no sector
 * snapshot, no fair market rent row, no comps line, no rules, because none
 * of those is on file, and a page that hinted at them would be the site
 * being wrong about a market.
 *
 * Pure: the page reads the rows and hands them in, and the render test
 * draws it on a fixture.
 */
export function ReadOnlyMetroView({
  metro,
  rates,
  zori,
  realtor,
}: {
  metro: DataMetro;
  /** `liveMetroRates(metro.id)` */
  rates: readonly LiveRate[];
  /** `liveZori(metro.name)` */
  zori: ZoriRead | null;
  /** `liveRealtor(metro.name)` */
  realtor: RealtorRead | null;
}) {
  return (
    <div className="mt-4 space-y-4" data-qa="read-only-metro">
      <div className="band-dark relative flex min-h-[13rem] items-end overflow-hidden rounded-2xl text-white sm:min-h-[16rem]">
        <PlaceBackdrop metro={metro.id} height={480} />
        <div className="on-photo band-words relative w-full px-5 pb-6 pt-10 sm:px-6 sm:pb-7 sm:pt-12">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-accent">Read without a brief</p>
          <h3 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{metro.name}</h3>
        </div>
      </div>
      {/* One string, so React puts no separators inside a sentence live-verify greps. */}
      <p className="text-sm leading-relaxed text-muted">
        {`A market the site reads but does not brief: the published figures below — the metro area's own, from FRED, the BLS, the Census Bureau, Zillow Research and Realtor.com, pulled on their own cadences — are all it holds for it. No research note, no sector tracker, no fair market rent, no comps pull and no metro rules on file; a deal here is screened on these figures and its state's rules, and every sentence on it says so.`}
      </p>
      <ZoriLine z={zori} fmr2br={null} />
      <RealtorLine r={realtor} />
      <MetroLive rates={rates} metroId={metro.id} metroName={metro.name} />
      <p className="text-[11px] leading-relaxed text-muted">
        {"The briefed markets carry a research note, a sector tracker, comps and rules beside the same figures. "}
        <Link href="/market" prefetch={false} className="underline decoration-dotted underline-offset-2 hover:text-brand">
          See the briefed markets
        </Link>
      </p>
    </div>
  );
}
