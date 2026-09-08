import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { authLinkHandoff, safeNextPath } from "@/lib/auth-flow";

export { safeNextPath };

/**
 * Runs on every request (from proxy.ts) to keep the Supabase auth session
 * fresh — it reads the auth cookie, refreshes the token if needed, and writes
 * the updated cookie back onto the response. It also does a fast "optimistic"
 * redirect: signed-out users hitting the app go to /login (carrying a `next`
 * param so invite links survive the sign-in), and signed-in users hitting
 * /login go where they were headed. An email link's one-time code goes to the
 * callback that can exchange it, whichever page the link landed on.
 *
 * (The real security check still happens inside the app layout + Row-Level
 * Security — this is just the first gate.)
 */

/** Every signed-in area: a signed-out visit bounces to /login with `next`. */
export const PROTECTED_PREFIXES = [
  "/deals",
  "/team",
  "/billing",
  "/account",
  "/criteria",
  "/analytics",
  "/submarkets",
  "/comps",
  "/news",
  "/data-health",
] as const;

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh the token. Don't add code between createServerClient and getUser():
  // per Supabase guidance it can intermittently log users out. We tolerate a
  // network failure (e.g. Supabase unreachable) by treating the user as signed
  // out, so public pages still render.
  let signedIn = false;
  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    signedIn = !!user;
  } catch {
    signedIn = false;
  }

  // A password-reset or confirmation link that landed on a page instead of
  // the callback: hand its code over before any sign-in bounce can strip it.
  const handoff = authLinkHandoff(request.nextUrl);
  if (handoff) return redirectWithCookies(request, supabaseResponse, handoff);

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuthPage = pathname === "/login";

  if (!signedIn && isProtected) {
    return redirectWithCookies(request, supabaseResponse, "/login", {
      next: pathname,
    });
  }
  if (signedIn && isAuthPage) {
    const next = safeNextPath(request.nextUrl.searchParams.get("next"));
    return redirectWithCookies(request, supabaseResponse, next ?? "/deals");
  }

  return supabaseResponse;
}

/**
 * Redirect while carrying over any refreshed auth cookies. `target` is a
 * same-origin path that may carry its own query (`/deals?error=auth`), which
 * survives; `params` are added on top.
 */
function redirectWithCookies(
  request: NextRequest,
  response: NextResponse,
  target: string,
  params?: Record<string, string>,
) {
  const url = new URL(target, request.url);
  for (const [k, v] of Object.entries(params ?? {})) {
    url.searchParams.set(k, v);
  }
  const redirectRes = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => {
    redirectRes.cookies.set(cookie);
  });
  return redirectRes;
}
