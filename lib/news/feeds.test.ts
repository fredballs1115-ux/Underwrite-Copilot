import { describe, expect, it } from "vitest";
import {
  NEWS_SOURCES,
  decodeText,
  parseFeed,
  rankHeadlines,
  scoreHeadline,
  timeAgo,
  toSnippet,
  type FeedItem,
  type NewsSource,
} from "./feeds";

const NOW = Date.parse("2026-09-07T18:00:00Z");

const src = (over: Partial<NewsSource> = {}): NewsSource => ({
  id: "test-pub",
  name: "Test Publisher",
  home: "https://pub.example/",
  feed: "https://pub.example/feed/",
  kind: "publisher",
  cap: 3,
  ...over,
});

/** A WordPress RSS 2.0 feed the way Commercial Observer / The Real Deal emit it. */
const RSS = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/">
<channel>
  <title>Test Publisher</title>
  <item>
    <title><![CDATA[Blackstone Buys $1.2B Industrial Portfolio at a 5.4% Cap Rate]]></title>
    <link>https://pub.example/2026/09/07/blackstone-industrial/</link>
    <pubDate>Mon, 07 Sep 2026 14:30:00 +0000</pubDate>
    <dc:creator><![CDATA[Staff]]></dc:creator>
    <description><![CDATA[<p>The deal &amp; its pricing signal that <b>cap rates</b> for warehouses have stopped rising&hellip; more text follows here for the snippet.</p>]]></description>
  </item>
  <item>
    <title>Local Bakery Opens Second Location</title>
    <link>https://pub.example/2026/09/06/bakery/</link>
    <pubDate>Sun, 06 Sep 2026 09:00:00 +0000</pubDate>
    <description>A charming story with nothing about property.</description>
  </item>
  <item>
    <title>No link here</title>
    <pubDate>Sun, 06 Sep 2026 09:00:00 +0000</pubDate>
  </item>
</channel>
</rss>`;

/** Atom, the way the Federal Reserve press feed is shaped. */
const ATOM = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Press Releases</title>
  <entry>
    <title>Federal Reserve issues FOMC statement</title>
    <link rel="alternate" type="text/html" href="https://www.federalreserve.gov/newsevents/pressreleases/monetary20260907a.htm"/>
    <link rel="self" href="https://www.federalreserve.gov/feeds/press_all.xml"/>
    <published>2026-09-07T18:00:00Z</published>
    <updated>2026-09-07T18:05:00Z</updated>
    <summary type="html">&lt;p&gt;The Committee decided to lower the target range for the federal funds rate.&lt;/p&gt;</summary>
  </entry>
</feed>`;

/** Google News search RSS: the outlet rides in <source>, the title carries a " - Outlet" suffix. */
const GOOGLE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel><title>"commercial real estate" - Google News</title>
<item>
  <title>Office Loan Delinquencies Hit 11% as CMBS Distress Deepens - Bisnow</title>
  <link>https://news.google.com/rss/articles/CBMiabc?oc=5</link>
  <pubDate>Mon, 07 Sep 2026 12:10:00 GMT</pubDate>
  <description>&lt;a href="https://news.google.com/rss/articles/CBMiabc?oc=5"&gt;Office Loan Delinquencies Hit 11%&lt;/a&gt;&amp;nbsp;&amp;nbsp;&lt;font color="#6f6f6f"&gt;Bisnow&lt;/font&gt;</description>
  <source url="https://www.bisnow.com">Bisnow</source>
</item>
<item>
  <title>Office Loan Delinquencies Hit 11% as CMBS Distress Deepens - Bisnow</title>
  <link>https://news.google.com/rss/articles/CBMiDUP?oc=5</link>
  <pubDate>Mon, 07 Sep 2026 12:40:00 GMT</pubDate>
  <source url="https://www.bisnow.com">Bisnow</source>
