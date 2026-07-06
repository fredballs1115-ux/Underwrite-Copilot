import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

// In Next.js 16 this file convention is "proxy" (it was called "middleware"
// before 16). It runs on every matched request — here, to keep the Supabase
// session fresh. See node_modules/next/dist/docs for the convention.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on all routes except static assets and image files.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
