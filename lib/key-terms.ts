// The rows a "Key terms" block leads with. A memo's first block and the
// shared screen's grid show a handful of the OM's figures — and the ones a
// reader needs first are the deal-defining ones: what it costs, what it
// yields, how big it is. Flagged rows used to sort first and the block was
// cut at four, so a memo could open on four speculative pro-forma figures
// and never state the asking price. The head is read by the shared readers
// (the same price, cap, count and plan rows every other surface uses), then
// the flagged rows, then the rest.
import type { InterestKind } from "./anthropic/types";
import { findGoingInCap, parsePrice } from "./criteria";
import {
  capitalBudgetFromMetrics,
  findPriceMetric,
  isPlanDeal,
  noiFigures,
  notYetDelivered,
  priceRowIsLand,
  unitCountRow,
  type StrategyKind,
} from "./deal-strategy";
import { forwardTermRows } from "./forward-purchase";
import { COMMERCIAL_INCOME_ROW, RESIDENTIAL_INCOME_ROW, mixedUseTermRows } from "./mixed-use";
import { noteTermRows } from "./note-yield";
import { affordableTermRows } from "./affordable";
import { singleTenantTermRows } from "./single-tenant";
import { hotelTermRows } from "./hotel-deal";
import { saleTermRows } from "./sale-terms";
import { rosterTermRows } from "./tenant-roster";
import { valueAddTermRows } from "./value-add";
import { taxAbatementTermRows } from "./tax-abatement";
import { sellerFinancingTermRows } from "./seller-financing";
import { sellerNoteStatedRows } from "./loan-rows";
import { siteReportTermRows } from "./site-reports";
import { studentTermRows } from "./student-housing";
import { mhTermRows } from "./manufactured-housing";
import { storageTermRows } from "./self-storage";
import { regulationTermRows } from "./rent-regulation";

/** A cap rate on the property's income, whatever its qualifier: "Cap rate
 *  (T-12)", "Stabilized cap rate", "Going-in cap", "Exit cap". Never an
 *  interest rate cap ("Interest rate cap", "Rate cap strike"), which is a
 *  term of a floating-rate loan. */
const COLLATERAL_CAP =
  /\bcap(?:italization)?\s+rates?\b|\b(?:going[- ]?in|entry|exit|terminal|reversion(?:ary)?|in[- ]place|stabili[sz]ed|pro ?forma|implied|trailing|current|market)\s+cap\b/i;

function isCollateralCap(row: { label: string; value: string }): boolean {
  return COLLATERAL_CAP.test(row.label) || findGoingInCap([row]) === row;
}

export interface KeyTermMetric {
  label: string;
  value: string;
  flagged?: boolean;
  page?: string;
  basis?: string;
}

/**
 * `metrics` in the order a key-terms block should show them, cut to `limit`:
 * the price (or a development's land cost) first; then, on a stabilized
 * asset, the going-in cap — or, on a plan deal, the stabilized NOI and the
 * budget or total cost the plan is judged on; then the unit count; then the
 * flagged rows; then everything else in the OM's order. On a note (#416)
 * the loan's own terms follow the price — the balance, the coupon, the
 * maturity, whether it pays — and the collateral's cap is not led with,
 * since it is not the buyer's; financing the seller offers on a note
 * follows them, labelled as the note purchase's. Rows that are not objects
 * (analysis output can carry nulls) are dropped. `screenYear` is the year
 * the screen read the memorandum (lib/criteria `screenYearOf`), which the
 * price row's label is read against, as on every other surface.
 */
