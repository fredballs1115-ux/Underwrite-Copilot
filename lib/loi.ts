import "server-only";
import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
} from "docx";
import type { StrategyKind } from "@/lib/deal-strategy";

/** The work a plan deal's diligence must cover, in the letter's own words. */
const PLAN_WORK: Record<StrategyKind, string | null> = {
  conversion: "conversion of the Property",
  development: "development of the Property",
  value_add: "renovation program for the Property",
  lease_up: "lease-up of the Property",
  stabilized: null,
  unknown: null,
};

/** A change of use or a ground-up build closes on approvals the seller does
 *  not control — the letter says so. A renovation or a lease-up does not. */
const NEEDS_ENTITLEMENTS = new Set<StrategyKind>(["conversion", "development"]);

export interface LoiParams {
  /** the deal's plan, when it has one: a conversion or a development gets an
   *  entitlements contingency and a diligence clause that names the work; a
   *  value-add or a lease-up names the work only. Null on a stabilized asset. */
  plan?: { kind: StrategyKind; label: string } | null;
  buyerName: string;
  propertyName: string;
  propertyAddress: string;
  /** already formatted, e.g. "$68,000,000" */
  price: string;
  /** already formatted */
  deposit: string;
  ddDays: number;
  closeDays: number;
  /** financing contingency LTV %, or null for no financing contingency */
  ltvPct: number | null;
  /** how many days the offer stays open */
  openDays: number;
  dateStr: string;
  /** firm letterhead line (Feature 6 branding) — null renders no letterhead.
   *  Deliberately name-only: the report footerText is written for internal
   *  IC pages and doesn't belong on an outbound letter. */
  firmName?: string | null;
}

const BRAND = "114e54";
const INK = "18211f";
const MUTED = "5f6b69";

function para(
  text: string,
  opts?: { bold?: boolean; color?: string; before?: number; after?: number; size?: number },
): Paragraph {
  return new Paragraph({
    spacing: { before: opts?.before ?? 120, after: opts?.after ?? 120 },
    children: [
      new TextRun({
        text,
        bold: opts?.bold,
        color: opts?.color ?? INK,
        size: opts?.size ?? 22, // half-points → 11pt
        font: "Calibri",
      }),
    ],
  });
}

function numbered(n: number, title: string, body: string): Paragraph[] {
  return [
    para(`${n}. ${title}`, { bold: true, before: 200, after: 40 }),
    para(body, { before: 0 }),
  ];
}

/**
 * A clean, deliberately conservative non-binding LOI draft: the standard
 * skeleton an acquisitions team marks up, not a novel legal instrument.
 * Every figure comes from the form the analyst just reviewed.
 */
