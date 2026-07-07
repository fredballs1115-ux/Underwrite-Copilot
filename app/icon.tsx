import { ImageResponse } from "next/og";

// Generated favicon — the range-bars mark on the brand teal.
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 3,
          background: "linear-gradient(180deg, #2b4a80, #1a3054)",
          borderRadius: 7,
          paddingBottom: 7,
        }}
      >
        <div
          style={{
            width: 4,
            height: 7,
            borderRadius: 2,
            background: "rgba(255,255,255,0.85)",
          }}
        />
        <div
          style={{ width: 4, height: 15, borderRadius: 2, background: "#8ab4f8" }}
        />
        <div
          style={{
            width: 4,
            height: 11,
            borderRadius: 2,
            background: "rgba(255,255,255,0.85)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
