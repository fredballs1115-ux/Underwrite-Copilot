import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { AppShell } from "./app-shell";

// Wraps every signed-in screen: real auth check (proxy.ts is the fast gate)
// plus the app chrome (deep-teal sidebar / mobile top bar).
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <AppShell userEmail={user.email ?? ""}>{children}</AppShell>;
}
