import sharp from "sharp";
import { describe, expect, it } from "vitest";
import {
  COVER_PAGES,
  IMAGE_KIND,
  coverShaped,
  decodeOmCover,
  isGrey,
  pickDecodedCover,
  type ImageCandidate,
} from "./om-photo-decode";
import { findOmImages, pickCover } from "./om-photo";
import { PICTURE_SEARCH_VERSION, coverOf, derivePicture, pictureMayBeInMemorandum, searchedRecently } from "./deal-picture";
import { testMemorandum, testPicture, testPixels, type Security } from "./test-memorandum";

const W = 800;
const H = 500;

/** Each channel's mean over a picture's pixels. */
function means(pixels: ArrayLike<number>, channels: number): number[] {
  const sums = [0, 0, 0];
  const count = pixels.length / channels;
  for (let i = 0; i < pixels.length; i += channels) {
    sums[0] += pixels[i];
    sums[1] += pixels[i + 1];
    sums[2] += pixels[i + 2];
  }
  return sums.map((s) => s / count);
}

const SOURCE_MEANS = means(testPixels(W, H), 3);
const logo = () => testPicture(200, 80, "png");

function candidate(over: Partial<ImageCandidate>): ImageCandidate {
  return { width: 1600, height: 1000, kind: IMAGE_KIND.rgb, page: 1, grey: false, ...over };
}

describe("which painted image is the cover", () => {
  it("takes a colour picture of a photograph's size and shape, and nothing else", () => {
    expect(coverShaped(candidate({}))).toBe(true);
    expect(coverShaped(candidate({ kind: IMAGE_KIND.rgba }))).toBe(true);
    expect(coverShaped(candidate({ kind: IMAGE_KIND.mask }))).toBe(false);
    expect(coverShaped(candidate({ grey: true }))).toBe(false);
    expect(coverShaped(candidate({ width: 400, height: 300 }))).toBe(false);
    // A banner or a strip is not a photograph's shape.
    expect(coverShaped(candidate({ width: 3000, height: 600 }))).toBe(false);
  });

  it("prefers page one over a slightly larger picture further in, but not over a much larger one", () => {
    const first = candidate({ width: 800, height: 500, page: 1 });
    const slightlyLarger = candidate({ width: 900, height: 560, page: 2 });
    const muchLarger = candidate({ width: 1600, height: 1000, page: 3 });
    expect(pickDecodedCover([slightlyLarger, first])).toBe(first);
    expect(pickDecodedCover([first, muchLarger])).toBe(muchLarger);
    expect(pickDecodedCover([candidate({ grey: true }), candidate({ kind: IMAGE_KIND.mask })])).toBeNull();
    expect(pickDecodedCover([])).toBeNull();
  });

  it("reads greyscale from the pixels, since a grey picture arrives as RGB", () => {
    expect(isGrey(Uint8Array.from([10, 10, 10, 200, 200, 200]), 3)).toBe(true);
    expect(isGrey(Uint8Array.from([10, 10, 10, 200, 201, 200]), 3)).toBe(false);
    expect(isGrey(Uint8Array.from([10, 10, 10, 255, 90, 90, 90, 128]), 4)).toBe(true);
    expect(isGrey(new Uint8Array(0), 3)).toBe(true);
  });
});

