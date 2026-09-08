/**
 * The memo's cover picture is a courtesy, never a dependency: a picture that
 * arrives intact becomes a data URI with its credit; one that does not
 * arrive in time, is not an image, is corrupt, or fails, is simply absent —
 * because react-pdf hangs its whole render on a corrupt PNG, the memo
 * download must never be handed one.
 */
import { describe, expect, it } from "vitest";
import { coverFrom, intactImage } from "./cover-aerial";
import { CORRUPT_PNG, TINY_PNG } from "./test-png";

const image = (type: string, body: Buffer | null = TINY_PNG) =>
  new Response(body ? new Uint8Array(body) : null, { headers: { "content-type": type } });

// A JPEG's skeleton: start marker, some bytes, end marker.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(40, 1), Buffer.from([0xff, 0xd9])]);

describe("intactImage", () => {
  it("accepts a whole PNG and a whole JPEG", () => {
    expect(intactImage(TINY_PNG, "image/png")).toBe(true);
    expect(intactImage(JPEG, "image/jpeg")).toBe(true);
    // A little padding after a JPEG's end marker is common and fine.
    expect(intactImage(Buffer.concat([JPEG, Buffer.alloc(8)]), "image/jpeg")).toBe(true);
  });

  it("refuses a PNG whose data fails its check, a truncated PNG, a JPEG with no end, and a mismatched type", () => {
    expect(intactImage(CORRUPT_PNG, "image/png")).toBe(false);
    expect(intactImage(TINY_PNG.subarray(0, TINY_PNG.length - 6), "image/png")).toBe(false);
    expect(intactImage(JPEG.subarray(0, JPEG.length - 2), "image/jpeg")).toBe(false);
    expect(intactImage(TINY_PNG, "image/jpeg")).toBe(false);
    expect(intactImage(TINY_PNG, "image/webp")).toBe(false);
  });
});

describe("coverFrom", () => {
  it("turns an aerial answer into a PNG data URI with the USGS credit", async () => {
    const cover = await coverFrom(async () => ({ source: "aerial", response: image("image/png") }));
    expect(cover?.dataUri.startsWith("data:image/png;base64,")).toBe(true);
    expect(cover?.dataUri.endsWith(TINY_PNG.toString("base64"))).toBe(true);
    expect(cover?.credit).toBe("Imagery: USGS The National Map");
  });

  it("keeps the JPEG type and drops the charset suffix", async () => {
    const cover = await coverFrom(async () => ({
      source: "aerial",
      response: image("image/jpeg; charset=binary", JPEG),
    }));
    expect(cover?.dataUri.startsWith("data:image/jpeg;base64,")).toBe(true);
  });

  it("no answer, a non-image answer, an empty body, a corrupt picture and a throw are all no cover", async () => {
    expect(await coverFrom(async () => null)).toBeNull();
    expect(
      await coverFrom(async () => ({ source: "aerial", response: image("application/json", Buffer.from("{}")) })),
    ).toBeNull();
    expect(await coverFrom(async () => ({ source: "aerial", response: image("image/webp") }))).toBeNull();
    expect(await coverFrom(async () => ({ source: "aerial", response: image("image/png", Buffer.alloc(0)) }))).toBeNull();
    expect(await coverFrom(async () => ({ source: "aerial", response: image("image/png", CORRUPT_PNG) }))).toBeNull();
    expect(
      await coverFrom(async () => {
        throw new Error("network down");
      }),
    ).toBeNull();
  });

  it("a source that does not answer in time is no cover, and the memo is not held up", async () => {
    const started = Date.now();
    const cover = await coverFrom(() => new Promise(() => {}), 40);
    expect(cover).toBeNull();
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
