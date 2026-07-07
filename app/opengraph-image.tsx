import { ImageResponse } from "next/og";

// Branded card shown when the site is shared (iMessage, Slack, X, LinkedIn…).
export const alt =
  "Underwrite Copilot — stop underwriting like a coin flip. Every CRE deal through the same disciplined screen.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SCENARIOS: [string, string, string][] = [
  ["Conservative", "No-go", "#f87171"],
  ["Base", "Caution", "#fbbf24"],
  ["Sponsor", "Go", "#4ade80"],
];

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#0c3338",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* Graph-paper grid */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(90deg, rgba(255,255,255,0.045) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        {/* Aqua glow, top-right */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "radial-gradient(circle at 85% 0%, rgba(127,214,204,0.28), transparent 55%)",
          }}
        />

        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            padding: "72px 80px",
            color: "white",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div
              style={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "center",
                gap: 6,
                width: 56,
                height: 56,
                borderRadius: 14,
                background: "linear-gradient(180deg, #19606a, #0c383d)",
                border: "1px solid rgba(255,255,255,0.2)",
                paddingBottom: 12,
              }}
            >
              <div
                style={{
                  width: 7,
                  height: 12,
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.85)",
                }}
              />
              <div
                style={{
                  width: 7,
                  height: 26,
                  borderRadius: 4,
                  background: "#7fd6cc",
                }}
              />
              <div
                style={{
                  width: 7,
                  height: 19,
                  borderRadius: 4,
                  background: "rgba(255,255,255,0.85)",
                }}
              />
            </div>
            <div style={{ fontSize: 28, fontWeight: 600 }}>
              Underwrite Copilot
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
            <div
              style={{
                fontSize: 78,
                fontWeight: 700,
                lineHeight: 1.04,
                letterSpacing: -2,
                maxWidth: 1000,
              }}
            >
              Stop underwriting like a coin flip.
            </div>
            <div
              style={{
                fontSize: 30,
                lineHeight: 1.4,
                color: "rgba(255,255,255,0.72)",
                maxWidth: 920,
              }}
            >
              Every CRE deal through the same disciplined screen — sourced
              ranges, the three deal-killers first, a Go / No-go that shows
              its work.
            </div>
          </div>

          <div style={{ display: "flex", gap: 14 }}>
            {SCENARIOS.map(([label, call, color]) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 20px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.07)",
                  border: "1px solid rgba(255,255,255,0.14)",
                  fontSize: 22,
                }}
              >
                <div
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 999,
                    background: color,
                  }}
                />
                <div style={{ color: "rgba(255,255,255,0.6)" }}>{label}</div>
                <div style={{ fontWeight: 600 }}>{call}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
