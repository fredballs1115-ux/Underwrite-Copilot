// Where the subject of a comps read stands, and how it may be said (the comps
// research pass's H2). The deal's recorded-sales pull and the OM comps map
// take the deal's resolved location — lib/deal-location's point, the one its
// pictures are drawn around — and a point placed no finer than a street or
// an area is said as that, never starred as "Subject property": a city's
// centre measured as "0.4 mi from the subject" is a distance from nowhere in
// particular.
//
// Pure, no runtime imports, so the client maps read it.

import type { LocationPrecision } from "@/lib/imagery-plan";

export type { LocationPrecision };

export interface SubjectPoint {
  lat: number;
  lng: number;
  /** how finely the point was placed (lib/geocode): at the house, on its
   *  street, or only at the area the address names */
  precision: LocationPrecision;
}

/** Whether the point is the building itself, and may wear the star. */
export function pointIsSubject(precision: LocationPrecision | null | undefined): boolean {
  return precision === undefined || precision === null || precision === "street";
}

/** What the point on a map is called: the subject where it is the building,
 *  else where the address was placed. An absent precision is a result
 *  stored before it was recorded, said as before. */
export function subjectPinLabel(precision: LocationPrecision | null | undefined, building = "Subject property"): string {
  if (pointIsSubject(precision)) return building;
  return precision === "block"
    ? "The address's street, not the building"
    : "The centre of the area the address names, not the building";
}

/** What a distance is measured from, said after a figure: "from the
 *  subject", "from the address's street", "from the area's centre". */
export function distanceFrom(precision: LocationPrecision | null | undefined, building = "the subject"): string {
  if (pointIsSubject(precision)) return `from ${building}`;
  return precision === "block" ? "from the address's street" : "from the area's centre";
}

/** The sentence a readout carries where the point is not the building, or
 *  "" where it is. */
export function placementNote(precision: LocationPrecision | null | undefined): string {
  if (pointIsSubject(precision)) return "";
  return precision === "block"
    ? "The address was placed on its street, not at the building: distances and the radius are measured from that point."
    : "The address was placed only at the centre of the area it names, not at the building: distances and the radius are measured from that centre, so the nearest sales need not be the building's neighbours.";
}