describe("the cover of a memorandum the byte scan cannot read", () => {
  it("is invisible to the byte scan once the file is secured", async () => {
    const plain = await testMemorandum([{ images: [await testPicture(W, H, "jpeg")] }]);
    const locked = await testMemorandum([{ images: [await testPicture(W, H, "jpeg")] }], "aes-128");
    expect(pickCover(findOmImages(plain), plain.length)).not.toBeNull();
    expect(findOmImages(locked)).toEqual([]);
  });

  const SECURED: Security[] = ["none", "rc4-40", "rc4-128", "aes-128", "aes-256"];
  for (const security of SECURED) {
    it(`opens a JPEG cover under ${security === "none" ? "no security" : security} and hands back its pixels`, async () => {
      const pdf = await testMemorandum(
        [{ images: [await testPicture(W, H, "jpeg"), await logo()], text: "The Maddox" }, { text: "Executive summary" }],
        security,
      );
      const cover = await decodeOmCover(pdf);
      expect(cover).not.toBeNull();
      expect(cover).toMatchObject({ width: W, height: H, channels: 3, page: 1 });
      expect(cover!.pixels.length).toBe(W * H * 3);
      // The picture that went in, in its own channel order: a JPEG's loss only.
      means(cover!.pixels, 3).forEach((m, c) => expect(Math.abs(m - SOURCE_MEANS[c])).toBeLessThan(3));
    });
  }

  it("decodes a photograph stored as pixels (a PNG), plain or secured, exactly", async () => {
    for (const security of ["none", "aes-128"] as const) {
      const pdf = await testMemorandum([{ images: [await testPicture(W, H, "png")] }], security);
      expect(findOmImages(pdf)).toEqual([]);
      const cover = await decodeOmCover(pdf);
      expect(cover).toMatchObject({ width: W, height: H, channels: 3, page: 1 });
      expect(Buffer.from(cover!.pixels).equals(testPixels(W, H))).toBe(true);
    }
  });

  it("keeps a picture with transparency's alpha, for the store to lay on white", async () => {
    const pdf = await testMemorandum([{ images: [await testPicture(W, H, "png-alpha")] }], "aes-128");
    expect(await decodeOmCover(pdf)).toMatchObject({ width: W, height: H, channels: 4 });
  });

  it("never reads a file that asks for a password to open", async () => {
    const pdf = await testMemorandum([{ images: [await testPicture(W, H, "jpeg")] }], "user-password");
    expect(await decodeOmCover(pdf)).toBeNull();
  });

  it("finds a cover a few pages in, and none past the first pages", async () => {
    const photo = await testPicture(W, H, "jpeg");
    const third = await testMemorandum([{ text: "Confidentiality" }, { text: "Contents" }, { images: [photo] }], "rc4-128");
    expect(await decodeOmCover(third)).toMatchObject({ width: W, page: 3 });
    const late = await testMemorandum(
      [...Array.from({ length: COVER_PAGES }, (_, i) => ({ text: `Page ${i + 1}` })), { images: [photo] }],
      "rc4-128",
    );
    expect(await decodeOmCover(late)).toBeNull();
  });

  it("takes no greyscale picture, a logo, or nothing at all for a cover", async () => {
    const grey = await testMemorandum([{ images: [await testPicture(W, H, "grey-jpeg")] }], "aes-128");
    expect(await decodeOmCover(grey)).toBeNull();
    const logoOnly = await testMemorandum([{ images: [await logo()], text: "Offering Memorandum" }], "aes-128");
    expect(await decodeOmCover(logoOnly)).toBeNull();
    expect(await decodeOmCover(new TextEncoder().encode("%PDF-1.7\nnot a pdf at all"))).toBeNull();
  });
});

describe("the deal's picture out of its memorandum", () => {
  it("serves a plain file's JPEG byte for byte, and a secured file's pixels", async () => {
    const jpeg = await testPicture(W, H, "jpeg");
    const plain = await coverOf(await testMemorandum([{ images: [jpeg] }]));
    expect(Buffer.isBuffer(plain) && plain.equals(jpeg)).toBe(true);
    const locked = await coverOf(await testMemorandum([{ images: [jpeg] }], "aes-256"));
    expect(locked && !Buffer.isBuffer(locked) ? { w: locked.width, h: locked.height } : null).toEqual({ w: W, h: H });
    expect(await coverOf(await testMemorandum([{ text: "No pictures" }], "aes-256"))).toBeNull();
  });

  it("writes the two sizes from pixels as from a file, laying transparency on white", async () => {
    const pixels = testPixels(W, H);
    const derived = await derivePicture({ width: W, height: H, channels: 3, pixels });
    expect({ w: derived.width, h: derived.height }).toEqual({ w: W, h: H });
    const thumb = await sharp(derived.thumb).metadata();
    expect({ w: thumb.width, h: thumb.height, format: thumb.format }).toEqual({ w: 240, h: 240, format: "jpeg" });
    // Fully transparent pixels come out white, not black.
    const clear = Buffer.alloc(W * H * 4);
    const onWhite = await derivePicture({ width: W, height: H, channels: 4, pixels: clear });
    const stats = await sharp(onWhite.hero).stats();
    expect(stats.channels.slice(0, 3).every((c) => c.mean > 250)).toBe(true);
  });

  it("searches again a memorandum judged photograph-free under older rules", () => {
    const now = Date.parse("2026-09-29T12:00:00Z");
    const yesterday = new Date(now - 86_400_000).toISOString();
    const lastQuarter = new Date(now - 90 * 86_400_000).toISOString();
    expect(searchedRecently({ pictureCheckedAt: yesterday }, now)).toBe(false);
    expect(searchedRecently({ pictureCheckedAt: yesterday, pictureSearchV: PICTURE_SEARCH_VERSION - 1 }, now)).toBe(false);
    expect(searchedRecently({ pictureCheckedAt: yesterday, pictureSearchV: PICTURE_SEARCH_VERSION }, now)).toBe(true);
    expect(searchedRecently({ pictureCheckedAt: lastQuarter, pictureSearchV: PICTURE_SEARCH_VERSION }, now)).toBe(false);
    expect(searchedRecently(null, now)).toBe(false);
    // So the pipeline's card asks the picture route first for a deal judged before.
    const cache = { pictureCheckedAt: new Date().toISOString() };
    expect(pictureMayBeInMemorandum({ omPath: "u/d.pdf", isSample: false, cache })).toBe(true);
    expect(
      pictureMayBeInMemorandum({
        omPath: "u/d.pdf",
        isSample: false,
        cache: { ...cache, pictureSearchV: PICTURE_SEARCH_VERSION },
      }),
    ).toBe(false);
  });
});
