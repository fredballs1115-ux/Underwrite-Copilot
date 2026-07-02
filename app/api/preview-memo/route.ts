/* TEMP — render the upgraded memo with mock screen data. Delete after. */
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { MemoDocument, type MemoData } from "@/lib/memo/memo-document";

export const runtime = "nodejs";

const data: MemoData = {
  name: "The Maddox at Highland Park",
  market: "North Dallas, TX",
  assetClass: "multifamily",
  dateStr: "July 2, 2026",
  verdictWord: "Caution",
  verdictColor: "#b45309",
  verdictSub: "Proceed only with named conditions",
  verdictReason:
    "The going-in basis is rich and the exit cap assumes compression with no thesis. Worth a closer look only if the seller moves on price or the rent ramp is de-risked.",
  keyTerms: [
    { label: "Asking price", value: "$68,000,000", flagged: false },
    { label: "Going-in cap", value: "5.45%", flagged: false },
    { label: "Exit cap", value: "5.25%", flagged: true },
    { label: "Year-1 NOI", value: "$3,706,500", flagged: false },
    { label: "Pro forma rent", value: "$1,600/mo", flagged: true },
    { label: "Units", value: "248", flagged: false },
  ],
  topRisks: [
    "Exit cap of 5.25% is inside today's submarket trades with no catalyst.",
    "Pro forma rents assume a $180/mo premium the comps don't support.",
    "Stabilized vacancy of 6% ignores the 9% in-place reality.",
  ],
  // buildMemoData drops challenges when the screen is present (one-page budget).
  challenges: [],
  // buildMemoData drops flags when the screen is present (one-page budget).
  flags: [],
  ranges: [
    {
      label: "Market rent /unit/mo",
      low: "$1,420",
      base: "$1,495",
      high: "$1,600",
      source: "Public listings + 3 comp leases within 1 mi",
    },
    {
      label: "Vacancy",
      low: "6.0%",
      base: "9.0%",
      high: "9.5%",
      source: "Rent roll (in-place) vs. OM stabilized",
    },
    {
      label: "Exit cap",
      low: "5.25%",
      base: "5.50%",
      high: "5.75%",
      source: "Submarket trades 5.25–5.75%",
    },
    {
      label: "Basis / unit",
      low: "$248k",
      base: "$262k",
      high: "$274k",
      source: "Last two comparable trades vs. ask",
    },
  ],
  dealKillers: [
    {
      label: "Basis",
      read: "Buying above the last comparable trades.",
      risk: "No renovation premium yet justifies the spread.",
    },
    {
      label: "Exit",
      read: "Underwritten inside going-in; flat exit cuts ~200 bps.",
      risk: "A flat 5.5% exit pushes the IRR under the hurdle.",
    },
    {
      label: "Debt",
      read: "60% LTV at 6.0%; refi window is the pressure point.",
      risk: "A 50 bp rate move pressures the takeout.",
    },
  ],
  sensitivity: [
    {
      scenario: "Conservative",
      call: "No-go",
      note: "Flat exit + real vacancy: single-digit IRR.",
    },
    { scenario: "Base", call: "Caution", note: "Pencils only if the seller moves on price." },
    { scenario: "Sponsor", call: "Go", note: "Ramp + exit hold: clears the hurdle." },
  ],
  nextSteps: [
    "Pull three renovated-comp leases to test the rent premium.",
    "Re-run returns at a flat 5.5% exit and real in-place vacancy.",
  ],
};

export async function GET() {
  const element = React.createElement(MemoDocument, {
    data,
  }) as unknown as Parameters<typeof renderToBuffer>[0];
  const buffer = await renderToBuffer(element);
  return new Response(new Uint8Array(buffer), {
    headers: { "Content-Type": "application/pdf" },
  });
}
