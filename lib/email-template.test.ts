import { describe, expect, it } from "vitest";
import {
  PREVIEW_MAX,
  analysisReadyEmail,
  bannerAlt,
  previewLine,
  previousCallLine,
  screenStoppedEmail,
  weeklyDigestEmail,
  type DigestInput,
} from "./email-template";
import { a11yIssues, gluedWords, visibleText } from "./render-lint";

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
  it("draws the picture across the card, linked to the deal, its alt naming the deal and the link", () => {
    const { html, text } = analysisReadyEmail({ ...ready, picture: { url: BANNER } });
    const img = /<a href="([^"]+)"[^>]*><img src="([^"]+)" width="520" height="260" alt="([^"]*)" style="([^"]+)" \/><\/a>/.exec(html);
    expect(img).not.toBeNull();
    expect(img![1]).toBe(ready.dealUrl);
    expect(img![2]).toBe(BANNER);
    // True whichever picture the route serves when the email is opened —
    // the photograph or the cover's drawing — so never "Photograph of …".
    expect(img![3]).toBe("Smith &amp; Sons Lofts — open the deal");
    expect(img![3]).toBe(bannerAlt("Smith &amp; Sons Lofts"));
    // Fluid on a phone, at its own shape.
    expect(img![4]).toContain("width:100%");
    expect(img![4]).toContain("height:auto");
    // Between the masthead and the words.
    expect(html.indexOf("Underwrite Copilot</span>")).toBeLessThan(html.indexOf(BANNER));
    expect(html.indexOf(BANNER)).toBeLessThan(html.indexOf("Screen complete</p>"));
    // The plain-text part is the same words it always was.
    expect(text).not.toContain("picture");
  });

  it("with images blocked, the band holds a tint and its alt reads as a line, never a blank white gap", () => {
    const { html } = analysisReadyEmail({ ...ready, picture: { url: BANNER } });
    const cell = /<td style="([^"]*)">\s*<a href="[^"]+" style="([^"]*)"><img [^>]*style="([^"]*)"/.exec(html)!;
    for (const style of [cell[1], cell[2], cell[3]]) expect(style).toMatch(/background-color:#[0-9a-f]{6}/);
    // The alt is drawn legibly in the band, not at the cell's zero size.
    expect(cell[3]).toMatch(/font-size:15px/);
    expect(cell[3]).toMatch(/color:#[0-9a-f]{6}/);
  });

  it("no picture leaves the email as it was", () => {
    const none = analysisReadyEmail(ready);
    expect(none.html).not.toContain("<img");
    expect(none.html).toContain("Smith &amp; Sons Lofts");
  });
});

