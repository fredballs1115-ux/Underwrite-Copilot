import { describe, expect, it } from "vitest";
import { coverSizes, headerPhotoSizes, mosaicTileSizes, photoAspect, photoSrcSet, viewerSizes } from "./photo-srcset";

const url = (size: "hero" | "full") => `/api/deals/d1/picture?size=${size}`;

describe("a stored photograph's srcset", () => {
  it("names the hero and the full-size copy, each at its own width", () => {
    expect(photoSrcSet(url, { width: 1600, height: 1067, fullWidth: 2560 })).toBe(
      "/api/deals/d1/picture?size=hero 1600w, /api/deals/d1/picture?size=full 2560w",
    );
    // A portrait photograph's widths are its widths, not its long sides.
    expect(photoSrcSet(url, { width: 1067, height: 1600, fullWidth: 1707 })).toBe(
      "/api/deals/d1/picture?size=hero 1067w, /api/deals/d1/picture?size=full 1707w",
    );
  });

  it("is nothing where the hero is all there is: no copy, none larger, or no sizes known", () => {
    expect(photoSrcSet(url, { width: 1200, height: 750 })).toBeUndefined();
    expect(photoSrcSet(url, { width: 1200, height: 750, fullWidth: null })).toBeUndefined();
    expect(photoSrcSet(url, { width: 1600, height: 1000, fullWidth: 1600 })).toBeUndefined();
    expect(photoSrcSet(url, { fullWidth: 2560 })).toBeUndefined();
    expect(photoSrcSet(url, null)).toBeUndefined();
  });

  it("reads a photograph's shape, and a common one where none is known", () => {
    expect(photoAspect({ width: 1600, height: 1000 })).toBe(1.6);
    expect(photoAspect({ width: 0, height: 1000 })).toBe(1.5);
    expect(photoAspect(undefined)).toBe(1.5);
  });
});

describe("the width a stored photograph is drawn at", () => {
  it("is the header's picture frame on each window, for a photograph no wider than the frame", () => {
    const sizes = headerPhotoSizes(1.5);
    expect(sizes).toBe(
      "(min-width: 1264px) 557px, (min-width: 1072px) calc(58vw - 176px), (min-width: 768px) calc(100vw - 304px), (min-width: 640px) calc(100vw - 64px), calc(100vw - 40px)",
    );
    // A portrait photograph covers the frame by its width too.
    expect(headerPhotoSizes(0.66)).toBe(sizes);
  });

  it("is wider for a panorama, which covers the frame by its height", () => {
    // 2.5:1 in a 16:9 frame is drawn 1.406 times the frame's width.
    expect(headerPhotoSizes(2.5)).toContain("(min-width: 1264px) calc(557px * 1.406)");
    expect(headerPhotoSizes(2.5)).toContain("calc((100vw - 40px) * 1.406)");
  });

  it("is a third of the frame for a mosaic tile, more where the tile's shape crops the photograph", () => {
    // A 3:2 photograph in a tile two thirds of 16:9 is drawn 1.266 times the tile.
    expect(mosaicTileSizes(1.5)).toContain("(min-width: 1264px) calc(557px * 0.422)");
    expect(coverSizes(1, 1 / 3, 1)).toContain("(min-width: 1264px) calc(557px * 0.333)");
  });

  it("is the viewer's box: by the window's height where the window is wider than the photograph, by its width otherwise", () => {
    expect(viewerSizes({ width: 1600, height: 1067 })).toBe(
      "(min-aspect-ratio: 1600/1067) calc((100vh - 11rem) * 1.5), (min-width: 640px) calc(100vw - 8rem), calc(100vw - 1rem)",
    );
    expect(viewerSizes(null)).toBe("(min-width: 640px) calc(100vw - 8rem), calc(100vw - 1rem)");
  });
});
