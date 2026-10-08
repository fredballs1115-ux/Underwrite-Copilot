/**
 * The public-web comp search cites only what its search returned (research
 * pass 31, C6): a comp's source is linked only where it is a page the
 * web_search tool returned in that response, at the search's own address,
 * and a source the model named that the search did not return is its name
 * in words, said unverified — never a link. Driven by a fake response.
 */
import { describe, expect, it, vi } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const create = vi.hoisted(() => vi.fn());
vi.mock("./client", () => ({ getAnthropic: () => ({ messages: { create } }) }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => {
    throw new Error("the search itself writes nothing");
  },
}));

import { findPublicComps, type CompSearchResult } from "./comps-search";
import { returnedUrlFor, searchResultUrls, sourceUrlKey } from "./search-sources";
import { BrokerComps } from "@/app/(app)/deals/[id]/deal-sections";
import type { BrokerCompsResult } from "./types";
import { a11yIssues, gluedWords, visibleText } from "@/lib/render-lint";

const result = (url: string, title: string) => ({
  type: "web_search_result" as const,
  url,
  title,
  page_age: null,
  encrypted_content: "opaque",
});

const candidates = [
  // The search's page, written another way by the model: scheme, "www."
  // and a trailing slash differ.
  { name: "Oakwood Flats", sourceName: "Bisnow", sourceUrl: "http://bisnow.com/philadelphia/news/oakwood-flats-sold/" },
  // The same page as the search's but for its query: another page.
  { name: "Maple Court", sourceName: "Trade Weekly", sourceUrl: "https://www.tradeweekly.example.com/deals/maple-court?id=8" },
  // A page the search never returned.
  { name: "Elm Row", sourceName: "CRE Wire", sourceUrl: "https://invented.example.com/made-up-sale" },
  // A page the search returned from code execution (dynamic filtering),
  // with a fragment the model added.
  { name: "Birch Hall", sourceName: "City records", sourceUrl: "https://records.phila.example.gov/sales/987#sale" },
  // A page the model's text cites.
  { name: "Cedar Lofts", sourceName: "Cited Daily", sourceUrl: "https://cited.example.com/a" },
  // Not a web address at all.
  { name: "Pine Yard", sourceName: "Somewhere", sourceUrl: "javascript:alert(1)" },
].map((c) => ({ location: "Philadelphia, PA", detail: "$10,000,000", date: "2026-05", note: "", ...c }));

const content = [
  { type: "server_tool_use", id: "srvtoolu_1", name: "web_search", input: { query: "Philadelphia multifamily sale" } },
  {
    type: "web_search_tool_result",
    tool_use_id: "srvtoolu_1",
    caller: { type: "direct" },
    content: [
      result("https://www.bisnow.com/philadelphia/news/oakwood-flats-sold", "Oakwood Flats sold"),
      result("https://www.tradeweekly.example.com/deals/maple-court?id=7", "Maple Court"),
    ],
  },
  {
    type: "web_search_tool_result",
    tool_use_id: "srvtoolu_2",
    caller: { type: "code_execution_20260120", tool_id: "srvtoolu_x" },
    content: [result("https://records.phila.example.gov/sales/987", "Sale 987")],
  },
  // A search that failed answers with an error object, not a list.
  {
    type: "web_search_tool_result",
    tool_use_id: "srvtoolu_3",
    caller: { type: "direct" },
    content: { type: "web_search_tool_result_error", error_code: "max_uses_exceeded" },
  },
  {
    type: "text",
    text: "Five sales found.",
    citations: [
      { type: "web_search_result_location", url: "https://cited.example.com/a", title: "A", cited_text: "sold", encrypted_index: "x" },
    ],
  },
  {
    type: "text",
    text: "```json\n" + JSON.stringify({ summary: "Unverified public-web sales.", candidates: [...candidates, "not a comp"] }) + "\n```",
    citations: null,
  },
] as unknown as Anthropic.ContentBlock[];

