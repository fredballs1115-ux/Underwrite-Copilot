/**
 * Attaching a rent roll or a T-12 (model-actions `addDealDocument`), driven
 * through the action with the REAL storage layer over a fake service-role
 * client: a storage failure, or a record the database refuses, lands on the
 * deal page's own banner (`?error=docupload`), never the app's error page,
 * and a refused record leaves no file behind (the first-run audit of
 * 2026-10-20).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const DEAL = "22222222-2222-4222-8222-222222222222";

class Redirect extends Error {
  constructor(readonly to: string) {
    super(`REDIRECT ${to}`);
  }
}

const state = vi.hoisted(() => ({
  uploadError: null as string | null,
  insertError: null as string | null,
  uploads: [] as string[],
  removed: [] as string[],
  inserts: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string) => {
          state.uploads.push(path);
          return { error: state.uploadError ? { message: state.uploadError } : null };
        },
        remove: async (paths: string[]) => {
          state.removed.push(...paths);
          return { error: null };
        },
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
vi.mock("next/server", () => ({ after: vi.fn() }));
vi.mock("@/lib/billing", () => ({ isPro: vi.fn(async () => true) }));
vi.mock("@/lib/model/build-model", () => ({ runModelGeneration: vi.fn() }));
vi.mock("@/lib/supabase/server", () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } } }) },
    from(table: string) {
      let insert: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: () => q,
        insert: (row: Record<string, unknown>) => {
          insert = row;
          return q;
        },
        then<T>(resolve: (v: { data: unknown; error: { message: string } | null }) => T) {
          if (table === "deal_documents" && insert) {
            state.inserts.push(insert);
            return Promise.resolve({
              data: null,
              error: state.insertError ? { message: state.insertError } : null,
            }).then(resolve);
          }
          // RLS answers the caller's own deal.
          return Promise.resolve({ data: { id: DEAL }, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { createSupabaseServerClient: async () => client };
});

import { addDealDocument } from "@/app/(app)/deals/[id]/model-actions";

function rentRoll(): FormData {
  const fd = new FormData();
  fd.set("dealId", DEAL);
  fd.set("kind", "rent_roll");
  fd.set("file", new File([new Uint8Array(Buffer.from("%PDF-1.7 rent roll"))], "rent-roll.pdf", { type: "application/pdf" }));
  return fd;
}

async function landing(fd: FormData): Promise<string | null> {
  try {
    await addDealDocument(fd);
    return null;
  } catch (err) {
    if (err instanceof Redirect) return err.to;
    throw err;
  }
}

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  state.uploadError = null;
  state.insertError = null;
  state.uploads.length = 0;
  state.removed.length = 0;
  state.inserts.length = 0;
  errSpy?.mockRestore();
  errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("addDealDocument", () => {
  it("stores the file and records it", async () => {
    expect(await landing(rentRoll())).toBeNull();
    expect(state.uploads).toHaveLength(1);
    expect(state.inserts).toHaveLength(1);
    expect(state.inserts[0]).toMatchObject({ deal_id: DEAL, kind: "rent_roll", storage_path: state.uploads[0] });
  });

  it("a storage failure lands on the deal page's banner, with no record written", async () => {
    state.uploadError = "Gateway Timeout";
    expect(await landing(rentRoll())).toBe(`/deals/${DEAL}?error=docupload`);
    expect(state.inserts).toHaveLength(0);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Gateway Timeout"));
  });

  it("a record the database refuses lands on the banner, and the stored file is removed", async () => {
    state.insertError = "permission denied for table deal_documents";
    expect(await landing(rentRoll())).toBe(`/deals/${DEAL}?error=docupload`);
    expect(state.removed).toEqual(state.uploads);
  });

  it("the deal page has words for the code", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/deal-view.tsx"), "utf8");
    expect(src).toMatch(/\n\s+docupload:\s*"[^"]+nothing was added[^"]*"/);
  });
});
