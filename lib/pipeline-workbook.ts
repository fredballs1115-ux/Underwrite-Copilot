import "server-only";
import ExcelJS from "exceljs";
import { applyWorkbookBranding, type ExportBranding } from "@/lib/excel-branding";
import { STAGES, STAGE_LABEL, isOpenStage, normalizeStage, type Stage } from "@/lib/stages";
import { assetClassLabel } from "@/lib/asset-class";
import { parsePct, parsePrice, priceRange, type BuyBoxCoverage } from "@/lib/criteria";
import { FIRST_READ_TITLE } from "@/lib/first-read";
import { FOLD_WORD, checkedSentence, fitCellText, fitTone, type FitTone } from "@/lib/fit-label";
import { OWN_YIELD_WORDS } from "@/lib/compare-interest";

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

/** The Pipeline sheet's header row: frozen under, and repeated on every
 *  printed page. */
const HEAD_ROW = 4;
/** The underwrite workbook's print margins (lib/underwrite/workbook), in
 *  inches. */
const PRINT_MARGINS = { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 };

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
  /** an operating business on its real estate — "Going concern", "Operator
   *  lease, 2.61x coverage" (lib/going-concern `goingConcernTag`); carried in
   *  the price cell's note */
  goingConcern?: string | null;
  /** condominium units bought in bulk — "Bulk 42 of 120 (35%)", "Condo
   *  units" (lib/condo `condoTag`); carried in the price cell's note */
  condo?: string | null;
  /** a sandwich position's spread — "Spread $720k, 1.65× cover", "Subleases
   *  under the master rent" (lib/sandwich-lease `sandwichTag`); carried in
   *  the price cell's note */
  sandwich?: string | null;
  /** the going-in cap on today's income — the memorandum's, else the first
   *  signal's, as the pipeline card reads it — always null on a plan deal,
   *  and where the slot is withheld (`capWithheld`) */
  cap: string | null;
  /** "note" where the going-in cap is withheld because the price is a
   *  loan's: the collateral's income over it is a cap nobody earns;
   *  "position" where it is a preferred equity position's; and "share"
   *  where it is a share's beside the loan its entity carries (lib/compare-
   *  interest `capSlotWithheld`) — the cell says "n/a — note", "n/a —
   *  position" or "n/a — share" */
  capWithheld?: "note" | "position" | "share" | null;
  /** a note's yield to maturity, or a position's to redemption, at its
   *  price — "17.0%", the pipeline card's figure (lib/compare-interest
   *  `ownYieldText`) — written in the cap cell with what it runs to; null
   *  where none can be stated, and the cell says the cap is withheld */
  noteYield?: string | null;
  /** a plan deal's stabilized NOI over total cost, as a fraction — 0.0627
   *  — written raw into the cell, whose "0.00%" shows the "6.27%" the deal
   *  header prints; never a rounded string read back */
  yieldOnCost: number | null;
  fit: "fits" | "near" | "outside" | null;
  /** how many of the box's criteria the fit stands on (lib/criteria
   *  `buyBoxCoverage`) — the cell says "Fits (2 of 4)" where not every one
   *  could be checked, names them in its note, and is never green while
   *  one the price decides is among them */
  fitCoverage?: BuyBoxCoverage | null;
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

/** A fit's colour by its tone (lib/fit-label `fitTone`): the fold's own —
 *  green, amber, red — and muted, never green, while a criterion the price
 *  decides could not be checked. */