describe("what the search returned", () => {
  it("reads every result list, a code execution search's too, and every web citation, once each", () => {
    expect(searchResultUrls(content)).toEqual([
      "https://www.bisnow.com/philadelphia/news/oakwood-flats-sold",
      "https://www.tradeweekly.example.com/deals/maple-court?id=7",
      "https://records.phila.example.gov/sales/987",
      "https://cited.example.com/a",
    ]);
    expect(searchResultUrls([])).toEqual([]);
  });

  it("matches two writings of one page, and never a different path, query or scheme of address", () => {
    expect(sourceUrlKey("HTTPS://WWW.Example.com/a/b/")).toBe("example.com/a/b");
    expect(sourceUrlKey("http://example.com/a/b#x")).toBe("example.com/a/b");
    expect(sourceUrlKey("https://example.com/a/b?q=1")).not.toBe(sourceUrlKey("https://example.com/a/b?q=2"));
    expect(sourceUrlKey("https://example.com/a/c")).not.toBe(sourceUrlKey("https://example.com/a/b"));
    expect(sourceUrlKey("javascript:alert(1)")).toBeNull();
    expect(sourceUrlKey("not a url")).toBeNull();
    // The link is the search's own address, never the model's writing of it.
    const returned = searchResultUrls(content);
    expect(returnedUrlFor("http://bisnow.com/philadelphia/news/oakwood-flats-sold/", returned)).toBe(
      "https://www.bisnow.com/philadelphia/news/oakwood-flats-sold",
    );
    expect(returnedUrlFor("", returned)).toBeNull();
    expect(returnedUrlFor(undefined, returned)).toBeNull();
  });
});

describe("findPublicComps — each source held to the pages its search returned", () => {
  it("links a returned page at the search's address and keeps any other source as unlinked words", async () => {
    create.mockResolvedValueOnce({ content, stop_reason: "end_turn" });
    const found = await findPublicComps({ name: "The Maddox", address: "", market: "Philadelphia", assetClass: "multifamily" });
    const by = (name: string) => found.candidates.find((c) => c.name === name)!;
    // A candidate that is not an object is dropped, not spread.
    expect(found.candidates).toHaveLength(6);
    expect(by("Oakwood Flats")).toMatchObject({
      sourceName: "Bisnow",
      sourceUrl: "https://www.bisnow.com/philadelphia/news/oakwood-flats-sold",
      sourceInSearch: true,
    });
    expect(by("Birch Hall")).toMatchObject({ sourceUrl: "https://records.phila.example.gov/sales/987", sourceInSearch: true });
    expect(by("Cedar Lofts")).toMatchObject({ sourceUrl: "https://cited.example.com/a", sourceInSearch: true });
    for (const name of ["Maple Court", "Elm Row", "Pine Yard"]) {
      expect(by(name), name).toMatchObject({ sourceUrl: "", sourceInSearch: false });
      // The name stays: the source is said, unverified.
      expect(by(name).sourceName, name).not.toBe("");
    }
    // The prompt asks for the address as the search returned it.
    const sent = JSON.stringify(create.mock.calls[0][0]);
    expect(sent).toContain("the URL exactly as your search returned that page");
  });
});

describe("the deal page's public-web comps — a link only where the search returned the page", () => {
  const empty = { summary: "", saleComps: [], leaseComps: [], redFlags: [] } as unknown as BrokerCompsResult;
  const draw = (compSearch: CompSearchResult) =>
    renderToStaticMarkup(
      React.createElement(BrokerComps, { result: empty, dealId: "d1", compSearch, active: false, isPro: true }),
    );

  it("links the returned pages and says the rest as unverified words", async () => {
    create.mockResolvedValueOnce({ content, stop_reason: "end_turn" });
    const found = await findPublicComps({ name: "The Maddox", address: "", market: "Philadelphia", assetClass: "multifamily" });
    const html = draw(found);
    const text = visibleText(html);
    expect(html).toContain('href="https://www.bisnow.com/philadelphia/news/oakwood-flats-sold"');
    expect(html).toContain('href="https://records.phila.example.gov/sales/987"');
    expect(html).not.toContain("invented.example.com");
    // (React writes its own "javascript:" placeholder into the card's
    // server-action form; no link may carry one.)
    expect(html).not.toMatch(/href="javascript:/);
    expect(html).not.toContain("maple-court?id=8");
    expect(text).toContain("CRE Wire · unverified, not a page the search returned");
    expect(gluedWords(text)).toEqual([]);
    expect(a11yIssues(html)).toEqual([]);
  });

  it("never links a source stored before the check, whatever its address", () => {
    const legacy: CompSearchResult = {
      summary: "An older search.",
      searchedAt: "2026-09-01T00:00:00.000Z",
      candidates: [
        { name: "Old Comp", location: "", detail: "", date: "", note: "", sourceName: "Old Wire", sourceUrl: "https://old.example.com/sale" },
      ],
    };
    const html = draw(legacy);
    expect(html).not.toContain('href="https://old.example.com/sale"');
    expect(visibleText(html)).toContain("Old Wire · unverified, not checked against the search's pages");
  });
});
