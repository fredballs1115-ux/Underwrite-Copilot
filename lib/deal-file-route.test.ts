/**
 * The file link that signs on click (`/api/deals/[id]/file`), driven with the
 * REAL storage layer over a recording fake of the service-role client and a
 * fake database that answers as row-level security does. The deal page's
 * links to the files added with a note, and the valuations page's links to
 * each BOV's own document, were signed URLs minted when the page rendered,
 * good for an hour; a page left open longer sent the reader to an expiry
 * error. Now each click is signed fresh and redirected — and only for one of
 * this deal's own supplements or documents that the deal's records list.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dealPhotoPath, documentPath, floodFramePath, supplementPath } from "./storage-paths";

const DEAL = "22222222-2222-4222-8222-222222222222";
const OTHER_DEAL = "44444444-4444-4444-8444-444444444444";
const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "33333333-3333-4333-8333-333333333333";
// Minted by the app's own helpers, so the test holds the shapes it writes.
const MY_SUPP = supplementPath(DEAL, "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b", "site notes.pdf");
const MY_DOC = documentPath(DEAL, "0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d", "JLL BOV.pdf");
const MY_OM = `${OWNER}/${DEAL}.pdf`;
const OTHER_SUPP = supplementPath(OTHER_DEAL, "5e4d3c2b-1a0f-4e9d-8c7b-6a5f4e3d2c1b", "rent roll.xlsx");
const OTHER_DOC = documentPath(OTHER_DEAL, "7b6a5f4e-3d2c-4b1a-8f9e-8d7c6b5a4f3e", "T12.pdf");

const db = vi.hoisted(() => ({
  user: null as { id: string } | null,
  /** deal id → its row as the database holds it */
  deals: {} as Record<string, { id: string; user_id: string; supplements: unknown }>,
  /** the deal_documents table */
  documents: [] as { id: string; deal_id: string; storage_path: string }[],
  /** whether the bucket holds the object asked for */
  objectExists: true,
  signed: [] as { path: string; ttl: number }[],
  /** the tables read, in order */
  reads: [] as string[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        createSignedUrl: async (path: string, ttl: number) => {
          db.signed.push({ path, ttl });
          return db.objectExists
            ? { data: { signedUrl: `https://storage.example/object/sign/offering-memoranda/${path}?token=t1` }, error: null }
            : { data: null, error: { message: "Object not found" } };
        },
      }),
    },
  }),
}));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { getUser: async () => ({ data: { user: db.user } }) },
    from: (table: string) => {
      const where: Record<string, string> = {};
      // Row-level security: a row comes back only where its deal is the caller's.
      const readable = (dealId: string) => !!db.user && db.deals[dealId]?.user_id === db.user.id;
      const q = {
        select: () => q,
        eq: (col: string, value: string) => {
          where[col] = value;
          return q;
        },
        limit: () => q,
        maybeSingle: async () => {
          db.reads.push(table);
          if (table === "deals") {
            const row = db.deals[where.id];
            return { data: row && readable(row.id) ? row : null, error: null };
          }
          if (table === "deal_documents") {
            const row = db.documents.find((d) => d.deal_id === where.deal_id && d.storage_path === where.storage_path);
            return { data: row && readable(row.deal_id) ? { id: row.id } : null, error: null };
          }
          throw new Error(`unexpected read of ${table}`);
        },
      };
      return q;
    },
  }),
}));

import { GET } from "@/app/api/deals/[id]/file/route";
import { Supplements } from "@/app/(app)/deals/[id]/deal-sections";
import { ValuationsView, type ColumnData } from "@/app/(app)/deals/[id]/valuations/valuations-view";
import { dealFileKind, dealFileLinkFor, supplementListed } from "./deal-file-link";

const BASE = "https://underwrite.example";
const ask = (id: string, p: string | null) =>
  GET(new Request(`${BASE}/api/deals/${id}/file${p == null ? "" : `?p=${encodeURIComponent(p)}`}`), {
    params: Promise.resolve({ id }),
  });
/** Follow a link the pages draw, exactly as written. */
const follow = (link: string, id: string) =>
  GET(new Request(new URL(link, BASE)), { params: Promise.resolve({ id }) });
const signedUrlOf = (path: string) => `https://storage.example/object/sign/offering-memoranda/${path}?token=t1`;
const file = (path: string, name = "a file") => ({ id: path.slice(-12), name, path, createdAt: "2026-09-30T12:00:00Z" });

beforeEach(() => {
  db.user = { id: OWNER };
  db.deals = {
    [DEAL]: {
      id: DEAL,
      user_id: OWNER,
      supplements: {
        comps: { notes: [{ id: "n1", text: "Called the broker", createdAt: "2026-09-29T12:00:00Z" }], files: [] },
        documents: { notes: [], files: [file(MY_SUPP, "site notes.pdf")] },
      },
    },
    // The reader's own other deal: its files are the reader's too, but never
    // through this deal's link.
    [OTHER_DEAL]: {
      id: OTHER_DEAL,
      user_id: OWNER,
      supplements: { terms: { notes: [], files: [file(OTHER_SUPP, "rent roll.xlsx")] } },
    },
  };
  db.documents = [
    { id: "d1", deal_id: DEAL, storage_path: MY_DOC },
    { id: "d2", deal_id: OTHER_DEAL, storage_path: OTHER_DOC },
  ];
  db.objectExists = true;
  db.signed.length = 0;
  db.reads.length = 0;
});

