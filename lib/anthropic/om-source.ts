import "server-only";
import Anthropic, { toFile } from "@anthropic-ai/sdk";
import { getAnthropic } from "./client";

/**
 * How the OM PDF rides along on an analysis request.
 *
 * Inline base64 inflates the payload ~33% against Anthropic's ~32MB request
 * cap, so it tops out around 22MB of raw PDF — glossy OMs hit that near 15
 * pages, which users experienced as a page limit. Larger files upload ONCE to
 * the Anthropic Files API and every step references the file id instead: the
 * full 32MB / ~600-page document limit applies, and the bytes never ride the
 * request again. Small files keep the inline path unchanged (no extra round
 * trip, identical behavior and caching to before).
 */
export type OmSource =
  | { kind: "file"; fileId: string }
  | { kind: "buffer"; data: Buffer };

export const omFromBuffer = (data: Buffer): OmSource => ({ kind: "buffer", data });

/** Largest raw PDF the inline-base64 fallback can carry under the request cap. */
export const MAX_INLINE_PDF_BYTES = 22 * 1024 * 1024;

/**
 * Pick the transport for this OM: inline for anything the request cap can
 * carry, Files API above that. Throws a user-meaningful error if a large OM
 * can't be uploaded (there is no inline fallback past the cap — better a
 * clear message than a cryptic 413 from the API).
 */
export async function omSourceFor(pdf: Buffer, filename = "om.pdf"): Promise<OmSource> {
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
      : ({
          type: "base64",
          media_type: "application/pdf",
          data: om.data.toString("base64"),
        } as const);
  return {
    type: "document" as const,
    source,
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
