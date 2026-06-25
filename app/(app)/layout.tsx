import Link from "next/link";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

// This layout wraps every signed-in screen. It does the real auth check
// (proxy.ts is just the fast first gate) and renders the app header.
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

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-10 border-b border-line/80 bg-paper/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-3.5">
          <Link href="/deals" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white">
              UC
            </div>
            <span className="font-semibold tracking-tight">
              Underwrite Copilot
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <span className="hidden text-sm text-muted sm:inline">
              {user.email}
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:bg-faint"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-6 py-10">
        {children}
      </main>
    </div>
  );
}
