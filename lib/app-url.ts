/**
 * The site's own origin, where every link an email or an auth message
 * carries comes back to. One reader for the three that build those links —
 * the screen emails (lib/email), the Monday digest (lib/digest) and the
 * sign-in service's confirmation and reset links (app/login/actions) — which
 * had disagreed: two fell back to the Render host and one to localhost, and
 * all three read NEXT_PUBLIC_APP_URL with `??`, which keeps an EMPTY value,
 * so a blank setting made every email link and picture relative ("/deals/…"),
 * a link no mail client can open.
 *
 * A blank or all-space value is unset. A trailing slash is dropped, so a
 * path joined on ("/deals/…") never doubles it. No imports: a server action,
 * the worker and a test all read it as is.
 */

/** The deployed site, where a link goes when NEXT_PUBLIC_APP_URL names none. */
export const DEFAULT_APP_URL = "https://underwrite-copilot.onrender.com";

export function appUrl(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const set = env.NEXT_PUBLIC_APP_URL?.trim();
  return (set || DEFAULT_APP_URL).replace(/\/+$/, "");
}
