import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CAPTION_SCRIM,
  HERO_SIDE_SCRIM,
  MARKET_BAND_CREDIT,
  MARKET_BAND_CREDIT_ROW,
  MARKET_BAND_PICTURE,
  MARKET_BAND_WORDS_TOP,
} from "@/app/place-band";

/**
 * The scrim over a market photograph, held to the contrast floor.
 *
 * WHY THIS IS ARITHMETIC AND NOT A SCREENSHOT. The contrast of white type
 * on a band depends on the photograph behind it, and the photographs come
 * from Wikimedia at request time — this sandbox cannot fetch one, and even
 * if it could, next week's file would be a different picture. So the test
 * asserts the only thing that is knowable: that the scrim holds the floor
 * against the WORST photograph a market could ever have, a frame that is
 * pure white in every pixel. A blown-out sky behind a skyline is not a
 * hypothetical; it is most of them at midday.
 *
 * THE STOPS ARE READ OUT OF THE COMPONENT, not restated here. A test that
 * hardcoded the alphas would pass forever while someone lightened the
 * gradient in app/place-band.tsx, which is exactly the regression that
 * shipped once already — fifteen verified photographs washed to an eighth
 * of their strength by a treatment nobody had measured.
 */

const SOURCE = readFileSync(join(process.cwd(), "app/place-band.tsx"), "utf8");
const CSS = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");

/** #0c3338 — the band colour every scrim is painted in. */
const SIDEBAR: RGB = [12, 51, 56];
const WHITE: RGB = [255, 255, 255];

type RGB = [number, number, number];

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance. */
function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** `top` at `alpha` composited over `bottom`, the way the browser does it. */
function over(top: RGB, alpha: number, bottom: RGB): RGB {
  return bottom.map((b, i) => alpha * top[i] + (1 - alpha) * b) as RGB;
}

