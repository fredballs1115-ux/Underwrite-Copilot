import { ImageResponse } from "next/og";

// Generated touch icon for iOS home-screen / bookmarks.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "flex-end",
          justifyContent: "center",
          gap: 16,
          background: "linear-gradient(180deg, #2b4a80, #1a3054)",
          paddingBottom: 40,
        }}
      >
        <div
          style={{
            width: 22,
            height: 40,
            borderRadius: 11,
            background: "rgba(255,255,255,0.85)",
          }}
        />
        <div
          style={{
            width: 22,
            height: 86,
            borderRadius: 11,
            background: "#8ab4f8",
          }}
        />
        <div
          style={{
            width: 22,
            height: 62,
            borderRadius: 11,
            background: "rgba(255,255,255,0.85)",
          }}
        />
      </div>
    ),
    { ...size },
  );
}
