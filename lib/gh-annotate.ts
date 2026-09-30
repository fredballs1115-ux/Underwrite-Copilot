/**
 * A line GitHub Actions reads as an annotation — the pulls' way of saying
 * on the run's page what went wrong, where a green tick alone says nothing.
 *
 * A pull that loses a series, a file or a source and still exits 0 (its
 * policy: partial success is success) is a green run, and a green run is
 * read as a healthy feed; nobody opens the log. `::warning::` puts one line
 * per failure on the run's summary page and against the step, and
 * `::error::` the reason a run failed. The runner reads these workflow
 * commands from the step's output a line at a time, so each is printed on a
 * line of its own, to stdout.
 *
 * The message's own `%`, CR and LF are escaped as the runner expects (`%25`,
 * `%0D`, `%0A`) — "a 3% move" would otherwise be read as the start of an
 * escape, and a second line would be cut off — and a title's `:` and `,`
 * as well, since they delimit the command's properties.
 *
 * Imports nothing at run time: the pulls load it under plain Node, as they
 * load lib/fmr.ts and lib/feed-rows.ts.
 */

export type AnnotationLevel = "error" | "warning" | "notice";

function escapeData(s: string): string {
  return s.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeProperty(s: string): string {
  return escapeData(s).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

/** One annotation line: `::warning title=…::message`. */
export function annotation(level: AnnotationLevel, message: string, title?: string): string {
  return `::${level}${title ? ` title=${escapeProperty(title)}` : ""}::${escapeData(message)}`;
}

/** The names among `secrets` that are unset or empty, in the order given. */
export function missingSecrets(secrets: Readonly<Record<string, string | undefined>>): string[] {
  return Object.entries(secrets)
    .filter(([, value]) => !value)
    .map(([name]) => name);
}

/** "A", "A and B", "A, B and C". */
function listed(names: readonly string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/**
 * The error a pull prints, before it exits 1, when a secret it needs is
 * missing: which, that nothing was fetched or written, and what to do. A
 * secret a pull documents as optional (the BLS key) is never passed here.
 */
export function missingSecretsError(pull: string, missing: readonly string[], remedy: string): string {
  const verb = missing.length === 1 ? "is" : "are";
  return annotation(
    "error",
    `${pull} did not run: ${listed(missing)} ${verb} not set, so nothing was fetched or written. ${remedy}`,
    `${pull}: missing ${missing.length === 1 ? "secret" : "secrets"}`,
  );
}
