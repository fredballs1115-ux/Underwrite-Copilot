import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server";
import { AppShell } from "./app-shell";
import { coveredMarketNav } from "@/lib/market-match";
import { RegulatoryAlertBanner } from "./regulatory-alert-banner";

// Wraps every signed-in screen: real auth check (proxy.ts is the fast gate)
// plus the app chrome (deep-teal sidebar / mobile top bar). getCurrentUser is
// request-cached, so the page rendered inside this layout reuses this same
// auth call rather than making a second round-trip.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <AppShell userEmail={user.email ?? ""} markets={coveredMarketNav()}>
      {/* The banner reads a cookie and a table. A layout's own data is out
          of loading.js's reach — a hard load waited on it before the page
          or its loading state could stream — so it streams in its own
          boundary, and draws nothing until it has something to say. */}
      <Suspense fallback={null}>
        <RegulatoryAlertBanner />
      </Suspense>
      {children}
    </AppShell>
  );
}
