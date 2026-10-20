// Which published figure a rent growth is held to (audit H1, M4, L4,
// 2026-10-20): ONE order, read by the stress test's rent-growth row
// (lib/stress-test) and the model's rent-growth check (lib/model-vs-market),
// so the deal page's card, the report's assumptions block and the workbook's
// Market Read never read "inside the published range" on a figure the stress
// row calls unsupported. One figure decides — the first in the class's order
// that the read carries — and every other figure is shown beside it, never
// held to. Pure; it imports only the class reader.
//
// The order, by the kind of rent the class collects:
//   - rental apartments (and a residential class with no list of its own):
//     Zillow's asking rents over apartments alone, else over all home types
//     (the nearest Zillow reads where its apartment index has no figure for
//     the month), else the rent sitting tenants pay (the CPI's rent of
//     primary residence), which lags the rents new leases sign at;
//   - a rented house (single-family or build-to-rent): Zillow's index across
//     all home types first, houses among them, then the CPI's rent — the
//     apartment index is never this kind of rent;
//   - a student building, a mixed-use building's apartments and a
//     manufactured-housing park: no published index tracks a bed's, a
//     mixed building's or a lot's rent, so the closest figure decides and is
//     named as the closest published one, never as this kind of rent;
//   - a commercial class: the national index of rents its kind of lessor
//     charges (the BLS producer price indexes, lib/live-market-brief
//     `rentIndexFor`), the nation's;
//   - lodging and licensed care read no rent index: they sell nights and
//     care, not leases (`NO_RENT_INDEX`).

import { assetClassKey } from "@/lib/asset-words";

/** The published figures' labels, as lib/model-vs-market writes them. */
export const APARTMENT_RENT_LABEL = "Asking rent, apartments";
export const ALL_HOMES_RENT_LABEL = "Asking rent, all home types";
export const CPI_RENT_LABEL = "Rent paid by sitting tenants (CPI rent)";
const LESSOR_INDEX = /^Rents charged by .+, national \(PPI\)$/;

const LAGS = "it averages every lease in place, so it lags the rents new leases sign at";

type Step = { label: string | RegExp; name: (label: string) => string; why: string };

const apartments = (why: string): Step => ({ label: APARTMENT_RENT_LABEL, name: () => "Zillow's apartment asking rents", why });
const allHomes = (why: string): Step => ({ label: ALL_HOMES_RENT_LABEL, name: () => "Zillow's asking rents across all home types", why });
const cpiRent = (why: string): Step => ({ label: CPI_RENT_LABEL, name: () => "the rent sitting tenants pay (CPI rent)", why });
const lessors: Step = {
  label: LESSOR_INDEX,
  name: (label) => {
    const what = label.replace(/, national \(PPI\)$/, "");
    return `the national index of ${what[0].toLowerCase()}${what.slice(1)}`;
  },
  why: "the figure for this kind of rent, the nation's lessors of this kind of building rather than the metro's",
};

/** "the closest published figure, not a student building's own kind of
 *  rent (beds leased by the academic year)" */
const closest = (whose: string, where = ""): string => `the closest published figure${where}, not ${whose}`;

const ORDERS: Record<"apartments" | "houses" | "student" | "mixed" | "park" | "commercial", readonly Step[]> = {
  apartments: [
    apartments("the figure for this kind of rent"),
    allHomes("the nearest figure for this kind of rent, since Zillow's apartment index has no figure for the month"),
    cpiRent(`the figure for this kind of rent where no Zillow asking rent was read; ${LAGS}`),
  ],
  houses: [
    allHomes("the figure for a rented home, houses among the home types it covers, where the apartment index covers apartments alone"),
    cpiRent(`the figure for a rented home where no Zillow asking rent was read; ${LAGS}`),
  ],
  student: [
    apartments(closest("a student building's own kind of rent, beds leased by the academic year")),
    allHomes(closest("a student building's own kind of rent, beds leased by the academic year", " where Zillow's apartment index has none for the month")),
    cpiRent(`${closest("a student building's own kind of rent", " where no Zillow asking rent was read")}; ${LAGS}`),
  ],
  mixed: [
    apartments(closest("the commercial space's rent", " for the apartments")),
    allHomes(closest("the commercial space's rent", " for the apartments where Zillow's apartment index has none for the month")),
    cpiRent(`${closest("the commercial space's rent", " for the apartments where no Zillow asking rent was read")}; ${LAGS}`),
  ],
  park: [
    allHomes(closest("a park's own kind of rent: its income is lot rents, which no published index tracks")),
    cpiRent(`${closest("a park's own kind of rent: its income is lot rents", " where no Zillow asking rent was read")}; ${LAGS}`),
  ],
  commercial: [lessors],
};

/** Why a class reads no rent index at all, where it does not. */
export const NO_RENT_INDEX = "Lodging and licensed care read no rent index: they sell nights and care, not leases, so no published figure speaks to the rent growth.";

/** Whether the class sells nights or care rather than leases. */
export function readsNoRentIndex(assetClass: string | null | undefined): boolean {
  const k = assetClassKey(assetClass);
  return k === "hospitality_str" || k === "senior_housing";
}

function orderFor(assetClass: string | null | undefined): readonly Step[] {
  switch (assetClassKey(assetClass)) {
    case "sfr_btr":
      return ORDERS.houses;
    case "student_housing":
      return ORDERS.student;
    case "mixed_use":
      return ORDERS.mixed;
    case "manufactured_housing":
      return ORDERS.park;
    default:
      return [...ORDERS.apartments, ...ORDERS.commercial];
  }
}

export interface RentGrowthDecider {
  /** the deciding figure's index in the labels handed in */
  index: number;
  /** "Zillow's apartment asking rents" — how a sentence names it */
  name: string;
  /** "the figure for this kind of rent" — why it decides */
  why: string;
}

/**
 * The figure that decides a rent growth on a deal of this class, among the
 * published figures' labels the read carries (a regulation's allowance is
 * never among them: the caller sets it apart). Null where none of the
 * class's order is present.
 */
export function rentGrowthDecider(assetClass: string | null | undefined, labels: readonly string[]): RentGrowthDecider | null {
  for (const step of orderFor(assetClass)) {
    const index = labels.findIndex((l) => (typeof step.label === "string" ? l === step.label : step.label.test(l)));
    if (index >= 0) return { index, name: step.name(labels[index]), why: step.why };
  }
  return null;
}
