// The bridge's saved versions said for what they are (research pass 42, M10):
// the page lists the newest sixty under "Saved versions" with no "of N", and
// the deal page's Bridge badge was a bare figure.
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { VERSION_LIST_MAX, versionBadge, versionListCut } from "../version-rules";
import { listDealVersionsCounted } from "../versions";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** A deal_versions table of `n` rows that answers a list read with its
 *  newest `limit` and, where asked, the exact count beside them. */
function versionsTable(n: number, countFails = false): SupabaseClient {
  const rows = Array.from({ length: n }, (_, i) => ({ id: `v${i}`, version_label: `v${n - i}`, created_at: new Date(Date.UTC(2026, 0, 1) + (n - i) * 3600e3).toISOString() }));
  return {
    from: () => {
      let limit = Infinity;
      let counted = false;
      const q = {
        select: (_cols: string, opts?: { count?: string }) => {
          counted = opts?.count === "exact";
          return q;
        },
        eq: () => q,
        order: () => q,
        limit: (k: number) => {
          limit = k;
          return q;
        },
        then: <T>(resolve: (v: { data: unknown; count: number | null; error: null }) => T) =>
          Promise.resolve({ data: rows.slice(0, limit), count: counted && !countFails ? n : null, error: null }).then(resolve),
      };
      return q;
    },
  } as unknown as SupabaseClient;
}

describe("the bridge page's list says when it is cut", () => {
  it("is the newest sixty of every version the deal holds", async () => {
    expect(VERSION_LIST_MAX).toBe(60);
    const { versions, total } = await listDealVersionsCounted(versionsTable(214), "d1");
    expect(versions).toHaveLength(60);
    expect(total).toBe(214);
    expect(versionListCut(versions.length, total)).toBe("the newest 60 of 214 saved versions");
  });

  it("says nothing where every version is listed, or the count did not come back", async () => {
    const few = await listDealVersionsCounted(versionsTable(12), "d1");
    expect(few.total).toBe(12);
    expect(versionListCut(few.versions.length, few.total)).toBeNull();
    const unknown = await listDealVersionsCounted(versionsTable(214, true), "d1");
    expect(unknown.total).toBeNull();
    expect(versionListCut(unknown.versions.length, unknown.total)).toBeNull();
  });

  it("is drawn under the list's heading", () => {
    const page = readFileSync(resolve(__dirname, "../../../app/(app)/deals/[id]/bridge/page.tsx"), "utf8");
    expect(page).toContain("listDealVersionsCounted(supabase, id)");
    expect(page).toContain("versionListCut(versions.length, versionTotal)");
  });
});

describe("the deal page's Bridge badge says what it counts", () => {
  it("says versions on the badge and in full in its title", () => {
    expect(versionBadge(214)).toEqual({
      text: "214 versions",
      title:
        "Assumption bridge — which input moved the IRR, and by how much. 214 saved versions of the deal's assumptions: the automatic snapshots of the model's inputs and the scenarios saved by hand.",
    });
    expect(versionBadge(1).text).toBe("1 version");
    const page = readFileSync(resolve(__dirname, "../../../app/(app)/deals/[id]/page.tsx"), "utf8");
    expect(page).toContain("{versionBadge(versionCount).text}");
    expect(page).toContain("title={versionBadge(versionCount).title}");
  });
});
