// Which document/action feeds which part of the template-driven model. Shared
// by the server-side Excel fill and the in-app "inputs needed" checklist, so
// the requirements shown on screen exactly match the generated workbook.

export const MODEL_INPUTS = [
  {
    kind: "om",
    label: "Offering memorandum",
    fills: "Deal name, price, and the base investment & sale assumptions",
  },
  {
    kind: "rent_roll",
    label: "Rent roll",
    fills:
      "Rent Roll tab — tenants, suites, square footage, in-place rents, occupancy",
  },
  {
    kind: "t12",
    label: "T-12 / operating statement",
    fills: "Trailing operating expenses on the Cash Flow tab",
  },
  {
    kind: "loan_terms",
    label: "Loan terms",
    fills: "LOAN ASSUMPTIONS — rate, loan-to-cost, amortization",
  },
  {
    kind: "financials",
    label: "Offering financials",
    fills: "Historical income & expense detail",
  },
] as const;

export const MODEL_PASTES = [
  {
    label: "ARGUS cash-flow export",
    fills:
      "The monthly projection and the IRR / returns — paste into the ARGUS Paste regions (Cash Flow, MLAs, Lease-Up, Rent Roll, Lease Audit tabs)",
  },
  {
    label: "Capital plan / PCA (optional)",
    fills: "CapEx Detail tab — the capital-budget line items",
  },
];
