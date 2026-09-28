// Every Leaflet map sits in a stacking context of its own (#437).
//
// Leaflet sets z-index 400 to 1000 on its panes and controls, and each map's
// basemap switch sits at z-[1000] beside it. With no stacking context around
// them, those numbers are compared with the page's own: the app's sticky top
// bar on a phone is z-10 and the deal's bar is z-20, so a map scrolled under
// either drew over it. Checked in Chromium before the fix: at the top bar's
// point, the element on top was the map's overlay path; with the wrapper
// isolated it was the bar. Each map's wrapper is `relative isolate`, and this
// holds every file that loads Leaflet to it, so the next map cannot forget.
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (name.endsWith(".tsx")) out.push(p);
  }
  return out;
}

const maps = ["app", "lib"]
  .flatMap((dir) => tsxFiles(dir))
  .filter((file) => /import\("leaflet"\)/.test(readFileSync(file, "utf8")));

describe("a Leaflet map never draws over the page's fixed bars", () => {
  it("finds the maps it guards", () => {
    // The pipeline's map, the deal page's map and the comps map.
    expect(maps.length).toBeGreaterThanOrEqual(3);
  });

  it.each(maps)("%s wraps its map in its own stacking context", (file) => {
    expect(readFileSync(file, "utf8")).toMatch(/className="relative isolate[\s"]/);
  });
});
