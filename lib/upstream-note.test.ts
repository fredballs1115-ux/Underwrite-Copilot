import { describe, expect, it } from "vitest";
import { bareUrl, jsonShape, upstreamNote } from "./upstream-note";

describe("upstreamNote — what a health probe may repeat of an upstream answer", () => {
  it("strips every credential-shaped query value, inside and outside URLs", () => {
    const echoed =
      "The provided API key is invalid. Request: https://maps.googleapis.com/maps/api/streetview/metadata?location=x&key=AIzaSyREALKEY123 (see docs)";
    const note = upstreamNote(echoed);
    expect(note).not.toContain("AIzaSyREALKEY123");
    expect(note).toContain("maps.googleapis.com/maps/api/streetview/metadata");
    expect(upstreamNote("denied: token=abc.def.ghi&signature=zzz")).toBe("denied: token=[redacted]&signature=[redacted]");
  });

  it("is short and single-line", () => {
    const long = `error\n\n${"x".repeat(500)}`;
    const note = upstreamNote(long);
    expect(note.length).toBeLessThanOrEqual(160);
    expect(note).not.toContain("\n");
    expect(note.endsWith("…")).toBe(true);
    expect(upstreamNote(null)).toBe("");
    expect(upstreamNote({ error: { code: 400 } })).toBe('{"error":{"code":400}}');
  });

  it("bareUrl keeps host and path only", () => {
    expect(bareUrl("https://hub.arcgis.com/api/v3/datasets/abc?token=secret#frag")).toBe(
      "https://hub.arcgis.com/api/v3/datasets/abc",
    );
    expect(bareUrl("not a url")).toBe("[url]");
  });

  it("jsonShape names the keys, never the values", () => {
    expect(jsonShape({ layers: [1, 2], secret: "x" })).toEqual(["layers", "secret"]);
    expect(jsonShape([1, 2, 3])).toEqual(["array(3)"]);
    expect(jsonShape("text")).toBeNull();
  });
});
