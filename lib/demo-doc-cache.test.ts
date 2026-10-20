// The public sample's documents are held as long as /demo's own page is,
// never a day: each prints today's published figures, as /demo does.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_DOC_CACHE_CONTROL, DEMO_DOC_SECONDS, heldRenderFresh } from "./demo-doc-cache";

const ROUTES = ["app/api/demo/memo/route.ts", "app/api/demo/report/route.ts", "app/api/demo/underwrite.xlsx/route.ts"];

describe("the sample's documents are held for /demo's ISR window", () => {
  it("is /demo's own revalidate, and the homepage's", () => {
    for (const page of ["app/demo/page.tsx", "app/page.tsx"]) {
      const m = readFileSync(page, "utf8").match(/export const revalidate = (\d+);/);
      expect(m, page).not.toBeNull();
      expect(Number(m![1]), page).toBe(DEMO_DOC_SECONDS);
    }
    expect(DEMO_DOC_CACHE_CONTROL).toBe(`public, max-age=${DEMO_DOC_SECONDS}`);
  });

  it("every route serves the window's header and holds its render by it, never a day", () => {
    for (const route of ROUTES) {
      const src = readFileSync(route, "utf8");
      expect(src, route).toContain('"Cache-Control": DEMO_DOC_CACHE_CONTROL');
      expect(src, route).toContain("heldRenderFresh(");
      expect(src, route).not.toContain("86400");
    }
  });

  it("serves a held render again only on the same day and inside the window", () => {
    const at = Date.UTC(2026, 9, 20, 12);
    const held = { day: "2026-10-20", at };
    expect(heldRenderFresh(held, "2026-10-20", at)).toBe(true);
    expect(heldRenderFresh(held, "2026-10-20", at + DEMO_DOC_SECONDS * 1000 - 1)).toBe(true);
    expect(heldRenderFresh(held, "2026-10-20", at + DEMO_DOC_SECONDS * 1000)).toBe(false);
    expect(heldRenderFresh(held, "2026-10-21", at)).toBe(false);
    expect(heldRenderFresh(null, "2026-10-20", at)).toBe(false);
  });
});
