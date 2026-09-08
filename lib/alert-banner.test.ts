/**
 * The workspace-wide regulatory alert banner renders rows written outside the
 * request: only a real web URL ever becomes a link, and the headline is text.
 */
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const rows: Record<string, unknown>[] = [];

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/supabase/server", () => {
  const client = {
    from() {
      const q = {
        select: () => q,
        is: () => q,
        order: () => q,
        limit: () => q,
        then<T>(resolve: (v: { data: unknown; error: null }) => T) {
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        },
      };
      return q;
    },
  };
  return { createSupabaseServerClient: async () => client, getCurrentUser: async () => ({ id: "u1" }) };
});

import { RegulatoryAlertBanner } from "@/app/(app)/regulatory-alert-banner";

async function html(): Promise<string> {
  const el = await RegulatoryAlertBanner();
  return renderToStaticMarkup(el as React.ReactElement);
}

describe("RegulatoryAlertBanner", () => {
  it("drops a non-web URL and keeps the headline as text", async () => {
    rows.length = 0;
    rows.push({
      id: "a1",
      rule_id: "nyc-ll97",
      headline: "URGENT: re-verify <b>your</b> account",
      url: "javascript:alert(document.cookie)",
      detail: null,
    });
    const out = await html();
    // (React's own server-action form placeholder is a javascript: action;
    // the test is about the headline link.)
    expect(out).not.toContain('href="javascript:');
    expect(out).not.toContain("<a ");
    expect(out).toContain("URGENT: re-verify &lt;b&gt;your&lt;/b&gt; account");
  });

  it("keeps a real web URL as the link", async () => {
    rows.length = 0;
    rows.push({ id: "a2", rule_id: null, headline: "LL97 amendment filed", url: "https://legistar.council.nyc.gov/x", detail: null });
    const out = await html();
    expect(out).toContain('href="https://legistar.council.nyc.gov/x"');
    expect(out).toContain("LL97 amendment filed");
  });

  it("renders nothing without open alerts", async () => {
    rows.length = 0;
    expect(await RegulatoryAlertBanner()).toBeNull();
  });
});