describe("GET /api/deals/[id]/file", () => {
  it("signs the deal's own attachment at the click and redirects to it", async () => {
    const res = await ask(DEAL, MY_SUPP);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(signedUrlOf(MY_SUPP));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(db.signed.map((s) => s.path)).toEqual([MY_SUPP]);
    // The deal's own record listed it; no document was looked for.
    expect(db.reads).toEqual(["deals"]);
  });

  it("signs the deal's own source document — a BOV — once its deal_documents row lists it", async () => {
    const res = await ask(DEAL, MY_DOC);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(signedUrlOf(MY_DOC));
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(db.signed.map((s) => s.path)).toEqual([MY_DOC]);
    expect(db.reads).toEqual(["deals", "deal_documents"]);
  });

  it("answers 404 for a deal that is not the reader's, and signs nothing", async () => {
    db.user = { id: STRANGER };
    expect((await ask(DEAL, MY_SUPP)).status).toBe(404);
    expect((await ask(DEAL, MY_DOC)).status).toBe(404);
    expect(db.signed).toEqual([]);
  });

  it("never signs a path of the right shape that the deal's own records do not list", async () => {
    const plantedSupp = supplementPath(DEAL, "9c8b7a6f-5e4d-4c3b-8a2f-1e0d9c8b7a6f", "planted.pdf");
    const plantedDoc = documentPath(DEAL, "8b7a6f5e-4d3c-4b2a-9f1e-0d9c8b7a6f5e", "planted.pdf");
    expect((await ask(DEAL, plantedSupp)).status).toBe(404);
    expect((await ask(DEAL, plantedDoc)).status).toBe(404);
    // A document is listed by its deal_documents row, never by a supplement
    // entry that happens to name it.
    (db.deals[DEAL].supplements as { documents: { files: unknown[] } }).documents.files.push(file(plantedDoc));
    expect((await ask(DEAL, plantedDoc)).status).toBe(404);
    expect(db.signed).toEqual([]);
  });

  it("never signs another deal's file through this deal, even the reader's own, before any read", async () => {
    // Even where this deal's record names it (a row written around the
    // database's own shape check).
    (db.deals[DEAL].supplements as { documents: { files: unknown[] } }).documents.files.push(file(OTHER_SUPP));
    expect((await ask(DEAL, OTHER_SUPP)).status).toBe(404);
    expect((await ask(DEAL, OTHER_DOC)).status).toBe(404);
    expect(db.signed).toEqual([]);
    expect(db.reads).toEqual([]);
    // Through its own deal the same files open: the refusal is the deal's.
    expect((await ask(OTHER_DEAL, OTHER_SUPP)).status).toBe(302);
    expect((await ask(OTHER_DEAL, OTHER_DOC)).status).toBe(302);
    expect(db.signed.map((s) => s.path)).toEqual([OTHER_SUPP, OTHER_DOC]);
  });

  it("answers 404 for the OM, which has its own route, and for the deal's other objects", async () => {
    for (const p of [
      MY_OM,
      `${OWNER}/${DEAL}.model-tmp`,
      dealPhotoPath(DEAL, "k3x9", "hero"),
      floodFramePath(DEAL, "k3x9"),
    ]) {
      expect((await ask(DEAL, p)).status, p).toBe(404);
    }
    expect(db.signed).toEqual([]);
    expect(db.reads).toEqual([]);
  });

  it("answers 404 with no path, or one that is not a stored path at all", async () => {
    for (const p of [
      null,
      "",
      `supplements/${DEAL}/../../${MY_OM}`,
      `supplements/${DEAL}/a/b.pdf`,
      `/supplements/${DEAL}/x.pdf`,
      `supplements/${DEAL}/`,
      `https://storage.example/${MY_SUPP}`,
    ]) {
      expect((await ask(DEAL, p)).status, String(p)).toBe(404);
    }
    expect(db.signed).toEqual([]);
    expect(db.reads).toEqual([]);
  });

  it("answers 404 when the bucket has no such object", async () => {
    db.objectExists = false;
    expect((await ask(DEAL, MY_SUPP)).status).toBe(404);
    expect((await ask(DEAL, MY_DOC)).status).toBe(404);
    expect(db.signed.map((s) => s.path)).toEqual([MY_SUPP, MY_DOC]);
  });

  it("sends a signed-out reader to sign in, back to the deal", async () => {
    db.user = null;
    const res = await ask(DEAL, MY_SUPP);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${BASE}/login?next=${encodeURIComponent(`/deals/${DEAL}`)}`);
    expect(db.signed).toEqual([]);
    expect(db.reads).toEqual([]);
  });
});

describe("the pages' file links", () => {
  it("point at the route with the object's path, never at a signed URL, and only for the deal's own supplements and documents", () => {
    expect(dealFileLinkFor(DEAL, MY_SUPP)).toBe(`/api/deals/${DEAL}/file?p=${encodeURIComponent(MY_SUPP)}`);
    expect(dealFileLinkFor(DEAL, MY_SUPP)).toBe(
      `/api/deals/${DEAL}/file?p=supplements%2F${DEAL}%2F6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b-site_notes.pdf`,
    );
    expect(dealFileLinkFor(DEAL, MY_DOC)).toBe(
      `/api/deals/${DEAL}/file?p=documents%2F${DEAL}%2F0a9b8c7d-6e5f-4a3b-8c2d-1e0f9a8b7c6d-JLL_BOV.pdf`,
    );
    expect(dealFileKind(DEAL, MY_SUPP)).toBe("supplement");
    expect(dealFileKind(DEAL, MY_DOC)).toBe("document");
    for (const p of [
      null,
      undefined,
      "",
      MY_OM,
      OTHER_SUPP,
      OTHER_DOC,
      `${OWNER}/${DEAL}.model-tmp`,
      dealPhotoPath(DEAL, "k3x9", "thumb"),
      floodFramePath(DEAL, "k3x9"),
    ]) {
      expect(dealFileLinkFor(DEAL, p), String(p)).toBeNull();
      expect(dealFileKind(DEAL, p), String(p)).toBeNull();
    }
  });

  it("a link, followed, opens the very file it names", async () => {
    for (const p of [MY_SUPP, MY_DOC]) {
      const res = await follow(dealFileLinkFor(DEAL, p)!, DEAL);
      expect(res.status, p).toBe(302);
      expect(res.headers.get("location"), p).toBe(signedUrlOf(p));
    }
  });

  it("a supplement is listed only by a file entry in the deal's own record", () => {
    const record = db.deals[DEAL].supplements;
    expect(supplementListed(record, MY_SUPP)).toBe(true);
    expect(supplementListed(record, OTHER_SUPP)).toBe(false);
    expect(supplementListed(record, "")).toBe(false);
    for (const bad of [null, undefined, "x", 7, [], [file(MY_SUPP)], { documents: null }, { documents: { files: "x" } }]) {
      expect(supplementListed(bad, MY_SUPP), JSON.stringify(bad)).toBe(false);
    }
    // A note that quotes the path is not a file.
    expect(supplementListed({ terms: { notes: [{ id: "n", text: MY_SUPP, path: MY_SUPP }], files: [] } }, MY_SUPP)).toBe(false);
    expect(supplementListed({ terms: { files: [null, { name: "x" }, { path: MY_SUPP }] } }, MY_SUPP)).toBe(true);
  });

  it("an added file on the deal page links to the route, and a file with no link is its name alone", () => {
    const html = renderToStaticMarkup(
      React.createElement(Supplements, {
        dealId: DEAL,
        tab: "documents",
        data: {
          notes: [],
          files: [
            { id: "s1", name: "site notes.pdf", createdAt: "2026-09-30T12:00:00Z", url: dealFileLinkFor(DEAL, MY_SUPP) },
            { id: "s2", name: "stray.pdf", createdAt: "2026-09-30T12:00:00Z", url: dealFileLinkFor(DEAL, OTHER_SUPP) },
          ],
        },
      }),
    );
    expect(html).toContain(`href="/api/deals/${DEAL}/file?p=supplements%2F${DEAL}%2F`);
    expect(html).toContain(">site notes.pdf</a>");
    expect(html).toContain(">stray.pdf</span>");
    expect(html).not.toContain("storage.example");
    expect(html).not.toContain("token=");
  });

  it("a BOV's page citation on the valuations page links to the route", () => {
    const link = dealFileLinkFor(DEAL, MY_DOC);
    const column: ColumnData = {
      id: "v1",
      label: "JLL BOV",
      sourceType: "broker",
      extracted: true,
      internal: false,
      documentUrl: link,
      note: null,
      values: { headlineValue: 71_500_000 },
      citations: { headlineValue: { page: "p. 3", snippet: "Our opinion of value is $71,500,000" } },
      derivedFields: [],
      implied: { ok: false, error: "no model yet", leveredIrrPct: null, leveredEquityMultiple: null, substitutions: [] },
    };
    const html = renderToStaticMarkup(
      React.createElement(ValuationsView, {
        columns: [column],
        bridge: null,
        summary: null,
        tally: null,
        aLabel: null,
        bLabel: null,
      }),
    );
    expect(html).toContain(`href="${link}"`);
    expect(html).toContain(`href="/api/deals/${DEAL}/file?p=documents%2F${DEAL}%2F`);
    expect(html).toContain(">p. 3</a>");
    expect(html).not.toContain("storage.example");
  });
});
