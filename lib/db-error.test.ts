/**
 * The pipeline page tells a reader to run the migrations only where a table
 * is truly missing, never on PostgREST's reloading schema cache (the
 * first-run audit of 2026-10-20).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { relationMissing } from "./db-error";

describe("relationMissing", () => {
  it("a table Postgres does not have is missing, by its code or its words", () => {
    expect(relationMissing({ code: "42P01", message: 'relation "public.deals" does not exist' })).toBe(true);
    expect(relationMissing({ code: "42P01", message: "" })).toBe(true);
    expect(relationMissing({ message: 'relation "deals" does not exist' })).toBe(true);
    expect(relationMissing({ message: "relation public.deals does not exist" })).toBe(true);
  });

  it("PostgREST's schema cache, a column, a timeout or a blip is not", () => {
    expect(
      relationMissing({ code: "PGRST205", message: "Could not find the table 'public.deals' in the schema cache" }),
    ).toBe(false);
    expect(relationMissing({ code: "PGRST002", message: "Could not query the database for the schema cache. Retrying." })).toBe(false);
    expect(relationMissing({ code: "42703", message: 'column deals.photo does not exist' })).toBe(false);
    expect(relationMissing({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(relationMissing({ message: "TypeError: fetch failed" })).toBe(false);
    expect(relationMissing({ message: "function does not exist" })).toBe(false);
    expect(relationMissing(null)).toBe(false);
    expect(relationMissing("relation x does not exist")).toBe(false);
  });

  it("the pipeline page reads the error through it, not a loose pattern", () => {
    const src = readFileSync(join(process.cwd(), "app/(app)/deals/page.tsx"), "utf8");
    expect(src).toContain("relationMissing(readError)");
    expect(src).not.toMatch(/\/relation\|does not exist\|schema\/i/);
  });
});
