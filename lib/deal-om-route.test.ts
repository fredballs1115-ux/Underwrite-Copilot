/**
 * The OM link that signs on click (`/api/deals/[id]/om`), driven with the
 * REAL storage layer over a recording fake of the service-role client and a
 * fake database that answers as row-level security does. The deal page's OM
 * link and its "p. N" chips used one signed URL minted when the page
 * rendered, good for an hour; a page left open longer sent the reader to an
 * expiry error. Now each click is signed fresh and redirected, and the page
 * fragment rides on the route's own URL.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DEAL = "22222222-2222-4222-8222-222222222222";
const OTHER_DEAL = "44444444-4444-4444-8444-444444444444";
const OWNER = "11111111-1111-4111-8111-111111111111";
const STRANGER = "33333333-3333-4333-8333-333333333333";
const MY_OM = `${OWNER}/${DEAL}.pdf`;

const db = vi.hoisted(() => ({
  user: null as { id: string } | null,
  /** deal id → its row as the database holds it */
  rows: {} as Record<string, { id: string; user_id: string; om_storage_path: string | null }>,
  /** whether the bucket holds the object the row names */
  objectExists: true,
  signed: [] as { path: string; ttl: number }[],
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
    from: () => {
      let id = "";
      const q = {
        select: () => q,
        eq: (_col: string, value: string) => {
          id = value;
          return q;
        },
        // Row-level security: only the caller's own deal comes back.
        maybeSingle: async () => {
          const row = db.rows[id];
          return { data: row && db.user && row.user_id === db.user.id ? row : null, error: null };
        },
      };
      return q;
    },
  }),
}));

import { GET } from "@/app/api/deals/[id]/om/route";
import { SourceChip } from "@/app/(app)/deals/[id]/source-chip";
import { omLinkFor } from "./om-link";

const ask = (id: string) =>
  GET(new Request(`https://underwrite.example/api/deals/${id}/om`), { params: Promise.resolve({ id }) });

beforeEach(() => {
  db.user = { id: OWNER };
  db.rows = { [DEAL]: { id: DEAL, user_id: OWNER, om_storage_path: MY_OM } };
  db.objectExists = true;
  db.signed.length = 0;
});

describe("GET /api/deals/[id]/om", () => {
  it("signs the deal's own memorandum at the click and redirects to it, with no fragment of its own", async () => {
    const res = await ask(DEAL);
    expect(res.status).toBe(302);
    const location = res.headers.get("location") ?? "";
    expect(location).toBe(`https://storage.example/object/sign/offering-memoranda/${MY_OM}?token=t1`);
    // The chip's #page=N is kept across the redirect only because this has none.
    expect(location).not.toContain("#");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(db.signed.map((s) => s.path)).toEqual([MY_OM]);
  });

  it("answers 404 for a deal that is not the reader's, and signs nothing", async () => {
    db.user = { id: STRANGER };
    const res = await ask(DEAL);
    expect(res.status).toBe(404);
    expect(db.signed).toEqual([]);
  });

  it("answers 404 for a deal with no memorandum, and signs nothing", async () => {
    db.rows[DEAL].om_storage_path = null;
    const res = await ask(DEAL);
    expect(res.status).toBe(404);
    expect(db.signed).toEqual([]);
  });

  it("never signs a path on the row that is not this deal's own OM", async () => {
    db.rows[DEAL].om_storage_path = `${OWNER}/${OTHER_DEAL}.pdf`;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await ask(DEAL);
    warn.mockRestore();
    expect(res.status).toBe(404);
    expect(db.signed).toEqual([]);
  });

  it("answers 404 when the bucket has no such object", async () => {
    db.objectExists = false;
    expect((await ask(DEAL)).status).toBe(404);
  });

  it("sends a signed-out reader to sign in, back to the deal", async () => {
    db.user = null;
    const res = await ask(DEAL);
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      `https://underwrite.example/login?next=${encodeURIComponent(`/deals/${DEAL}`)}`,
    );
    expect(db.signed).toEqual([]);
  });
});

describe("the page's OM link and its chips", () => {
  it("point at the route, never at a signed URL, and only for the deal's own memorandum", () => {
    expect(omLinkFor(DEAL, MY_OM)).toBe(`/api/deals/${DEAL}/om`);
    expect(omLinkFor(DEAL, null)).toBeNull();
    expect(omLinkFor(DEAL, `${OWNER}/${OTHER_DEAL}.pdf`)).toBeNull();
    expect(omLinkFor(DEAL, `supplements/${DEAL}/x-notes.pdf`)).toBeNull();
  });

  it("a located chip opens the route at its page", () => {
    const html = renderToStaticMarkup(
      React.createElement(SourceChip, {
        fact: {
          field: "Asking price",
          value: "$68,000,000",
          unit: null,
          docLabel: "Offering memorandum",
          pageNumber: 14,
          located: true,
          locatorSnippet: "Offered at $68,000,000",
          confidence: "high",
          provenance: "extracted",
        },
        omUrl: omLinkFor(DEAL, MY_OM),
      }),
    );
    expect(html).toContain(`href="/api/deals/${DEAL}/om#page=14"`);
    expect(html).toContain(">p.14<");
  });
});
