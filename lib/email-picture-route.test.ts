import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DealPicture } from "./deal-location";

// The public route an email draws the building from (#464), driven with its
// reads faked: the deal row and the stored photograph.
const route = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  bytes: null as Buffer | null,
  asked: [] as { dealId: string; size: string }[],
}));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: (_col: string, id: string) => ({
          maybeSingle: async () => ({ data: route.row && route.row.id === id ? route.row : null }),
        }),
      }),
    }),
  }),
}));
vi.mock("@/lib/deal-picture", () => ({
  readPictureBytes: async (dealId: string, _picture: unknown, size: string) => {
    route.asked.push({ dealId, size });
    if (!route.bytes) throw new Error("gone");
    return route.bytes;
  },
}));

import { GET } from "@/app/api/email/picture/[token]/route";
import { emailPictureToken } from "./email-picture";
import { coverFor } from "./deal-cover";

const DEAL = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";
const PICTURE: DealPicture = {
  hero: `photos/${DEAL}/1-hero.jpg`,
  thumb: `photos/${DEAL}/1-thumb.jpg`,
  width: 1600,
  height: 1067,
  source: "om",
  at: "2026-09-01T00:00:00Z",
};
let saved: string | undefined;

const ask = (token: string, shape?: string) =>
  GET(new Request(`http://x/api/email/picture/${token}${shape ? `?s=${shape}` : ""}`), {
    params: Promise.resolve({ token }),
  });

/** A photograph: a warm left half and a cool right half. */
async function photo(): Promise<Buffer> {
  const w = 1600;
  const h = 1067;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      raw[i] = x < w / 2 ? 200 : 40;
      raw[i + 1] = 120;
      raw[i + 2] = x < w / 2 ? 60 : 190;
    }
  }
  return sharp(raw, { raw: { width: w, height: h, channels: 3 } }).jpeg().toBuffer();
}

describe("the email's picture route (#464)", () => {
  beforeEach(async () => {
    saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    route.row = { id: DEAL, photo: { picture: PICTURE }, is_sample: false, asset_class: "auto", extracted_class: "Garden multifamily" };
    route.bytes = await photo();
    route.asked = [];
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  });

  it("answers the building's photograph cut to the banner, as a JPEG any mail client draws", async () => {
    const res = await ask(emailPictureToken(DEAL)!, "banner");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-image-source")).toBe("photo");
    expect(res.headers.get("cache-control")).toContain("public");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1040, 520, "jpeg"]);
    expect(route.asked).toEqual([{ dealId: DEAL, size: "hero" }]);
  });

  it("answers the stored square for a digest row", async () => {
    const res = await ask(emailPictureToken(DEAL)!, "thumb");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([96, 96]);
    expect(route.asked).toEqual([{ dealId: DEAL, size: "thumb" }]);
  });

  it("draws the deal's cover where it has no photograph, or the stored one cannot be read", async () => {
    route.row = { ...route.row!, photo: null };
    const res = await ask(emailPictureToken(DEAL)!, "banner");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-image-source")).toBe("cover");
    const { data, info } = await sharp(Buffer.from(await res.arrayBuffer())).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([1040, 520]);
    // The ground is the card's own gradient for this deal: its corner is
    // near the tone's light stop, never white or black.
    const [light] = coverFor({ seed: DEAL, assetClass: "multifamily" }).tone;
    const hex = (i: number) => parseInt(light.slice(1 + 2 * i, 3 + 2 * i), 16);
    for (let c = 0; c < 3; c++) expect(Math.abs(data[c] - hex(c))).toBeLessThan(40);

    route.row = { ...route.row!, photo: { picture: PICTURE } };
    route.bytes = null;
    const unreadable = await ask(emailPictureToken(DEAL)!, "thumb");
    expect(unreadable.headers.get("x-image-source")).toBe("cover");
    const meta = await sharp(Buffer.from(await unreadable.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([96, 96]);
  });

  it("answers 404 to a token that does not verify, a deal that is gone and the sample deal", async () => {
    expect((await ask("not-a-token")).status).toBe(404);
    const token = emailPictureToken(DEAL)!;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "rotated";
    expect((await ask(token)).status).toBe(404);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    route.row = null;
    expect((await ask(token)).status).toBe(404);
    route.row = { id: DEAL, photo: { picture: PICTURE }, is_sample: true };
    expect((await ask(token)).status).toBe(404);
    expect(route.asked).toEqual([]);
  });
});
