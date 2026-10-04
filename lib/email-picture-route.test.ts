import { createHmac } from "node:crypto";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DealPicture } from "./deal-location";

// The public route an email draws the building from (#464), driven through
// the real route and its real kept copy (lib/email-picture-copy) with the
// reads faked: the deal row, the team's members and the stored photograph.
const route = vi.hoisted(() => ({
  deals: [] as Record<string, unknown>[],
  members: [] as { team_id: string; user_id: string }[],
  membersThrow: false,
  bytes: null as Buffer | null,
  asked: [] as { dealId: string; size: string }[],
}));

/** Tables of rows; `maybeSingle` answers the first row matching every eq. */
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      const filters: [string, unknown][] = [];
      const q = {
        select: () => q,
        eq: (k: string, v: unknown) => {
          filters.push([k, v]);
          return q;
        },
        maybeSingle: async () => {
          const rows: Record<string, unknown>[] = table === "team_members" ? route.members : route.deals;
          if (table === "team_members" && route.membersThrow) throw new Error("connection reset");
          return { data: rows.find((r) => filters.every(([k, v]) => r[k] === v)) ?? null, error: null };
        },
      };
      return q;
    },
  }),
}));
vi.mock("@/lib/deal-picture", () => ({
  picturePathFor: (p: DealPicture, size: string) => (size === "thumb" ? p.thumb : size === "full" ? (p.full ?? p.hero) : p.hero),
  readPictureBytes: async (dealId: string, _picture: unknown, size: string) => {
    route.asked.push({ dealId, size });
    // Slow enough that asks sent together arrive while it is being made.
    await new Promise((r) => setTimeout(r, 20));
    if (!route.bytes) throw new Error("gone");
    return route.bytes;
  },
}));

import { GET } from "@/app/api/email/picture/[token]/route";
import { EMAIL_PICTURE_DAYS, emailPictureToken } from "./email-picture";
import { forgetEmailPictures } from "./email-picture-copy";
import { coverFor } from "./deal-cover";
import { coverSvg } from "./deal-cover-art";

const DEAL = "3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b";
const OTHER_DEAL = "7c6b5a49-3827-4615-8a4b-3c2d1e0f9a8b";
const TEAM = "5d4c3b2a-1f0e-4d9c-8b7a-6f5e4d3c2b1a";
const OWNER = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const MEMBER = "11111111-2222-4333-8444-555555555555";
const STRANGER = "66666666-7777-4888-9999-aaaaaaaaaaaa";
const PICTURE: DealPicture = {
  hero: `photos/${DEAL}/1-hero.jpg`,
  thumb: `photos/${DEAL}/1-thumb.jpg`,
  width: 1600,
  height: 1067,
  source: "om",
  at: "2026-09-01T00:00:00Z",
};
let saved: string | undefined;

const dealRow = (over: Record<string, unknown> = {}) => ({
  id: DEAL,
  user_id: OWNER,
  team_id: null,
  photo: { picture: PICTURE },
  is_sample: false,
  asset_class: "auto",
  extracted_class: "Garden multifamily",
  ...over,
});

const ask = (token: string, shape?: string) =>
  GET(new Request(`http://x/api/email/picture/${token}${shape ? `?s=${shape}` : ""}`), {
    params: Promise.resolve({ token }),
  });

/**
 * A token as the server minted it before the recipient was carried: the
 * deal and an expiry, signed under the same key and label (lib/email-picture).
 */
function legacyToken(dealId: string): string {
  const key = createHmac("sha256", "test-service-role-key").update("underwrite-copilot/email-picture/v1").digest();
  const body = `${dealId}.${(Math.floor(Date.now() / 1000) + EMAIL_PICTURE_DAYS * 86_400).toString(36)}`;
  return `${body}.${createHmac("sha256", key).update(body).digest("base64url").slice(0, 22)}`;
}

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
let stored: Buffer;

