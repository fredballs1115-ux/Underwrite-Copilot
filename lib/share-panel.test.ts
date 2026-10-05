/**
 * The share panel says what a shared link carries beyond the terms
 * (research pass 39): the call and its reasons, which the verdict writes
 * with the reader's buy box in hand, so they can name where the deal misses
 * it. Said in one line, before a link is made.
 */
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// Open the panel: the control starts it closed, and a server render cannot
// press the button.
vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  return { ...real, useState: <T>(init: T) => real.useState(init === false ? (true as T) : init) };
});

import { ShareControl } from "@/app/(app)/deals/[id]/share-control";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

describe("the share panel says what the link shows", () => {
  it("names the call and its reasons, which can name where the deal misses the buy box, in one line", () => {
    const html = renderToStaticMarkup(
      React.createElement(ShareControl, {
        dealId: "d1",
        shares: [{ id: "abcdef0123456789", created_at: "2026-10-01T00:00:00Z", expires_at: "2026-10-31T00:00:00Z" }],
        appUrl: "https://example.com",
      }),
    );
    const text = visibleText(html).replace(/\s+/g, " ");
    expect(text).toContain("Share this screen");
    expect(text).toContain("The link shows the call and its reasons, which can name where the deal misses your buy box.");
    expect(html.match(/data-qa="share-buybox-note"/g)).toHaveLength(1);
    // Before the button that makes a link.
    expect(html.indexOf('data-qa="share-buybox-note"')).toBeLessThan(html.indexOf("Create share link"));
    expect(a11yIssues(html)).toEqual([]);
    expect(gluedWords(text)).toEqual([]);
  });
});
