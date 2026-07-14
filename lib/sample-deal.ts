// A fully-populated demo deal so a new user can explore the whole product
// without an OM in hand. Pure data + deterministic math — no AI calls, no file.
// Seeded into the user's pipeline by the "Try a sample deal" action.

import { computeModel, type ModelInputs } from "@/lib/model/compute";
import type {
  ExtractionResult,
  ChallengerResult,
  BrokerCompsResult,
  ReconciliationResult,
  MarketResult,
  VerdictResult,
} from "@/lib/anthropic/types";
import type { UnderwritingModel, ReconciledMetric } from "@/lib/model/types";
import type {
  RentRollExtraction,
  RentRollSummary,
  T12Extraction,
  T12Summary,
} from "@/lib/actuals/types";
import type { BuyBox } from "@/lib/criteria";

/** The hypothetical mandate the PUBLIC sample screen judges the deal
 *  against — chosen so the fit lands WATCH beside the Caution verdict (a
 *  consistent story: in scope, but short of the return floors). Logged-in
 *  users see their OWN box here instead. */
export const SAMPLE_DEMO_BOX: BuyBox = {
  assetClasses: ["multifamily"],
  minCapPct: 5.75,
  minIrrPct: 13,
  minCoCPct: 5,
};

export const SAMPLE_DEAL_NAME = "Sample — The Maddox at Highland Park";

const inputs: ModelInputs = {
  units: 248,
  purchasePrice: 68000000,
  closingCostPct: 2,
  loanFeePct: 1,
  year1Gpr: 7150000,
  vacancyPct: 9,
  otherIncomeAnnual: 300000,
  year1Opex: 3100000,
  capexReserveAnnual: 74400,
  rentGrowthPct: 3,
  expenseGrowthPct: 3,
  otherIncomeGrowthPct: 3,
  exitCapPct: 5.5,
  sellingCostPct: 2,
  holdYears: 5,
  loan: { ltvPct: 60, ratePct: 6.0, amortYears: 30, ioYears: 1 },
};

const { cashFlow, returns } = computeModel(inputs);

