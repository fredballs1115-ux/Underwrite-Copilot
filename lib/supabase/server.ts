import "server-only";
import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

/**
 * Supabase client for server code (Server Components and Route Handlers).
 *
 * It reads and writes the auth cookie so a signed-in user stays signed in
 * across requests. In Next.js 16 `cookies()` is async, so this helper is async
 * too — remember to `await` it.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // `set` is read-only inside a Server Component; safe to ignore here
            // because session refresh happens in middleware (added in Phase 1).
          }
        },
      },
    },
  );
}

/**
 * The authenticated user for this request, deduped with React `cache()` so the
 * layout, page, and any helper that needs the user share ONE call to Supabase
 * Auth per render instead of each making its own network round-trip. Use this
 * in Server Components for reads; mutations that need a guaranteed-fresh check
 * can still call getUser() directly.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});
