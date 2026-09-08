/**
 * The deal actions, driven end to end with the REAL storage layer over a
 * recording fake of the service-role client, and a fake database shaped the
 * way row-level security answers each caller:
 *
 *   - deleteDeal: a teammate's refused DELETE (zero rows, no error — what
 *     PostgREST returns) sweeps nothing and lands on the permission message;
 *     the creator's accepted DELETE sweeps the deal's own files and nothing
 *     with another deal's id.
 *   - replaceOm: a row whose om_storage_path names another user's object
 *     never gets its bytes written over.
 *   - askDeal: the same forged path is never downloaded, and no answer is
 *     saved.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DEAL = "22222222-2222-4222-8222-222222222222";
const CREATOR = "11111111-1111-4111-8111-111111111111";
const VICTIM_OM = "33333333-3333-4333-8333-333333333333/44444444-4444-4444-8444-444444444444.pdf";
const MY_OM = `${CREATOR}/${DEAL}.pdf`;
const MY_DOC = `documents/${DEAL}/doc1-rent-roll.xlsx`;
const MY_SUPP = `supplements/${DEAL}/s1-notes.pdf`;
const FOREIGN_DOC = "documents/44444444-4444-4444-8444-444444444444/doc9-secret.xlsx";

class Redirect extends Error {
  constructor(readonly to: string) {
    super(`REDIRECT ${to}`);
  }
}

// ---- what the service-role storage client was asked to do -----------------
const storageOps: { op: string; paths: string[] }[] = [];

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        remove: async (paths: string[]) => {
          storageOps.push({ op: "remove", paths });
          return { error: null };
        },
        upload: async (path: string) => {
          storageOps.push({ op: "upload", paths: [path] });
          return { error: null };
        },
        download: async (path: string) => {
          storageOps.push({ op: "download", paths: [path] });
          return { data: { arrayBuffer: async () => new TextEncoder().encode("%PDF- victim").buffer }, error: null };
        },
        createSignedUrl: async () => ({ data: null, error: null }),
      }),
    },
  }),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Redirect(to);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: (fn: () => unknown) => void fn }));
vi.mock("@/lib/billing", () => ({ getBilling: vi.fn(), isPro: async () => true }));
vi.mock("@/lib/public-comps/run", () => ({
  claimRecordComps: vi.fn(async () => false),
  runRecordComps: vi.fn(),
}));
vi.mock("@/lib/jobs", () => ({
  claimJob: vi.fn(async () => ({ outcome: "claimed", priorStatus: "done" })),
  releaseClaim: vi.fn(),
  analysisWorkerEnabled: () => false,
  workerSchemaReady: vi.fn(async () => false),
  newJobRow: vi.fn(() => ({})),
}));
vi.mock("@/lib/anthropic/pipeline", () => ({ runAnalysis: vi.fn(), runReconciliation: vi.fn() }));
vi.mock("@/lib/anthropic/ask", () => ({
  askDealQuestion: async () => ({ answer: "never reached", cites: [] }),
  dealContextFor: () => null,
}));

// ---- the database, as RLS answers the current caller ------------------------
type Row = Record<string, unknown>;
const db = {
  caller: CREATOR,
  deal: {} as Row,
  /** rows a DELETE on deals matches for this caller (RLS: creator or team owner) */
  deleteMatches: 1,
  deleteAttempts: 0,
  savedQa: [] as unknown[],
};

