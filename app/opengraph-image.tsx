import { ImageResponse } from "next/og";

// Branded card shown when the site is shared (iMessage, Slack, X, LinkedIn…).
export const alt =
  "Underwrite Copilot — stop underwriting like a coin flip. Every CRE deal through the same disciplined screen.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SCENARIOS: [string, string, string][] = [
  ["Conservative", "No-Go", "#f87171"],
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
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#0c3338",
          padding: "72px 80px",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 56,
              height: 56,
              borderRadius: 12,
              background: "rgba(255,255,255,0.12)",
              border: "1px solid rgba(255,255,255,0.18)",
              fontSize: 24,
              fontWeight: 700,
            }}
          >
            UC
          </div>
          <div style={{ fontSize: 28, fontWeight: 600 }}>Underwrite Copilot</div>
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
            Every CRE deal through the same disciplined screen — sourced ranges,
            the three deal-killers first, a reproducible Go / No-Go.
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
    ),
    { ...size },
  );
}
