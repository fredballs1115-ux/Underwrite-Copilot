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
//   - what the price buys adds its own: a leasehold's ground lease, a
//     note's loan file;
//   - an item already a task (by its title) is never added twice.
import type { ExtractionResult } from "@/lib/anthropic/types";
import { assetWords, dealClassKey } from "@/lib/asset-words";
import { interestOf } from "@/lib/interest";
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
  const cls = dealClassKey(storedClass, extraction ?? null);
  const land = cls === "land_infill" || assetWords(cls).operating === false;
  const items: string[] = [BASE.title, BASE.zoning];
  if (!land) items.push(BASE.pca);
  items.push(BASE.phase1);
  if (BUSINESS_LEASES.has(cls)) items.push("Tenant estoppels and SNDAs");
  else if (assetWords(cls).residential) items.push("Lease audit: a sample of the leases against the rent roll");
  if (cls === "hospitality_str") items.push("PIP and franchise: the brand's improvement plan and its approval of the sale");
  if (cls === "manufactured_housing") items.push("Utilities: the water, sewer and electric systems, and who owns and bills them");
  const kind = interestOf(extraction ?? null).kind;
  if (kind === "leasehold") items.push("Ground lease: the lease, its amendments and the ground lessor's estoppel");
  if (kind === "note") items.push("Loan file: the note, the mortgage, the guaranties and the payment history");
  if (!land) items.push(BASE.contracts);
  items.push(BASE.insurance, BASE.tax);
  return items.map(normalizeTaskTitle);
}

/** The checklist's items not yet among the deal's tasks, by title. */
export function unaddedChecklist(items: readonly string[], tasks: readonly { title: string }[]): string[] {
  const have = new Set(tasks.map((t) => t.title));
  return items.filter((t) => !have.has(t));
}
