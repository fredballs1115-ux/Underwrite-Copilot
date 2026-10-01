/**
 * A branding logo path is user-writable (the profiles.branding column grant)
 * and read back with the service role: the parser drops anything not shaped
 * like a logo, and the renderer refuses a logo outside the owner's folder —
 * and bytes that are not an intact picture, which react-pdf would hang on.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sanitizeBranding } from "./branding";
import { CORRUPT_PNG, TINY_PNG } from "./memo/test-png";

// A JPEG's skeleton: start marker, some bytes, end marker.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1), Buffer.from([0xff, 0xd9])]);

const state = vi.hoisted(() => ({ body: null as Buffer | null }));
const downloads: string[] = [];
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    storage: {
      from: () => ({
        download: async (path: string) => {
          downloads.push(path);
          const body = state.body!;
          return {
            data: { arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) },
            error: null,
          };
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
  state.body = JPEG;
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
    expect(uri).toBe(`data:image/jpeg;base64,${JPEG.toString("base64")}`);
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

  it("hands react-pdf only an intact picture of the type its name claims — text-only branding otherwise", async () => {
    const png = { logoPath: `${USER}/branding-logo-k3x9-ab12.png` };
    const jpg = { logoPath: `${USER}/branding-logo-k3x9-ab12.jpg` };
    const owner = { userId: USER, teamId: null };
    state.body = TINY_PNG;
    expect(await brandingLogoDataUri(png, owner)).toBe(`data:image/png;base64,${TINY_PNG.toString("base64")}`);
    // A PNG whose zlib stream fails its check: a browser paints it, react-pdf
    // hangs the whole render on it.
    state.body = CORRUPT_PNG;
    expect(await brandingLogoDataUri(png, owner)).toBeNull();
    // Cut short, or not the type its name claims.
    state.body = TINY_PNG.subarray(0, TINY_PNG.length - 6);
    expect(await brandingLogoDataUri(png, owner)).toBeNull();
    state.body = TINY_PNG;
    expect(await brandingLogoDataUri(jpg, owner)).toBeNull();
    state.body = Buffer.from([1, 2, 3]);
    expect(await brandingLogoDataUri(jpg, owner)).toBeNull();
  });
});
