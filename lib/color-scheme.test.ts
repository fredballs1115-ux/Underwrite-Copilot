import { describe, expect, it, vi } from "vitest";

// The root layout loads next/font, which runs only under Next: stood in for
// here, so the object the test reads is the layout's own `viewport` export,
// the one Next renders into every page's head.
vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "--font-geist-sans", className: "" }),
  Geist_Mono: () => ({ variable: "--font-geist-mono", className: "" }),
}));

import { viewport } from "@/app/layout";

describe("the site says it is light only (research pass 36)", () => {
  it("declares the color-scheme `only light` on the root layout's viewport", () => {
    // Next renders it as <meta name="color-scheme" content="only light">. A
    // phone that darkens websites (Chrome Android's "Darken websites",
    // Samsung Internet's dark mode) inverted a page that declared nothing,
    // and every black reference tick a panel draws went dark on dark.
    expect(viewport.colorScheme).toBe("only light");
    // The brand colour of the browser's own chrome stays as it was.
    expect(viewport.themeColor).toBe("#0c3338");
  });
});
