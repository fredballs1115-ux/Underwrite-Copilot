/**
 * The most the app ever asks of the two public-record lookups in the
 * database (research pass 39), in one place: migration 0037 holds
 * nearest_property and nearby_sales to these radii and row counts, and
 * lib/rls-policies.test.ts holds the migration to this file, so no caller of
 * the app sees a change while no other caller can ask for more.
 *
 * Pure, with no imports: the deal page's card and the comps pull both read it.
 */

/** The deal page's public-record card (app/(app)/deals/[id]/public-record-card):
 *  the one parcel nearest the deal's map point, within 120 m. */
export const NEAREST_PARCEL: Readonly<{ radiusM: number; limit: number }> = { radiusM: 120, limit: 1 };

/** The comps pull (lib/public-comps/run): recorded sales within a mile over
 *  two years, widened once to three miles over three when thin, at most 80
 *  a read. */
export const RECORDED_SALES: Readonly<{
  radiusKm: number;
  wideRadiusKm: number;
  monthsBack: number;
  wideMonthsBack: number;
  limit: number;
}> = {
  radiusKm: 1.6,
  wideRadiusKm: 4.8,
  monthsBack: 24,
  wideMonthsBack: 36,
  limit: 80,
};

/** The largest radius, in whole metres, the comps pull asks nearby_sales for
 *  (it rounds each ask to the metre). */
export const RECORDED_SALES_MAX_RADIUS_M = Math.round(RECORDED_SALES.wideRadiusKm * 1000);
