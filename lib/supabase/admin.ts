import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client using the SECRET service-role key. It bypasses Row-Level
 * Security, so use it ONLY in trusted server code (the background analysis),
 * never in anything reachable by the browser. The `server-only` import makes
 * the build fail if this is ever pulled into a client bundle.
 *
 * We use it for two things the analysis needs without a user session: reading
 * the OM PDF out of Storage, and writing results/job-progress back to the deal.
 */
export function createSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Admin client needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
