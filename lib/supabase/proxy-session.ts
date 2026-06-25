import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Runs on every request (from proxy.ts) to keep the Supabase auth session
 * fresh — it reads the auth cookie, refreshes the token if needed, and writes
 * the updated cookie back onto the response. It also does a fast "optimistic"
 * redirect: signed-out users hitting /deals go to /login, and signed-in users
 * hitting /login go to /deals.
 *
 * (The real security check still happens inside the app layout + Row-Level
 * Security — this is just the first gate.)
 */
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

  const { pathname } = request.nextUrl;
  const isProtected = pathname.startsWith("/deals");
  const isAuthPage = pathname === "/login";

  if (!signedIn && isProtected) {
    return redirectWithCookies(request, supabaseResponse, "/login");
  }
  if (signedIn && isAuthPage) {
    return redirectWithCookies(request, supabaseResponse, "/deals");
  }

  return supabaseResponse;
}

/** Redirect while carrying over any refreshed auth cookies. */
function redirectWithCookies(
  request: NextRequest,
  response: NextResponse,
  pathname: string,
) {
  const url = request.nextUrl.clone();
  url.pathname = pathname;
  const redirectRes = NextResponse.redirect(url);
  response.cookies.getAll().forEach((cookie) => {
    redirectRes.cookies.set(cookie);
  });
  return redirectRes;
}
