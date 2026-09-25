// One address for the site (#430). Once the operator puts the site on its
// own domain, the Render subdomain goes on answering too — and a search
// engine that finds the same page at two hosts splits its standing between
// them. With CANONICAL_HOST set, a page request that arrives at any other
// host is sent to the canonical one, permanently (308, so a method and a
// body survive). Pure: the proxy asks, this answers.
//
// Unset, nothing moves — the redirect is inert until the domain resolves,
// so setting the variable is the last step of the move, never the first.
//
// Three things never move:
// - /api/ — a webhook (Stripe's) does not follow a redirect, and the
//   routes answer for their own host;
// - /auth/ — an email link's one-time code is exchanged against a
//   verifier cookie set on the host the link was requested from, and a
//   redirect would carry the code to a host without the cookie;
// - anything but GET and HEAD — a form posted to the old host completes
//   there rather than being replayed at another.

export function canonicalRedirect(
  url: URL,
  method: string,
  canonicalHost: string | null | undefined,
): URL | null {
  const target = (canonicalHost ?? "").trim().toLowerCase();
  if (!target) return null;
  if (method !== "GET" && method !== "HEAD") return null;
  const host = url.host.toLowerCase();
  if (host === target) return null;
  // Only a public host moves: a preview, a local server or a raw address
  // is someone working on the site, not a visitor.
  if (host.startsWith("localhost") || host.startsWith("127.") || /^\d+\.\d+\.\d+\.\d+(:\d+)?$/.test(host)) return null;
  const path = url.pathname;
  if (path.startsWith("/api/") || path.startsWith("/auth/")) return null;
  const next = new URL(url.toString());
  next.protocol = "https:";
  next.host = target;
  next.port = "";
  return next;
}
