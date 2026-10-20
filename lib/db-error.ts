/**
 * Whether a database read failed because a table is not there at all — the
 * migrations have not run, a setup state — rather than for a passing reason.
 * Pure, no imports.
 *
 * Only Postgres's own "undefined table" says so: its SQLSTATE `42P01`, or its
 * message, `relation "public.deals" does not exist`. The pipeline page had
 * matched any message with "relation", "does not exist" or "schema" in it,
 * which also caught PostgREST's "Could not find the table … in the schema
 * cache" (PGRST205), a cache that is reloading after a deploy and answers
 * again in a moment, and so told a customer in production to go and run SQL
 * (the first-run audit of 2026-10-20).
 */
export function relationMissing(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  if (code === "42P01") return true;
  // A code of another kind is that kind, whatever its words say.
  if (typeof code === "string" && code !== "") return false;
  return typeof message === "string" && /\brelation\s+"?[\w.]+"?\s+does not exist\b/i.test(message);
}
