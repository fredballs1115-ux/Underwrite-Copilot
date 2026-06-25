import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

// next/font downloads and self-hosts the fonts at build time (no extra network
// request for users) and exposes them as CSS variables we reference in the theme.
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

// This `metadata` export is how Next.js sets the <title> and <meta> tags —
// it's what shows in the browser tab and in link previews.
export const metadata: Metadata = {
  title: "Underwrite Copilot — One deal. Every angle.",
  description:
    "Self-serve CRE deal screening: extract terms from an offering memorandum, red-team the pro forma, reconcile it against your own underwriting model, sanity-check the market, and get a one-screen verdict.",
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
