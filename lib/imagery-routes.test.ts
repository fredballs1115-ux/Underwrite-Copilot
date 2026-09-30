/**
 * The public imagery routes and the link preview's card, driven with the
 * network faked. An id is read against the site's own tables, so one that
 * names what every object inherits ("constructor", "__proto__") is a 404
 * that asks nobody for anything — never a photograph with no file, or a 500.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as skylineRoute } from "@/app/api/imagery/skyline/[id]/route";
import { GET as metroRoute } from "@/app/api/imagery/metro/[id]/route";
import { GET as ogRoute } from "@/app/api/og/market/[id]/route";

type Route = (req: Request, ctx: { params: Promise<{ id: string }> }) => Promise<Response>;

const fetcher = vi.fn(async (): Promise<Response> => new Response(null, { status: 500 }));

beforeEach(() => {
  fetcher.mockClear();
  vi.stubGlobal("fetch", fetcher);
});
afterEach(() => vi.unstubAllGlobals());

const ask = (route: Route, url: string, id: string) =>
  route(new Request(`http://site.test${url}`), { params: Promise.resolve({ id }) });

describe("an id off the URL that names an inherited property", () => {
  it.each(["constructor", "__proto__", "toString", "hasOwnProperty"])(
    "%s is no market to the skyline, the overhead or the card, and nothing is fetched",
    async (id) => {
      expect((await ask(skylineRoute, `/api/imagery/skyline/${id}?w=1600`, id)).status).toBe(404);
      expect((await ask(metroRoute, `/api/imagery/metro/${id}?w=480&h=360`, id)).status).toBe(404);
      expect((await ask(ogRoute, `/api/og/market/${id}`, id)).status).toBe(404);
      expect(fetcher).not.toHaveBeenCalled();
    },
  );
});
