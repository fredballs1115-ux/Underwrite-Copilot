// The IndexNow key (#430) is only worth anything if the file the site serves
// at its root holds exactly the key the submit script sends — an engine
// that fetches a different string refuses the whole list.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { INDEXNOW_KEY, sitemapUrls } from "../scripts/indexnow.mjs";

describe("IndexNow", () => {
  it("serves exactly the key the script sends, from the site's root", () => {
    const keyFiles = readdirSync(join(process.cwd(), "public")).filter((f) => /^[0-9a-f]{32}\.txt$/.test(f));
    expect(keyFiles).toEqual([`${INDEXNOW_KEY}.txt`]);
    expect(readFileSync(join(process.cwd(), "public", keyFiles[0]), "utf8")).toBe(INDEXNOW_KEY);
  });

  it("reads the sitemap's own URLs, unescaped, on the site's host only", () => {
    const xml = `<?xml version="1.0"?><urlset>
      <url><loc>https://underwrite-copilot.onrender.com/</loc></url>
      <url><loc> https://underwrite-copilot.onrender.com/market?metro=dc&amp;sector=office </loc></url>
      <url><loc>https://elsewhere.example/</loc></url>
      <url><loc>https://underwrite-copilot.onrender.com/</loc></url>
    </urlset>`;
    expect(sitemapUrls(xml, "https://underwrite-copilot.onrender.com")).toEqual([
      "https://underwrite-copilot.onrender.com/",
      "https://underwrite-copilot.onrender.com/market?metro=dc&sector=office",
    ]);
  });
});
