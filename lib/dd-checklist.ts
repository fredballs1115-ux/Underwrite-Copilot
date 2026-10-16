// The due-diligence checklist (research pass 24, B16): under contract, a
// team rebuilds the same list every time. This is that list for the deal's
// class and what its price buys, added as the deal's tasks in one click.
// Pure: the deal's stored class and its extraction come in; the action and
// the tasks card read the same list, so the button shows exactly when a
// click would add something.
//
// Its rules:
//   - the items are the work, named plainly — never a figure, a date or a
//     vendor; a task's due date is the team's to set (the critical dates a
//     contract sets are not stored yet, research pass 24 B7), so the items
//     arrive undated, never on a day nobody chose;
//   - the class decides the tenancy item: tenant estoppels and SNDAs where
//     the building leases to businesses, a lease audit where it leases
//     homes, the PIP and the franchise on a hotel, the utilities on a park;
//     land has no building to inspect or contracts to assume;
//   - what the price buys decides whose diligence it is (audit C8, M3): a
//     fee simple, a leasehold or a tenancy in common takes title to the
//     property, so the property's list stands (a leasehold adds its ground
//     lease, a tenancy in common its co-owners' agreement); a note buys a
//     loan — no title, no contracts to assume and no reassessment at our
//     price — so its list is the collateral's and the loan file's; a leased
//     fee buys the land under someone else's building, so its list is the
//     ground lease's and the leaseholder's, never the building's PCA or
//     contracts; a share of an entity, a Delaware statutory trust, a share
//     of the general partner's interest and a preferred equity position buy
//     into the owner, so their lists are the entity's documents, its loan,
//     its waterfall and the sponsor's reporting, and the property's own
//     reports are the sponsor's to hand over;
import type { ExtractionResult } from "@/lib/anthropic/types";
import { assetWords, dealClassKey } from "@/lib/asset-words";
import { interestOf, isDst, isGpStake, isTenancyInCommon } from "@/lib/interest";
import { normalizeTaskTitle } from "@/lib/deal-tasks";

const BASE = {
  title: "Title commitment and survey",
  zoning: "Zoning report",
  pca: "Property condition assessment (PCA)",
  phase1: "Phase I environmental site assessment",
  contracts: "Service contracts: review each and decide which to assume",
  insurance: "Insurance quote on our own program",
  tax: "Property tax reassessment estimate at our price",
} as const;

/** Classes whose tenants are businesses on leases a lender reads. */
const BUSINESS_LEASES = new Set(["office", "industrial", "retail", "net_lease", "medical_office", "mixed_use", "data_center"]);

/** The checklist for the deal, in the order the work usually runs. */
export function ddChecklist(storedClass: string | null | undefined, extraction: ExtractionResult | null | undefined): string[] {
  const ex = extraction ?? null;
  const cls = dealClassKey(storedClass, ex);
  const land = cls === "land_infill" || assetWords(cls).operating === false;
  const kind = interestOf(ex).kind;
  if (kind === "note") return noteChecklist(land);
  if (kind === "leased_fee") return leasedFeeChecklist();
  if (kind === "preferred_equity") return positionChecklist();
  if (kind === "partial_interest" && !isTenancyInCommon(ex)) return shareChecklist(ex);

  const items: string[] = [BASE.title, BASE.zoning];
  if (!land) items.push(BASE.pca);
  items.push(BASE.phase1);
  if (BUSINESS_LEASES.has(cls)) items.push("Tenant estoppels and SNDAs");
  else if (assetWords(cls).residential) items.push("Lease audit: a sample of the leases against the rent roll");
  if (cls === "hospitality_str") items.push("PIP and franchise: the brand's improvement plan and its approval of the sale");
  if (cls === "manufactured_housing") items.push("Utilities: the water, sewer and electric systems, and who owns and bills them");
  if (kind === "leasehold") items.push("Ground lease: the lease, its amendments and the ground lessor's estoppel");
  if (kind === "partial_interest") {
    // A tenancy in common: title to the property beside its co-owners.
    items.push("Tenancy-in-common agreement: decisions, transfers, partition and the manager");
    items.push("The property's loan: its documents and the lender's consent to our interest");
  }
  if (!land) items.push(BASE.contracts);
  items.push(BASE.insurance, BASE.tax);
  return items.map(normalizeTaskTitle);
}

/** A note: the loan is what is bought, the property its collateral. */
function noteChecklist(land: boolean): string[] {
  return [
    "Loan file: the note, the mortgage, the guaranties and the payment history",
    "Servicing history: payments, defaults, modifications and forbearance",
    "Title and lien search on the collateral: the mortgage's priority",
    ...(land ? [] : ["Collateral's property condition assessment (PCA)"]),
    "Phase I environmental site assessment on the collateral",
    "Collateral's documents: the borrower's rent roll, operating statements and insurance",
  ].map(normalizeTaskTitle);
}

/** A leased fee: the land and its ground lease; the building is the
 *  leaseholder's. */
function leasedFeeChecklist(): string[] {
  return [
    BASE.title,
    BASE.zoning,
    BASE.phase1,
    "Ground lease: the lease, its amendments and its rent schedule",
    "Leaseholder's estoppel: the rent, the term and no default",
    "Subordination: whether the fee stands behind the leaseholder's mortgage",
    "Leaseholder's financials: the building's operating statements and its cover of the ground rent",
    "Taxes and insurance: confirm the ground lease puts them on the leaseholder",
  ].map(normalizeTaskTitle);
}

/** A share of the owning entity, a trust's beneficial interests or a share
 *  of the general partner's: what is bought is the entity's paper. */
function shareChecklist(ex: ExtractionResult | null): string[] {
  const agreement = isDst(ex)
    ? "Trust agreement: the trustee's powers, transfers and how the trust ends"
    : isGpStake(ex)
      ? "General partner's agreement: our share of the promote, the fees and the decisions"
      : "Operating agreement: governance, major decisions, transfers and exit rights";
  return [
    agreement,
    "The waterfall: distributions, the promote and capital calls",
    "The entity's loan: its documents and the lender's consent to the transfer",
    "The sponsor's reporting: the latest financials, rent roll and budget",
    "Entity diligence: formation documents, good standing, liens and litigation",
    "The property's reports: the sponsor's title policy, PCA and Phase I",
  ].map(normalizeTaskTitle);
}

/** A preferred equity position: capital behind the mortgage, so its terms,
 *  the senior loan ahead of it and the sponsor's reporting. */
function positionChecklist(): string[] {
  return [
    "Operating agreement: the preferred return, redemption, remedies and change of control",
    "The senior loan: its documents, maturity and the lender's consent to the position",
    "The waterfall: where the position sits ahead of the common equity",
    "The sponsor's reporting: the latest financials, rent roll and budget",
    "Entity diligence: formation documents, good standing, liens and litigation",
    "The property's reports: the sponsor's title policy, PCA and Phase I",
  ].map(normalizeTaskTitle);
}

/** The checklist's items not yet among the deal's tasks, by title. */
export function unaddedChecklist(items: readonly string[], tasks: readonly { title: string }[]): string[] {
  const have = new Set(tasks.map((t) => t.title));
  return items.filter((t) => !have.has(t));
}
