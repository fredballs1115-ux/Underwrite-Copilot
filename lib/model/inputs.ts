// Which document feeds which part of the generated model. Shared by the
// server-side Excel builder (Start Here sheet) and the in-app "add more to the
// model" checklist, so what's shown on screen matches the workbook.

export const MODEL_INPUTS = [
  {
    kind: "om",
    label: "Offering memorandum",
    fills: "Deal name, purchase price, and the headline sale & return assumptions",
  },
  {
    kind: "rent_roll",
    label: "Rent roll",
    fills: "In-place rents, units / SF, and occupancy that drive Year-1 income",
  },
  {
    kind: "t12",
    label: "T-12 / operating statement",
    fills: "Trailing operating expenses behind the NOI on the Cash Flow tab",
  },
  {
    kind: "loan_terms",
    label: "Loan terms",
    fills: "Loan sizing on Deal Summary — rate, loan-to-value, amortization, IO",
  },
  {
    kind: "financials",
    label: "Offering financials",
    fills: "Historical income & expense detail to reconcile against",
  },
] as const;

// No paste-in steps any more — the workbook is generated and fully populated
// from the deal. Kept as an (empty) export so existing imports stay valid.
export const MODEL_PASTES: { label: string; fills: string }[] = [];
