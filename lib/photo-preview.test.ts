import { describe, expect, it } from "vitest";
import { PREVIEW_MAX_CHARS, blurredBackground, isPreview, previewStyle } from "./photo-preview";

const PREVIEW = "data:image/webp;base64,UklGRlIAAABXRUJQVlA4IEYAAAAwAgCdASoYABAAPm0wkkWkIqGYBABABsSgCdMoRwBAbAhvCgAA/vy3qgA=";

describe("isPreview — only a small image data URI this site made", () => {
  it("takes a base64 WebP, JPEG or PNG data URI and nothing else", () => {
    expect(isPreview(PREVIEW)).toBe(true);
    expect(isPreview("data:image/jpeg;base64,/9j/4AAQSkZJRg==")).toBe(true);
    expect(isPreview("https://example.com/a.jpg")).toBe(false);
    expect(isPreview("data:image/svg+xml;base64,PHN2Zz4=")).toBe(false);
    expect(isPreview("data:image/webp;base64,abc\")}body{color:red")).toBe(false);
    expect(isPreview(`data:image/webp;base64,${"A".repeat(PREVIEW_MAX_CHARS)}`)).toBe(false);
    expect(isPreview(null)).toBe(false);
    expect(isPreview(42)).toBe(false);
  });
});

describe("blurredBackground — the preview blurred by the browser, as one CSS value", () => {
  it("wraps the preview in a blurred SVG whose markup is escaped for a url()", () => {
    const bg = blurredBackground(PREVIEW)!;
    expect(bg.startsWith('url("data:image/svg+xml;charset=utf-8,')).toBe(true);
    expect(bg.endsWith('")')).toBe(true);
    const inner = bg.slice('url("'.length, -'")'.length);
    // Nothing that could close the url() or the style attribute early.
    expect(inner).not.toMatch(/["<>]/);
    expect(inner).toContain("feGaussianBlur");
    expect(inner).toContain(PREVIEW);
    expect(inner).toContain("filter='url(%23b)'");
  });

  it("nothing where there is no preview", () => {
    expect(blurredBackground(null)).toBeNull();
    expect(blurredBackground("not a preview")).toBeNull();
    expect(previewStyle(undefined)).toBeUndefined();
    expect(previewStyle(PREVIEW)).toMatchObject({ backgroundSize: "cover", backgroundPosition: "center" });
  });
});
