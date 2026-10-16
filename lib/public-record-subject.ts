// The point the deal page's public-record card asks the assessor table
// about (nearest_property, within 120 m). Pure, no runtime imports.
//
// The nearest parcel is the building's only where the point was placed at
// the building: a street address the geocoder put at the house. A street's
// centreline, a block or an area's centre (a neighbourhood placement) has
// somebody else's parcel nearest it, and the card would print a real owner's
// name as this deal's record. And never on the sample deal: its building is
// fictional, placed only at its neighbourhood's centre in a market whose
// parcels are loaded, so any parcel found would be a real neighbour's.

export interface PointWithPrecision {
  lat: number;
  lng: number;
  /** how finely it was placed (lib/imagery-plan's LocationPrecision); an
   *  absent precision is a result stored before it was recorded, and is
   *  not taken for the building's */
  precision?: "street" | "block" | "area" | null;
}

export interface PublicRecordSubjectInput {
  /** deals.is_sample */
  isSample: boolean;
  /** the deal's own cached point, where lib/deal-location `pointIsBuilding`
   *  says it is the building's; null otherwise */
  buildingPoint: { lat: number; lng: number } | null;
  /** the recorded-sales pull's subject (lib/public-comps), with its
   *  precision */
  compsSubject?: PointWithPrecision | null;
  /** the site-flags lookup's point, and whether it was the building's
   *  (SiteFlagsResult.pointIsBuilding) */
  siteFlagsSubject?: { lat: number; lng: number } | null;
  siteFlagsPointIsBuilding?: boolean | null;
}

/** The point to look a parcel up at, or null to look none up. */
export function publicRecordSubject(input: PublicRecordSubjectInput): { lat: number; lng: number } | null {
  if (input.isSample) return null;
  const at = (p: { lat: number; lng: number }) => ({ lat: p.lat, lng: p.lng });
  if (input.buildingPoint) return at(input.buildingPoint);
  if (input.compsSubject && input.compsSubject.precision === "street") return at(input.compsSubject);
  if (input.siteFlagsSubject && input.siteFlagsPointIsBuilding === true) return at(input.siteFlagsSubject);
  return null;
}

/** The one line the card shows in its place on the sample deal. */
export const SAMPLE_PUBLIC_RECORD_LINE =
  "The sample's building is fictional, so no parcel or owner is looked up for it.";
