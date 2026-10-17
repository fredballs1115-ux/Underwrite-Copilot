// The signed-in boundaries: the error page a failed page falls to, and the
// page a deleted or unknown deal's link opens. Each keeps the app's shell
// (they live under app/(app)), says only what is known, and offers the way
// back. Rendered statically and linted like every other view.
import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/navigation", () => ({
  usePathname: () => "/analytics",
}));

import AppError from "../app/(app)/error";
import AppNotFound from "../app/(app)/not-found";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";
import { SUPPORT_EMAIL, pageErrorMailto } from "./support-link";

describe("the signed-in error page", () => {
  const error = Object.assign(new Error("read failed"), { digest: "3141592653" });
  const html = renderToStaticMarkup(React.createElement(AppError, { error, unstable_retry: () => {} }));
  const text = visibleText(html);

  it("wears the covers' own drawing, as the not-found page does, never a red '!'", () => {
    expect(html).toContain('data-deal-cover="building"');
    expect(html).not.toMatch(/>\s*!\s*</);
  });

  it("says the page did not load, never that the reader's data is fine", () => {
    expect(text).toContain("This page could not load.");
    expect(text).not.toMatch(/data (are|is) fine|hiccup|not a data loss|stored safely/i);
  });

  it("offers a retry, the way back and support, the link carrying the page and the error ID", () => {
    expect(text).toContain("Try again");
    expect(html).toContain('href="/deals"');
    const href = /href="(mailto:[^"]+)"/.exec(html)![1].replace(/&amp;/g, "&");
    expect(href).toBe(pageErrorMailto({ path: "/analytics", digest: "3141592653" }));
    expect(decodeURIComponent(href)).toContain("Page: /analytics");
    expect(decodeURIComponent(href)).toContain("Error ID: 3141592653");
    expect(href.startsWith(`mailto:${SUPPORT_EMAIL}?`)).toBe(true);
    expect(text).toContain("error ID 3141592653");
  });

  it("lints clean", () => {
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});

describe("pageErrorMailto", () => {
  it("leaves out what is unknown", () => {
    const href = decodeURIComponent(pageErrorMailto({ path: null, digest: undefined }));
    expect(href).toContain("subject=A page failed to load&");
    expect(href).not.toContain("Page:");
    expect(href).not.toContain("Error ID:");
  });
});

describe("the signed-in not-found page", () => {
  const html = renderToStaticMarkup(React.createElement(AppNotFound));
  const text = visibleText(html);

  it("draws the covers' own empty lot, says what is known and leads back to the pipeline", () => {
    expect(html).toContain('data-deal-cover="land"');
    expect(text).toContain("Nothing at this link.");
    // Row-level security answers someone else's deal as one that is gone:
    // the page names both and claims neither.
    expect(text).toMatch(/deleted, or it may belong to someone else/);
    expect(html).toContain('href="/deals"');
  });

  it("lints clean", () => {
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});
