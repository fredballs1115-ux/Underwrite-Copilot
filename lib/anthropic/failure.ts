/**
 * What a failed screen tells the analyst.
 *
 * The pipeline's catch used to store `err.message` verbatim, so the deal page
 * showed the provider's own words ("authentication_error: invalid x-api-key")
 * and the operator's ("ANTHROPIC_API_KEY is not set. Add it to .env.local…")
 * to a paying user, under a "Technical details" toggle. This module turns any
 * failure into one sentence the analyst can act on and keeps the raw text
 * for the server log. Pure — no I/O and no SDK import — so it is tested
 * directly; the SDK's errors are recognized by shape (an HTTP `status`, a
 * connection-error name, the parser's own message), never by class.
 */

/** An error whose message was written for the analyst and shows as it is. */
export class ScreenError extends Error {
  /** the raw failure behind a readable message, for the log */
  readonly detail?: string;
  constructor(message: string, detail?: string) {
    super(message);
    this.name = "ScreenError";
    this.detail = detail;
  }
}

export interface RunFailure {
  /** the sentence the deal page shows */
  message: string;
  /** the raw failure, for the server log — never shown */
  detail: string;
}

const CREDENTIALS =
  "The analysis service isn't accepting our credentials. That is a configuration problem on our side, not your deal — it needs the operator, not a retry.";
const RATE_LIMITED =
  "The analysis service is rate-limiting us right now — wait a minute and try again.";
const OVERLOADED =
  "The analysis service is overloaded right now — try again in a few minutes.";
const TOO_LARGE =
  "The analysis service refused this document as too large — try a smaller PDF.";
const REJECTED =
  "The analysis service could not accept this document — if the OM is scanned, password-protected or very long, try a text-based PDF; otherwise try again.";
const UNREACHABLE =
  "We couldn't reach the analysis service — check back in a minute and try again.";
const UNREADABLE =
  "Claude's answer came back incomplete or unreadable — try again.";
const STORAGE =
  "We couldn't read the OM back from storage — re-upload it and try again.";
const UNEXPECTED = "The screen hit an unexpected error — try again.";

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    // JSON.stringify(undefined) is undefined, not a string.
    const s = JSON.stringify(err);
    return typeof s === "string" ? s : String(err);
  } catch {
    return String(err);
  }
}

function nameOf(err: unknown): string {
  if (err instanceof Error) return err.name;
  const n = (err as { name?: unknown } | null)?.name;
  return typeof n === "string" ? n : "";
}

function statusOf(err: unknown): number | null {
  if (typeof err !== "object" || err === null) return null;
  const s = (err as { status?: unknown }).status;
  return typeof s === "number" && Number.isFinite(s) ? s : null;
}

/** The raw failure as the log wants it: name, message, and the HTTP status when there is one. */
export function failureDetail(err: unknown): string {
  const status = statusOf(err);
  const name = nameOf(err);
  const msg = messageOf(err);
  const head = name && name !== "Error" ? `${name}: ` : "";
  return `${head}${msg}${status != null && !msg.startsWith(String(status)) ? ` (HTTP ${status})` : ""}`;
}

/**
 * A message written by our own code reads as a sentence: no JSON, no stack
 * frame, no provider error type, not the SDK's "401 {…}" shape. Anything
 * else is replaced by the generic sentence rather than shown.
 */
export function looksReadable(msg: string): boolean {
  const s = msg.trim();
  if (!s || s.length > 240) return false;
  if (/[{}<>\[\]]/.test(s)) return false;
  if (/\n\s+at\s/.test(s)) return false;
  if (/^\d{3}\b/.test(s)) return false;
  if (/_error\b|x-api-key|api[_ -]?key|\bENV\b|\.env\b|stack|undefined is not|is not a function|cannot read propert/i.test(s)) return false;
  if (/^[A-Za-z]*Error:/.test(s)) return false;
  return /\s/.test(s);
}

/** True for the SDK parser's own failure: the model's text was not the JSON the schema asked for. */
export function isStructuredParseFailure(err: unknown): boolean {
  return /parse structured output/i.test(messageOf(err));
}

/** Classify any failure into the sentence the analyst sees and the detail the log keeps. */
export function describeRunFailure(err: unknown): RunFailure {
  const detail = err instanceof ScreenError && err.detail ? `${err.message} — ${err.detail}` : failureDetail(err);
  if (err instanceof ScreenError) return { message: err.message, detail };

  const status = statusOf(err);
  if (status != null) {
    if (status === 401 || status === 403) return { message: CREDENTIALS, detail };
    if (status === 429) return { message: RATE_LIMITED, detail };
    if (status === 413) return { message: TOO_LARGE, detail };
    if (status === 400 || status === 422) return { message: REJECTED, detail };
    if (status === 408 || status === 409 || status >= 500) return { message: OVERLOADED, detail };
    return { message: UNEXPECTED, detail };
  }

  const name = nameOf(err);
  const msg = messageOf(err);
  if (/^APIConnection/.test(name) || /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|network error|timed out|timeout/i.test(msg)) {
    return { message: UNREACHABLE, detail };
  }
  if (/ANTHROPIC_API_KEY|api[_ -]?key/i.test(msg)) return { message: CREDENTIALS, detail };
  if (isStructuredParseFailure(err) || /structured output|Unterminated string|Unexpected token|Unexpected end of JSON|in JSON at position/i.test(msg)) {
    return { message: UNREADABLE, detail };
  }
  if (/storage download failed|object not found|not found in storage|bucket/i.test(msg)) return { message: STORAGE, detail };
  if (/^Deal not found\.?$/i.test(msg)) return { message: "This deal is no longer available.", detail };

  return { message: looksReadable(msg) ? msg : UNEXPECTED, detail };
}

/** The part of a structured-output response the guards below read. */
export interface StructuredResponse<T> {
  parsed_output: T | null;
  stop_reason?: string | null;
}

/**
 * Read a structured-output response, naming the failures the SDK leaves
 * indistinguishable: the answer ran past `max_tokens` (a cut-off, not
 * nonsense), the model declined, or no parsed block came back at all.
 */
export function structuredOutput<T>(response: StructuredResponse<T>, what: string): T {
  if (response.stop_reason === "max_tokens") {
    throw new ScreenError(`${what} was cut off before it finished — try again.`);
  }
  if (response.stop_reason === "refusal") {
    throw new ScreenError(
      `${what} was declined by the model — the document may hold content it will not analyze.`,
    );
  }
  if (response.parsed_output == null) {
    throw new ScreenError(`${what} did not return structured output.`);
  }
  return response.parsed_output;
}

/**
 * Run one structured-output call and read its result. The SDK parses the
 * model's text while building the response and throws its own
 * "Failed to parse structured output: … Unterminated string in JSON at
 * position 62" on a cut-off or malformed answer — here that becomes a
 * sentence, with the parser's text kept as the detail for the log.
 */
export async function structured<T>(
  what: string,
  call: () => Promise<StructuredResponse<T>>,
): Promise<T> {
  let response: StructuredResponse<T>;
  try {
    response = await call();
  } catch (err) {
    if (isStructuredParseFailure(err)) {
      throw new ScreenError(
        `${what} came back unreadable — the answer was cut off or malformed. Try again.`,
        failureDetail(err),
      );
    }
    throw err;
  }
  return structuredOutput(response, what);
}