export async function buildLoiDocx(p: LoiParams): Promise<Buffer> {
  // XML 1.0 cannot carry these control characters; docx writes them verbatim
  // and Word then refuses the file — strip every string that reaches a run.
  const clean = (s: string) =>
    s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  p = {
    ...p,
    buyerName: clean(p.buyerName),
    propertyName: clean(p.propertyName),
    propertyAddress: clean(p.propertyAddress),
    price: clean(p.price),
    deposit: clean(p.deposit),
    dateStr: clean(p.dateStr),
    firmName: p.firmName ? clean(p.firmName).trim() : null,
  };

  const financing =
    p.ltvPct !== null
      ? `Buyer’s obligation to close shall be contingent upon Buyer obtaining debt financing of up to ${p.ltvPct}% of the Purchase Price on market terms. Buyer shall apply for such financing promptly and pursue it diligently.`
      : `This offer is not contingent on financing.`;

  // A plan deal's diligence covers the work itself — and a change of use or
  // a ground-up build closes on approvals the seller does not control.
  const work = p.plan ? PLAN_WORK[p.plan.kind] : null;
  const diligence = `${p.ddDays} days from execution of the PSA, during which Buyer and its consultants shall have reasonable access to the Property and to Seller’s books, records, leases, contracts, and reports relating to the Property${
    work
      ? `, including for structural, environmental, zoning and construction-cost investigations in connection with Buyer’s intended ${work}`
      : ""
  }, and during which Buyer may terminate for any reason or no reason with a full return of the Deposit.`;
  const entitlements =
    work && p.plan && NEEDS_ENTITLEMENTS.has(p.plan.kind)
      ? `Buyer’s obligation to close shall be contingent upon Buyer obtaining, at Buyer’s cost and in form and substance satisfactory to Buyer, all zoning approvals, entitlements, permits and other governmental consents necessary for Buyer’s intended ${work}. Seller shall reasonably cooperate with Buyer’s applications, and the parties shall agree in the PSA on any extension of the Due Diligence Period or the Closing required to pursue them.`
      : null;

  // Numbered in order, so an added clause renumbers the ones after it.
  const sections: [string, string][] = [
    [
      "Purchase Price",
      `${p.price}, payable in cash at closing, subject to customary prorations and adjustments.`,
    ],
    [
      "Earnest Money Deposit",
      `${p.deposit}, to be deposited with a mutually acceptable escrow agent within three (3) business days after execution of a purchase and sale agreement (the “PSA”), applicable to the Purchase Price at closing.`,
    ],
    ["Due Diligence Period", diligence],
    ["Financing", financing],
    ...(entitlements ? [["Entitlements and Approvals", entitlements] as [string, string]] : []),
    [
      "Closing",
      `Closing shall occur within ${p.closeDays} days after expiration of the Due Diligence Period, subject to customary closing conditions.`,
    ],
    [
      "Purchase and Sale Agreement",
      `The parties shall negotiate in good faith toward execution of a mutually acceptable PSA reflecting these terms. This letter shall remain open for acceptance for ${p.openDays} days from the date above.`,
    ],
  ];

  const children: Paragraph[] = [
    // Firm letterhead (Feature 6 branding) — above the title, small caps
    // tracking, only when the account set a firm name.
    ...(p.firmName
      ? [
          new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 120 },
            children: [
              new TextRun({
                text: p.firmName.toUpperCase(),
                bold: true,
                size: 20,
                color: INK,
                font: "Calibri",
                characterSpacing: 20,
              }),
            ],
          }),
        ]
      : []),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: "LETTER OF INTENT",
          bold: true,
          size: 32,
          color: BRAND,
          font: "Calibri",
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [
        new TextRun({
          text: "Non-binding indication of interest",
          size: 20,
          color: MUTED,
          font: "Calibri",
        }),
      ],
    }),
    para(p.dateStr, { color: MUTED }),
    para(`Re: ${p.propertyName}${p.propertyAddress ? ` — ${p.propertyAddress}` : ""}`, {
      bold: true,
      before: 200,
    }),
    para(
      `${p.buyerName} (“Buyer”) is pleased to submit this non-binding letter of intent to acquire the above-referenced property (the “Property”) from its owner (“Seller”) on the principal terms set out below.`,
    ),
    ...sections.flatMap(([title, body], i) => numbered(i + 1, title, body)),
    para(
      "NON-BINDING: This letter is an expression of mutual interest only. Except for this paragraph, no provision of this letter creates any legally binding obligation on either party, and no such obligation shall arise unless and until a definitive PSA is executed and delivered by both parties. Either party may discontinue discussions at any time for any reason.",
      { bold: true, before: 280 },
    ),
    para("Sincerely,", { before: 320 }),
    para(p.buyerName, { bold: true, before: 240 }),
    para("By: ______________________________        Date: ______________", {
      before: 160,
    }),
    para("Acknowledged and agreed (non-binding):", { color: MUTED, before: 360 }),
    para("Seller: ___________________________        Date: ______________", {
      before: 160,
    }),
    new Paragraph({
      spacing: { before: 420 },
      children: [
        new TextRun({
          text: "Draft prepared with Underwrite Copilot for negotiation purposes — have counsel review before sending or signing.",
          size: 16,
          color: MUTED,
          italics: true,
          font: "Calibri",
        }),
      ],
    }),
  ];

  const doc = new Document({
    sections: [
      {
        properties: {
          page: { margin: { top: 1080, bottom: 1080, left: 1260, right: 1260 } },
        },
        children,
      },
    ],
  });
  return Buffer.from(await Packer.toBuffer(doc));
}