vi.mock("@/lib/supabase/server", () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: db.caller, email: "x@x.com" } } }) },
    rpc: async (_fn: string, args: { p_entry: unknown }) => {
      db.savedQa.push(args.p_entry);
      return { error: null };
    },
    from(table: string) {
      const q = {
        _op: "select" as "select" | "delete" | "update",
        select: () => q,
        eq: () => q,
        update: () => {
          q._op = "update";
          return q;
        },
        delete: () => {
          q._op = "delete";
          return q;
        },
        maybeSingle: () => q,
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          if (q._op === "delete") {
            db.deleteAttempts += 1;
            const gone = Array.from({ length: db.deleteMatches }, () => ({ id: DEAL }));
            return Promise.resolve({ data: gone, error: null }).then(resolve);
          }
          if (q._op === "update") return Promise.resolve({ data: null, error: null }).then(resolve);
          if (table === "deals") return Promise.resolve({ data: db.deal, error: null }).then(resolve);
          if (table === "deal_documents") {
            return Promise.resolve({
              data: [{ storage_path: MY_DOC }, { storage_path: FOREIGN_DOC }],
              error: null,
            }).then(resolve);
          }
          return Promise.resolve({ data: null, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { createSupabaseServerClient: async () => client, getCurrentUser: async () => ({ id: db.caller }) };
});

import { deleteDeal, replaceOm } from "@/app/(app)/deals/actions";
import { askDeal } from "@/app/(app)/deals/[id]/ask-actions";

async function landing(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    if (e instanceof Redirect) return e.to;
    throw e;
  }
  return "(no redirect)";
}

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  storageOps.length = 0;
  db.caller = CREATOR;
  db.deleteMatches = 1;
  db.deleteAttempts = 0;
  db.savedQa.length = 0;
  db.deal = {
    id: DEAL,
    user_id: CREATOR,
    team_id: "team-1",
    is_sample: false,
    om_storage_path: MY_OM,
    supplements: { terms: { files: [{ path: MY_SUPP }, { path: VICTIM_OM }] } },
    qa: [],
    extraction: null,
  };
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

describe("deleteDeal", () => {
  it("a teammate whose DELETE matched nothing sweeps nothing and is told why", async () => {
    db.caller = "teammate-id";
    db.deleteMatches = 0;
    const fd = new FormData();
    fd.set("dealId", DEAL);
    expect(await landing(() => deleteDeal(fd))).toBe(`/deals/${DEAL}?error=deletepermission`);
    expect(db.deleteAttempts).toBe(1);
    expect(storageOps).toEqual([]);
  });

  it("the creator's accepted DELETE sweeps the deal's own files — and only those", async () => {
    const fd = new FormData();
    fd.set("dealId", DEAL);
    expect(await landing(() => deleteDeal(fd))).toBe("/deals?deleted=1");
    expect(storageOps).toHaveLength(1);
    const swept = storageOps[0].paths;
    expect(swept).toContain(MY_OM);
    expect(swept).toContain(`${CREATOR}/${DEAL}.model-tmp`);
    expect(swept).toContain(MY_DOC);
    expect(swept).toContain(MY_SUPP);
    // The two paths on the row that name another deal's objects were skipped.
    expect(swept).not.toContain(VICTIM_OM);
    expect(swept).not.toContain(FOREIGN_DOC);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining(VICTIM_OM));
  });
});

describe("replaceOm with a forged om_storage_path", () => {
  it("never writes over another user's object", async () => {
    db.deal.om_storage_path = VICTIM_OM;
    const fd = new FormData();
    fd.set("dealId", DEAL);
    fd.set(
      "om",
      new File([new Uint8Array(Buffer.from("%PDF-1.7 attacker replacement"))], "x.pdf", {
        type: "application/pdf",
      }),
    );
    const to = await landing(() => replaceOm(fd));
    expect(to).toBe(`/deals/${DEAL}?error=omupload`);
    expect(storageOps.filter((o) => o.op === "upload")).toEqual([]);
  });

  it("a manual deal's first OM lands in the creator's folder, whoever uploads it", async () => {
    db.deal.om_storage_path = null;
    const fd = new FormData();
    fd.set("dealId", DEAL);
    fd.set("om", new File([new Uint8Array(Buffer.from("%PDF-1.7 first"))], "om.pdf", { type: "application/pdf" }));
    await landing(() => replaceOm(fd));
    expect(storageOps.filter((o) => o.op === "upload")).toEqual([{ op: "upload", paths: [MY_OM] }]);
  });
});

describe("askDeal with a forged om_storage_path", () => {
  it("downloads nothing and saves no answer", async () => {
    db.deal.om_storage_path = VICTIM_OM;
    const fd = new FormData();
    fd.set("dealId", DEAL);
    fd.set("question", "What is the purchase price and who is the seller?");
    const state = await askDeal(null, fd);
    expect(state && "error" in state && state.error).toBeTruthy();
    expect(storageOps).toEqual([]);
    expect(db.savedQa).toEqual([]);
  });
});