const modelMetrics: ReconciledMetric[] = [
  {
    key: "price",
    label: "Purchase price",
    chosenValue: "$68,000,000",
    unit: "$",
    sources: [{ doc: "OM", value: "$68,000,000", locator: "p.3", basis: "ask" }],
    authority: "OM",
    rationale: "Stated asking price.",
    confidence: "high",
    isConflict: false,
  },
  {
    key: "year1Noi",
    label: "Year-1 NOI",
    chosenValue: "$3,706,500",
    unit: "$",
    sources: [
      { doc: "OM", value: "$3,880,000", locator: "p.8", basis: "pro forma" },
      { doc: "T-12", value: "$3,706,500", locator: "trailing", basis: "actual" },
    ],
    authority: "T-12",
    rationale: "Actuals beat the pro forma; the OM understates the expense load.",
    confidence: "medium",
    isConflict: true,
  },
  {
    key: "vacancy",
    label: "Vacancy",
    chosenValue: "9.0%",
    unit: "%",
    sources: [
      { doc: "OM", value: "6.0%", locator: "p.8", basis: "pro forma" },
      { doc: "Rent roll", value: "9.1%", locator: "sheet", basis: "actual" },
    ],
    authority: "Rent roll",
    rationale: "In-place vacancy runs higher than the stabilized pro forma.",
    confidence: "high",
    isConflict: true,
  },
  {
    key: "exitCap",
    label: "Exit cap",
    chosenValue: "5.50%",
    unit: "%",
    sources: [{ doc: "Market", value: "5.5%", locator: "", basis: "market norm" }],
    authority: "Market",
    rationale: "Held flat to going-in — no compression thesis.",
    confidence: "medium",
    isConflict: false,
  },
  {
    key: "ltv",
    label: "Loan-to-value",
    chosenValue: "60%",
    unit: "%",
    sources: [{ doc: "Loan terms", value: "60%", locator: "term sheet", basis: "term sheet" }],
    authority: "Loan terms",
    rationale: "Per the quoted term sheet.",
    confidence: "high",
    isConflict: false,
  },
  {
    key: "units",
    label: "Units",
    chosenValue: "248",
    unit: "",
    sources: [
      { doc: "Rent roll", value: "248", locator: "sheet", basis: "actual" },
      { doc: "OM", value: "248", locator: "p.3", basis: "stated" },
    ],
    authority: "Rent roll",
    rationale: "Rent roll and OM agree.",
    confidence: "high",
    isConflict: false,
  },
  {
    key: "avgRent",
    label: "Avg monthly rent",
    chosenValue: "$2,400/unit",
    unit: "$",
    sources: [
      { doc: "OM", value: "$2,600/unit", locator: "p.12", basis: "pro forma" },
      { doc: "Rent roll", value: "$2,400/unit", locator: "sheet", basis: "actual" },
    ],
    authority: "Rent roll",
    rationale:
      "In-place rents, not the OM's post-renovation target — the $200 gap IS the business plan, not the starting point.",
    confidence: "high",
    isConflict: true,
  },
  {
    key: "rentGrowth",
    label: "Rent growth",
    chosenValue: "3.0%/yr",
    unit: "%",
    sources: [
      { doc: "OM", value: "4.0%/yr", locator: "p.40", basis: "pro forma" },
      { doc: "Market", value: "3.0%/yr", locator: "", basis: "market norm" },
    ],
    authority: "Market",
    rationale:
      "The submarket has averaged ~3% over the long run; 4% assumes the top of the band every year.",
    confidence: "medium",
    isConflict: true,
  },
  {
    key: "expenseGrowth",
    label: "Expense growth",
    chosenValue: "3.0%/yr",
    unit: "%",
    sources: [{ doc: "Market", value: "3.0%/yr", locator: "", basis: "market norm" }],
    authority: "Market",
    rationale: "Held at inflation — taxes and insurance argue against less.",
    confidence: "medium",
    isConflict: false,
  },
  {
    key: "otherIncome",
    label: "Other income",
    chosenValue: "$300,000/yr",
    unit: "$",
    sources: [{ doc: "T-12", value: "$300,000", locator: "trailing", basis: "actual" }],
    authority: "T-12",
    rationale: "Parking, fees, and laundry as actually collected.",
    confidence: "high",
    isConflict: false,
  },
  {
    key: "capexReserve",
    label: "Capital reserve",
    chosenValue: "$300/unit/yr",
    unit: "$",
    sources: [
      { doc: "OM", value: "$250/unit/yr", locator: "p.9", basis: "pro forma" },
      { doc: "Market", value: "$300/unit/yr", locator: "", basis: "lender norm" },
    ],
    authority: "Market",
    rationale:
      "1990s vintage with original roofs and chillers — $250 underfunds what a lender will escrow anyway.",
    confidence: "medium",
    isConflict: true,
  },
  {
    key: "rate",
    label: "Interest rate",
    chosenValue: "6.00%",
    unit: "%",
    sources: [{ doc: "Loan terms", value: "6.00%", locator: "term sheet", basis: "term sheet" }],
    authority: "Loan terms",
    rationale: "Quoted fixed rate, 30-yr amortization after one IO year.",
    confidence: "high",
    isConflict: false,
  },
  {
    key: "sellingCost",
    label: "Selling costs at exit",
    chosenValue: "2.0%",
    unit: "%",
    sources: [{ doc: "Market", value: "2.0%", locator: "", basis: "market norm" }],
    authority: "Market",
    rationale: "Broker and transfer costs on disposition.",
    confidence: "medium",
    isConflict: false,
  },
];

const model: UnderwritingModel = {
  generatedFrom: [
    "Offering memorandum: Maddox-OM.pdf",
    "Rent roll: Maddox-RentRoll.xlsx",
    "T-12: Maddox-T12.pdf",
  ],
  holdYears: inputs.holdYears,
  metrics: modelMetrics,
  conflicts: modelMetrics.filter((m) => m.isConflict),
  inputs,
  cashFlow,
  returns,
  summary:
    "Reconciled across the OM, rent roll, and T-12. Actuals set the in-place income and expense load, rent growth is haircut to the market norm, the capital reserve is funded at the lender's $300/unit, and the exit holds flat to going-in with no compression assumed.",
  caveats: [
    "Single-tranche debt and straight-line growth — a screening model, not a full build.",
    "Capital reserve is a flat annual figure; confirm against a real engineering budget.",
  ],
};

