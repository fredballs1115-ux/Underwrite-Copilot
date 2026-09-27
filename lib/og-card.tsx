import "server-only";
import { ImageResponse } from "next/og";
import type { SkylineShot } from "@/lib/skyline";

// A market page's link preview (#436): the market's own photograph — the
// skyline the page opens on — with its name, what the page holds and the
// photograph's credit set on it, the card Slack, LinkedIn and iMessage show
// when someone shares the page. It had been the site's one branded card for
// every market, under a title from the homepage.
//
// The words are drawn by next/og (its own bundled Geist, so the card never
// depends on the fonts a server happens to have) as a transparent layer,
// and sharp lays that layer over the photograph and writes a JPEG — a
// photograph as a PNG is megabytes where a JPEG is a tenth of that.

export const OG_CARD = { width: 1200, height: 630 } as const;

/** The overhead's credit, where a market's card falls back to it: a US
 *  federal work in the public domain. */
export const OVERHEAD_CARD_CREDIT = "Imagery: USGS The National Map (public domain)";

/**
 * Whether the card's font can draw a line. Geist carries Latin-1 whole and
 * the dashes, quotes and middle dot, and not every script a photographer's
 * name may be written in — Philadelphia's is credited as 颐园居 — and a
 * credit the card cannot print is a licence the card cannot honour, so such
 * a photograph stays off the card (the overhead stands in).
 */
export function cardCanDraw(text: string): boolean {
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0x20 && cp <= 0x7e) continue;
    if (cp >= 0xa0 && cp <= 0xff) continue;
    if (cp >= 0x2010 && cp <= 0x2027) continue; // dashes, quotes, bullet, ellipsis
    return false;
  }
  return true;
}

/**
 * The photograph's credit on the card, with the change the card made to it:
 * the author, the licence and "cropped", which a CC licence asks to be said.
 * Null where the card cannot draw the author's name.
 */
export function cardPhotoCredit(shot: Pick<SkylineShot, "credit" | "license">): string | null {
  const author = shot.credit && shot.credit !== "unknown" ? shot.credit : "Wikimedia Commons";
  const line = `Photo: ${author}, ${shot.license}, cropped (Wikimedia Commons)`;
  return cardCanDraw(line) ? line : null;
}

/** The words over the photograph, as a transparent 1200 × 630 layer: the
 *  brand top-left, then the eyebrow, the market's name, what the page holds
 *  and the credit, over a scrim that clears toward the top so the skyline
 *  stays the picture. */
async function wordsLayer(name: string, credit: string): Promise<Buffer> {
  const layer = new ImageResponse(
    (
      <div style={{ width: OG_CARD.width, height: OG_CARD.height, display: "flex", position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: OG_CARD.width,
            height: OG_CARD.height,
            backgroundImage:
              "linear-gradient(to bottom, rgba(12,51,56,0) 32%, rgba(12,51,56,0.55) 58%, rgba(12,51,56,0.94) 100%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            left: 56,
            top: 48,
            display: "flex",
            alignItems: "center",
            padding: "10px 18px",
            borderRadius: 999,
            backgroundColor: "rgba(12,51,56,0.78)",
            color: "#ffffff",
            fontSize: 24,
          }}
        >
          Underwrite Copilot
        </div>
        <div
          style={{
            position: "absolute",
            left: 56,
            right: 56,
            bottom: 40,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ fontSize: 22, letterSpacing: 3, color: "#7fd6cc" }}>MARKET DATA</div>
          <div style={{ fontSize: 76, lineHeight: 1.05, color: "#ffffff", marginTop: 8 }}>{name}</div>
          <div style={{ fontSize: 28, color: "rgba(255,255,255,0.88)", marginTop: 14 }}>
            Rents, vacancy, jobs and supply, each figure dated and sourced
          </div>
          <div style={{ fontSize: 16, color: "rgba(255,255,255,0.72)", marginTop: 22 }}>{credit}</div>
        </div>
      </div>
    ),
    { width: OG_CARD.width, height: OG_CARD.height },
  );
  return Buffer.from(await layer.arrayBuffer());
}

/** The card: the photograph cut to 1200 × 630, the words laid over it, a
 *  JPEG. */
export async function marketCard(photo: Buffer, name: string, credit: string): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const words = await wordsLayer(name, credit);
  return sharp(photo)
    .rotate()
    .resize(OG_CARD.width, OG_CARD.height, { fit: "cover", position: "centre" })
    .composite([{ input: words, top: 0, left: 0 }])
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
}
