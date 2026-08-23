import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SPREAD_BPS } from "@/lib/marketing-constants";
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
    "Run every commercial real estate deal through the same disciplined screen: rent, expenses, and cap as sourced ranges; the three deal-killers stressed first; a Go / No-go that shows its work before you open a model. One method, every deal.",
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
  openGraph: {
    type: "website",
    url: APP_URL,
    siteName: "Underwrite Copilot",
    title: "Stop underwriting like a coin flip.",
    description: `Same deal, same afternoon, ${SPREAD_BPS} bps apart — that's a coin flip with a spreadsheet attached. Underwrite Copilot gives every deal the same rigor: sourced ranges, the three deal-killers first, a verdict that shows its work.`,
  },
  twitter: {
    card: "summary_large_image",
    title: "Stop underwriting like a coin flip.",
    description:
      "Every CRE deal through the same disciplined screen — sourced ranges, deal-killers first, a Go / No-go that shows its work. One method, every deal.",
  },
  robots: { index: true, follow: true },
};

// Baked into every rendered page: the sha of the build that produced THIS
// HTML. The self-heal script below compares it to /api/build (the running
// server, no-store) and reloads once when they differ — the cure for
// browsers still holding a copy from before the freshness fix, whose
// stale-while-revalidate grant ran for a year, and for restored mobile
// tabs that never refetch. Scoped to the public ISR pages (the only ones
// whose HTML can be stale) so an app page mid-form-entry never reloads.
const BUILD_SHA = (process.env.RENDER_GIT_COMMIT ?? "").slice(0, 7);

const SELF_HEAL_SCRIPT = `(function(){
var served=${JSON.stringify(BUILD_SHA)};
if(!served)return;
var PUB={"/":1,"/why":1,"/demo":1,"/whats-new":1,"/security":1,"/terms":1,"/privacy":1};
var busy=false;
function check(){
if(!PUB[location.pathname]||busy)return;
busy=true;
fetch("/api/build",{cache:"no-store"}).then(function(r){return r.json()}).then(function(d){
busy=false;
if(d&&d.sha&&d.sha!==served){
var k="uc-heal-"+d.sha;
try{if(sessionStorage.getItem(k))return;sessionStorage.setItem(k,"1");}catch(e){}
location.reload();
}}).catch(function(){busy=false;});
}
addEventListener("pageshow",function(e){if(e.persisted)check();});
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")check();});
if(document.readyState==="complete"){setTimeout(check,400);}
else{addEventListener("load",function(){setTimeout(check,800);});}
})();`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      // The inline script below adds a `js` class before hydration; suppress
      // the resulting className diff warning (the standard theme-script pattern).
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full`}
    >
      <head>
        {/* Cut the mustard: mark the document as JS-capable before first
            paint, so scroll-reveal sections only start hidden when JS can
            reveal them. Without JS (or if it fails) the content stays
            visible instead of blanking forever. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "document.documentElement.classList.add('js')",
          }}
        />
        {/* Machine-checkable build stamp (the footer carries the human one). */}
        {BUILD_SHA ? <meta name="uc-build" content={BUILD_SHA} /> : null}
        {/* Stale-copy self-heal — see SELF_HEAL_SCRIPT above. */}
        <script dangerouslySetInnerHTML={{ __html: SELF_HEAL_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col font-sans antialiased">
        {children}
      </body>
    </html>
  );
}