</item>
</channel></rss>`;

describe("decodeText / toSnippet", () => {
  it("unwraps CDATA and decodes named, decimal and hex entities", () => {
    expect(decodeText("<![CDATA[Tom &amp; Jerry &#8217;s &#x27;deal&#x27;]]>")).toBe("Tom & Jerry ’s 'deal'");
    expect(decodeText("a &nbsp; b\n\n  c")).toBe("a b c");
  });

  it("strips tags and caps at a word boundary with an ellipsis", () => {
    const long = `<p>${"word ".repeat(80)}</p>`;
    const s = toSnippet(long);
    expect(s.length).toBeLessThanOrEqual(221);
    expect(s.endsWith("…")).toBe(true);
    expect(s).not.toContain("<");
  });
});

describe("parseFeed", () => {
  it("reads a WordPress RSS feed: title, link, date, snippet, publisher from the source", () => {
    const items = parseFeed(RSS, src());
    expect(items).toHaveLength(2); // the link-less item is dropped
    expect(items[0]).toMatchObject({
      title: "Blackstone Buys $1.2B Industrial Portfolio at a 5.4% Cap Rate",
      url: "https://pub.example/2026/09/07/blackstone-industrial/",
      publisher: "Test Publisher",
      publisherUrl: "https://pub.example/",
      publishedAt: "2026-09-07T14:30:00.000Z",
      sourceId: "test-pub",
    });
    expect(items[0].snippet).toBe(
      "The deal & its pricing signal that cap rates for warehouses have stopped rising… more text follows here for the snippet.",
    );
  });

  it("reads an Atom feed, taking the alternate link and the published date", () => {
    const items = parseFeed(ATOM, src({ id: "fed", name: "Federal Reserve" }));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: "Federal Reserve issues FOMC statement",
      url: "https://www.federalreserve.gov/newsevents/pressreleases/monetary20260907a.htm",
      publishedAt: "2026-09-07T18:00:00.000Z",
      publisher: "Federal Reserve",
    });
    expect(items[0].snippet).toBe("The Committee decided to lower the target range for the federal funds rate.");
  });

  it("names the outlet on a Google News item and drops the title suffix", () => {
    const items = parseFeed(GOOGLE, src({ id: "gn", name: "Google News · CRE", kind: "topic", cap: 5 }));
    expect(items[0]).toMatchObject({
      title: "Office Loan Delinquencies Hit 11% as CMBS Distress Deepens",
      publisher: "Bisnow",
      publisherUrl: "https://www.bisnow.com",
    });
  });

  it("returns nothing for garbage, never throws", () => {
    expect(parseFeed("<html>not a feed</html>", src())).toEqual([]);
    expect(parseFeed("", src())).toEqual([]);
  });

  it("treats an unparseable date as unknown, not as now", () => {
    const xml = `<rss><channel><item><title>T</title><link>https://x.example/a</link><pubDate>whenever</pubDate></item></channel></rss>`;
    expect(parseFeed(xml, src())[0].publishedAt).toBeNull();
  });
});

describe("scoreHeadline", () => {
  const base: FeedItem = {
    title: "",
    url: "https://x.example/1",
    publisher: "P",
    publisherUrl: null,
    publishedAt: new Date(NOW - 2 * 3_600_000).toISOString(),
    snippet: "",
    sourceId: "test-pub",
  };

  it("ranks a fresh cap-rate / distress story above a fresh story about nothing", () => {
    const signal = scoreHeadline({ ...base, title: "CMBS delinquencies climb as office cap rates widen" }, NOW);
    const noise = scoreHeadline({ ...base, title: "Local bakery opens second location" }, NOW);
    expect(signal).toBeGreaterThan(noise);
  });

  it("lets recency decide between two stories with the same signal", () => {
    const fresh = scoreHeadline({ ...base, title: "Fed cuts rates" }, NOW);
    const old = scoreHeadline(
      { ...base, title: "Fed cuts rates", publishedAt: new Date(NOW - 5 * 86_400_000).toISOString() },
      NOW,
    );
    expect(fresh).toBeGreaterThan(old);
  });

  it("caps the signal so a keyword-stuffed headline cannot outrank everything forever", () => {
    const stuffed = scoreHeadline(
      {
        ...base,
        title: "Fed cap rates CMBS distress rent control tariffs multifamily vacancy refinance sale",
        publishedAt: new Date(NOW - 9 * 86_400_000).toISOString(),
      },
      NOW,
    );
    const freshPlain = scoreHeadline({ ...base, title: "Apartment portfolio trades in Dallas" }, NOW);
    expect(stuffed).toBeLessThanOrEqual(5 + 0.8);
    expect(freshPlain).toBeGreaterThan(3);
  });

  it("gives an undated item a middling recency, never zero", () => {
    expect(scoreHeadline({ ...base, publishedAt: null, title: "x" }, NOW)).toBeGreaterThan(0);
  });
});

