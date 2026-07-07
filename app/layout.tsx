import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// next/font downloads and self-hosts the fonts at build time (no extra network
// request for users) and exposes them as CSS variables we reference in the theme.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// The canonical public URL — used as the base for Open Graph / canonical links
// and the sitemap. Override per environment via NEXT_PUBLIC_APP_URL.
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ?? "https://underwrite-copilot.onrender.com";

// This `metadata` export is how Next.js sets the <title> and <meta> tags —
// it's what shows in the browser tab, in Google results, and in link previews.
// Colors the browser chrome (mobile address bar) to match the brand.
export const viewport: Viewport = {
  themeColor: "#0c3338",
};

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: "Underwrite Copilot — Consistent CRE underwriting, every deal",
    template: "%s · Underwrite Copilot",
  },
  description:
    "Run every commercial real estate deal through the same disciplined screen: rent, expenses, and cap as sourced ranges; the three deal-killers stressed first; a Go / No-Go that shows its work before you open a model. One method, every deal.",
  keywords: [
    "CRE underwriting",
    "commercial real estate underwriting software",
    "deal screening",
    "offering memorandum analysis",
    "underwriting model",
    "pro forma analysis",
    "real estate acquisitions",
  ],
  applicationName: "Underwrite Copilot",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: APP_URL,
    siteName: "Underwrite Copilot",
    title: "Stop underwriting like a coin flip.",
    description:
      "Same deal, same afternoon, 800 bps apart — that's a coin flip with a spreadsheet attached. Underwrite Copilot gives every deal the same rigor: sourced ranges, the three deal-killers first, a verdict that shows its work.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Stop underwriting like a coin flip.",
    description:
      "Every CRE deal through the same disciplined screen — sourced ranges, deal-killers first, a Go / No-Go that shows its work. One method, every deal.",
  },
  robots: { index: true, follow: true },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <body className="flex min-h-full flex-col font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
