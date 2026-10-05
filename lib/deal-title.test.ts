import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ name: null as string | null, asked: [] as string[] }));

vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => {
            state.asked.push(id);
            return { data: state.name == null ? null : { name: state.name }, error: null };
          },
        }),
      }),
    }),
  }),
}));

import { dealTitle } from "./deal-title";

const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  state.name = null;
  state.asked = [];
});

describe("a deal page's tab title (research pass 33)", () => {
  it("is the deal's name, after a sub-page's own word, read under the reader's session", async () => {
    state.name = "Harbor View Apartments";
    expect(await dealTitle(ID)).toEqual({ title: "Harbor View Apartments" });
    expect(await dealTitle(ID, "Rent roll")).toEqual({ title: "Rent roll — Harbor View Apartments" });
  });

  it("says the page's own word where the reader cannot read the deal, and asks nothing for an id that is none", async () => {
    expect(await dealTitle(ID)).toEqual({ title: "Deal" });
    expect(await dealTitle(ID, "Valuations")).toEqual({ title: "Valuations" });
    expect(await dealTitle("not-an-id")).toEqual({ title: "Deal" });
    expect(state.asked).not.toContain("not-an-id");
  });

  it("is what the deal page and its three sub-pages carry, never the homepage's tagline", () => {
    for (const [page, word] of [
      ["page.tsx", null],
      ["rent-roll/page.tsx", "Rent roll"],
      ["valuations/page.tsx", "Valuations"],
      ["bridge/page.tsx", "Assumption bridge"],
    ] as const) {
      const src = readFileSync(join(process.cwd(), "app/(app)/deals/[id]", page), "utf8");
      expect(src, page).toMatch(/export async function generateMetadata\(/);
      expect(src, page).toContain(word ? `return dealTitle(id, "${word}");` : "return dealTitle(id);");
      expect(src, page).not.toMatch(/export const metadata\b/);
    }
  });
});