describe("rankHeadlines", () => {
  const mk = (over: Partial<FeedItem>): FeedItem => ({
    title: "t",
    url: "https://x.example/" + Math.random(),
    publisher: "P",
    publisherUrl: null,
    publishedAt: new Date(NOW - 3_600_000).toISOString(),
    snippet: "",
    sourceId: "test-pub",
    ...over,
  });

  it("drops the same story arriving from two feeds, by URL or by title", () => {
    const items = [
      mk({ title: "Fed cuts rates", url: "https://a.example/fed" }),
      mk({ title: "Fed cuts rates", url: "https://b.example/fed", sourceId: "gn" }),
      mk({ title: "Different", url: "https://a.example/fed?utm=1" }), // same URL, tracking params
    ];
    const ranked = rankHeadlines(items, [src({ cap: 5 }), src({ id: "gn", cap: 5 })], NOW);
    expect(ranked).toHaveLength(1);
  });

  it("caps each source's share so one publisher cannot fill the page", () => {
    const items = Array.from({ length: 10 }, (_, i) => mk({ title: `Story ${i} about cap rates` }));
    const ranked = rankHeadlines(items, [src({ cap: 3 })], NOW);
    expect(ranked).toHaveLength(3);
  });

  it("drops anything older than ten days — live means live", () => {
    const items = [
      mk({ title: "Old", publishedAt: new Date(NOW - 12 * 86_400_000).toISOString() }),
      mk({ title: "New" }),
    ];
    expect(rankHeadlines(items, [src()], NOW).map((i) => i.title)).toEqual(["New"]);
  });

  it("keeps undated items (some feeds omit dates) and honours the overall limit", () => {
    const items = [mk({ publishedAt: null, title: "Undated" }), mk({ title: "Dated" }), mk({ title: "Third" })];
    expect(rankHeadlines(items, [src({ cap: 9 })], NOW, 2)).toHaveLength(2);
    expect(rankHeadlines(items, [src({ cap: 9 })], NOW).some((i) => i.title === "Undated")).toBe(true);
  });

  it("puts the most decision-relevant headline first", () => {
    const items = [
      mk({ title: "Bakery opens" }),
      mk({ title: "Office CMBS delinquency rate hits record as Fed holds rates" }),
      mk({ title: "New parking garage" }),
    ];
    expect(rankHeadlines(items, [src({ cap: 9 })], NOW)[0].title).toMatch(/CMBS/);
  });
});

describe("NEWS_SOURCES", () => {
  it("every source has an https feed, a home page and a share", () => {
    for (const s of NEWS_SOURCES) {
      expect(s.feed).toMatch(/^https:\/\//);
      expect(s.home).toMatch(/^https:\/\//);
      expect(s.cap).toBeGreaterThan(0);
    }
    expect(new Set(NEWS_SOURCES.map((s) => s.id)).size).toBe(NEWS_SOURCES.length);
  });

  it("carries publisher feeds first and Google News topics as the backstop", () => {
    const kinds = NEWS_SOURCES.map((s) => s.kind);
    expect(kinds[0]).toBe("publisher");
    expect(kinds.at(-1)).toBe("topic");
    expect(NEWS_SOURCES.filter((s) => s.kind === "publisher").length).toBeGreaterThanOrEqual(6);
  });
});

describe("timeAgo", () => {
  it("reads naturally at each scale", () => {
    expect(timeAgo(new Date(NOW - 20 * 60_000).toISOString(), NOW)).toBe("just now");
    expect(timeAgo(new Date(NOW - 5 * 3_600_000).toISOString(), NOW)).toBe("5h ago");
    expect(timeAgo(new Date(NOW - 30 * 3_600_000).toISOString(), NOW)).toBe("yesterday");
    expect(timeAgo("2026-09-01T12:00:00Z", NOW)).toBe("Sep 1");
    expect(timeAgo(null, NOW)).toBe("");
  });
});
