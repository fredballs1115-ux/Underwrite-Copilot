import { afterEach, describe, it, expect } from "vitest";
import React from "react";
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import {
  omFromBuffer,
  omSourceFor,
  omDocument,
  omReadMode,
  omRequestOptions,
  MAX_INLINE_PDF_BYTES,
} from "./om-source";

const h = React.createElement;
/** A deck of `pages` pages, each carrying `lines` lines of text. */
const deck = (pages: number, lines: number) =>
  renderToBuffer(
    h(
      Document,
      null,
      ...Array.from({ length: pages }, (_, p) =>
        h(
          Page,
          { key: p, size: "LETTER", style: { padding: 40, fontSize: 10 } },
          ...Array.from({ length: lines }, (_, i) => h(Text, { key: i }, `Page ${p + 1} line ${i + 1}: in-place NOI of $1,200,000 on 240 units.`)),
        ),
      ),
    ),
  );

describe("om-source — the deck goes text first", () => {
  afterEach(() => {
    delete process.env.OM_READ;
  });

  it("a dense text layer stands in for the pages, tagged by page, with the same cache marker", async () => {
    const pdf = await deck(6, 12);
    const om = await omSourceFor(pdf, "om.pdf", { textFirst: true });
    expect(om.kind).toBe("pages");
    if (om.kind !== "pages") return;
    expect(om.pages).toBe(6);
    expect(om.sparsePages).toBe(0);
    expect(om.text).toContain("[[page 6]]\nPage 6 line 1: in-place NOI of $1,200,000 on 240 units.");
    const block = omDocument(om) as {
      type: string;
      title?: string;
      source: { type: string; media_type?: string; data?: string };
      cache_control?: { type: string };
    };
    expect(block.type).toBe("document");
    expect(block.title).toBe("Offering memorandum (text layer, page-tagged)");
    expect(block.source).toEqual({ type: "text", media_type: "text/plain", data: om.text });
    expect(block.cache_control).toEqual({ type: "ephemeral" });
    expect(omRequestOptions(om)).toEqual({});
  });

  it("a deck that is mostly pictures, and a scan, still go as PDF", async () => {
    const sparse = await deck(4, 1);
    expect((await omSourceFor(sparse, "om.pdf", { textFirst: true })).kind).toBe("buffer");
    const scan = Buffer.from("%PDF-1.4 no text layer");
    expect(await omSourceFor(scan, "om.pdf", { textFirst: true })).toEqual({ kind: "buffer", data: scan });
  });

  it("a document that is not the OM keeps its pages unless asked", async () => {
    const pdf = await deck(6, 12);
    expect((await omSourceFor(pdf, "buyer-model.pdf")).kind).toBe("buffer");
  });

  it("OM_READ=pdf forces the pages; OM_READ=text takes the layer whenever there is any", async () => {
    expect(omReadMode()).toBe("auto");
    process.env.OM_READ = "pdf";
    expect(omReadMode()).toBe("pdf");
    expect((await omSourceFor(await deck(6, 12), "om.pdf", { textFirst: true })).kind).toBe("buffer");
    process.env.OM_READ = "text";
    const sparse = await omSourceFor(await deck(4, 1), "om.pdf", { textFirst: true });
    expect(sparse.kind).toBe("pages");
    if (sparse.kind === "pages") expect(sparse.sparsePages).toBe(4);
    process.env.OM_READ = "nonsense";
    expect(omReadMode()).toBe("auto");
  });
});

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