const extraction: ExtractionResult = {
  dealName: SAMPLE_DEAL_NAME,
  assetClass: "multifamily",
  market: "North Dallas, TX",
  metrics: [
    { label: "Asking price", value: "$68,000,000", flagged: false, page: "p. 3" },
    { label: "Going-in cap", value: "5.45%", flagged: false, page: "p. 8" },
    { label: "Pro forma cap", value: "5.7%", flagged: true, page: "p. 8" },
    { label: "Exit cap", value: "5.25%", flagged: true, page: "p. 41" },
    // The OM's own p.8 figure — the pro forma the reconciliation (below) and
    // the T-12 actual ($3,706,500) both push back on. Storing the OM's stated
    // number here keeps the OM-vs-T-12 note honest: +4.7%, not a self-compare.
    { label: "NOI (pro forma)", value: "$3,880,000", flagged: true, page: "p. 8" },
    { label: "Units", value: "248", flagged: false, page: "p. 3" },
    { label: "Avg in-place rent", value: "$2,400/mo", flagged: false, page: "p. 12" },
    { label: "Pro forma rent", value: "$2,600/mo", flagged: true, page: "p. 12" },
    { label: "Rent growth", value: "4.0%/yr", flagged: true, page: "p. 40" },
    { label: "Vacancy (pro forma)", value: "6.0%", flagged: true, page: "p. 8" },
    { label: "Loan-to-value", value: "60%", flagged: false, page: "p. 44" },
  ],
};

const challenges: ChallengerResult = {
  challenges: [
    {
      assumption: "Exit cap compression to 5.25%",
      severity: "high",
      challenge:
        "The model exits 20 bps tighter than going-in with no stated thesis for compression in a flat-to-rising-rate environment.",
      question:
        "What supports a 5.25% exit in year five when the submarket trades at 5.25–5.75% today?",
    },
    {
      assumption: "$180/mo renovation premium",
      severity: "high",
      challenge:
        "Pro forma rents jump 13% on a renovation program the comps don't yet support at this basis.",
      question: "Which renovated comps achieved this premium, and at what cost per unit?",
    },
    {
      assumption: "6% stabilized vacancy",
      severity: "medium",
      challenge: "In-place vacancy runs ~9%; the 6% stabilized figure assumes a lease-up that isn't underwritten.",
      question: "What's the absorption schedule to get from 9% to 6%?",
    },
  ],
  stressTest:
    "At a flat 5.5% exit, a real 9% vacancy, and a heavier expense load, the levered IRR falls from the pro forma's mid-teens to roughly 8%.",
};

const comps: BrokerCompsResult = {
  saleComps: [
    {
      name: "The Brixton — 2.1 mi",
      detail: "$252k/unit · 5.6% cap · Q3'25",
      support: "supports",
      note: "Comparable vintage and submarket; supports a sub-$260k basis.",
    },
    {
      name: "Vue at Legacy — 4.0 mi",
      detail: "$298k/unit · 4.9% cap · Q1'25",
      support: "stretched",
      note: "Newer, amenitized asset in a stronger submarket — not a clean comp.",
    },
    {
      name: "Parkside — 1.4 mi",
      detail: "$261k/unit · 5.4% cap · Q4'25",
      support: "favorable",
      note: "Closest comp; lands near the subject's implied basis.",
    },
  ],
  leaseComps: [
    {
      name: "The Brixton (renovated)",
      detail: "$2,520/mo · 2BR",
      support: "favorable",
      note: "Renovated units clear $2,520 — below the $2,600 pro forma.",
    },
  ],
  redFlags: [
    "Two of three sale comps sit in stronger submarkets, inflating the implied basis.",
    "A weaker $238k/unit trade 0.8 mi away was omitted from the set.",
  ],
  summary:
    "The comp set leans on the strongest trades and omits a nearby weaker sale — sell-side selections usually do. On clean comps, the basis looks 8–12% rich.",
};

const reconciliation: ReconciliationResult = {
  rows: [
    {
      metric: "Year-1 NOI",
      omValue: "$3,880,000",
      myValue: "$3,706,500",
      gap: "$174k below the OM — heavier expense load",
      direction: "unfavorable",
    },
    {
      metric: "Vacancy",
      omValue: "6.0%",
      myValue: "9.0%",
      gap: "300 bps higher, in line with in-place",
      direction: "unfavorable",
    },
    {
      metric: "Going-in cap",
      omValue: "5.45%",
      myValue: "5.45%",
      gap: "In agreement",
      direction: "neutral",
    },
  ],
  takeaway:
    "Your model lands ~$174k light on NOI and 300 bps higher on vacancy — together roughly 200 bps of IRR versus the OM.",
};

