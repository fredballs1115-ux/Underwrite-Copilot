import "server-only";
import ExcelJS from "exceljs";
import { applyWorkbookBranding, type ExportBranding } from "@/lib/excel-branding";
import { STAGES, STAGE_LABEL, isOpenStage, normalizeStage, type Stage } from "@/lib/stages";
import { assetClassLabel } from "@/lib/asset-class";
import { parsePct, parsePrice, priceRange } from "@/lib/criteria";
import { FIRST_READ_TITLE, markFirstRead } from "@/lib/first-read";

/**
 * The whole pipeline as one meeting-ready Excel workbook: a stage-grouped
 * deal sheet with verdict/buy-box markers, plus a summary sheet with the
 * counts a pipeline meeting opens with. Same visual language as the
 * underwriting workbook (lib/underwrite/workbook.ts).
 */

const BRAND = "FF114E54";
const BRAND_SOFT = "FFE7EEEC";
const INK = "FF18211F";
const MUTED = "FF5F6B69";
const FAINT = "FFF3F5F4";
const WHITE = "FFFFFFFF";
const PASS = "FF1B7A5E";
const CAUTION = "FFA05A1C";
const KILL = "FFB23A30";

const USD = "$#,##0";
const PCT2 = "0.00%";

export interface PipelineExportRow {
  name: string;
  stage: string;
  assetClass: string;
  market: string;
  /** the deal's kind as a label ("Conversion") — null when the OM gives nothing to read */
  dealType: string | null;
  /** a plan deal — value-add, lease-up, conversion or development: no going-in cap */
  planDeal: boolean;
  /** raw extracted strings — parsed for number cells, kept verbatim otherwise */
  price: string | null;
  /** what the price buys where it is not the building outright — "49%
   *  share", "Note", "Leasehold", "Leased fee" (lib/interest `interestTag`,
   *  #415); carried as the price cell's note, since the columns are fixed */
  interest?: string | null;
  /** the seller's loan where it is offered for assumption — "Assumable
   *  3.45%" (lib/assumable-debt `assumableTag`, #419); carried in the price
   *  cell's note beside what the price buys */
  debt?: string | null;
  /** a covenant or a contract that sets the rents — "LIHTC, 75%
   *  restricted" (lib/affordable `affordableTag`, #453); carried in the
   *  price cell's note beside what the price buys */
  affordable?: string | null;
  /** one tenant leases the whole property — "Single tenant, 9 yrs left"
   *  (lib/single-tenant `singleTenantTag`, #454); carried in the price
   *  cell's note beside what the price buys */
  tenancy?: string | null;
  /** what a hotel is sold with — "Mgmt encumbered, PIP $35k/key"
   *  (lib/hotel-deal `hotelTag`, #455); carried in the price cell's note */
  hotel?: string | null;
  /** how the property is sold — "Auction, 5% premium" (lib/sale-terms
   *  `saleTag`, #456); carried in the price cell's note */
  sale?: string | null;
  /** a multi-tenant property's listed tenants — "Shadow-anchored, 56%
   *  rolls in 5 yrs" (lib/tenant-roster `rosterTag`, #457); carried in the
   *  price cell's note */
  roster?: string | null;
  /** a value-add renovation program — "Reno $250/mo, 20% on cost"
   *  (lib/value-add `valueAddTag`, #460); carried in the price cell's note */
  valueAdd?: string | null;
  /** a property-tax abatement — "Tax abated, 4 yrs left, +$450k/yr"
   *  (lib/tax-abatement `taxAbatementTag`, #461); carried in the price
   *  cell's note */
  abatement?: string | null;
  /** a note the seller offers to carry — "Seller financing 5.00%"
   *  (lib/seller-financing `sellerFinancingTag`, #462); carried in the
   *  price cell's note */
  sellerNote?: string | null;
  /** what the third-party reports found — "Phase I: REC", "PML 24%"
   *  (lib/site-reports `siteReportsTag`, #465); carried in the price
   *  cell's note */
  reports?: string | null;
  /** a student building's pre-leasing — "Pre-leased 87%, +5 pts y/y"
   *  (lib/student-housing `studentHousingTag`, #468); carried in the price
   *  cell's note */
  student?: string | null;
  /** a manufactured-housing park's lot rent against the market's and its
   *  private utilities — "Lot rent $430 vs $525 mkt, Private water & sewer"
   *  (lib/manufactured-housing `manufacturedHousingTag`, #470); carried in
   *  the price cell's note */
  mh?: string | null;
  /** a self-storage facility's lease-up, the premium over street and its
   *  economic occupancy (lib/self-storage `selfStorageTag`, #471); carried
   *  in the price cell's note */
  storage?: string | null;
  /** the rent rules that reach the building — "Rent-stabilized, 41 of 48",
   *  "Rent rules: check" (lib/rent-regulation `regulationTag`); carried in
   *  the price cell's note */
  regulation?: string | null;
  /** a forward purchase or a build-to-suit bought at delivery — "Forward,
   *  delivers Q2 2028", "Build-to-suit, 6.00% at delivery"
   *  (lib/forward-purchase `forwardTag`); carried in the price cell's note */
  forward?: string | null;
  /** a mixed-use building's commercial share — "Commercial 29% of income"
   *  (lib/mixed-use `mixedUseTag`); carried in the price cell's note */
  mixedUse?: string | null;
  /** the going-in cap on today's income — always null on a plan deal, and
   *  on a note (`capWithheld`) */
  cap: string | null;
  /** "note" where the going-in cap is withheld because the price is a
   *  loan's: the collateral's income over it is a cap nobody earns
   *  (lib/compare-interest `noteCapSlot`) — the cell says "n/a — note" */
  capWithheld?: "note" | null;
  /** a plan deal's stabilized NOI over total cost, e.g. "11.7%" */
  yieldOnCost: string | null;
  fit: "fits" | "near" | "outside" | null;
  /** the fit is judged on the screen's first signal, the extraction not
   *  landed yet — the pipeline card's "First read" (lib/first-read); the
   *  cell says so beside the fit it shows */
  fitFirstRead?: boolean | null;
  verdict: string | null; // pass | caution | pass_on
  /** the call on file is the previous screen's: a re-screen is running,
   *  the latest screen failed before its verdict, or it stopped making
   *  progress on the way (lib/screen-run `verdictBehind`) — the cell says
   *  so beside the call it shows */
  verdictBehind?: "running" | "failed" | "stalled" | null;
  offersDue: string | null; // YYYY-MM-DD
  createdAt: string; // ISO
  addedBy: string | null;
}

