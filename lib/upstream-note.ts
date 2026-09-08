/**
 * What a health probe may repeat of an upstream service's answer. The raw
 * body belongs in the server log; the page gets a short note with every
 * credential-shaped query value and every URL's query stripped, so a
 * provider that echoes its request can never hand a key to a signed-in
 * visitor. (Universal module: the health routes and their tests.)
 */

const SECRET_PARAM =
  /(^|[?&\s"'(,;])((?:key|api[_-]?key|apikey|token|access_token|signature|sig|secret|password|client_secret)=)[^&\s"'<>),;]*/gi;
const URL_RE = /https?:\/\/[^\s"'<>]+/gi;

/** A URL with its query and fragment dropped — the host and path stay. */
export function bareUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return "[url]";
  }
}

/** The upstream text, short and without anything credential-shaped. */
export function upstreamNote(text: unknown, max = 160): string {
  const s = typeof text === "string" ? text : text == null ? "" : JSON.stringify(text);
  const cleaned = s
    .replace(URL_RE, (m) => bareUrl(m))
    .replace(SECRET_PARAM, "$1$2[redacted]")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned.length > max ? `${cleaned.slice(0, max - 1)}…` : cleaned;
}

/** The shape of a JSON body without its values: the keys an operator needs
 *  to see to wire a provider, none of the content. */
export function jsonShape(body: unknown, max = 40): string[] | null {
  if (!body || typeof body !== "object") return null;
  if (Array.isArray(body)) return [`array(${body.length})`];
  return Object.keys(body as Record<string, unknown>).slice(0, max);
}