describe("every email is a whole document a mail client reads well", () => {
  const digestInput: DigestInput = {
    stages: [{ label: "Screening", count: 2 }],
    offersDue: [{ name: "The Maddox <B>", due: "Fri, Oct 2", url: "https://underwrite.example/deals/a", pictureUrl: thumb(1) }],
    offersThrough: "Sun, Oct 4",
    verdicts: [{ name: "Harbor & Point", label: "Go", color: "#1b7a5e", url: "https://underwrite.example/deals/c", pictureUrl: thumb(3) }],
    pipelineUrl: "https://underwrite.example/deals",
    settingsUrl: "https://underwrite.example/account",
  };
  const all = () => [
    analysisReadyEmail({ ...ready, picture: { url: BANNER } }),
    screenStoppedEmail({
      dealName: "The Maddox",
      message: "The analysis service is overloaded right now — try again in a few minutes.",
      dealUrl: "https://underwrite.example/deals/d1",
      settingsUrl: "https://underwrite.example/account",
    }),
    weeklyDigestEmail(digestInput),
  ];

  it("carries a head: the charset, a phone's viewport, its colour scheme, its language and its subject as the title", () => {
    for (const { html, subject } of all()) {
      expect(html).toMatch(/^<!doctype html>\n<html lang="en">\n<head>\n/);
      expect(html).toContain('<meta charset="utf-8">');
      expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
      expect(html).toContain('<meta name="color-scheme" content="light">');
      expect(html).toContain(`<title>${subject.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</title>`);
      expect(html.indexOf("</head>")).toBeLessThan(html.indexOf("<body"));
    }
  });

  it("opens its body on a hidden preview line that leads with what matters", () => {
    const [done, stopped, digest] = all().map(({ html }) => {
      const m = /<body[^>]*>\s*<div style="display:none;[^"]*">([^<]*)<\/div>/.exec(html);
      expect(m).not.toBeNull();
      return m![1];
    });
    // The call first, then why.
    expect(done).toBe("Go — Priced under the market's range. Buy box: Fits buy box.");
    // Why it stopped.
    expect(stopped).toMatch(/^The analysis service is overloaded/);
    // The deadlines first, escaped.
    expect(digest).toMatch(/^Offers due: The Maddox &lt;B&gt; \(Fri, Oct 2\)\./);
  });

  it("cuts a long preview line at a word, under its bound", () => {
    expect(previewLine("  a   b\n c ")).toBe("a b c");
    const long = previewLine(`Go — ${"the rent roll ties to the T-12 ".repeat(12)}`);
    expect(long.length).toBeLessThanOrEqual(PREVIEW_MAX);
    expect(long.endsWith("…")).toBe(true);
    expect(long).not.toMatch(/\s…$/);
  });

  it("names every link and every picture, by the site's own lint", () => {
    for (const { html } of all()) expect(a11yIssues(html)).toEqual([]);
    // The squares and the banner each say which deal: their alt is the link's name.
    const digest = weeklyDigestEmail(digestInput).html;
    expect(digest).toContain(`<img src="${thumb(1)}" width="48" height="48" alt="The Maddox &lt;B&gt;"`);
    expect(digest).toContain(`<img src="${thumb(3)}" width="48" height="48" alt="Harbor &amp; Point"`);
  });

  it("stays small at its fullest — six deadlines, six calls, long names and a long reason — well under where a mail client clips", () => {
    const pic = "https://underwrite-copilot.onrender.com/api/email/picture/3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6b.abcdefg.XYZXYZXYZXYZXYZXYZXYZX?s=thumb";
    const row = (i: number) => ({
      name: `A fairly long deal name, number ${i}, at 1234 Market Street`,
      due: "Fri, Oct 2",
      url: `https://underwrite-copilot.onrender.com/deals/3f2b8c1e-7a4d-4e6f-9b0a-1c2d3e4f5a6${i}`,
      pictureUrl: pic,
    });
    const fullest = [
      weeklyDigestEmail({
        ...digestInput,
        stages: [1, 2, 3, 4, 5].map((count) => ({ label: "Under contract / DD", count })),
        offersDue: [0, 1, 2, 3, 4, 5].map(row),
        verdicts: [0, 1, 2, 3, 4, 5].map((i) => ({ ...row(i), label: "Caution", color: "#a05a1c" })),
      }),
      analysisReadyEmail({ ...ready, reason: "A sentence of why. ".repeat(20), picture: { url: pic } }),
      screenStoppedEmail({ dealName: "The Maddox", message: "A sentence of why. ".repeat(20), dealUrl: "https://x.example/d", settingsUrl: "https://x.example/a" }),
    ];
    // The digest at its fullest is about 18 KB (the family's largest was
    // about 16 KB on ordinary inputs before the head and the alt texts).
    for (const { html } of fullest) expect(Buffer.byteLength(html)).toBeLessThan(24_000);
  });

  it("reads clean to a person: no glued or doubled words", () => {
    for (const { html, text } of all()) {
      expect(gluedWords(visibleText(html))).toEqual([]);
      expect(gluedWords(text)).toEqual([]);
    }
  });
});