const FIT_LABEL: Record<string, { label: string; color: string }> = {
  fits: { label: "Fits", color: PASS },
  near: { label: "Near", color: CAUTION },
  outside: { label: "Outside", color: KILL },
};

const VERDICT_LABEL: Record<string, { label: string; color: string }> = {
  pass: { label: "Go", color: PASS },
  caution: { label: "Caution", color: CAUTION },
  pass_on: { label: "No-go", color: KILL },
};

export async function buildPipelineWorkbook(
  rows: PipelineExportRow[],
  exportedAt: Date,
  branding?: ExportBranding | null,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Underwrite Copilot";
  wb.created = exportedAt;

  /* ------------------------------ Pipeline ------------------------------ */
  const ws = wb.addWorksheet("Pipeline", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  ws.columns = [
    { width: 2 },
    { width: 34 }, // Deal
    { width: 20 }, // Stage
    { width: 13 }, // Asset
    { width: 13 }, // Deal type
    { width: 22 }, // Market
    { width: 14 }, // Price
    { width: 11 }, // Cap
    { width: 13 }, // Yield on cost
    { width: 10 }, // Buy box
    { width: 10 }, // Verdict
    { width: 12 }, // Offers due
    { width: 12 }, // Added
    { width: 18 }, // Added by
  ];

  const t = ws.getCell("B2");
  t.value = "Pipeline";
  t.font = { bold: true, size: 16, color: { argb: INK } };
  const st = ws.getCell("D2");
  st.value = `${rows.length} deal${rows.length === 1 ? "" : "s"} · exported ${exportedAt.toISOString().slice(0, 10)} · Underwrite Copilot`;
  st.font = { size: 10, color: { argb: MUTED }, italic: true };

  const HEADERS = [
    "Deal",
    "Stage",
    "Asset class",
    "Deal type",
    "Market",
    "Price",
    "Cap rate",
    "Yield on cost",
    "Buy box",
    "Verdict",
    "Offers due",
    "Added",
    "Added by",
  ];
  const headRow = ws.getRow(4);
  HEADERS.forEach((h, i) => {
    const c = headRow.getCell(i + 2);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: WHITE } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    c.alignment = {
      horizontal: i >= 5 && i <= 7 ? "right" : "left",
      vertical: "middle",
    };
    if (h === "Yield on cost") {
      c.note =
        "Plan deals — value-add, lease-up, conversion, development — have no going-in cap. " +
        "This is the OM's stabilized NOI over total cost (price plus the capital budget), " +
        "the figure such a deal is judged on.";
    }
  });
  headRow.height = 18;

  // Group rows by normalized stage, in ladder order.
  const byStage = new Map<Stage, PipelineExportRow[]>(
    STAGES.map((s) => [s, []]),
  );
  for (const r of rows) byStage.get(normalizeStage(r.stage))!.push(r);

  let rowN = 5;
  let lastDealRow = 0;
  const today = exportedAt.toISOString().slice(0, 10);
  for (const stage of STAGES) {
    const group = byStage.get(stage)!;
    if (!group.length) continue;
    const isDead = stage === "dead";

    // Stage band.
    ws.mergeCells(`B${rowN}:N${rowN}`);
    const band = ws.getCell(`B${rowN}`);
    band.value = `${STAGE_LABEL[stage]}  ·  ${group.length}`;
    band.font = { bold: true, size: 10, color: { argb: isDead ? MUTED : BRAND } };
    band.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isDead ? FAINT : BRAND_SOFT },
    };
    ws.getRow(rowN).height = 16;
    rowN++;

    for (const d of group) {
      const row = ws.getRow(rowN);
      const baseFont = { size: 10, color: { argb: isDead ? MUTED : INK } };

      row.getCell(2).value = d.name;
      row.getCell(2).font = { ...baseFont, bold: !isDead };
      row.getCell(3).value = STAGE_LABEL[normalizeStage(d.stage)];
      row.getCell(3).font = baseFont;
      row.getCell(4).value = assetClassLabel(d.assetClass) || "—";
      row.getCell(4).font = baseFont;
      // The deal's kind beside its asset class: a conversion's figures read
      // differently from a stabilized asset's, and a meeting reads the row
      // before anyone opens the deal.
      row.getCell(5).value = d.dealType ?? "—";
      row.getCell(5).font =
        d.planDeal && !isDead
          ? { size: 10, bold: true, color: { argb: BRAND } }
          : baseFont;
      // A note's or a leased fee's type says whose strategy it is
      // ("Stabilized (the collateral)"), longer than the column: wrapped,
      // so the row grows to print it whole.
      row.getCell(5).alignment = { wrapText: true };
      row.getCell(6).value = d.market || "—";
      row.getCell(6).font = baseFont;

      // A range at its top (#466), the figure every other reader takes, and
      // the range said in the cell's note.
      const priceNum = d.price ? parsePrice(d.price) : null;
      const priceSpan = d.price ? priceRange(d.price) : null;
      const priceCell = row.getCell(7);
      if (priceNum != null) {
        priceCell.value = priceNum;
        priceCell.numFmt = USD;
      } else {
        priceCell.value = d.price ?? "—";
      }
      priceCell.font = baseFont;
      priceCell.alignment = { horizontal: "right" };
      // A share's price, a note's or the land's under a ground lease is not
      // the building's: the cell says so where Excel shows a note (#415).
      // …and where the seller's loan is offered for assumption (#419), the
      // same note says so, since the columns are fixed too.
      const notes = [
        priceSpan ? `The memorandum states a range, ${d.price}: the cell is its top, the end that does not flatter the returns.` : null,
        d.interest ? `${d.interest}: the price does not buy the building outright — the deal page says what it buys.` : null,
        d.debt ? `${d.debt}: the seller's loan is offered for assumption — the deal page prices it against today's rate.` : null,
        d.affordable ? `${d.affordable}: a covenant or a contract sets these rents — they move with the limits, not the market; the deal page says until when.` : null,
        d.tenancy ? `${d.tenancy}: one lease is the whole income — the deal page reads its guarantor, its term and its increases.` : null,
        d.hotel ? `${d.hotel}: what the hotel is sold with — the deal page reads the flag, the manager and the PIP.` : null,
        d.sale ? `${d.sale}: the figure is where the bidding opens or the seller is not an owner — the deal page reads the sale.` : null,
        d.roster ? `${d.roster}: the listed tenants against the model's sale — the deal page reads the roll, the anchors and their rights.` : null,
        d.valueAdd ? `${d.valueAdd}: the renovation program as stated — the deal page reads its proof, its pace and what the model does not carry.` : null,
        d.abatement ? `${d.abatement}: the NOI is on an abated tax bill — the deal page reads when it ends and what it is worth.` : null,
        d.sellerNote ? `${d.sellerNote}: the seller offers to carry financing — the deal page prices the note against today's rate.` : null,
        d.reports ? `${d.reports}: from the third-party reports the memorandum cites — the deal page reads them.` : null,
        d.student ? `${d.student}: a student building's leasing for the coming year — the deal page reads the pace, the beds and the walk to campus.` : null,
        d.mh ? `${d.mh}: a manufactured-housing park — the deal page reads the lot rent against the market's, the park-owned homes and the water and sewer.` : null,
        d.storage ? `${d.storage}: a self-storage facility — the deal page reads its two occupancies and the rent sitting tenants pay against the street rate.` : null,
        d.regulation ? `${d.regulation}: the rent rules that reach the building — the deal page reads the regime, the regulated share and the allowance in force against the model's growth.` : null,
        d.forward ? `${d.forward}: the price is paid at delivery and the developer funds the works — the deal page reads the clock, the deposit and the yield at delivery.` : null,
        d.mixedUse ? `${d.mixedUse}: a mixed-use building's commercial share — the deal page reads the two incomes, the commercial space and what one exit cap does to both.` : null,
      ].filter((n): n is string => n != null);
      if (notes.length) priceCell.note = notes.join(" ");

      // A plan deal has no going-in cap; its yield on cost sits in the next
      // column, so the cap cell says so rather than showing a dash a reader
      // would take for "not stated".
      const capNum = d.cap ? parsePct(d.cap) : null;
      const capCell = row.getCell(8);
      if (capNum != null) {
        capCell.value = capNum / 100;
        capCell.numFmt = PCT2;
      } else {
        capCell.value = d.cap ?? (d.planDeal ? "n/a — plan" : d.capWithheld === "note" ? "n/a — note" : "—");
      }
      capCell.font = baseFont;
      capCell.alignment = { horizontal: "right" };

      const yocNum = d.yieldOnCost ? parsePct(d.yieldOnCost) : null;
      const yocCell = row.getCell(9);
      if (yocNum != null) {
        yocCell.value = yocNum / 100;
        yocCell.numFmt = PCT2;
      } else {
        yocCell.value = d.yieldOnCost ?? "—";
      }
      yocCell.font = baseFont;
      yocCell.alignment = { horizontal: "right" };

      // A fit judged on the first signal is the card's "First read": said on
      // the cell, in italic as a call not yet the screen's own is, and
      // explained in its note — never passed off as the full screen's fit.
      const fit = d.fit ? FIT_LABEL[d.fit] : null;
      const firstRead = !!fit && !!d.fitFirstRead;
      row.getCell(10).value = fit ? markFirstRead(fit.label, firstRead) : "—";
      row.getCell(10).font = fit
        ? firstRead
          ? { size: 10, italic: true, color: { argb: fit.color } }
          : { size: 10, bold: true, color: { argb: fit.color } }
        : baseFont;
      if (firstRead) row.getCell(10).note = FIRST_READ_TITLE;

      const v = d.verdict ? VERDICT_LABEL[d.verdict] : null;
      // A call the latest screen has not re-run is the previous screen's,
      // printed beside this run's terms — said, never passed off as current.
      const behind =
        v && d.verdictBehind
          ? d.verdictBehind === "running"
            ? "Re-screening"
            : d.verdictBehind === "stalled"
              ? "Screen stalled"
              : "Screen failed"
          : null;
      row.getCell(11).value = behind ? `${behind} (was ${v!.label})` : (v?.label ?? "—");
      row.getCell(11).font = v
        ? behind
          ? { size: 10, italic: true, color: { argb: v.color } }
          : { size: 10, bold: true, color: { argb: v.color } }
        : baseFont;

      const dueCell = row.getCell(12);
      dueCell.value = d.offersDue ?? "—";
      dueCell.font =
        d.offersDue && d.offersDue < today && !isDead
          ? { size: 10, bold: true, color: { argb: KILL } }
          : baseFont;

      row.getCell(13).value = d.createdAt.slice(0, 10);
      row.getCell(13).font = baseFont;
      row.getCell(14).value = d.addedBy ?? "";
      row.getCell(14).font = baseFont;
      lastDealRow = rowN;
      rowN++;
    }
    rowN++; // breathing room between stages
  }

  // Data bars on the three figures a meeting compares across the sheet —
  // price, cap, yield on cost. Excel draws these itself and keeps them live
  // as the numbers change: a picture with no chart library and nothing
  // computed into a cell. Text cells (a dash, "n/a — plan", a band header)
  // draw no bar, so a plan deal's cap column stays honestly empty.
  if (lastDealRow > 0) {
    for (const col of ["G", "H", "I"]) {
      ws.addConditionalFormatting({
        ref: `${col}5:${col}${lastDealRow}`,
        rules: [
          {
            type: "dataBar",
            priority: 1,
            gradient: false,
            minLength: 0,
            maxLength: 100,
            showValue: true,
            border: false,
            cfvo: [{ type: "min" }, { type: "max" }],
            // The bar's colour rides the rule's model even though the typing
            // omits it (exceljs writes it as the databar's <color>).
            color: { argb: "FFB5CDC9" },
          } as unknown as ExcelJS.ConditionalFormattingRule,
        ],
      });
    }
  }

  /* ------------------------------ Summary ------------------------------- */
  const sum = wb.addWorksheet("Summary");
  sum.columns = [{ width: 2 }, { width: 30 }, { width: 12 }, { width: 4 }, { width: 30 }, { width: 12 }];
  const ts = sum.getCell("B2");
  ts.value = "Pipeline summary";
  ts.font = { bold: true, size: 16, color: { argb: INK } };
  const tss = sum.getCell("B3");
  tss.value = `Exported ${exportedAt.toISOString().slice(0, 10)} — figures as extracted from each OM.`;
  tss.font = { size: 10, color: { argb: MUTED }, italic: true };

  const header = (cell: string, text: string) => {
    const c = sum.getCell(cell);
    c.value = text.toUpperCase();
    c.font = { bold: true, size: 10, color: { argb: BRAND } };
  };

  header("B5", "By stage");
  let r = 6;
  for (const stage of STAGES) {
    const n = byStage.get(stage)!.length;
    sum.getCell(`B${r}`).value = STAGE_LABEL[stage];
    sum.getCell(`B${r}`).font = { size: 10, color: { argb: INK } };
    sum.getCell(`C${r}`).value = n;
    sum.getCell(`C${r}`).font = { size: 10, bold: true, color: { argb: n ? INK : MUTED } };
    r++;
  }

  header("E5", "By verdict");
  const verdicts: [string, string, string][] = [
    ["pass", "Go", PASS],
    ["caution", "Caution", CAUTION],
    ["pass_on", "No-go", KILL],
  ];
  let vr = 6;
  for (const [key, label, color] of verdicts) {
    const n = rows.filter((d) => d.verdict === key).length;
    sum.getCell(`E${vr}`).value = label;
    sum.getCell(`E${vr}`).font = { size: 10, bold: true, color: { argb: color } };
    sum.getCell(`F${vr}`).value = n;
    sum.getCell(`F${vr}`).font = { size: 10, bold: true, color: { argb: INK } };
    vr++;
  }
  sum.getCell(`E${vr}`).value = "Not screened yet";
  sum.getCell(`E${vr}`).font = { size: 10, color: { argb: MUTED } };
  sum.getCell(`F${vr}`).value = rows.filter((d) => !d.verdict).length;
  sum.getCell(`F${vr}`).font = { size: 10, bold: true, color: { argb: INK } };

  // Live-pipeline value: sum of parsed asking prices over the deals still in
  // play (lib/stages `isOpenStage`, the digest's rule). A closed deal is
  // neither live nor dead — it had been counted live here and its price
  // added to the asking value — and the By-stage table above counts it.
  const live = rows.filter((d) => isOpenStage(normalizeStage(d.stage)));
  const prices = live
    .map((d) => (d.price ? parsePrice(d.price) : null))
    .filter((n): n is number => n != null && n > 0);
  const totalRow = r + 1;
  header(`B${totalRow}`, "Live pipeline");
  sum.getCell(`B${totalRow + 1}`).value = "Deals (Closed and Dead excluded)";
  sum.getCell(`B${totalRow + 1}`).font = { size: 10, color: { argb: INK } };
  sum.getCell(`C${totalRow + 1}`).value = live.length;
  sum.getCell(`C${totalRow + 1}`).font = { size: 10, bold: true, color: { argb: INK } };
  sum.getCell(`B${totalRow + 2}`).value = `Asking value (${prices.length} with a stated price)`;
  sum.getCell(`B${totalRow + 2}`).font = { size: 10, color: { argb: INK } };
  sum.getCell(`C${totalRow + 2}`).value = prices.reduce((a, b) => a + b, 0);
  sum.getCell(`C${totalRow + 2}`).numFmt = USD;
  sum.getCell(`C${totalRow + 2}`).font = { size: 10, bold: true, color: { argb: INK } };
  // How many live rows read on yield on cost rather than a going-in cap —
  // the meeting should know before it compares caps across the sheet.
  const planLive = live.filter((d) => d.planDeal).length;
  sum.getCell(`B${totalRow + 3}`).value = "Plan deals (judged on yield on cost)";
  sum.getCell(`B${totalRow + 3}`).font = { size: 10, color: { argb: INK } };
  sum.getCell(`C${totalRow + 3}`).value = planLive;
  sum.getCell(`C${totalRow + 3}`).font = {
    size: 10,
    bold: true,
    color: { argb: planLive ? INK : MUTED },
  };

  // Firm branding (Feature 6): file properties + print chrome only — the
  // meeting workbook is the artifact most likely to be projected, so it
  // carries the same identity as every other export.
  applyWorkbookBranding(wb, wb.worksheets, "Pipeline", branding);

  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}