const market: MarketResult = {
  checks: [
    {
      assumption: "Exit cap 5.25%",
      omSays: "5.25%",
      typicalRange: "5.25–5.75%",
      assessment: "aggressive",
      note: "At the tight end of the range with no compression catalyst.",
    },
    {
      assumption: "Rent growth 4.0%/yr",
      omSays: "4.0%",
      typicalRange: "2.5–3.5%",
      assessment: "aggressive",
      note: "Above the metro's long-run trend.",
    },
    {
      assumption: "Vacancy 6%",
      omSays: "6.0%",
      typicalRange: "5–7%",
      assessment: "in-line",
      note: "Reasonable once stabilized — but not the in-place figure.",
    },
  ],
  summary:
    "Two of three headline assumptions sit at or beyond the aggressive end of market norms.",
};

const verdict: VerdictResult = {
  verdict: "caution",
  reason:
    "The going-in basis is rich and the returns lean on an aggressive exit and rent ramp. Worth a closer look only if the seller moves on price or the ramp is de-risked.",
  topRisks: [
    "Exit cap of 5.25% sits at the tight end of today's submarket trades with no catalyst.",
    "Pro forma rents assume a $200/mo premium the comps don't support.",
    "Stabilized vacancy of 6% ignores the 9% in-place reality.",
  ],
  nextSteps: [
    "Pull three renovated-comp leases to test the rent premium.",
    "Re-run returns at a flat 5.5% exit and real in-place vacancy.",
  ],
  screen: {
    ranges: [
      {
        label: "Market rent / unit / mo",
        low: "$2,400",
        base: "$2,480",
        high: "$2,600",
        source: "Public listings + 3 comp leases within 1 mi",
        basis: "Low = in-place renewals; high = the OM's renovated pro forma.",
        confidence: "medium",
      },
      {
        label: "Vacancy",
        low: "6.0%",
        base: "9.0%",
        high: "9.5%",
        source: "Rent roll (in-place) vs. OM stabilized",
        basis: "Base reflects in-place; low assumes a completed lease-up.",
        confidence: "high",
      },
      {
        label: "Exit cap",
        low: "5.25%",
        base: "5.50%",
        high: "5.75%",
        source: "Submarket trades 5.25–5.75%; broker holds 5.25%",
        basis: "Base assumes no compression; high reflects a softer exit.",
        confidence: "medium",
      },
      {
        label: "Basis / unit",
        low: "$248k",
        base: "$262k",
        high: "$274k",
        source: "Last two comparable trades (p. 14) vs. ask",
        basis: "Ask sits above clean comps with no renovation premium yet.",
        confidence: "high",
      },
    ],
    dealKillers: [
      {
        lever: "basis",
        read: "Buying at ~$274k/unit — above the last comparable trades.",
        risk: "No renovation premium yet justifies the spread.",
      },
      {
        lever: "exit",
        read: "Underwritten at a 5.25% exit, inside going-in.",
        risk: "A flat 5.5% exit knocks roughly 200 bps off the IRR.",
      },
      {
        lever: "debt",
        read: "60% LTV at 6.0% with one year of IO.",
        risk: "A soft refi window or higher rate pressures the takeout.",
      },
    ],
    sensitivity: [
      {
        scenario: "conservative",
        call: "pass_on",
        note: "Flat exit + real vacancy pushes the IRR into the single digits.",
      },
      { scenario: "base", call: "caution", note: "Pencils only if the seller moves on price." },
      {
        scenario: "sponsor",
        call: "pass",
        note: "If the ramp and exit hold, returns clear the hurdle.",
      },
    ],
  },
};

// ---- Property actuals (Feature 1 on the sample) ----------------------------
// Consistent by construction with the reconciliation above: the T-12's NOI is
// the $3,706,500 the reconciler chose over the OM's $3,880,000 pro forma, and
// the rent roll's 9.1% in-place vacancy is the figure that beat the OM's 6%.

