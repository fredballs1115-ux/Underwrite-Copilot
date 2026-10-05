// Reading every row past a project's row cap, and naming many ids a hundred
// at a time (lib/read-all, research pass 42).
import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import {
  ID_CHUNK,
  IN_LIST_CHARS,
  READ_PAGE,
  chunks,
  chunksBySize,
  readAll,
  readAllResult,
  readByIds,
  readByValues,
} from "./read-all";

/** A table that answers at most `cap` rows a response, as a project's max
 *  rows does — a normal success, with no sign the rest exist. */
function table(n: number, cap: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
  const asked: [number, number][] = [];
  const page = (from: number, to: number) => {
    asked.push([from, to]);
    return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + cap)), error: null });
  };
  return { page, asked };
}

describe("readAll", () => {
  it("reads every row of a table larger than one response, in order, ending at an empty page", async () => {
    const t = table(2_345, 1_000);
    const got = await readAll(t.page);
    expect(got?.length).toBe(2_345);
    expect(got?.map((r) => r.id)).toEqual(Array.from({ length: 2_345 }, (_, i) => i));
    expect(t.asked[0]).toEqual([0, READ_PAGE - 1]);
    expect(t.asked.at(-1)?.[0]).toBe(2_345);
  });

  it("reads a server set to answer fewer rows than a page asks for", async () => {
    const t = table(25, 7);
    expect((await readAll(t.page))?.length).toBe(25);
    expect(t.asked.map(([from]) => from)).toEqual([0, 7, 14, 21, 25]);
  });

  it("is null on a failed page, and says why", async () => {
    const said: unknown[] = [];
    const got = await readAll(
      (from) => Promise.resolve(from === 0 ? { data: [{ id: 0 }], error: null } : { data: null, error: { message: "timeout" } }),
      (e) => said.push(e),
    );
    expect(got).toBeNull();
    expect(said).toEqual([{ message: "timeout" }]);
  });
});

describe("readAllResult", () => {
  it("answers as a query does: every row, or none and the error", async () => {
    expect(await readAllResult(table(5, 2).page)).toEqual({ data: [0, 1, 2, 3, 4].map((id) => ({ id })), error: null });
    const failed = await readAllResult(() => Promise.resolve({ data: null, error: { message: "relation does not exist" } }));
    expect(failed).toEqual({ data: null, error: { message: "relation does not exist" } });
  });
});

describe("chunks and readByIds", () => {
  it("names a hundred ids a request", () => {
    expect(ID_CHUNK).toBe(100);
    expect(chunks(Array.from({ length: 250 }, (_, i) => i)).map((c) => c.length)).toEqual([100, 100, 50]);
    expect(chunks([])).toEqual([]);
  });

  it("reads every chunk's rows, in the ids' order", async () => {
    const ids = Array.from({ length: 1_000 }, (_, i) => `d${i}`);
    const asked: number[] = [];
    const got = await readByIds(ids, (chunk) => {
      asked.push(chunk.length);
      return Promise.resolve({ data: chunk.map((id) => ({ id })), error: null });
    });
    expect(asked).toEqual(Array(10).fill(100));
    expect(got?.map((r) => r.id)).toEqual(ids);
  });

  it("is null when any chunk fails — never the rows of the others, as if the rest had none", async () => {
    const said: unknown[] = [];
    const got = await readByIds(
      Array.from({ length: 300 }, (_, i) => `d${i}`),
      (chunk) => Promise.resolve(chunk[0] === "d100" ? { data: null, error: { message: "414" } } : { data: chunk.map((id) => ({ id })), error: null }),
      (e) => said.push(e),
    );
    expect(got).toBeNull();
    expect(said).toEqual([{ message: "414" }]);
  });

  it("reads no ids as no rows, without a request", async () => {
    let n = 0;
    expect(await readByIds([], () => (n++, Promise.resolve({ data: [], error: null })))).toEqual([]);
    expect(n).toBe(0);
  });
});

// A news story's address, as the intel job reads it from Google News: a few
// hundred characters, where an id is thirty-six.
const story = (i: number) =>
  `https://news.google.com/rss/articles/CBMi${"qAFBVV95cUxQb2RmT2pQdXl0bF8tZm1Ja3R1VTVRVHlFT0JHUzZKVzBlVDhUZUhs".repeat(4)}${i}?oc=5`;

describe("chunksBySize and readByValues", () => {
  it("cuts a list of long values by what a request line carries, as well as by count", () => {
    const urls = Array.from({ length: 100 }, (_, i) => story(i));
    const runs = chunksBySize(urls);
    expect(runs.length).toBeGreaterThan(5);
    expect(runs.flat()).toEqual(urls);
    for (const run of runs) {
      expect(run.reduce((n, u) => n + encodeURIComponent(u).length + 9, 0)).toBeLessThanOrEqual(IN_LIST_CHARS);
    }
    // ids keep their hundred a request, and a value longer than the line
    // alone is a run of its own rather than a lost one
    expect(chunksBySize(Array.from({ length: 250 }, (_, i) => `d${i}`)).map((r) => r.length)).toEqual([100, 100, 50]);
    expect(chunksBySize(["x".repeat(5_000), "y"]).map((r) => r.length)).toEqual([1, 1]);
    expect(chunksBySize([])).toEqual([]);
  });

  it("puts each run in a request line a proxy carries, where a hundred stories in one did not", async () => {
    const urls: string[] = [];
    const client = createClient("https://project.supabase.co", "anon-key", {
      global: {
        fetch: async (input: RequestInfo | URL) => {
          urls.push(String(input));
          return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
        },
      },
    });
    const stories = Array.from({ length: 100 }, (_, i) => story(i));
    await readByValues(stories, (run) => client.from("market_intel_items").select("url").in("url", run));
    expect(urls.length).toBeGreaterThan(5);
    for (const u of urls) expect(u.length).toBeLessThan(8_192);
    // The old read: a hundred at once.
    await client.from("market_intel_items").select("url").in("url", stories);
    expect(urls.at(-1)!.length).toBeGreaterThan(8_192);
  });

  it("hands back the values of a run whose read failed, with no rows for them — never as none matched", async () => {
    const values = Array.from({ length: 250 }, (_, i) => `v${i}`);
    const said: number[] = [];
    const { rows, unread } = await readByValues(
      values,
      (run) => {
        if (run[0] === "v100") return Promise.resolve({ data: null, error: { message: "414 URI Too Long" } });
        if (run[0] === "v200") return Promise.reject(new Error("socket hang up"));
        return Promise.resolve({ data: run.filter((v) => Number(v.slice(1)) % 2 === 0).map((v) => ({ v })), error: null });
      },
      (_e, run) => said.push(run.length),
    );
    expect(unread).toEqual(values.slice(100));
    expect(said).toEqual([100, 50]);
    expect(rows.map((r) => r.v)).toEqual(values.slice(0, 100).filter((_, i) => i % 2 === 0));
  });
});
