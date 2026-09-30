import { describe, expect, it } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { marketCardPath, marketPages } from "@/lib/public-pages";

// robots.txt read the way a crawler reads it: of every rule whose path
// prefixes the URL's, the LONGEST wins, and an allow wins a tie.
function allowed(path: string): boolean {
  const rules = robots().rules;
  const rule = Array.isArray(rules) ? rules[0] : rules;
  const list = (v: string | string[] | undefined) => (v === undefined ? [] : Array.isArray(v) ? v : [v]);
  let best = { len: -1, allow: true };
  for (const [paths, allow] of [
    [list(rule.allow), true],
    [list(rule.disallow), false],
  ] as const) {
    for (const p of paths) {
      if (!path.startsWith(p)) continue;
      if (p.length > best.len || (p.length === best.len && allow)) best = { len: p.length, allow };
    }
  }
  return best.allow;
}

describe("robots.txt", () => {
  it("lets a crawler reach every page the sitemap lists", () => {
    for (const entry of sitemap()) {
      const path = new URL(entry.url).pathname + new URL(entry.url).search;
      expect(allowed(path), path).toBe(true);
    }
  });

  it("lets a link preview fetch each market page's own card, and nothing else under /api", () => {
    for (const page of marketPages()) expect(allowed(marketCardPath(page.id)), page.id).toBe(true);
    expect(allowed("/api/deals/d1/picture")).toBe(false);
    expect(allowed("/api/imagery/skyline/dc")).toBe(false);
    expect(allowed("/api/news/health")).toBe(false);
  });

  it("keeps the signed-in app and the shared screens out of the index", () => {
    for (const path of ["/deals", "/deals/abc", "/billing", "/account", "/team", "/criteria", "/analytics", "/share/tok"]) {
      expect(allowed(path), path).toBe(false);
    }
  });
});
