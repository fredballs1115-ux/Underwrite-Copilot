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
          alignItems: "center",
          justifyContent: "center",
          background: "#114e54",
          color: "white",
          fontSize: 84,
          fontWeight: 700,
          letterSpacing: -2,
        }}
      >
        UC
      </div>
    ),
    { ...size },
  );
}
