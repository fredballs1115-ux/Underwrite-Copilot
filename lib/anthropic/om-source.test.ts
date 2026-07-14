import { describe, it, expect } from "vitest";
import {
  omFromBuffer,
  omSourceFor,
  omDocument,
  omRequestOptions,
  MAX_INLINE_PDF_BYTES,
} from "./om-source";

describe("om-source — transport selection for the OM PDF", () => {
  it("small PDFs stay inline (no upload round-trip, no client needed)", async () => {
    // Must resolve WITHOUT ANTHROPIC_API_KEY — the inline path never touches
    // the client, which is also why every fake-backed test keeps working.
    const pdf = Buffer.from("%PDF-1.4 tiny");
    const om = await omSourceFor(pdf);
    expect(om).toEqual({ kind: "buffer", data: pdf });
  });

  it("the inline ceiling is the base64-inflation bound, not the API cap", () => {
    // 22MB × 4/3 ≈ 29.3MB of base64 — under the ~32MB request cap. Raising
    // this without the Files API would 413 on the wire.
    expect(MAX_INLINE_PDF_BYTES).toBe(22 * 1024 * 1024);
    expect((MAX_INLINE_PDF_BYTES * 4) / 3).toBeLessThan(32 * 1024 * 1024);
  });

  it("inline documents render the exact block shape the steps always sent", () => {
    const pdf = Buffer.from("%PDF-1.4 tiny");
    const block = omDocument(omFromBuffer(pdf)) as {
      type: string;
      source: { type: string; media_type?: string; data?: string };
      cache_control?: { type: string };
    };
    expect(block.type).toBe("document");
    expect(block.source.type).toBe("base64");
    expect(block.source.media_type).toBe("application/pdf");
    expect(block.source.data).toBe(pdf.toString("base64"));
    expect(block.cache_control).toEqual({ type: "ephemeral" });
  });

  it("file documents reference the id and carry the same cache marker", () => {
    const block = omDocument({ kind: "file", fileId: "file_abc123" }) as {
      source: { type: string; file_id?: string };
      cache_control?: { type: string };
    };
    expect(block.source).toEqual({ type: "file", file_id: "file_abc123" });
    expect(block.cache_control).toEqual({ type: "ephemeral" });
  });

  it("the beta header rides ONLY on file-source requests", () => {
    expect(omRequestOptions(omFromBuffer(Buffer.from("x")))).toEqual({});
    expect(omRequestOptions({ kind: "file", fileId: "file_1" })).toEqual({
      headers: { "anthropic-beta": "files-api-2025-04-14" },
    });
  });
});
