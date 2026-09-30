import { describe, expect, it } from "vitest";
import { analysisReadyEmail, weeklyDigestEmail, type DigestInput } from "./email-template";

const BANNER = "https://underwrite.example/api/email/picture/3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b.abc.XYZ?s=banner";
const thumb = (n: number) => `https://underwrite.example/api/email/picture/t${n}?s=thumb`;

const ready = {
  dealName: "Smith & Sons Lofts",
  verdictLabel: "Go",
  verdictColor: "#1b7a5e",
  buyBoxLabel: "Fits buy box",
  reason: "Priced under the market's range.",
  dealUrl: "https://underwrite.example/deals/d1",
  settingsUrl: "https://underwrite.example/account",
};

describe("the screen-complete email opens on the building (#464)", () => {
  it("draws the picture across the card, linked to the deal, with its alt text", () => {
    const { html, text } = analysisReadyEmail({ ...ready, picture: { url: BANNER, alt: "Photograph of Smith & Sons Lofts" } });
    const img = /<a href="([^"]+)"[^>]*><img src="([^"]+)" width="520" height="260" alt="([^"]*)" style="([^"]+)" \/><\/a>/.exec(html);
    expect(img).not.toBeNull();
    expect(img![1]).toBe(ready.dealUrl);
    expect(img![2]).toBe(BANNER);
    expect(img![3]).toBe("Photograph of Smith &amp; Sons Lofts");
    // Fluid on a phone, at its own shape.
    expect(img![4]).toContain("width:100%");
    expect(img![4]).toContain("height:auto");
    // Between the masthead and the words.
    expect(html.indexOf("Underwrite Copilot</span>")).toBeLessThan(html.indexOf(BANNER));
    expect(html.indexOf(BANNER)).toBeLessThan(html.indexOf("Screen complete</p>"));
    // The plain-text part is the same words it always was.
    expect(text).not.toContain("picture");
  });

  it("a cover's drawing is decorative, and no picture leaves the email as it was", () => {
    const cover = analysisReadyEmail({ ...ready, picture: { url: BANNER, alt: "" } });
    expect(cover.html).toContain('alt=""');
    const none = analysisReadyEmail(ready);
    expect(none.html).not.toContain("<img");
    expect(none.html).toContain("Smith &amp; Sons Lofts");
  });
});

describe("the Monday digest pictures each deal it names (#464)", () => {
  const base: DigestInput = {
    stages: [{ label: "Screening", count: 3 }],
    offersDue: [
      { name: "The Maddox", due: "Fri, Oct 2", url: "https://underwrite.example/deals/a", pictureUrl: thumb(1) },
      { name: "Pine & Oak", due: "Mon, Oct 5", url: "https://underwrite.example/deals/b", pictureUrl: thumb(2) },
    ],
    verdicts: [
      { name: "Harbor Point", label: "Caution", color: "#a05a1c", url: "https://underwrite.example/deals/c", pictureUrl: thumb(3) },
    ],
    pipelineUrl: "https://underwrite.example/deals",
    settingsUrl: "https://underwrite.example/account",
  };

  it("puts the deal's square beside each name, linked like the name, the call at the row's end", () => {
    const { html, text } = weeklyDigestEmail(base);
    for (const n of [1, 2, 3]) {
      expect(html).toContain(`<img src="${thumb(n)}" width="48" height="48" alt=""`);
    }
    expect(html).toContain('<a href="https://underwrite.example/deals/b" style="display:block;text-decoration:none;"><img');
    expect(html).toContain("Pine &amp; Oak");
    // The call follows the name once there is a picture before it.
    expect(html.indexOf("Harbor Point")).toBeLessThan(html.indexOf(">Caution</span>"));
    expect(text).not.toContain("picture");
  });

  it("keeps the picture column for a row with none, so the names start at one x", () => {
    const mixed = weeklyDigestEmail({
      ...base,
      offersDue: [base.offersDue[0], { ...base.offersDue[1], pictureUrl: null }],
    });
    expect(mixed.html.match(/<td width="48"/g)?.length).toBe(3);
    expect(mixed.html.match(/<img /g)?.length).toBe(2);
  });

  it("with no pictures at all, reads as it always has: the call first", () => {
    const plain = weeklyDigestEmail({
      ...base,
      offersDue: base.offersDue.map((o) => ({ ...o, pictureUrl: null })),
      verdicts: base.verdicts.map((v) => ({ ...v, pictureUrl: undefined })),
    });
    expect(plain.html).not.toContain("<img");
    expect(plain.html).not.toContain('<td width="48"');
    expect(plain.html.indexOf(">Caution</span>")).toBeLessThan(plain.html.indexOf("Harbor Point"));
  });
});
