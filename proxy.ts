import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";
import { canonicalRedirect } from "@/lib/canonical-host";

// In Next.js 16 this file convention is "proxy" (it was called "middleware"
// before 16). It runs on every matched request — here, to send a page asked
// for at a second host to the site's own address once CANONICAL_HOST names
// it (#430, lib/canonical-host), and to keep the Supabase session fresh. See
// node_modules/next/dist/docs for the convention.
export async function proxy(request: NextRequest) {
  const to = canonicalRedirect(request.nextUrl, request.method, process.env.CANONICAL_HOST);
  if (to) return NextResponse.redirect(to, 308);
  return await updateSession(request);
}

export const config = {
  // Run on all routes except static assets and image files.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
