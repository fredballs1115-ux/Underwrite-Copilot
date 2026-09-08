import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { landingAfterExchange, landingAfterFailedExchange } from "@/lib/auth-flow";

/**
 * Where every Supabase email link ends up (password reset, address
 * confirmation). The link carries a one-time `code`; exchanging it for a
 * session writes the auth cookies, which only a Route Handler or a Server
 * Action may do — a Server Component cannot, which is why the reset flow used
 * to dead-end on the Account page. `proxy.ts` hands any link that lands
 * elsewhere to this route (`authLinkHandoff`), so the target the email was
 * sent with does not have to be this path.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const code = params.get("code");
  const next = params.get("next");

  if (code) {
    try {
      const supabase = await createSupabaseServerClient();
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (!error && data.session) {
        // The client reports a recovery link's kind on the result (the
        // stored verifier carries it); the declared type omits the field.
        const kind = (data as { redirectType?: string | null }).redirectType ?? null;
        return NextResponse.redirect(new URL(landingAfterExchange(next, kind), request.url));
      }
      // The reason goes to the log; the page says what to do about it.
      console.warn(
        `[auth/callback] code exchange failed: ${error?.code ?? "no session"} — ${error?.message ?? ""}`,
      );
    } catch (err) {
      console.warn(
        `[auth/callback] code exchange threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  } else {
    console.warn(
      `[auth/callback] link arrived without a code (${params.get("error_code") ?? "no error code"})`,
    );
  }

  return NextResponse.redirect(new URL(landingAfterFailedExchange(next, !!code), request.url));
}