function contrast(fg: RGB, bg: RGB): number {
  const [hi, lo] = [luminance(fg), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/** The veil's alpha, read from the one `bg-sidebar/NN` covering the frame. */
function veilAlpha(): number {
  const m = /<div className="absolute inset-0 bg-sidebar\/(\d+)" \/>/.exec(SOURCE);
  expect(m, "the overall veil is no longer a bare bg-sidebar/NN").not.toBeNull();
  return Number(m![1]) / 100;
}

/** What the composite scrim looks like at `alpha`, over a pure white frame. */
function scrimOverWhite(alpha: number): RGB {
  return over(SIDEBAR, alpha, over(SIDEBAR, veilAlpha(), WHITE));
}

/** Linear interpolation along a gradient's stops, as CSS does it. */
function rampAt(x: number, stops: Array<[number, number]>): number {
  for (let i = 0; i < stops.length - 1; i++) {
    const [x0, a0] = stops[i];
    const [x1, a1] = stops[i + 1];
    if (x >= x0 && x <= x1) return x1 === x0 ? a1 : a0 + ((a1 - a0) * (x - x0)) / (x1 - x0);
  }
  return stops[stops.length - 1][1];
}

/**
 * Pull one Tailwind gradient's stops out of a class string:
 * `from-sidebar from-0% via-sidebar/80 via-58% to-sidebar/0 to-92%`
 * becomes [[0, 1], [0.58, 0.8], [0.92, 0]].
 */
function stopsOf(classes: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const key of ["from", "via", "to"] as const) {
    const colour = new RegExp(`\\b${key}-sidebar(?:\\/(\\d+))?\\b`).exec(classes);
    if (!colour) continue;
    const at = new RegExp(`\\b${key}-(\\d+)%`).exec(classes);
    const alpha = colour[1] === undefined ? 1 : Number(colour[1]) / 100;
    // A stop with no explicit position takes the CSS default for its slot.
    const pos = at ? Number(at[1]) / 100 : key === "from" ? 0 : key === "via" ? 0.5 : 1;
    out.push([pos, alpha]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** The band scrim's own stops, read out of the component. */
const BAND_STOPS = stopsOf(
  /className="absolute inset-0 (bg-gradient-to-t from-sidebar[^"]*)"/.exec(SOURCE)?.[1] ?? "",
);

describe("the photograph is actually visible", () => {
  it("draws the picture at full strength, never at an opacity", () => {
    // The bug this guards: the first version rendered the image itself at
    // `opacity-30` under a gradient that was still 55% opaque at its
    // lightest, leaving about an eighth of the photograph showing. The
    // scrim does the work now, so the <img> carries no opacity at all.
    const img = /<CityPhoto[\s\S]*?\/>/.exec(SOURCE)?.[0] ?? "";
    expect(img, "CityPhoto in the backdrop").not.toBe("");
    expect(img).not.toMatch(/opacity-\d/);
    expect(SOURCE).not.toMatch(/opacity\?:/);
  });

  it("leaves most of the frame showing the photograph", () => {
    // Not a decorative texture. The words sit at the BOTTOM of a band, so
    // the top of the frame has nothing over it and must be mostly picture,
    // or none of this was worth fetching.
    const shown = (y: number) => {
      const a = rampAt(y, BAND_STOPS);
      return 1 - (a + (1 - a) * veilAlpha());
    };
    expect(shown(1.0)).toBeGreaterThan(0.7); // the top of the band
    expect(shown(0.75)).toBeGreaterThan(0.35);
    // …and opaque where the words are, which is the other half of the deal.
    expect(shown(0.0)).toBeLessThan(0.05);
  });
});

describe("white type on the worst photograph there could be", () => {
  // How far up the band a line of words can reach. The band is bottom-
  // aligned and the tallest one on the site (the sample screen: a heading,
  // a chip and two lines of copy in a 23rem band) fills a little over half
  // of it, so every tenth up to 60% is checked.
  const WORDS_REACH = [0, 0.2, 0.4, 0.5, 0.6];

  it("caps the measure, which is what keeps a line readable", () => {
    const measureRem = Number(/\.band-words\s*\{\s*max-width:\s*([\d.]+)rem/.exec(CSS)?.[1]);
    expect(measureRem).toBeGreaterThan(0);
    expect(measureRem * 16).toBeLessThanOrEqual(640);
  });

  it("clears AA everywhere a band's words can reach", () => {
    for (const y of WORDS_REACH) {
      const bg = scrimOverWhite(rampAt(y, BAND_STOPS));
      expect(contrast(WHITE, bg), `${y * 100}% up`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("holds every white tier a band actually uses to the floor", () => {
    // The trap this exists for: a faint tier reads fine on a FLAT teal band
    // (text-white/60 is about 12:1 there) and can fail on the same band
    // with a photograph behind it, because the floor underneath is no
    // longer a known colour. Nobody checks, because the class looks the
    // same in both places. So every tier on a band's words is measured
    // against the worst frame there could be, at the highest point a line
    // of words can reach.
    const bg = scrimOverWhite(rampAt(Math.max(...WORDS_REACH), BAND_STOPS));
    const BANDS = ["app/why/page.tsx", "app/demo/page.tsx", "app/tools/page.tsx"];
    let checked = 0;
    for (const page of BANDS) {
      const src = readFileSync(join(process.cwd(), page), "utf8");
      for (const [, tier] of src.matchAll(/\btext-white\/(\d+)\b/g)) {
        checked++;
        expect(
          contrast(over(WHITE, Number(tier) / 100, bg), bg),
          `${page}: text-white/${tier}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Solid white needs no tier, so a page with none is the expected state
    // — the assertion is that no page carries one the scrim cannot hold.
    expect(checked).toBeGreaterThanOrEqual(0);
    expect(contrast(WHITE, bg)).toBeGreaterThanOrEqual(7); // AAA for the words themselves
  });

  it("keeps the obligatory credit readable over the bottom of the frame", () => {
    // Every licence here but the public-domain ones requires the
    // photographer to be named. A name the scrim swallows is not a name.
    const band = /className="absolute inset-x-0 bottom-0 h-(\d+) bg-gradient-to-t from-sidebar\/(\d+)/.exec(
      SOURCE,
    );
    expect(band, "the bottom band behind the credit").not.toBeNull();
    const heightPx = Number(band![1]) * 4;
    const peak = Number(band![2]) / 100;
    // The credit sits at bottom-3 (12px), so it reads the gradient near
    // its dark end. app/city-photo.tsx sets the tier it is drawn at.
    const creditTier =
      Number(
        /creditClassName = "[^"]*text-white\/(\d+)/.exec(
          readFileSync(join(process.cwd(), "app/city-photo.tsx"), "utf8"),
        )?.[1],
      ) / 100;
    const alpha = peak * (1 - 12 / heightPx);
    const bg = scrimOverWhite(alpha);
    expect(contrast(over(WHITE, creditTier, bg), bg)).toBeGreaterThanOrEqual(4.5);
  });
});

describe("the centred scrim, for a card that floats in the middle", () => {
  it("is opaque across the whole column the sign-in card occupies", () => {
    // The card is max-w-sm (384px) centred, and this scrim only runs from
    // `lg` up — 1024px, where the card spans 31.25% to 68.75%. The plateau
    // has to contain that, or the footnotes under the card sit on bare
    // photograph.
    const m = /linear-gradient\(to_right,transparent_0%,var\(--color-sidebar\)_(\d+)%,var\(--color-sidebar\)_(\d+)%,transparent_100%\)/.exec(
      SOURCE,
    );
    expect(m, "the centred plateau").not.toBeNull();
    const [start, end] = [Number(m![1]) / 100, Number(m![2]) / 100];
    const cardLeft = 0.5 - 384 / 2 / 1024;
    const cardRight = 0.5 + 384 / 2 / 1024;
    expect(start).toBeLessThanOrEqual(cardLeft);
    expect(end).toBeGreaterThanOrEqual(cardRight);
    // …and both margins stay clear, or there is no photograph to show.
    expect(start).toBeGreaterThan(0.15);
    expect(end).toBeLessThan(0.85);
  });

  it("clears AA below lg, where the column is the whole width", () => {
    const m = /bg-sidebar\/(\d+) lg:hidden/.exec(SOURCE);
    expect(m, "the even veil below lg").not.toBeNull();
    const bg = scrimOverWhite(Number(m![1]) / 100);
    // The faintest tier the sign-in page puts over this.
    const login = readFileSync(join(process.cwd(), "app/login/page.tsx"), "utf8");
    const tiers = [...login.matchAll(/on-photo[^"]*text-white\/(\d+)/g)].map((x) => Number(x[1]) / 100);
    expect(tiers.length).toBeGreaterThan(0);
    for (const tier of tiers) {
      expect(contrast(over(WHITE, tier, bg), bg), `white/${tier * 100}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("the halo under the words", () => {
  it("exists, and every band's words are inside it", () => {
    // Not what makes the type legible — the scrim is, and it is measured
    // above. This is the floor under the floor, for the pixel of a
    // photograph nobody has looked at yet.
    expect(CSS).toMatch(/\.on-photo\s*\{[\s\S]*?text-shadow:/);
    expect(SOURCE).toContain("on-photo");
    for (const page of ["app/page.tsx", "app/tools/page.tsx", "app/login/page.tsx"]) {
      expect(readFileSync(join(process.cwd(), page), "utf8"), page).toContain("on-photo");
    }
    // The market pages draw their band through MarketBand, whose words sit
    // inside the halo in this file.
    expect(/export function MarketBand[\s\S]*?on-photo/.test(SOURCE)).toBe(true);
    for (const page of ["app/market/page.tsx", "app/market/read-only-metro.tsx", "app/(app)/submarkets/[id]/page.tsx"]) {
      expect(readFileSync(join(process.cwd(), page), "utf8"), page).toContain("<MarketBand");
    }
  });
});

describe("the caption scrim, for a market's own band on /market", () => {
  // The stops are IMPORTED rather than read as text: the gradient the page
  // paints is built from this one constant (asserted below), so this is
  // what renders, not a restatement of it.
  const stops = [...CAPTION_SCRIM].sort((a, b) => a.px - b.px);
  const alphaAt = (px: number) => rampAt(px, stops.map((s) => [s.px, s.alpha] as [number, number]));
  // The market band's scrim is a branch of PhotoScrim of its own: the strip's
  // fade below sm, and the veil and the caption scrim from sm.
  const branch = /if \(scrim === "caption"\) \{[\s\S]*?\n {2}\}/.exec(SOURCE)?.[0] ?? "";
  const captionVeil = Number(/"absolute inset-0 hidden bg-sidebar\/(\d+) sm:block"/.exec(branch)?.[1]) / 100;
  const overWhite = (alpha: number): RGB => over(SIDEBAR, alpha, over(SIDEBAR, captionVeil, WHITE));
  const shownAt = (px: number) => {
    const a = alphaAt(px);
    return 1 - (a + (1 - a) * captionVeil);
  };
  const ACCENT = (() => {
    const hex = /--color-accent:\s*#([0-9a-f]{6})/i.exec(CSS)?.[1] ?? "";
    expect(hex, "--color-accent").not.toBe("");
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
  })();
  const band = /export function MarketBand[\s\S]*?^}$/m.exec(SOURCE)?.[0] ?? "";

  // How far up the band its words can reach where they sit over the picture,
  // from sm, worked from the classes MarketBand sets: pb-7 (28px) under a
  // name wrapped to TWO lines of text-3xl (2 × 36px) — line-clamp-2 allows
  // two, and a submarket's name is whatever its owner typed — mt-1 (4px) and
  // the 11px eyebrow at the body's 1.5 line height. Below sm the words are
  // under the picture, on the band's own colour (the strip, below).
  const REACH_PX = 28 + 2 * 36 + 4 + 11 * 1.5;

  it("is the gradient the band paints, and the market band uses it", () => {
    expect(SOURCE).toMatch(/CAPTION_SCRIM\.map\(/);
    expect(branch, "PhotoScrim's caption branch").not.toBe("");
    expect(branch).toContain("backgroundImage: captionGradient");
    expect(captionVeil, "the caption's veil from sm").toBeGreaterThan(0);
    expect(band, "MarketBand").not.toBe("");
    expect(band).toContain('scrim="caption"');
    // line-clamp-2 is what makes "two lines" the reach whatever name is
    // passed — a submarket's is whatever its owner typed.
    for (const cls of ["pb-6", "text-2xl", "mt-1", "text-[11px]", "sm:pb-7", "sm:text-3xl", "line-clamp-2"]) {
      expect(band, cls).toContain(cls);
    }
    expect(REACH_PX).toBeLessThanOrEqual(125);
  });

  it("holds white to AAA and the accent eyebrow to AA everywhere the words reach", () => {
    for (let px = 0; px <= Math.ceil(REACH_PX); px += 5) {
      const bg = overWhite(alphaAt(px));
      expect(contrast(WHITE, bg), `white ${px}px up`).toBeGreaterThanOrEqual(7);
      expect(contrast(ACCENT, bg), `accent ${px}px up`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("draws the picture across a phone's band as a strip, its words starting at the strip's foot on the band's own colour", () => {
    // Under the caption scrim a 240px phone band had been a teal wash: no
    // pixel of the photograph showed untouched (measured in Chromium on a
    // white frame, 2026-10-05). Now the photograph is a strip and the words
    // are under it, as on the homepage's hero.
    const strip = Number(/(?:^| )h-\[(\d+)rem\]/.exec(MARKET_BAND_PICTURE)?.[1]);
    const top = Number(/(?:^| )pt-\[(\d+)rem\]/.exec(MARKET_BAND_WORDS_TOP)?.[1]);
    expect(strip).toBeGreaterThan(0);
    expect(top, "the words start at the strip's foot").toBe(strip);
    expect(band).toContain("${MARKET_BAND_WORDS_TOP}");
    // From sm the picture fills the words' row again, and the words sit at
    // its foot under the scrim.
    expect(MARKET_BAND_PICTURE).toMatch(/(?:^| )top-0(?: |$)/);
    expect(MARKET_BAND_PICTURE).toMatch(/\bsm:inset-0\b/);
    expect(MARKET_BAND_PICTURE).toMatch(/\bsm:h-auto\b/);
    expect(MARKET_BAND_WORDS_TOP).toMatch(/\bsm:pt-\d+\b/);
    // Below sm, nothing lies over the photograph but the strip's fade into
    // the band at its foot: the veil, the scrim and the foot's band are all
    // drawn from sm only.
    const layers = [...branch.matchAll(/<div className="([^"]*)"/g)].map((m) => m[1]);
    expect(layers.length).toBeGreaterThanOrEqual(3);
    for (const l of layers) {
      if (/\bsm:hidden\b/.test(l)) continue;
      expect(l, l).toMatch(/(?:^| )hidden(?: |$)/);
      expect(l, l).toMatch(/\bsm:block\b/);
    }
    const fade = /bg-gradient-to-b from-sidebar\/0 from-(\d+)% to-sidebar to-100% sm:hidden/.exec(branch);
    expect(fade, "the strip's fade below sm").not.toBeNull();
    expect(layers.filter((l) => /\bsm:hidden\b/.test(l))).toHaveLength(1);
    // The words begin where the fade has reached the band's own colour.
    expect(contrast(WHITE, SIDEBAR)).toBeGreaterThanOrEqual(7);
    expect(contrast(ACCENT, SIDEBAR)).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves more than half a phone's band to the photograph, with nothing over it", () => {
    // Worked from the classes: the strip's part above its fade, over the
    // strip and the words under it (the eyebrow, mt-1, a name of text-2xl
    // on one line or two, pb-6). Measured in Chromium at 390px on a white
    // frame (2026-10-05): 56–59% of the band with a one-line name, 53–54%
    // with two, against none before.
    const strip = Number(/(?:^| )h-\[(\d+)rem\]/.exec(MARKET_BAND_PICTURE)?.[1]) * 16;
    const from = Number(/from-sidebar\/0 from-(\d+)% to-sidebar to-100% sm:hidden/.exec(branch)?.[1]) / 100;
    expect(from).toBeGreaterThanOrEqual(0.6);
    for (const lines of [1, 2]) {
      const words = 11 * 1.5 + 4 + lines * 32 + 24;
      expect((strip * from) / (strip + words), `a name of ${lines} line(s)`).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("draws the photograph's credit in a row of its own under the picture, never over the words", () => {
    // Measured in Chromium on 2026-10-01: drawn at the picture's foot, the
    // credit wrapped to two or three lines at 390px and climbed over the
    // name on 40 of the 45 bands /market draws (St. Louis's at 820px too).
    // The band is a grid now: the picture and the words share the first row,
    // the credit has the second.
    expect(band).toContain("layer={MARKET_BAND_PICTURE}");
    expect(band).toContain("creditLayer={MARKET_BAND_CREDIT_ROW}");
    expect(band).toContain("creditClassName={MARKET_BAND_CREDIT}");
    expect(band).toMatch(/className="band-dark relative grid /);
    // The picture's box ends at its own row: an absolutely placed box whose
    // end line is `auto` reaches the grid's padding edge, over the credit.
    expect(MARKET_BAND_PICTURE).toMatch(/\brow-start-1\b/);
    expect(MARKET_BAND_PICTURE).toMatch(/\brow-end-2\b/);
    expect(MARKET_BAND_CREDIT_ROW).toMatch(/\brow-start-2\b/);
    // The words are in the picture's row, and the credit is not placed over it.
    expect(band).toMatch(/className=\{`on-photo band-words relative col-start-1 row-start-1 /);
    expect(MARKET_BAND_CREDIT).not.toMatch(/\b(absolute|bottom-\d|top-\d)\b/);
    // On the band's own colour, with no photograph under it: its tier is
    // measured against the solid band.
    const tier = Number(/text-white\/(\d+)/.exec(MARKET_BAND_CREDIT)?.[1]) / 100;
    expect(tier).toBeGreaterThan(0);
    expect(contrast(over(WHITE, tier, SIDEBAR), SIDEBAR)).toBeGreaterThanOrEqual(4.5);
  });

  it("leaves the band above the words to the photograph from sm", () => {
    // The whole point of anchoring in px: the band's height goes to the
    // picture, not to a proportional veil.
    const desk = Number(/sm:min-h-\[(\d+)rem\]/.exec(band)?.[1]) * 16;
    const clear = stops[stops.length - 1].px;
    expect(stops[stops.length - 1].alpha).toBe(0);
    expect(desk).toBeGreaterThanOrEqual(300); // a photograph, not a texture
    expect(desk, "the band clears the scrim with room to spare").toBeGreaterThanOrEqual(clear + 32);
    expect(shownAt(desk)).toBeGreaterThan(0.7);
    // From the middle of the band up, at least half the picture.
    expect(shownAt(desk / 2)).toBeGreaterThanOrEqual(0.5);
    // …and the words' own zone is still mostly scrim.
    expect(shownAt(0)).toBeLessThan(0.05);
  });
});

describe("the homepage hero, whose words sit at the TOP of its band", () => {
  // Measured in Chromium over a white frame before this shape existed: the
  // "band" scrim is clear at the top by design, so the hero's headline read
  // 1.9:1 on a phone and 3.0:1 on a laptop, its eyebrow about 1:1.
  const PAGE = readFileSync(join(process.cwd(), "app/page.tsx"), "utf8");
  const ACCENT = (() => {
    const hex = /--color-accent:\s*#([0-9a-f]{6})/i.exec(CSS)?.[1] ?? "";
    return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16)) as RGB;
  })();
  const hero = /<section className="band-dark relative overflow-hidden text-white">[\s\S]*?<\/section>/.exec(PAGE)?.[0] ?? "";
  // The words' column: everything the hero draws before the sample card.
  const words = hero.indexOf("<DealPreview") > 0 ? hero.slice(0, hero.indexOf("<DealPreview")) : "";
  const tiers = [...words.matchAll(/\btext-white\/(\d+)\b/g)].map((m) => Number(m[1]) / 100);

  it("draws the hero through the hero scrim, the words starting at the strip's foot below lg", () => {
    expect(hero, "the hero section").not.toBe("");
    expect(words, "the words' column, before the sample card").not.toBe("");
    expect(PAGE).toMatch(/scrim="hero"/);
    expect(hero).toContain("${HERO_WORDS_TOP}");
    const strip = /export const HERO_STRIP = "([^"]+)"/.exec(SOURCE)?.[1] ?? "";
    const top = /export const HERO_WORDS_TOP = "([^"]+)"/.exec(SOURCE)?.[1] ?? "";
    // The same heights on each side, at each width the stack has.
    expect(/(?:^| )h-\[(\d+)rem\]/.exec(strip)?.[1]).toBe(/(?:^| )pt-\[(\d+)rem\]/.exec(top)?.[1]);
    expect(/sm:h-\[(\d+)rem\]/.exec(strip)?.[1]).toBe(/sm:pt-\[(\d+)rem\]/.exec(top)?.[1]);
    expect(strip).toContain("lg:inset-0");
  });

  it("fades the strip into the band itself at its foot, so the words start on the band's own colour", () => {
    const m = /bg-gradient-to-b from-sidebar\/0 from-(\d+)% to-sidebar to-100% lg:hidden/.exec(SOURCE);
    expect(m, "the strip's gradient below lg").not.toBeNull();
    // …and the top of the strip is photograph: nothing but the veil there.
    expect(Number(m![1])).toBeGreaterThanOrEqual(35);
    expect(1 - veilAlpha()).toBeGreaterThan(0.7);
    const bg = scrimOverWhite(1);
    expect(contrast(WHITE, bg)).toBeGreaterThanOrEqual(7);
    expect(contrast(ACCENT, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it("holds the words' column to the floor from lg, at the right edge the column can reach", () => {
    const stops = HERO_SIDE_SCRIM.map((s) => [s.at, s.alpha] as [number, number]);
    // The 72rem container's left column ends at 48–49% of the width at
    // every screen from lg up (1024px: 488/1024; 1920px: 936/1920).
    for (const x of [0, 0.25, 0.49]) {
      const bg = scrimOverWhite(rampAt(x, stops));
      expect(contrast(WHITE, bg), `white at ${x}`).toBeGreaterThanOrEqual(7);
      expect(contrast(ACCENT, bg), `accent at ${x}`).toBeGreaterThanOrEqual(4.5);
      expect(tiers.length).toBeGreaterThan(0);
      for (const t of tiers) expect(contrast(over(WHITE, t, bg), bg), `white/${t * 100} at ${x}`).toBeGreaterThanOrEqual(4.5);
    }
    // …and the right of the band is the photograph's.
    expect(rampAt(0.8, stops)).toBe(0);
    expect(SOURCE).toMatch(/HERO_SIDE_SCRIM\.map\(/);
  });
});
