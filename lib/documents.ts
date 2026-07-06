/**
 * The set of source documents a user can attach to a deal for the model
 * generator. Each is tagged with a kind so reconciliation knows what authority
 * to give it (actuals from a rent roll / T-12 beat the OM's pro forma claims).
 */

export const DOC_KINDS = [
  { key: "om", label: "Offering memorandum" },
  { key: "rent_roll", label: "Rent roll" },
  { key: "t12", label: "T-12 / operating statement" },
  { key: "financials", label: "Offering financials" },
  { key: "loan_terms", label: "Loan terms" },
  { key: "other", label: "Other document" },
] as const;

export type DocKind = (typeof DOC_KINDS)[number]["key"];

export const DOC_KIND_LABEL: Record<string, string> = Object.fromEntries(
  DOC_KINDS.map((k) => [k.key, k.label]),
);

export const DOC_KIND_KEYS: Set<string> = new Set(DOC_KINDS.map((k) => k.key));

export interface DealDocument {
  id: string;
  deal_id: string;
  kind: string;
  filename: string;
  storage_path: string;
  content_type: string | null;
  created_at: string;
}
