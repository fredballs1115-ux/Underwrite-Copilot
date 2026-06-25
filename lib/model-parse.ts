import "server-only";
import ExcelJS from "exceljs";

/**
 * The buyer's own underwriting model, normalized into something Claude can read
 * alongside the OM. Claude reads PDFs natively (ARGUS exports, printed models),
 * so those pass through as-is. Spreadsheets are flattened to text here because
 * Claude's document blocks only accept PDFs — not .xlsx.
 */
export type ParsedModel =
  | { kind: "pdf"; data: Buffer }
  | { kind: "text"; text: string };

// Cap the flattened-spreadsheet text so a huge workbook can't blow up the
// prompt. The key assumption cells live near the top of a model anyway.
const MAX_TEXT_CHARS = 60_000;

/**
 * Turn an uploaded model file into a ParsedModel. PDFs are returned untouched;
 * .xlsx/.xls are flattened sheet-by-sheet into tab-separated text; .csv is read
 * straight through. Throws on an unrecognized extension.
 */
export async function parseModelFile(
  filename: string,
  buffer: Buffer,
): Promise<ParsedModel> {
  const lower = filename.toLowerCase();

  if (lower.endsWith(".pdf")) {
    return { kind: "pdf", data: buffer };
  }
  if (lower.endsWith(".csv")) {
    return { kind: "text", text: clip(buffer.toString("utf8")) };
  }
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    return { kind: "text", text: await flattenWorkbook(buffer) };
  }

  throw new Error("Unsupported model format — upload .xlsx, .csv, or PDF.");
}

/** Flatten every sheet to "Sheet: <name>" headers + tab-separated rows. */
async function flattenWorkbook(buffer: Buffer): Promise<string> {
  const wb = new ExcelJS.Workbook();
  // ExcelJS accepts a Node Buffer here despite the ArrayBuffer-ish typing.
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const lines: string[] = [];
  wb.eachSheet((sheet) => {
    lines.push(`# Sheet: ${sheet.name}`);
    sheet.eachRow({ includeEmpty: false }, (row) => {
      const cells: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell) => {
        // `cell.text` is the value as displayed — it resolves formulas to their
        // cached result and formats dates/percentages, which is what we want.
        cells.push((cell.text ?? "").toString().trim());
      });
      if (cells.some((c) => c !== "")) lines.push(cells.join("\t"));
    });
    lines.push("");
  });

  return clip(lines.join("\n"));
}

function clip(s: string): string {
  return s.length > MAX_TEXT_CHARS
    ? `${s.slice(0, MAX_TEXT_CHARS)}\n…(truncated)…`
    : s;
}
