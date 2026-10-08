// The pipeline page's write-backs go behind the response, a few at a time
// (research pass 42, L8): it had awaited every filled-in deadline and address
// at once before drawing anything.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { WRITE_BACKS_IN_FLIGHT, inTurns } from "./in-turns";

describe("inTurns", () => {
  it("runs every item, never more than its few at once", async () => {
    let running = 0;
    let most = 0;
    const done: number[] = [];
    const failed = await inTurns(Array.from({ length: 25 }, (_, i) => i), async (i) => {
      running++;
      most = Math.max(most, running);
      await new Promise((r) => setTimeout(r, 1));
      running--;
      done.push(i);
    });
    expect(failed).toBe(0);
    expect(done.sort((a, b) => a - b)).toEqual(Array.from({ length: 25 }, (_, i) => i));
    expect(most).toBe(WRITE_BACKS_IN_FLIGHT);
  });

  it("counts a failure, thrown or answered, and never throws", async () => {
    const failed = await inTurns([1, 2, 3, 4], async (i) => {
      if (i === 2) throw new Error("network");
      return i !== 3;
    });
    expect(failed).toBe(2);
    expect(await inTurns([], async () => true)).toBe(0);
  });
});

describe("the pipeline page's write-backs", () => {
  const page = readFileSync("app/(app)/deals/page.tsx", "utf8");
  it("draws from the values it computed and writes them behind the response", () => {
    // no write is awaited before the page draws
    expect(page).not.toMatch(/await Promise\.all\(\s*dueFills\.map/);
    expect(page).not.toMatch(/await Promise\.all\(\s*\[\.\.\.upgrades\]\.map/);
    const later = page.slice(page.indexOf("after(async () => {"));
    expect(later).toContain("await inTurns(writes, (write) => write())");
    // the values are set for this render before the writes are queued
    expect(page.indexOf("for (const [id, due] of dueFills) dueById.set(id, due);")).toBeLessThan(page.indexOf("after(async () => {"));
    expect(page.indexOf("if (next) d.address = next;")).toBeLessThan(page.indexOf("after(async () => {"));
  });
});