describe("the email's picture route (#464)", () => {
  beforeEach(async () => {
    saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    route.deals = [dealRow()];
    route.members = [];
    route.membersThrow = false;
    stored ??= await photo();
    route.bytes = stored;
    route.asked = [];
    forgetEmailPictures();
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  });

  it("answers the building's photograph cut to the banner, as a JPEG any mail client draws", async () => {
    const res = await ask(emailPictureToken(DEAL, OWNER)!, "banner");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("x-image-source")).toBe("photo");
    expect(res.headers.get("cache-control")).toContain("public");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height, meta.format]).toEqual([1040, 520, "jpeg"]);
    expect(route.asked).toEqual([{ dealId: DEAL, size: "hero" }]);
  });

  it("answers the stored square for a digest row", async () => {
    const res = await ask(emailPictureToken(DEAL, OWNER)!, "thumb");
    const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata();
    expect([meta.width, meta.height]).toEqual([96, 96]);
    expect(route.asked).toEqual([{ dealId: DEAL, size: "thumb" }]);
  });

  it("draws the deal's cover where it has no photograph, or the stored one cannot be read", async () => {
    // The cover the card wears for this deal, laid out for each frame: the
    // JPEG is that document drawn, within the JPEG's own loss.
    const cover = coverFor({ seed: DEAL, assetClass: "multifamily" });
    const same = async (res: Response, w: number, h: number) => {
      const got = await sharp(Buffer.from(await res.arrayBuffer())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
      const want = await sharp(Buffer.from(coverSvg(cover, w, h))).removeAlpha().raw().toBuffer();
      expect([got.info.width, got.info.height]).toEqual([w, h]);
      let diff = 0;
      for (let i = 0; i < want.length; i++) diff += Math.abs(got.data[i] - want[i]);
      expect(diff / want.length).toBeLessThan(3);
    };
    route.deals = [dealRow({ photo: null })];
    const res = await ask(emailPictureToken(DEAL, OWNER)!, "banner");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-image-source")).toBe("cover");
    await same(res, 1040, 520);

    route.deals = [dealRow()];
    route.bytes = null;
    const unreadable = await ask(emailPictureToken(DEAL, OWNER)!, "thumb");
    expect(unreadable.headers.get("x-image-source")).toBe("cover");
    await same(unreadable, 96, 96);
    // A storage failure is not kept: once the file reads again, the photograph.
    route.bytes = stored;
    expect((await ask(emailPictureToken(DEAL, OWNER)!, "thumb")).headers.get("x-image-source")).toBe("photo");
  });

  it("answers 404 to a token that does not verify, a deal that is gone and the sample deal", async () => {
    expect((await ask("not-a-token")).status).toBe(404);
    const token = emailPictureToken(DEAL, OWNER)!;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "rotated";
    expect((await ask(token)).status).toBe(404);
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    route.deals = [];
    expect((await ask(token)).status).toBe(404);
    route.deals = [dealRow({ is_sample: true })];
    expect((await ask(token)).status).toBe(404);
    expect(route.asked).toEqual([]);
  });

  it("makes the copy once: asks together share the making, and every recipient's link one copy", async () => {
    route.deals = [dealRow({ team_id: TEAM })];
    route.members = [{ team_id: TEAM, user_id: MEMBER }];
    const owner = emailPictureToken(DEAL, OWNER)!;
    const together = await Promise.all(Array.from({ length: 6 }, () => ask(owner, "banner")));
    expect(together.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
    const bodies = await Promise.all(together.map(async (r) => Buffer.from(await r.arrayBuffer())));
    expect(bodies.every((b) => b.equals(bodies[0]))).toBe(true);
    // A teammate's own link, and the same link later: the kept copy.
    expect((await ask(emailPictureToken(DEAL, MEMBER)!, "banner")).status).toBe(200);
    expect((await ask(owner, "banner")).status).toBe(200);
    expect(route.asked).toEqual([{ dealId: DEAL, size: "hero" }]);
    // Another frame is another copy; a replaced photograph (a new stored
    // path) is made fresh, never served from the old one's copy.
    expect((await ask(owner, "thumb")).status).toBe(200);
    route.deals = [dealRow({ team_id: TEAM, photo: { picture: { ...PICTURE, hero: `photos/${DEAL}/2-hero.jpg` } } })];
    expect((await ask(owner, "banner")).status).toBe(200);
    expect(route.asked).toEqual([
      { dealId: DEAL, size: "hero" },
      { dealId: DEAL, size: "thumb" },
      { dealId: DEAL, size: "hero" },
    ]);
  });

  it("answers 404 to a member who has left the team, though the deal's picture is kept", async () => {
    route.deals = [dealRow({ team_id: TEAM })];
    route.members = [{ team_id: TEAM, user_id: MEMBER }];
    const member = emailPictureToken(DEAL, MEMBER)!;
    expect((await ask(member, "thumb")).status).toBe(200);
    route.members = [];
    expect((await ask(member, "thumb")).status).toBe(404);
    // The deal's creator still sees it; someone never on the team never did.
    expect((await ask(emailPictureToken(DEAL, OWNER)!, "thumb")).status).toBe(200);
    expect((await ask(emailPictureToken(DEAL, STRANGER)!, "thumb")).status).toBe(404);
    // A personal deal is its creator's alone, and a membership read that
    // fails is a no.
    route.deals = [dealRow()];
    route.members = [{ team_id: TEAM, user_id: MEMBER }];
    expect((await ask(member, "thumb")).status).toBe(404);
    route.deals = [dealRow({ team_id: TEAM })];
    route.membersThrow = true;
    expect((await ask(member, "thumb")).status).toBe(404);
    expect(route.asked).toEqual([{ dealId: DEAL, size: "thumb" }]);
  });

  it("still serves a link signed before the recipient was carried, until it expires", async () => {
    route.deals = [dealRow({ team_id: TEAM })];
    const res = await ask(legacyToken(DEAL), "banner");
    expect(res.status).toBe(200);
    expect(res.headers.get("x-image-source")).toBe("photo");
  });

  it("cannot be replayed for another deal or another person", async () => {
    route.deals = [dealRow({ team_id: TEAM }), dealRow({ id: OTHER_DEAL, team_id: TEAM })];
    route.members = [{ team_id: TEAM, user_id: MEMBER }];
    const token = emailPictureToken(DEAL, OWNER)!;
    const [, , exp, sig] = token.split(".");
    expect((await ask(token, "thumb")).status).toBe(200);
    // Both deals are ones the owner and the member can read: only the
    // signature stands between this token and the other deal or person.
    expect((await ask(`${OTHER_DEAL}.${OWNER}.${exp}.${sig}`, "thumb")).status).toBe(404);
    expect((await ask(`${DEAL}.${MEMBER}.${exp}.${sig}`, "thumb")).status).toBe(404);
    expect((await ask(`${DEAL}.${exp}.${sig}`, "thumb")).status).toBe(404);
    const [, lexp, lsig] = legacyToken(DEAL).split(".");
    expect((await ask(`${OTHER_DEAL}.${lexp}.${lsig}`, "thumb")).status).toBe(404);
    expect((await ask(`${DEAL}.${MEMBER}.${lexp}.${lsig}`, "thumb")).status).toBe(404);
  });
});
