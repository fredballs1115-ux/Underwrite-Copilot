import { describe, expect, it } from "vitest";
import { HeldCopies } from "./held-copies";

/** A copy of `n` bytes, tagged so two copies of one size tell apart. */
const copy = (n: number, tag = "") => ({ bytes: new Uint8Array(n), tag });

describe("HeldCopies — what a process keeps of the pictures it made (the security review of 2026-10-01)", () => {
  it("makes a copy once and serves every later ask from it", async () => {
    const held = new HeldCopies<ReturnType<typeof copy>>(4, 1_000);
    let made = 0;
    const make = async () => {
      made++;
      return copy(10, "a");
    };
    const first = await held.take("k", make);
    expect(await held.take("k", make)).toBe(first);
    expect(made).toBe(1);
    expect([held.count, held.bytes]).toEqual([1, 10]);
  });

  it("shares one making among the asks that arrive while it runs", async () => {
    const held = new HeldCopies<ReturnType<typeof copy>>(4, 1_000);
    let made = 0;
    const make = async () => {
      made++;
      await new Promise((r) => setTimeout(r, 10));
      return copy(10);
    };
    const got = await Promise.all(Array.from({ length: 25 }, () => held.take("k", make)));
    expect(made).toBe(1);
    expect(new Set(got).size).toBe(1);
  });

  it("keeps no failure — a null or a throw is made again on the next ask", async () => {
    const held = new HeldCopies<ReturnType<typeof copy>>(4, 1_000);
    let made = 0;
    expect(await held.take("k", async () => (made++, null))).toBeNull();
    await expect(
      held.take("k", async () => {
        made++;
        throw new Error("upstream down");
      }),
    ).rejects.toThrow("upstream down");
    expect(await held.take("k", async () => (made++, copy(5)))).not.toBeNull();
    expect(made).toBe(3);
    expect(held.count).toBe(1);
  });

  it("holds at most its count, the oldest out first, and a copy read moves to the back", async () => {
    const held = new HeldCopies<ReturnType<typeof copy>>(3, 1_000);
    for (const k of ["a", "b", "c"]) await held.take(k, async () => copy(1, k));
    // Reading "a" keeps it; "b" is now the oldest.
    expect(held.peek("a")?.tag).toBe("a");
    await held.take("d", async () => copy(1, "d"));
    expect(held.count).toBe(3);
    expect(held.peek("b")).toBeUndefined();
    expect(held.peek("a")?.tag).toBe("a");
    expect(held.peek("d")?.tag).toBe("d");
  });

  it("holds at most its bytes, and never a copy larger than all of them", async () => {
    const held = new HeldCopies<ReturnType<typeof copy>>(10, 100);
    for (const k of ["a", "b", "c"]) await held.take(k, async () => copy(40, k));
    expect(held.bytes).toBeLessThanOrEqual(100);
    expect(held.peek("a")).toBeUndefined();
    expect([held.peek("b")?.tag, held.peek("c")?.tag]).toEqual(["b", "c"]);
    // Served, not kept: the next ask makes it again.
    let made = 0;
    const big = async () => (made++, copy(101, "big"));
    expect((await held.take("big", big))?.tag).toBe("big");
    expect((await held.take("big", big))?.tag).toBe("big");
    expect(made).toBe(2);
    expect(held.bytes).toBe(80);
  });

  it("serves a held copy only where the caller's test accepts it, and replaces it in its place", async () => {
    const held = new HeldCopies<{ bytes: Uint8Array; at: string }>(4, 1_000);
    const at = (where: string) => async () => ({ bytes: new Uint8Array(10), at: where });
    await held.take("deal", at("here"), { fresh: (h) => h.at === "here", flight: "deal@here" });
    // Moved: the copy drawn at the old place is not served, and one copy a key remains.
    const moved = await held.take("deal", at("there"), { fresh: (h) => h.at === "there", flight: "deal@there" });
    expect(moved?.at).toBe("there");
    expect([held.count, held.bytes]).toEqual([1, 10]);
    expect(held.peek("deal", (h) => h.at === "here")).toBeUndefined();
  });
});
