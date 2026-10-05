import "server-only";
import { ImageResponse } from "next/og";

// The site's plain card: the range-bars mark and the name on the brand teal,
// and nothing else — no headline, no claim, no figure. It is the preview of
// a link whose page is private: a shared deal screen had gone out under the
// homepage's advert ("Stop underwriting like a coin flip"), because a page
// that states no openGraph inherits the root layout's whole, picture and
// all. It never draws the deal — its name, its figures or its picture —
// since a chat app caches a preview long after the link that made it is
// revoked. Served by app/api/og/plain (lib/public-pages `PLAIN_CARD`).

export const PLAIN_CARD_SIZE = { width: 1200, height: 630 } as const;

/** The card, a 1200 × 630 PNG, cached a day by whoever fetches it: it
 *  changes only with a deploy. */
export function plainCard(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0c3338",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Graph-paper grid, as the site's other cards draw it */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage: "linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 28, color: "white" }}>
          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "center",
              gap: 10,
              width: 96,
              height: 96,
              borderRadius: 24,
              background: "linear-gradient(180deg, #19606a, #0c383d)",
              border: "1px solid rgba(255,255,255,0.2)",
              paddingBottom: 20,
            }}
          >
            <div style={{ width: 12, height: 21, borderRadius: 6, background: "rgba(255,255,255,0.85)" }} />
            <div style={{ width: 12, height: 45, borderRadius: 6, background: "#7fd6cc" }} />
            <div style={{ width: 12, height: 33, borderRadius: 6, background: "rgba(255,255,255,0.85)" }} />
          </div>
          <div style={{ fontSize: 64, fontWeight: 600, letterSpacing: -1 }}>Underwrite Copilot</div>
        </div>
      </div>
    ),
    { ...PLAIN_CARD_SIZE, headers: { "cache-control": "public, max-age=86400" } },
  );
}