export function keyTermRows<M extends KeyTermMetric>(
  metrics: ReadonlyArray<M | null | undefined>,
  kind: StrategyKind,
  screenYear: number,
  limit = 8,
  interest?: InterestKind,
): M[] {
  const rows = metrics.filter((m): m is M => !!m && typeof m === "object");
  const head: M[] = [];
  const lead = (row: { label: string; value: string } | null | undefined) => {
    const hit = row ? rows.find((m) => m === row || (m.label === row.label && m.value === row.value)) : undefined;
    if (hit && !head.includes(hit)) head.push(hit);
  };
  const price = findPriceMetric(rows, kind, screenYear);
  lead(price);
  // An auction has no asking price (#456): its starting bid, the buyer's
  // premium, the reserve and the deadline stand where the price would.
  for (const row of saleTermRows(rows)) lead(row);
  // A forward purchase (lib/forward-purchase): when the price is paid — the
  // delivery, the outside date, the deposit, the cap at delivery and rent
  // commencement — right after the price, on a building not yet delivered
  // (an earnest-money "Deposit" on a standing building is not this).
  if (notYetDelivered(kind)) for (const row of forwardTermRows(rows)) lead(row);
  if (interest === "note") {
    for (const row of noteTermRows(rows)) lead(row);
    // Financing the seller offers on a note is of the note's purchase: it
    // leads beside the note's own terms, so the block's limit never cuts
    // it, and is labelled as that below.
    for (const row of sellerFinancingTermRows(rows)) lead(row);
  } else if (isPlanDeal(kind)) {
    const stabilized = noiFigures(rows).find((f) => f.kind === "stabilized");
    if (stabilized) lead(rows.find((m) => m.label === stabilized.label));
    const priceValue = price ? parsePrice(price.value) : null;
    const budget = capitalBudgetFromMetrics(
      rows,
      priceValue != null && priceValue > 0 ? priceValue : null,
      !priceRowIsLand(price),
    );
    if (budget) lead(rows.find((m) => m.label === budget.label));
  } else {
    lead(findGoingInCap(rows));
  }
  lead(unitCountRow(rows));
  // A covenant or a contract that sets the rents (#453): how many units it
  // binds and until when, right after the count it is a share of.
  for (const row of affordableTermRows(rows)) lead(row);
  // The rent rules (lib/rent-regulation): the regime as the memorandum
  // names it, the units under it, and the legal and preferential rents —
  // after the count the regulated units are a share of.
  for (const row of regulationTermRows(rows)) lead(row);
  // The one lease a single-tenant property is (#454): when it ends, how its
  // rent grows and the tenant's options — what the price is paid for.
  for (const row of singleTenantTermRows(rows)) lead(row);
  // A multi-tenant property's quoted WALT (#457), which the deal page reads
  // against the listed tenants' own term.
  for (const row of rosterTermRows(rows)) lead(row);
  // A renovation program's unit economics (#460): the doors, the cost of a
  // door, the premium and the premium already achieved.
  for (const row of valueAddTermRows(rows)) lead(row);
  // A tax abatement (#461): the program, when it ends and the full bill.
  for (const row of taxAbatementTermRows(rows)) lead(row);
  // A note the seller offers to carry (#462): its size, rate and term.
  for (const row of sellerFinancingTermRows(rows)) lead(row);
  // What a hotel is sold with (#455): the PIP, the flag's end, RevPAR.
  for (const row of hotelTermRows(rows)) lead(row);
  // What the third-party reports found (#465): the Phase I's finding and
  // date, the immediate repairs, the seismic PML and the zoning.
  for (const row of siteReportTermRows(rows)) lead(row);
  // A student building (#468): the pre-leasing and last year's, the walk to
  // campus and the rent per bed.
  for (const row of studentTermRows(rows)) lead(row);
  // A manufactured-housing park (#470): the lot rent and the market's, the
  // park-owned homes, the water and sewer and the age restriction.
  for (const row of mhTermRows(rows)) lead(row);
  // A self-storage facility (#471): the economic occupancy, the street rate
  // and the in-place rent.
  for (const row of storageTermRows(rows)) lead(row);
  // A mixed-use building (lib/mixed-use): the residential and commercial
  // incomes, the commercial space and its occupancy — only where an income
  // half is stated, so a shopping center's "Retail SF" never leads as one.
  const mixedUse = mixedUseTermRows(rows);
  if (mixedUse.some((m) => RESIDENTIAL_INCOME_ROW.test(m.label) || COMMERCIAL_INCOME_ROW.test(m.label)))
    for (const row of mixedUse) lead(row);
  // On a note no cap on the collateral's income is printed at all — the
  // going-in, the in-place, the stabilized, the exit: among the rows a
  // reader would take any of them for a cap on the note's price, which none
  // is. An interest rate cap is a term of the loan and stays.
  const rest = rows.filter((m) => !head.includes(m) && !(interest === "note" && isCollateralCap(m)));
  const out = [...head, ...rest.filter((m) => m.flagged), ...rest.filter((m) => !m.flagged)].slice(0, limit);
  if (interest !== "note") return out;
  // On a note every row of the seller's financing is the note purchase's,
  // and says so — never the property's financing, and not run against the
  // model (research pass 23 found it listed with nothing to say whose).
  const purchase = new Set<unknown>(sellerNoteStatedRows(rows).map((e) => e.row));
  return out.map((m) => (purchase.has(m) ? { ...m, label: `${m.label} (for the note purchase; not run against the model)` } : m));
}
