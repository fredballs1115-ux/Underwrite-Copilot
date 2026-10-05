/**
 * Whether a memorandum can be read at all, checked at the upload — before it
 * becomes a deal, takes a free slot and fails at the screen's first step
 * with advice that cannot work (pass 14, 2026-10-01).
 *
 * Two refusals, each certain:
 * - a file that asks for a password to OPEN. A broker's "secured" file (an
 *   owner password over an empty user password: printing or copying locked)
 *   opens in every reader without asking, pdfjs included, and is NOT
 *   refused — the screen reads its text layer;
 * - a file longer than the analysis service reads in one pass
 *   (`MAX_OM_PAGES`), by pdfjs's own page count.
 *
 * Anything else — a file pdfjs cannot parse, a read that runs past its
 * budget, pdfjs failing to load — is "unknown", and the upload goes ahead:
 * the screen's own readers decide, as they did before this check. Never
 * throws.
 */
import { MAX_OM_PAGES } from "@/lib/pdf";
import { pdfjsWasmUrl } from "@/lib/pdfjs-wasm";

export type PdfOpenVerdict = "ok" | "password" | "too_long" | "unknown";

export interface PdfOpenCheck {
  verdict: PdfOpenVerdict;
  /** pdfjs's page count, where the file opened */
  pages: number | null;
}

/** How long the check may take before the upload goes ahead unchecked. */
export const PDF_OPEN_BUDGET_MS = 8_000;

export async function checkPdfOpens(pdf: Buffer | Uint8Array, budgetMs = PDF_OPEN_BUDGET_MS): Promise<PdfOpenCheck> {
  let pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs");
  try {
    pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  } catch {
    return { verdict: "unknown", pages: null };
  }
  let task: ReturnType<typeof pdfjs.getDocument> | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    task = pdfjs.getDocument({
      // A copy: pdfjs may take ownership of the buffer it is handed.
      data: new Uint8Array(pdf),
      verbosity: 0,
      useSystemFonts: false,
      // pdfjs keeps its decoders' location process-wide, set by each
      // document it opens: this check must not take it away from a picture
      // read running beside it (lib/pdfjs-wasm).
      wasmUrl: pdfjsWasmUrl(),
    });
    const timeout = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), budgetMs);
    });
    const doc = await Promise.race([task.promise, timeout]);
    if (doc === "timeout") return { verdict: "unknown", pages: null };
    const pages = doc.numPages;
    if (Number.isFinite(pages) && pages > MAX_OM_PAGES) return { verdict: "too_long", pages };
    return { verdict: "ok", pages: Number.isFinite(pages) ? pages : null };
  } catch (err) {
    // pdfjs names a file that needs a password to open by its exception's
    // name; any other failure is the screen's to meet.
    return { verdict: (err as { name?: unknown } | null)?.name === "PasswordException" ? "password" : "unknown", pages: null };
  } finally {
    if (timer) clearTimeout(timer);
    try {
      await task?.destroy();
    } catch {
      // nothing to release
    }
  }
}
