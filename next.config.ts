import type { NextConfig } from "next";

// Security headers applied to every response. The app serves confidential
// deal documents behind auth, so the priorities are: no framing (clickjacking
// on destructive actions like Delete account / Remove member), HSTS, and a
// conservative CSP. The CSP is deliberately permissive on style/img because
// Tailwind emits inline styles and the app uses inline SVG + data: images; it
// still blocks framing, plugins, and unknown script origins.
// React's dev server (Fast Refresh) needs eval(); production never does, so
// 'unsafe-eval' is included only in development and the prod CSP stays strict.
const scriptSrc =
  process.env.NODE_ENV === "development"
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : "script-src 'self' 'unsafe-inline'";

const CSP = [
  "default-src 'self'",
  // Next.js injects small inline bootstrap scripts; 'unsafe-inline' is required
  // until a nonce-based CSP is wired through the framework.
  scriptSrc,
  "style-src 'self' 'unsafe-inline'",
  // OpenStreetMap raster tiles power the comps map — without these hosts the
  // map renders as a blank gray canvas (tiles are <img> loads, so img-src).
  "img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org",
  "font-src 'self' data:",
  // Supabase (auth/storage/signed URLs) + Photon geocoder are the only
  // cross-origin fetch targets from the browser.
  "connect-src 'self' https://*.supabase.co https://photon.komoot.io",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-DNS-Prefetch-Control", value: "on" },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // OM PDFs are uploaded through a Server Action; raise the 1MB default.
      // 36mb = the 32MB PDF cap plus multipart/form-field overhead.
      bodySizeLimit: "36mb",
    },
    // Next 16 separately caps bodies on routes that pass through the proxy
    // (middleware) at 10MB — our session proxy runs on /deals, so without
    // this, uploads over 10MB truncate mid-stream ("Unexpected end of form")
    // no matter what bodySizeLimit says. Keep in lockstep with it.
    proxyClientMaxBodySize: "36mb",
  },
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