const FIT_COLOR: Record<FitTone, string> = {
  pass: PASS,
  caution: CAUTION,
  kill: KILL,
  muted: MUTED,
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
  // Frozen through the Deal column as well as under the header: frozen rows
  // alone, scrolling right kept the figures and lost whose they were
  // (research pass 35).
  const ws = wb.addWorksheet("Pipeline", {
    views: [{ state: "frozen", xSplit: 2, ySplit: HEAD_ROW }],
  });
  // Each column as wide as its words, and no wider: the sheet prints one page
  // wide, so every spare unit is smaller type on paper.
  ws.columns = [
    { width: 2 },
    { width: 34 }, // Deal — a longer name wraps
    { width: 16 }, // Stage — "Under contract / DD"
    { width: 13 }, // Asset
    { width: 13 }, // Deal type
    { width: 25 }, // Market — "Brewerytown, Philadelphia, PA" whole (22 cut it)
    { width: 14 }, // Price
    { width: 11 }, // Cap
    { width: 13 }, // Yield on cost
    { width: 16 }, // Buy box — "Outside (3 of 4)" on one line; a first read's longer words wrap
    { width: 24 }, // Verdict — "Re-screening (was Caution)", "Screen stalled (was Caution)" (10 cut them)
    { width: 12 }, // Offers due
    { width: 12 }, // Added
    { width: 16 }, // Added by
  ];
  // Printed as a meeting reads it: landscape, one page wide however many
  // deals run down it, the header row on every page. With no page setup the
  // sheet printed over five portrait pages, and pages two to four were rows
  // of figures with no deal's name beside them.
  ws.pageSetup = {
    ...ws.pageSetup,
    orientation: "landscape",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printTitlesRow: `${HEAD_ROW}:${HEAD_ROW}`,
    margins: PRINT_MARGINS,
  };

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
  const headRow = ws.getRow(HEAD_ROW);
  HEADERS.forEach((h, i) => {
    const c = headRow.getCell(i + 2);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: WHITE } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BRAND } };
    c.alignment = {
      horizontal: i >= 5 && i <= 7 ? "right" : "left",
      vertical: "middle",
      // The Buy box column sets its words off the right-aligned yield on
      // cost beside it: printed one page wide, "—Outside" read as one word.
      ...(h === "Buy box" ? { indent: 1 } : {}),
    };
    if (h === "Yield on cost") {
      c.note =
        "Plan deals — value-add, lease-up, conversion, development — are judged on yield on total cost, " +
        "not on an in-place cap. This is the OM's stabilized NOI over total cost (price plus the " +
        "capital budget).";
    }
  });
  headRow.height = 18;

  // Group rows by normalized stage, in ladder order.
  const byStage = new Map<Stage, PipelineExportRow[]>(
    STAGES.map((s) => [s, []]),
  );
  for (const r of rows) byStage.get(normalizeStage(r.stage))!.push(r);

  const firstRow = HEAD_ROW + 1;
  let rowN = firstRow;
  let lastDealRow = 0;
  const today = exportedAt.toISOString().slice(0, 10);
  for (const stage of STAGES) {
    const group = byStage.get(stage)!;
    if (!group.length) continue;
    const isDead = stage === "dead";

    // Stage band: its words in the Deal column, its fill across the row —
    // never one cell merged across the frozen Deal column's edge, which
    // would split the merged cell between the pane that stays and the pane
    // that scrolls.
    const bandFill: ExcelJS.Fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isDead ? FAINT : BRAND_SOFT },
    };
    for (let c = 2; c <= HEADERS.length + 1; c++) ws.getRow(rowN).getCell(c).fill = bandFill;
    const band = ws.getCell(`B${rowN}`);
    band.value = `${STAGE_LABEL[stage]}  ·  ${group.length}`;
    band.font = { bold: true, size: 10, color: { argb: isDead ? MUTED : BRAND } };
    ws.getRow(rowN).height = 16;
    rowN++;

    for (const d of group) {
      const row = ws.getRow(rowN);
      const baseFont = { size: 10, color: { argb: isDead ? MUTED : INK } };

      row.getCell(2).value = d.name;
      row.getCell(2).font = { ...baseFont, bold: !isDead };
      // A name longer than the frozen column wraps, so the row grows to
      // print it whole: "Harbor Point — Performing First Mortgage" had lost
      // its last letter on every page.
      row.getCell(2).alignment = { wrapText: true };
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
        d.goingConcern ? `${d.goingConcern}: an operating business on its real estate — the deal page reads whose earnings these are, the rent's coverage and the split.` : null,
        d.condo ? `${d.condo}: condominium units in an association its declaration governs — the deal page reads the buyer's share of the votes, a year of the dues and a lender's limit on a single owner.` : null,
        d.sandwich ? `${d.sandwich}: a master lease of the building, sublet — the master rent is owed whatever the subtenants pay; the deal page reads the spread, its cover and the master lease's term.` : null,
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
      } else if (!d.planDeal && d.noteYield && (d.capWithheld === "note" || d.capWithheld === "position")) {
        // The pipeline card's figure in the slot: a note's or a position's
        // own yield, said with what it runs to — text, so it draws no bar
        // among the column's caps — and why it stands where a cap would.
        const words = OWN_YIELD_WORDS[d.capWithheld];
        capCell.value = `${d.noteYield} ${words.to}`;
        capCell.note =
          d.capWithheld === "note"
            ? "A note has no going-in cap: the collateral's income over a loan's price is a cap nobody earns. Its yield to maturity at its price stands in its place."
            : "A preferred equity position has no going-in cap: its price buys a rate and a redemption, never a slice of the building. Its yield to redemption at its price stands in its place.";
      } else {
        capCell.value = d.cap ?? (d.planDeal ? "n/a — plan" : d.capWithheld ? `n/a — ${d.capWithheld}` : "—");
      }
      capCell.font = baseFont;
      capCell.alignment = { horizontal: "right" };

      const yocCell = row.getCell(9);
      if (d.yieldOnCost != null && Number.isFinite(d.yieldOnCost)) {
        yocCell.value = d.yieldOnCost;
        yocCell.numFmt = PCT2;
      } else {
        yocCell.value = "—";
      }
      yocCell.font = baseFont;
      yocCell.alignment = { horizontal: "right" };

      // A fit judged on the first signal is the card's "First read": said on
      // the cell, in italic as a call not yet the screen's own is, and
      // explained in its note — never passed off as the full screen's fit.
      // A fit that stands on part of the box says on how much — "Fits (2 of
      // 4)" — names what could not be checked in its note, and is not green
      // while that includes a criterion the price decides: a note's cap and
      // return, which the box cannot judge, had read a green "Fits"
      // (research pass 35).
      const fitWord = d.fit ? FOLD_WORD[d.fit] : null;
      const firstRead = !!fitWord && !!d.fitFirstRead;
      const fitColor = FIT_COLOR[fitTone(null, d.fit, d.fitCoverage)];
      row.getCell(10).value = fitWord ? fitCellText(fitWord, d.fitCoverage, firstRead) : "—";
      row.getCell(10).alignment = { horizontal: "left", indent: 1, wrapText: true };
      row.getCell(10).font = fitWord
        ? firstRead
          ? { size: 10, italic: true, color: { argb: fitColor } }
          : { size: 10, bold: true, color: { argb: fitColor } }
        : baseFont;
      const fitNote = fitWord ? [checkedSentence(d.fitCoverage), firstRead ? FIRST_READ_TITLE : null].filter(Boolean).join(" ") : "";
      if (fitNote) row.getCell(10).note = fitNote;

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
  // computed into a cell.
  //
  // Each bar runs from ZERO to the column's largest figure, as the
  // underwrite workbook's portfolio tab draws its shares, so a bar is its
  // figure's length: run from the column's smallest, the cheapest deal drew
  // no bar at all and a $36M price a sliver beside $75M (a 2.1x difference
  // drawn about 15x), and the lowest cap drew the same empty cell as "n/a —
  // note" (research pass 35).
  //
  // Text cells stay in the range on purpose, and draw nothing: Excel and
  // LibreOffice draw a data bar on a number alone, and leave a text cell out
  // of the column's largest — a dash, "n/a — plan", a note's yield said in
  // words, a stage band. From zero, every figure draws a bar of its own
  // length, so an empty cap cell is always one of those words, never the
  // column's lowest cap.
  if (lastDealRow > 0) {
    for (const col of ["G", "H", "I"]) {
      ws.addConditionalFormatting({
        ref: `${col}${firstRow}:${col}${lastDealRow}`,
        rules: [
          {
            type: "dataBar",
            priority: 1,
            gradient: false,
            minLength: 0,
            maxLength: 100,
            showValue: true,
            border: false,
            cfvo: [{ type: "num", value: 0 }, { type: "max" }],
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
  // Column C holds the asking value in $#,##0: at 12 wide a team's pipeline
  // past $1,000,000,000 showed "###" (research pass 35); 18 holds
  // "$10,000,000,000".
  sum.columns = [{ width: 2 }, { width: 30 }, { width: 18 }, { width: 4 }, { width: 30 }, { width: 12 }];
  // One page wide, so the By verdict block prints beside By stage rather
  // than alone on a page of its own.
  sum.pageSetup = {
    ...sum.pageSetup,
    orientation: "portrait",
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    margins: PRINT_MARGINS,
  };
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
