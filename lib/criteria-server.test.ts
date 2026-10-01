import { beforeEach, describe, expect, it, vi } from "vitest";

// The deal's buy box, read for the screen-complete email: a failed read had
// answered as "no box", so the email said "No buy box set" — a claim about
// the account — over a box that was there and simply not read.
const read = vi.hoisted(() => ({ result: { data: null as unknown, error: null as unknown }, tables: [] as string[] }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      read.tables.push(table);
      const q = { select: () => q, eq: () => q, maybeSingle: async () => read.result };
      return q;
    },
  }),
}));

import { getBuyBoxForDeal } from "./criteria-server";

const BOX = { assetClasses: ["multifamily"], markets: "Collin County" };

beforeEach(() => {
  read.result = { data: null, error: null };
  read.tables = [];
});

describe("getBuyBoxForDeal", () => {
  it("reads a team deal's box from the team and a personal deal's from its creator", async () => {
    read.result = { data: { criteria: BOX }, error: null };
    expect(await getBuyBoxForDeal("u1", "t1")).toMatchObject(BOX);
    expect(await getBuyBoxForDeal("u1", null)).toMatchObject(BOX);
    expect(read.tables).toEqual(["teams", "profiles"]);
  });

  it("answers no box where none is stored, strict or not", async () => {
    expect(await getBuyBoxForDeal("u1", null)).toBeNull();
    expect(await getBuyBoxForDeal("u1", null, { strict: true })).toBeNull();
  });

  it("throws on a failed read when strict, and answers as before when not", async () => {
    read.result = { data: null, error: { message: "connection reset" } };
    await expect(getBuyBoxForDeal("u1", "t1", { strict: true })).rejects.toThrow(/could not be read: connection reset/);
    await expect(getBuyBoxForDeal("u1", null, { strict: true })).rejects.toThrow(/could not be read/);
    expect(await getBuyBoxForDeal("u1", "t1")).toBeNull();
  });
});
