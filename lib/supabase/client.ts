import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for the browser (Client Components).
 *
 * Uses the public `anon` key — that's safe to expose. The real protection is
 * Row-Level Security in the database, which makes sure a user can only ever
 * read their own rows no matter what the browser asks for.
 */
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
