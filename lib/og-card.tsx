import "server-only";
import { ImageResponse } from "next/og";
import { SKYLINE_WIDTH, type SkylineShot } from "@/lib/skyline";
import { RunGate } from "@/lib/anthropic/run-gate";

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

/**
 * The width the card's skyline is fetched at: the route's default width,
 * the one most surfaces already ask for (so it is usually held), and wide
 * enough that a 2.5:1 panorama covers the card's 630px height — at 1280 it
 * was 512 tall and stretched.
 */
export const OG_PHOTO_WIDTH = SKYLINE_WIDTH.default;

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
 * The photograph's credit on the card, with the changes the card made to it:
 * the author and where the photograph is (Wikimedia Commons), the licence by
 * name and by its address, and that the card cropped it and set words over
 * it — "Photo: EEJCC via Wikimedia Commons · CC BY-SA 4.0,
 * https://creativecommons.org/licenses/by-sa/4.0 · cropped, words added".
 *
 * The card is an image, so it carries no link: the licence's address is
 * printed as text, exactly as the table holds it (lib/skyline's
 * `licenseUrl`, as the runner printed each file's page), so a card whose
 * photograph is under a 2.x or 3.0 licence names its licence's address too
 * (research pass 31, item 15). A public-domain photograph has no address and
 * the line names none. "words added" because the card is more than a crop:
 * the market's name, what the page holds and this credit are set over the
 * photograph. Null where the card cannot draw the author's name.
 */
export function cardPhotoCredit(shot: Pick<SkylineShot, "credit" | "license" | "licenseUrl">): string | null {
  const author = shot.credit && shot.credit !== "unknown" ? `${shot.credit} via Wikimedia Commons` : "Wikimedia Commons";
  const licence = shot.licenseUrl ? `${shot.license}, ${shot.licenseUrl}` : shot.license;
  const line = `Photo: ${author} · ${licence} · cropped, words added`;
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

/** Two cards drawn at once a process: each is next/og's render and a sharp
 *  composite, a second or so of CPU, and the route is public. */
const DRAW_GATE = new RunGate(() => 2);

/** The card: the photograph cut to 1200 × 630, the words laid over it, a
 *  JPEG. */
export async function marketCard(photo: Buffer, name: string, credit: string): Promise<Buffer> {
  const release = await DRAW_GATE.acquire();
  try {
    const sharp = (await import("sharp")).default;
    const words = await wordsLayer(name, credit);
    return await sharp(photo)
      .rotate()
      .resize(OG_CARD.width, OG_CARD.height, { fit: "cover", position: "centre" })
      .composite([{ input: words, top: 0, left: 0 }])
      .jpeg({ quality: 84, mozjpeg: true })
      .toBuffer();
  } finally {
    release();
  }
}

/**
 * The cards this process has drawn, one a market (the security review of
 * 2026-09-30): every ask for a market's card had fetched its photograph and
 * drawn the words and the JPEG anew. Now a card is drawn once a market a
 * process — the words change only with a deploy, the photograph only with
 * the table — and held like the photographs it is made from
 * (lib/skyline-fetch): bounded on count and on total bytes, oldest out
 * first, a failure kept by nobody so the next ask tries again, and one draw
 * a market at a time, shared by whoever asks while it runs.
 */
const CARD_MAX_ENTRIES = 64;
const CARD_MAX_TOTAL_BYTES = 12_000_000;
const cards = new Map<string, Buffer>();
let cardBytes = 0;
const drawing = new Map<string, Promise<Buffer | null>>();

function keepCard(key: string, card: Buffer) {
  const old = cards.get(key);
  if (old) {
    cardBytes -= old.byteLength;
    cards.delete(key);
  }
  cards.set(key, card);
  cardBytes += card.byteLength;
  while (cards.size > CARD_MAX_ENTRIES || cardBytes > CARD_MAX_TOTAL_BYTES) {
    const oldest = cards.keys().next().value;
    if (oldest === undefined || oldest === key) break;
    cardBytes -= cards.get(oldest)!.byteLength;
    cards.delete(oldest);
  }
}

/** Forget every held card (tests). */
export function forgetCards(): void {
  cards.clear();
  drawing.clear();
  cardBytes = 0;
}

/** The market's card from this process's copy, or drawn now by `draw` and
 *  kept; null where `draw` has nothing, and then nothing is kept. */
export async function cachedMarketCard(key: string, draw: () => Promise<Buffer | null>): Promise<Buffer | null> {
  const hit = cards.get(key);
  if (hit) {
    // Re-inserted, so a card in demand stays.
    keepCard(key, hit);
    return hit;
  }
  const running = drawing.get(key);
  if (running) return running;
  const work = (async () => {
    let card: Buffer | null = null;
    try {
      card = await draw();
    } catch {
      card = null;
    }
    if (card) keepCard(key, card);
    return card;
  })();
  drawing.set(key, work);
  try {
    return await work;
  } finally {
    drawing.delete(key);
  }
}