const rentRollExtraction: RentRollExtraction = {
  asOfDate: "2026-05-31",
  // Representative rows only — the summary below reflects the full 248-unit
  // roll (truncated: true says "not every row is reproduced here").
  rows: [
    { tenant: "Unit 101", suiteUnit: "101", sf: 745, leaseExpiry: "2026-11-30", inPlaceRentMonthly: 1795, rentPsf: null, occupied: true, freeRentMonths: null, tiPsf: null, page: "roll p.1" },
    { tenant: "Unit 108", suiteUnit: "108", sf: 745, leaseExpiry: "", inPlaceRentMonthly: null, rentPsf: null, occupied: false, freeRentMonths: null, tiPsf: null, page: "roll p.1" },
    { tenant: "Unit 214", suiteUnit: "214", sf: 890, leaseExpiry: "2027-02-28", inPlaceRentMonthly: 2140, rentPsf: null, occupied: true, freeRentMonths: 1, tiPsf: null, page: "roll p.2" },
    { tenant: "Unit 220", suiteUnit: "220", sf: 890, leaseExpiry: "2026-08-31", inPlaceRentMonthly: 2085, rentPsf: null, occupied: true, freeRentMonths: null, tiPsf: null, page: "roll p.2" },
    { tenant: "Unit 305", suiteUnit: "305", sf: 1080, leaseExpiry: "2026-09-30", inPlaceRentMonthly: 2560, rentPsf: null, occupied: true, freeRentMonths: null, tiPsf: null, page: "roll p.3" },
    { tenant: "Unit 312", suiteUnit: "312", sf: 1080, leaseExpiry: "", inPlaceRentMonthly: null, rentPsf: null, occupied: false, freeRentMonths: null, tiPsf: null, page: "roll p.3" },
  ],
  truncated: true,
  page: "roll p.1–6",
};

const rentRollSummary: RentRollSummary = {
  unitCount: 248,
  occupiedUnits: 225,
  totalSf: 220_720,
  occupiedSf: 200_635,
  sfWeightedOccupancy: 0.909,
  waltYears: 0.6,
  weightedAvgRentPsf: 32.4,
  expiryBuckets: { next12mo: 0.78, y1to3: 0.22, y3to5: 0, y5plus: 0 },
  expiryCoveredSf: 196_400,
  truncated: false,
  asOfUsed: "2026-05-31",
};

const t12Extraction: T12Extraction = {
  periodEndDate: "2026-05-31",
  collectedRent: 6_499_500,
  vacancyLoss: 650_500,
  otherIncome: 292_000,
  egi: 6_791_500,
  opex: [
    { key: "taxes", label: "Real estate taxes", amount: 1_140_000, page: "T-12 p.1" },
    { key: "insurance", label: "Insurance", amount: 385_000, page: "T-12 p.1" },
    { key: "utilities", label: "Utilities", amount: 460_000, page: "T-12 p.1" },
    { key: "rm", label: "Repairs & maintenance", amount: 420_000, page: "T-12 p.1" },
    { key: "payroll", label: "Payroll", amount: 415_000, page: "T-12 p.2" },
    { key: "mgmt", label: "Management fee", amount: 205_000, page: "T-12 p.2" },
    { key: "admin", label: "Marketing & admin", amount: 60_000, page: "T-12 p.2" },
  ],
  totalOpex: 3_085_000,
  noi: 3_706_500,
  page: "T-12 p.1–2",
};

const t12Summary: T12Summary = {
  collectedRent: 6_499_500,
  vacancyLoss: 650_500,
  otherIncome: 292_000,
  egi: 6_791_500,
  opex: t12Extraction.opex,
  totalOpex: 3_085_000,
  noi: 3_706_500,
  noiDerived: false,
};

/** The full seed payload for a sample deal row. */
export const SAMPLE_DEAL = {
  name: SAMPLE_DEAL_NAME,
  asset_class: "multifamily",
  extraction,
  challenges,
  comps,
  reconciliation,
  market,
  verdict,
  model,
  /** deal_rent_rolls / deal_t12_statements seed rows (best-effort insert) */
  rentRoll: {
    as_of_date: "2026-05-31",
    extraction: rentRollExtraction,
    summary: rentRollSummary,
  },
  t12: {
    period_end_date: "2026-05-31",
    extraction: t12Extraction,
    summary: t12Summary,
  },
} as const;