describe("the Monday digest pictures each deal it names (#464)", () => {
  const base: DigestInput = {
    stages: [{ label: "Screening", count: 3 }],
    offersDue: [
      { name: "The Maddox", due: "Fri, Oct 2", url: "https://underwrite.example/deals/a", pictureUrl: thumb(1) },
      { name: "Pine & Oak", due: "Mon, Oct 5", url: "https://underwrite.example/deals/b", pictureUrl: thumb(2) },
    ],
    offersThrough: "Sun, Oct 11",
    verdicts: [
      { name: "Harbor Point", label: "Caution", color: "#a05a1c", url: "https://underwrite.example/deals/c", pictureUrl: thumb(3) },
    ],
    pipelineUrl: "https://underwrite.example/deals",
    settingsUrl: "https://underwrite.example/account",
  };

  it("puts the deal's square beside each name, linked like the name, the call at the row's end", () => {
    const { html, text } = weeklyDigestEmail(base);
    for (const [n, name] of [[1, "The Maddox"], [2, "Pine &amp; Oak"], [3, "Harbor Point"]] as const) {
      expect(html).toContain(`<img src="${thumb(n)}" width="48" height="48" alt="${name}"`);
    }
    expect(html).toContain('<a href="https://underwrite.example/deals/b" style="display:block;text-decoration:none;"><img');
    expect(html).toContain("Pine &amp; Oak");
    // The call follows the name once there is a picture before it.
    expect(html.indexOf("Harbor Point")).toBeLessThan(html.indexOf(">Caution</span>"));
    expect(text).not.toContain("picture");
  });

  it("offers the unsubscribe link in its footer where it has one, beside the Account page", () => {
    const url = "https://underwrite.example/api/email/unsubscribe/tok";
    const { html, text } = weeklyDigestEmail({ ...base, unsubscribeUrl: url });
    // The link opens a page whose button turns the digest off, with no
    // sign-in: it says that, and never "one click" — only the mail
    // program's own button, from the List-Unsubscribe headers, is one
    // click (audit c66).
    expect(html).toContain(`<a href="${url}" style="color:#114e54;">Unsubscribe without signing in</a>`);
    expect(html).toContain(">manage both emails on your Account page</a>");
    expect(text).toContain(`Unsubscribe without signing in: ${url} — or manage both emails on your Account page: ${base.settingsUrl}`);
    expect(`${html} ${text}`).not.toMatch(/one click/i);
    expect(a11yIssues(html)).toEqual([]);
    // Without one, the footer is as it was.
    expect(weeklyDigestEmail(base).html).toContain(">Turn it off on your Account page</a>");
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

describe("the screen-complete email's buy-box chip is labelled as the buy box's", () => {
  it("says \"Buy box:\" before the chip, as the plain-text part does, so it never reads as a second call", () => {
    const { html, text } = analysisReadyEmail({ ...ready, verdictLabel: "No-go", verdictColor: "#b23a30", buyBoxLabel: "Fit 82 · Pursue" });
    expect(text).toContain("Buy box: Fit 82 · Pursue");
    // In the card (the hidden preview line above it names both too).
    const call = html.indexOf(">No-go</span>");
    const chip = html.indexOf("Fit 82 · Pursue", call);
    expect(call).toBeGreaterThan(-1);
    expect(chip).toBeGreaterThan(call);
    // Nothing but the label's own words between the call and the chip.
    const between = html.slice(call + 1, chip).replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    expect(between).toBe("No-go Buy box:");
  });
});

describe("a screen that stopped says so by email (pass 14, 2026-10-01)", () => {
  const input = {
    dealName: "The Maddox <Brewerytown>",
    message: "The analysis service is overloaded right now — try again in a few minutes.",
    dealUrl: "https://app.example/deals/d1",
    settingsUrl: "https://app.example/account",
  };

  it("on a re-screen, says the previous call still stands, with its day", () => {
    const { html, text } = screenStoppedEmail({ ...input, previousCall: { label: "Go", color: "#1b7a5e", on: "Sep 12, 2026" } });
    expect(text).toContain("The previous call still stands: Go, screened Sep 12, 2026. It stays on the deal until a screen finishes.");
    // The pill, then the sentence beside it — the call said once in the card.
    expect(html).toMatch(/background-color:#1b7a5e;[^"]*">Go<\/span>/);
    expect(html).toContain("The previous call still stands, screened Sep 12, 2026. It stays on the deal until a screen finishes.");
    // And in the inbox's preview, after why it stopped.
    expect(/<div style="display:none;[^"]*">([^<]*)<\/div>/.exec(html)![1]).toMatch(/^The analysis service is overloaded.*The previous call still stands: Go/);
    // A call saved before the pipeline dated one is said without a day.
    expect(screenStoppedEmail({ ...input, previousCall: { label: "No-go", color: "#b23a30", on: null } }).text).toContain(
      "The previous call still stands: No-go. It stays",
    );
    expect(previousCallLine({ label: "Caution", on: "Oct 1, 2026" })).toBe(
      "The previous call still stands: Caution, screened Oct 1, 2026. It stays on the deal until a screen finishes.",
    );
    // A first screen has no call to stand.
    expect(screenStoppedEmail(input).text).not.toContain("still stands");
  });

  it("names the deal, says the deal page's own sentence and links back", () => {
    const { subject, html, text } = screenStoppedEmail(input);
    expect(subject).toBe("The Maddox <Brewerytown> — the screen stopped");
    expect(text).toContain("the screen stopped before its verdict");
    expect(text).toContain(input.message);
    expect(text).toContain("Open the deal: https://app.example/deals/d1");
    expect(html).toContain("The Maddox &lt;Brewerytown&gt;");
    expect(html).not.toContain("<Brewerytown>");
    expect(html).toContain('href="https://app.example/deals/d1"');
    expect(html).toContain("Turn them off on your Account page");
  });
});
