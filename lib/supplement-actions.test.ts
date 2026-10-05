/**
 * The deal page's "Add info or upload" box, driven through its server
 * actions with the REAL storage layer over a recording fake of the
 * service-role client and a fake database that answers the caller's own
 * deal. The Documents tab renders the box too, and its note and file were
 * dropped without a word because the actions did not know the tab; every
 * tab the page renders the box on is now held to being saved.
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
  supplements: null as unknown,
  updates: [] as { supplements?: Record<string, { notes: { text: string }[]; files: { name: string; path: string }[] }> }[],
  uploads: [] as string[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        upload: async (path: string) => {
          state.uploads.push(path);
          return { error: null };
        },
        remove: async () => ({ error: null }),
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
vi.mock("@/lib/supabase/server", () => {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "11111111-1111-4111-8111-111111111111" } } }) },
    from() {
      let update: Record<string, unknown> | null = null;
      const q = {
        select: () => q,
        eq: () => q,
        update: (payload: Record<string, unknown>) => {
          update = payload;
          return q;
        },
        maybeSingle: () => q,
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          if (update) {
            state.updates.push(update);
            return Promise.resolve({ data: null, error: null }).then(resolve);
          }
          // RLS answers the caller's own deal.
          return Promise.resolve({ data: { id: DEAL, supplements: state.supplements }, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { createSupabaseServerClient: async () => client };
});

import { addSupplementFile, addSupplementNote } from "@/app/(app)/deals/[id]/supplement-actions";

function form(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

/** Every tab the deal page renders the box on: the literal ones, and the
 *  analyses panel's, which passes its AnalysisKey. Read off the source, so
 *  a tab the page adds is held here without anyone listing it. */
function tabsThePageOffers(): string[] {
  const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]/deal-view.tsx"), "utf8");
  const literal = [...src.matchAll(/<AddData\s+dealId=\{dealId\}\s+tab="([a-z_]+)"/g)].map((m) => m[1]);
  const analysis = src.match(/type AnalysisKey\s*=\s*([^;]+);/)?.[1] ?? "";
  const keys = [...analysis.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
  expect(src).toMatch(/<AddData\s+dealId=\{dealId\}\s+tab=\{analysis\}/);
  return [...new Set([...literal, ...keys])];
}

beforeEach(() => {
  state.supplements = null;
  state.updates.length = 0;
  state.uploads.length = 0;
});

describe("the Documents tab's note and file", () => {
  it("keeps the note under the documents tab", async () => {
    await addSupplementNote(form({ dealId: DEAL, tab: "documents", text: "Roof replaced in 2019, per the seller's broker." }));
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].supplements?.documents.notes.map((n) => n.text)).toEqual([
      "Roof replaced in 2019, per the seller's broker.",
    ]);
  });

  it("stores the file in the deal's own folder and lists it under the documents tab", async () => {
    const file = new File([new Uint8Array(Buffer.from("%PDF-1.7 rent roll"))], "rent-roll.pdf", {
      type: "application/pdf",
    });
    await addSupplementFile(form({ dealId: DEAL, tab: "documents", file }));
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0]).toMatch(new RegExp(`^supplements/${DEAL}/[0-9a-f-]+-rent-roll\\.pdf$`));
    const files = state.updates[0].supplements?.documents.files ?? [];
    expect(files.map((f) => [f.name, f.path])).toEqual([["rent-roll.pdf", state.uploads[0]]]);
  });
});

describe("every tab the deal page renders the box on", () => {
  it("names the Documents tab among them, and each one's note is saved", async () => {
    const tabs = tabsThePageOffers();
    expect(tabs).toContain("documents");
    expect(tabs).toContain("terms");
    for (const tab of tabs) {
      state.updates.length = 0;
      await addSupplementNote(form({ dealId: DEAL, tab, text: `A note on ${tab}` }));
      expect(state.updates, tab).toHaveLength(1);
      expect(state.updates[0].supplements?.[tab]?.notes.at(-1)?.text, tab).toBe(`A note on ${tab}`);
    }
  });

  it("still refuses a tab the page never offers", async () => {
    await addSupplementNote(form({ dealId: DEAL, tab: "bogus", text: "nowhere" }));
    expect(state.updates).toEqual([]);
  });
});
