import "server-only";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { getAnthropic } from "./client";
import { isDenseLayer, pageTaggedText, pdfTextLayer, type PdfTextLayer } from "@/lib/pdf-text";

/**
 * How the OM rides along on an analysis request.
 *
 * Text first: a deck exported from a layout tool carries a full text layer,
 * and that layer — page-tagged, in reading order — is a third to a quarter
 * of the tokens the same pages cost as PDF, on every OM-reading step at
 * once. When the layer is dense enough to stand in for the pages (see
 * `isDenseLayer`), the screen and Ask read it instead; a scan, or a deck
 * that is mostly pictures, still goes as PDF. `OM_READ=pdf` forces the PDF
 * for every deck, `OM_READ=text` the layer whenever there is any.
 *
 * PDF: inline base64 inflates the payload ~33% against Anthropic's ~32MB
 * request cap, so it tops out around 22MB of raw PDF — glossy OMs hit that
 * near 15 pages, which users experienced as a page limit. Larger files
 * upload ONCE to the Anthropic Files API and every step references the
 * file id instead: the full 32MB / ~600-page document limit applies, and the
 * bytes never ride the request again. Small files keep the inline path
 * unchanged (no extra round trip, identical behavior and caching to before).
 */
export type OmSource =
  | { kind: "file"; fileId: string }
  | { kind: "buffer"; data: Buffer }
  /** manual deals: a typed fact sheet stands in for the OM (plain text) */
  | { kind: "text"; text: string }
  /** the deck's own text layer, page-tagged, standing in for its pages */
  | { kind: "pages"; text: string; pages: number; sparsePages: number };

export const omFromBuffer = (data: Buffer): OmSource => ({ kind: "buffer", data });

export const omFromText = (text: string): OmSource => ({ kind: "text", text });

export const omFromPages = (layer: PdfTextLayer, title = "Offering memorandum"): OmSource => ({
  kind: "pages",
  text: pageTaggedText(layer, title),
  pages: layer.pages.length,
  sparsePages: layer.pages.length - layer.densePages,
});

/** Largest raw PDF the inline-base64 fallback can carry under the request cap. */
export const MAX_INLINE_PDF_BYTES = 22 * 1024 * 1024;

export type OmReadMode = "auto" | "pdf" | "text";

/** `OM_READ` from the environment, read per call so a redeploy is never
 *  needed to try it: `auto` (the default — the text layer when dense),
 *  `pdf` (always the pages), `text` (the layer whenever there is any). */
export function omReadMode(): OmReadMode {
  const v = process.env.OM_READ?.trim().toLowerCase();
  return v === "pdf" || v === "text" ? v : "auto";
}

/**
 * Pick the transport for this document. With `textFirst` (the screen and
 * Ask pass it for the OM; other documents keep their pages) a dense text
 * layer stands in for the PDF. Otherwise: inline for anything the request
 * cap can carry, Files API above that. Throws a user-meaningful error if a
 * large PDF can't be uploaded (there is no inline fallback past the cap —
 * better a clear message than a cryptic 413 from the API).
 */
export async function omSourceFor(
  pdf: Buffer,
  filename = "om.pdf",
  opts?: { textFirst?: boolean; title?: string },
): Promise<OmSource> {
  if (opts?.textFirst) {
    const mode = omReadMode();
    if (mode !== "pdf") {
      const layer = await pdfTextLayer(pdf);
      // `text` means any text at all — the raw count, before the running
      // lines are discounted; `auto` asks whether the layer is the deck.
      if (mode === "text" ? layer.pages.some((p) => p.chars > 0) : isDenseLayer(layer)) {
        return omFromPages(layer, opts.title);
      }
    }
  }
  if (pdf.length <= MAX_INLINE_PDF_BYTES) return omFromBuffer(pdf);
  try {
    const client = getAnthropic();
    const file = await client.beta.files.upload(
      { file: await toFile(pdf, filename, { type: "application/pdf" }) },
      { headers: { "anthropic-beta": "files-api-2025-04-14" } },
    );
    return { kind: "file", fileId: file.id };
  } catch (err) {
    console.error("[anthropic] Files upload for large OM failed", err);
    throw new Error(
      "This OM is too large to send inline and the document upload to the analysis service failed — try again in a minute.",
    );
  }
}

/**
 * Delete the Files-API copy of an OM once its run is over. Uploads are per
 * run (the pipeline, one Ask, one reconcile) and nothing else ever removed
 * them, so a 25MB deck asked twenty-five questions left twenty-five copies on
 * the account. Best-effort: a failed delete is logged, never surfaced — the
 * work the upload served is already done. Inline and text sources are no-ops.
 */
export async function releaseOmSource(om: OmSource | null | undefined): Promise<void> {
  if (!om || om.kind !== "file") return;
  try {
    await getAnthropic().beta.files.delete(om.fileId, { betas: ["files-api-2025-04-14"] });
  } catch (err) {
    console.error(`[anthropic] Files delete failed for ${om.fileId}`, err);
  }
}

/**
 * The document content block for a step's message, from either source.
 * `cache` marks the block for prompt caching (the OM is the shared prefix
 * every pipeline step re-reads) — it applies to both transports.
 *
 * File-source documents are typed only in the SDK's beta namespace, but the
 * /v1/messages endpoint accepts them with the files-api beta header (which
 * omRequestOptions supplies) — hence the cast to the stable block type.
 */
export function omDocument(om: OmSource, cache = true): Anthropic.Messages.ContentBlockParam {
  const source =
    om.kind === "file"
      ? ({ type: "file", file_id: om.fileId } as const)
      : om.kind === "text" || om.kind === "pages"
        ? ({
            type: "text",
            media_type: "text/plain",
            data: om.text,
          } as const)
        : ({
            type: "base64",
            media_type: "application/pdf",
            data: om.data.toString("base64"),
          } as const);
  // The title tells every step what it's reading when the block is not the
  // PDF itself: the fact sheet's own preamble carries the detailed framing;
  // the text layer's header says how its pages are tagged.
  const title =
    om.kind === "text"
      ? "Buyer-entered deal fact sheet"
      : om.kind === "pages"
        ? "Offering memorandum (text layer, page-tagged)"
        : null;
  return {
    type: "document" as const,
    source,
    ...(title ? { title } : {}),
    ...(cache ? { cache_control: { type: "ephemeral" as const } } : {}),
  } as unknown as Anthropic.Messages.ContentBlockParam;
}

/**
 * Per-request options for a message that references a Files-API document —
 * the beta header that unlocks file sources on /v1/messages. Empty for the
 * inline path so small-OM requests stay byte-identical to before.
 */
export function omRequestOptions(om: OmSource): { headers?: Record<string, string> } {
  return om.kind === "file"
    ? { headers: { "anthropic-beta": "files-api-2025-04-14" } }
    : {};
}

/** Request options when a message may reference SEVERAL documents — the beta
 *  header is needed if ANY of them rides as a Files-API reference. */
export function anyOmRequestOptions(
  ...sources: (OmSource | null | undefined)[]
): { headers?: Record<string, string> } {
  return sources.some((s) => s?.kind === "file")
    ? { headers: { "anthropic-beta": "files-api-2025-04-14" } }
    : {};
}
