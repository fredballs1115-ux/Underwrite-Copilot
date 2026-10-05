// GET /api/email/picture/<token>?s=banner|thumb — the building's picture in
// an email (#464): the screen-complete email's banner and each deal's
// square in the Monday digest. An email client fetches it with no session,
// so the token is the permission (lib/email-picture: the deal's id, the
// person the email went to and an expiry, signed by the server), and nothing
// but the picture answers.
//
// That person must still be able to read the deal when the picture is
// asked for — its creator, or a member of its team, the share link's own
// rule (lib/share-access) — read through the service role on every request
// (research pass 22): the digest pictures a team's deals, and a member who
// left the team had kept seeing their current photographs for the link's
// year. A token minted before the recipient was carried names no one and
// serves as before until it expires (lib/email-picture).
//
// What is stored and nothing else — this never searches a memorandum: the
// deal's own photograph cut to the email's frame, else the deal's cover
// (its kind of building under its own sky, the one its card wears), as a
// JPEG, which every mail client draws, made once per process and kept
// (lib/email-picture-copy). A token that does not verify, a deal that is
// gone, a recipient who can no longer read it and the sample deal answer
// 404, and the email shows its alt text.

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { DealVisualCache } from "@/lib/deal-location";
import { readEmailPictureToken, type EmailPictureShape } from "@/lib/email-picture";
import { heldEmailPicture } from "@/lib/email-picture-copy";
import { senderStillHasAccess } from "@/lib/share-access";
import { shownAssetClass } from "@/lib/pipeline-slots";

const HEADERS = {
  "content-type": "image/jpeg",
  // The URL is the deal's own and unguessable; a mail client's image proxy
  // may keep it a day, and a replaced photograph shows from the next day.
  "cache-control": "public, max-age=86400",
  "x-content-type-options": "nosniff",
};

const gone = () => new NextResponse(null, { status: 404 });

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const claim = readEmailPictureToken(token);
  if (!claim) return gone();
  const { dealId } = claim;
  const shape: EmailPictureShape = new URL(req.url).searchParams.get("s") === "thumb" ? "thumb" : "banner";

  const admin = createSupabaseAdminClient();
  let deal: Record<string, unknown> | null = null;
  try {
    const { data } = await admin
      .from("deals")
      .select("id, user_id, team_id, photo, is_sample, asset_class, extracted_class:extraction->>assetClass")
      .eq("id", dealId)
      .maybeSingle();
    deal = (data as Record<string, unknown> | null) ?? null;
  } catch {
    deal = null;
  }
  if (!deal || deal.is_sample) return gone();

  // The person the email went to, as of now. A read that fails is a no.
  if (claim.recipient) {
    let reads = false;
    try {
      reads = await senderStillHasAccess(admin, claim.recipient, {
        user_id: (deal.user_id as string | null) ?? null,
        team_id: (deal.team_id as string | null) ?? null,
      });
    } catch {
      reads = false;
    }
    if (!reads) return gone();
  }

  const picture = ((deal.photo as DealVisualCache | null) ?? null)?.picture ?? null;
  const assetClass = shownAssetClass((deal.asset_class as string | null) ?? null, {
    assetClass: (deal.extracted_class as string | null) ?? null,
  });
  const copy = await heldEmailPicture(dealId, picture, assetClass, shape);
  if (!copy) return gone();
  return new NextResponse(new Uint8Array(copy.bytes), { headers: { ...HEADERS, "x-image-source": copy.source } });
}
