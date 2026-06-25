import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // OM PDFs are uploaded through a Server Action; raise the 1MB default.
      bodySizeLimit: "32mb",
    },
  },
};

export default nextConfig;
