// GET /api/og/market/[id] — a market page's link preview (#436): the
// market's photograph with its name, what the page holds and the
// photograph's credit set on it, as a 1200 × 630 JPEG (lib/og-card).
//
// PUBLIC, as the page it previews is: a crawler asks for it without a
// session. The `id` is looked up in the public page catalogue, never
// trusted, so nothing here points at an arbitrary place.
//
// The market's own skyline first, where the card can print its credit
// (lib/og-card `cardPhotoCredit`); then the business district from above,
// public domain; and where neither answers, the site's own branded card —
// a preview is never an empty frame.

import { NextResponse } from "next/server";
import { marketPageFor } from "@/lib/public-pages";
import { skylineFor } from "@/lib/skyline";
import { fetchSkylinePhoto } from "@/lib/skyline-fetch";
import { fetchMetroOverhead } from "@/lib/metro-overhead";
import {
  OG_CARD,
  OG_PHOTO_WIDTH,
  OVERHEAD_CARD_CREDIT,
  cachedMarketCard,
  cardPhotoCredit,
  marketCard,
} from "@/lib/og-card";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const page = marketPageFor(id);
  if (!page) return new NextResponse(null, { status: 404 });

  // Drawn once a market a process and held (lib/og-card): a crawler's
  // second ask, or anyone's, is the card already drawn.
  const card = await cachedMarketCard(page.id, async () => {
    let photo: Buffer | null = null;
    let credit: string | null = null;
    const shot = skylineFor(page.id);
    const shotCredit = shot ? cardPhotoCredit(shot) : null;
    if (shot && shotCredit) {
      const got = await fetchSkylinePhoto(page.id, OG_PHOTO_WIDTH);
      if (got) {
        photo = Buffer.from(got.body);
        credit = shotCredit;
      }
    }
    if (!photo) {
      const got = await fetchMetroOverhead(page.id, OG_CARD.width, OG_CARD.height);
      if (got) {
        photo = got.bytes;
        credit = OVERHEAD_CARD_CREDIT;
      }
    }
    return photo && credit ? marketCard(photo, page.name, credit) : null;
  });
  // Nothing to picture the market with: the site's own card, never a blank.
  if (!card) {
    return new NextResponse(null, { status: 307, headers: { location: "/opengraph-image" } });
  }
  return new NextResponse(new Uint8Array(card), {
    headers: {
      "content-type": "image/jpeg",
      // A day: the photograph does not change under its name, and the words
      // change only with a deploy. Public — a preview is fetched by crawlers.
      "cache-control": "public, max-age=86400",
    },
  });
}
