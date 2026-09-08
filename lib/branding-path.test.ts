/**
 * A branding logo path is user-writable (the profiles.branding column grant)
 * and read back with the service role: the parser drops anything not shaped
 * like a logo, and the renderer refuses a logo outside the owner's folder.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeBranding } from "./branding";

const downloads: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        download: async (path: string) => {
          downloads.push(path);
          return { data: { arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer }, error: null };
        },
      }),
    },
  }),
}));

import { brandingLogoDataUri } from "./branding-server";

const USER = "11111111-1111-4111-8111-111111111111";
const TEAM = "55555555-5555-4555-8555-555555555555";
const OTHER = "33333333-3333-4333-8333-333333333333";

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  downloads.length = 0;
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => warnSpy.mockRestore());

describe("sanitizeBranding", () => {
  it("keeps a logo-shaped path and drops anything else", () => {
    expect(sanitizeBranding({ firmName: "Acme", logoPath: `${USER}/branding-logo-k3x9-ab12.png` })).toEqual({
      firmName: "Acme",
      logoPath: `${USER}/branding-logo-k3x9-ab12.png`,
    });
    expect(sanitizeBranding({ firmName: "Acme", logoPath: `${OTHER}/${OTHER}.pdf` })).toEqual({ firmName: "Acme" });
    expect(sanitizeBranding({ logoPath: "documents/x/y-rent-roll.xlsx" })).toBeNull();
  });
});

describe("brandingLogoDataUri", () => {
  it("reads the owner's logo, or the team's", async () => {
    const uri = await brandingLogoDataUri(
      { logoPath: `${TEAM}/branding-logo-k3x9-ab12.jpg` },
      { userId: USER, teamId: TEAM },
    );
    expect(uri).toBe(`data:image/jpeg;base64,${Buffer.from([1, 2, 3]).toString("base64")}`);
    expect(downloads).toEqual([`${TEAM}/branding-logo-k3x9-ab12.jpg`]);
  });

  it("refuses a logo in someone else's folder — text-only branding, nothing downloaded", async () => {
    const uri = await brandingLogoDataUri(
      { logoPath: `${OTHER}/branding-logo-k3x9-ab12.png` },
      { userId: USER, teamId: null },
    );
    expect(uri).toBeNull();
    expect(downloads).toEqual([]);
  });
});
