// The settings pages read the signed-in user once per request. The (app)
// layout asks `getCurrentUser()` (lib/supabase/server — React-cached, the
// same `auth.getUser()` call), and each page asked `auth.getUser()` again,
// a second round trip to the auth service on top of the proxy's session
// refresh. A page reads the cached user; only a mutation (a server action)
// asks the auth service itself, for a guaranteed-fresh check. And the
// account page reads its profile row once for the email preferences,
// beside the billing read rather than after it.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PAGES = [
  "app/(app)/account/page.tsx",
  "app/(app)/criteria/page.tsx",
  "app/(app)/billing/page.tsx",
  "app/(app)/team/page.tsx",
  "app/(app)/team/join/[token]/page.tsx",
];
const source = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("the settings pages read the request's cached user, never the auth service again", () => {
  for (const rel of PAGES) {
    it(rel, () => {
      const src = source(rel);
      expect(src).toContain("getCurrentUser()");
      expect(src).not.toMatch(/auth\.getUser\(\)/);
    });
  }

  it("getCurrentUser is the layout's own call, cached for the request", () => {
    const server = source("lib/supabase/server.ts");
    expect(server).toMatch(/export const getCurrentUser = cache\(async \(\)[^]*?supabase\.auth\.getUser\(\)/);
    expect(source("app/(app)/layout.tsx")).toContain("getCurrentUser()");
  });

  it("the account page reads its profile row once, beside the billing read", () => {
    const src = source("app/(app)/account/page.tsx");
    expect(src.match(/\.from\("profiles"\)/g)?.length).toBe(1);
    expect(src).toMatch(/Promise\.all\(\[getBilling\(supabase, user\.id\), emailPrefsOf\(user\.id\)\]\)/);
  });
});
