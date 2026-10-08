import type Anthropic from "@anthropic-ai/sdk";

/**
 * What a web search actually returned, and a model-written source held to
 * it (research pass 31, C6). The public-web comp search asks the model to
 * write each comp's source name and URL into its JSON, and the deal page
 * printed that URL as the comp's source link — the model's own text, so a
 * mistyped or invented address would have been printed as the citation. A
 * source is linked only where it is a page the search returned.
 *
 * Pure: the SDK's types only, so a test reads a fake response with it.
 */

/**
 * Every page a response's web searches returned: the results of each
 * `web_search_tool_result` block (a list on success, an error object
 * otherwise — server-tool errors do not raise), and the address of every
 * web search citation on its text. A search the model runs through dynamic
 * filtering (`web_search_20260209` calls it from code execution) still
 * answers as a `web_search_tool_result` block, its `caller` saying so, as
 * the SDK's types (0.106) declare. Each address once, in the order first
 * seen.
 */
export function searchResultUrls(content: readonly Anthropic.ContentBlock[]): string[] {
  const urls: string[] = [];
  for (const block of content) {
    if (block.type === "web_search_tool_result") {
      if (!Array.isArray(block.content)) continue;
      for (const result of block.content) {
        if (result.type === "web_search_result" && typeof result.url === "string" && result.url) urls.push(result.url);
      }
    } else if (block.type === "text" && Array.isArray(block.citations)) {
      for (const c of block.citations) {
        if (c.type === "web_search_result_location" && typeof c.url === "string" && c.url) urls.push(c.url);
      }
    }
  }
  return [...new Set(urls)];
}

/**
 * The key two writings of one address share: an http(s) address, its host
 * in lower case with a leading "www." set aside, its path without a
 * trailing slash, and its query; the scheme and the fragment set aside.
 * Null for anything that is not an http(s) address. Nothing looser: a
 * different path or query is a different page.
 */
export function sourceUrlKey(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  const host = u.host.toLowerCase().replace(/^www\./, "");
  const path = u.pathname.replace(/\/+$/, "");
  return `${host}${path}${u.search}`;
}

/**
 * The address the search returned for a model-written source, or null where
 * the search returned no such page. The link a page draws is always the
 * search's own address, never the model's writing of it.
 */
export function returnedUrlFor(modelUrl: unknown, returned: readonly string[]): string | null {
  if (typeof modelUrl !== "string" || !modelUrl.trim()) return null;
  const key = sourceUrlKey(modelUrl);
  if (!key) return null;
  return returned.find((u) => sourceUrlKey(u) === key) ?? null;
}
