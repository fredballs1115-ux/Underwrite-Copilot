// GET /api/email/picture/<token>?s=banner|thumb — the building's picture in
// an email (#464): the screen-complete email's banner and each deal's
// square in the Monday digest. An email client fetches it with no session,
// so the token is the whole permission (lib/email-picture: the deal's id
// and an expiry, signed by the server), and nothing but the picture answers.
//
// What is stored and nothing else — this never searches a memorandum: the
// deal's own photograph cut to the email's frame, else the deal's cover
// (its kind of building under its own sky, the one its card wears), as a
// JPEG, which every mail client draws. A token that does not verify, a deal
// that is gone and the sample deal answer 404, and the email shows its alt
// text.

import { NextResponse } from "next/server";
import sharp from "sharp";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DealVisualCache } from "@/lib/deal-location";
import { readPictureBytes } from "@/lib/deal-picture";
import { coverFor } from "@/lib/deal-cover";
import { coverSvg } from "@/lib/deal-cover-art";
import { EMAIL_PICTURE, readEmailPictureToken, type EmailPictureShape } from "@/lib/email-picture";
import { shownAssetClass } from "@/lib/pipeline-slots";

const HEADERS = {
  "content-type": "image/jpeg",
  // The URL is the deal's own and unguessable; a mail client's image proxy
  // may keep it a day, and a replaced photograph shows from the next day.
  "cache-control": "public, max-age=86400",
  "x-content-type-options": "nosniff",
};

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const dealId = readEmailPictureToken(token);
  if (!dealId) return new NextResponse(null, { status: 404 });
  const shape: EmailPictureShape = new URL(req.url).searchParams.get("s") === "thumb" ? "thumb" : "banner";
  const { w, h } = EMAIL_PICTURE[shape];

  let deal: Record<string, unknown> | null = null;
  try {
    const { data } = await createSupabaseAdminClient()
      .from("deals")
      .select("id, photo, is_sample, asset_class, extracted_class:extraction->>assetClass")
      .eq("id", dealId)
      .maybeSingle();
    deal = (data as Record<string, unknown> | null) ?? null;
  } catch {
    deal = null;
  }
  if (!deal || deal.is_sample) return new NextResponse(null, { status: 404 });

  // The deal's own photograph: the stored crop for a digest's square, the
  // hero cut to the banner by what the frame's attention falls on.
  const picture = ((deal.photo as DealVisualCache | null) ?? null)?.picture ?? null;
  if (picture) {
    try {
      const bytes = await readPictureBytes(dealId, picture, shape === "thumb" ? "thumb" : "hero");
      const out = await sharp(bytes, { failOn: "none" })
        .rotate()
        .resize({ width: w, height: h, fit: "cover", position: "attention" })
        .jpeg({ quality: 82, mozjpeg: true })
        .toBuffer();
      return new NextResponse(new Uint8Array(out), { headers: { ...HEADERS, "x-image-source": "photo" } });
    } catch {
      // The stored file is unreadable: the cover below, never a blank.
    }
  }

  const cover = coverFor({
    seed: dealId,
    assetClass: shownAssetClass((deal.asset_class as string | null) ?? null, {
      assetClass: (deal.extracted_class as string | null) ?? null,
    }),
  });
  try {
    // Laid out for the frame: the banner's scene wide, the square's simpler.
    const out = await sharp(Buffer.from(coverSvg(cover, w, h))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    return new NextResponse(new Uint8Array(out), { headers: { ...HEADERS, "x-image-source": "cover" } });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}
