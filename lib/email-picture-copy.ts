import "server-only";
import sharp from "sharp";
import type { DealPicture } from "@/lib/deal-location";
import { picturePathFor, readPictureBytes } from "@/lib/deal-picture";
import { coverFor } from "@/lib/deal-cover";
import { COVER_EDITION, coverSvg } from "@/lib/deal-cover-art";
import { EMAIL_PICTURE, type EmailPictureShape } from "@/lib/email-picture";
import { HeldCopies } from "@/lib/held-copies";
import { RunGate } from "@/lib/anthropic/run-gate";

/**
 * The email's picture as the route serves it (research pass 22): the deal's
 * stored photograph cut to the email's frame, else its cover drawn there,
 * made once per process and kept. The route downloaded the photograph and
 * ran sharp on every request, kept nothing and had no limit on how many ran
 * at once, for a link that lives a year in every inbox it was sent to.
 *
 *   - A photograph is kept under its STORED PATH and the frame, so a
 *     replaced photograph (a new path) is made fresh, and every recipient's
 *     link to the same picture shares one copy. The cover is kept under what
 *     it is drawn from: the deal, the class it is drawn as, the drawing's
 *     edition and the frame.
 *   - Asks that arrive while a copy is being made share that making.
 *   - At most `EMAIL_PICTURE_IN_FLIGHT` makings run at once; a making that
 *     finds no turn within `EMAIL_PICTURE_TURN_MS` is a failure, and nothing
 *     keeps it.
 *   - A failure is kept by nobody, so the next ask tries again. A stored
 *     photograph that cannot be read gives the cover, under the cover's key,
 *     never under the photograph's: a passing storage failure must not pin
 *     the cover in place of the photograph.
 *
 * The route checks the token and the recipient's access BEFORE it asks for
 * a copy, so a kept copy is never a way past either.
 */

export interface EmailPictureCopy {
  bytes: Buffer;
  /** what it is a picture of, for the route's `x-image-source` */
  source: "photo" | "cover";
}

/** How many copies, and how many bytes of them, this process keeps. A
 *  banner is 1040 × 520 and finishes at roughly 60–200 KB; a digest's
 *  square at a few KB. */
export const MAX_HELD_EMAIL_PICTURES = 64;
export const MAX_HELD_EMAIL_PICTURE_BYTES = 8_000_000;

/** Makings at once in this process: a digest's squares arrive together, and
 *  four at a time keeps a burst from decoding more than four photographs at
 *  once. */
export const EMAIL_PICTURE_IN_FLIGHT = 4;
const EMAIL_PICTURE_TURN_MS = 15_000;

const held = new HeldCopies<EmailPictureCopy>(MAX_HELD_EMAIL_PICTURES, MAX_HELD_EMAIL_PICTURE_BYTES);
const turns = new RunGate(() => EMAIL_PICTURE_IN_FLIGHT);

/** One making, inside a turn: null where no turn came free in time or the
 *  making failed. */
async function inTurn(make: () => Promise<EmailPictureCopy>): Promise<EmailPictureCopy | null> {
  const release = await turns.acquireWithin(EMAIL_PICTURE_TURN_MS);
  if (!release) return null;
  try {
    return await make();
  } catch {
    return null;
  } finally {
    release();
  }
}

/**
 * The deal's picture for an email's frame: its stored photograph where one
 * is stored and can be read (the digest's square from the stored crop, the
 * banner from the hero cut by what the frame's attention falls on), else its
 * cover. Null only where neither could be made.
 */
export async function heldEmailPicture(
  dealId: string,
  picture: DealPicture | null,
  assetClass: string | null,
  shape: EmailPictureShape,
): Promise<EmailPictureCopy | null> {
  const { w, h } = EMAIL_PICTURE[shape];
  if (picture) {
    const size = shape === "thumb" ? "thumb" : "hero";
    const photo = await held.take(`photo:${picturePathFor(picture, size)}:${shape}`, () =>
      inTurn(async () => {
        const bytes = await readPictureBytes(dealId, picture, size);
        const out = await sharp(bytes, { failOn: "none" })
          .rotate()
          .resize({ width: w, height: h, fit: "cover", position: "attention" })
          .jpeg({ quality: 82, mozjpeg: true })
          .toBuffer();
        return { bytes: out, source: "photo" };
      }),
    );
    if (photo) return photo;
  }
  return held.take(`cover:${dealId}:${assetClass ?? ""}:${COVER_EDITION}:${shape}`, () =>
    inTurn(async () => {
      // Laid out for the frame: the banner's scene wide, the square's simpler.
      const cover = coverFor({ seed: dealId, assetClass });
      const out = await sharp(Buffer.from(coverSvg(cover, w, h))).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
      return { bytes: out, source: "cover" };
    }),
  );
}

/** Forget every kept copy (tests). */
export function forgetEmailPictures(): void {
  held.forget();
}
