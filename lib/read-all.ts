/**
 * Reading every row, and naming many ids, past a Supabase project's row cap
 * (research pass 42).
 *
 * A Supabase list read answers with at most the project's max rows — 1,000
 * unless the operator changed it. That is Supabase's default (its own
 * docker-compose sets PGRST_DB_MAX_ROWS to 1000, and postgrest-js's builder
 * says "By default, Supabase projects return a maximum of 1,000 rows");
 * PostgREST's own default is no limit. A capped read is a normal success —
 * no error, no count, no sign the rest exist — and a `.limit(5000)` is capped
 * the same way. So a read whose rows a page counts, totals or lists whole
 * asks for them a page at a time, ordered by a stable key so the pages
 * neither overlap nor skip, and ends where a page brings no new row. A list of ids put in
 * a URL goes ID_CHUNK at a time. A failed read is said or thrown by its
 * caller, never read as no rows.
 *
 * Account deletion's handover (lib/account-handover) was the first reader to
 * page; its `readAll` and `chunks` moved here unchanged.
 *
 * No imports: the scripts load it under plain Node.
 */

/** Rows a read asks for per page. A server set to answer fewer is read
 *  correctly too: the next page starts at the last row that came back, and
 *  the read ends where a page brings no new row. */
export const READ_PAGE = 1000;

/** Ids an `in` filter carries per request. A UUID takes 39 characters of the
 *  URL once the comma after it is encoded, so a hundred keep the request line
 *  near 4 KB, inside the 8 KB a proxy commonly allows. */
export const ID_CHUNK = 100;

type Result<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Times a read is begun again when its rows moved under it before it fails
 *  (audit C5, MED-1). */
export const READ_ATTEMPTS = 3;

/** What the read could not settle: rows were added, removed or reordered
 *  between its pages on every attempt. */
export const ROWS_MOVED = "the rows changed while they were being read";

/** A row's identity: its `id`, else the row itself. */
function keyOf(row: unknown): string {
  const id = (row as { id?: unknown } | null)?.id;
  return id === undefined || id === null ? JSON.stringify(row) : `${typeof id}:${String(id)}`;
}

/** One pass: the rows, or "moved" where a later page did not begin on the row
 *  the page before it ended on, or a row came back twice. */
async function readPass<T>(
  page: (from: number, to: number) => Result<T>,
): Promise<{ rows: T[] } | { moved: true } | { error: unknown }> {
  const rows: T[] = [];
  const seen = new Set<string>();
  for (let from = 0; ; ) {
    // Every page after the first asks from the row before it, so the page
    // says whether the rows ahead of it moved since the page before.
    const overlap = from > 0 ? 1 : 0;
    const { data, error } = await page(from - overlap, from - overlap + READ_PAGE - 1);
    if (error) return { error };
    const got = data ?? [];
    if (overlap) {
      // An empty page here means even the row the read ended on has gone.
      if (got.length === 0 || keyOf(got[0]) !== keyOf(rows[rows.length - 1])) return { moved: true };
    }
    const fresh = got.slice(overlap);
    if (fresh.length === 0) return { rows };
    for (const row of fresh) {
      const key = keyOf(row);
      if (seen.has(key)) return { moved: true };
      seen.add(key);
      rows.push(row);
    }
    from += fresh.length;
  }
}

/** Every row a read matches, a page at a time — null if any page fails, after
 *  handing its error to `onError`. The read must be ordered on a stable key
 *  (an `id` last), so the pages do not overlap.
 *
 *  Offsets count rows, so a row added or removed ahead of the next page
 *  shifts it: an added deal read the oldest one twice and missed itself, a
 *  removed one skipped the row after it (audit C5, MED-1). So every page
 *  after the first asks from the row the page before ended on and checks it
 *  is still there, and a row read twice is caught by its id. Where the rows
 *  moved, the read begins again, READ_ATTEMPTS times at most, then fails
 *  with ROWS_MOVED — a total is never struck on a set the read could not
 *  settle. A row added and another removed ahead of the same page leave the
 *  page where it was: every row there the whole time is still read once. */
export async function readAll<T>(
  page: (from: number, to: number) => Result<T>,
  onError?: (error: unknown) => void,
): Promise<T[] | null> {
  for (let attempt = 0; attempt < READ_ATTEMPTS; attempt++) {
    const pass = await readPass(page);
    if ("error" in pass) {
      onError?.(pass.error);
      return null;
    }
    if ("rows" in pass) return pass.rows;
  }
  onError?.(new Error(ROWS_MOVED));
  return null;
}

/** `readAll` as a query answers: every row, or no rows and the failed
 *  page's error — for a caller that says the error's own words. */
export async function readAllResult<T>(
  page: (from: number, to: number) => Result<T>,
): Promise<{ data: T[] | null; error: unknown }> {
  let error: unknown = null;
  const data = await readAll(page, (e) => {
    error = e ?? new Error("read failed");
  });
  return { data, error: data ? null : error };
}

/** A list in runs of at most `size`. */
export function chunks<T>(list: readonly T[], size = ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** Characters a run of values takes in a request line at most, encoded:
 *  about what ID_CHUNK UUIDs take. A value can be far longer than an id — a
 *  news story's address runs to a few hundred characters — so a hundred of
 *  those in one URL is tens of kilobytes, which no proxy carries. */
export const IN_LIST_CHARS = 4000;

/** What one value adds to an `in` filter's list once encoded: its own
 *  characters, the quotes PostgREST wants around a value holding a comma, a
 *  colon or a bracket, and the comma after it (%22 twice, %2C). */
function encodedLength(value: string): number {
  return encodeURIComponent(value).length + 9;
}

/** A list of values in runs of at most `size` that each fit `chars` of a
 *  request line, once encoded. A value longer than that alone is a run of its
 *  own. */
export function chunksBySize(values: readonly string[], size = ID_CHUNK, chars = IN_LIST_CHARS): string[][] {
  const out: string[][] = [];
  let run: string[] = [];
  let used = 0;
  for (const v of values) {
    const len = encodedLength(v);
    if (run.length > 0 && (run.length >= size || used + len > chars)) {
      out.push(run);
      run = [];
      used = 0;
    }
    run.push(v);
    used += len;
  }
  if (run.length > 0) out.push(run);
  return out;
}

/**
 * Every row a read of a list of values matches, the values in runs that fit
 * a request line (`chunksBySize`), one run at a time. A run whose read fails
 * hands its error to `onError` and its values back in `unread`, with no rows
 * for them — never as "none of these matched", which a dedupe would read as
 * "all of these are new".
 */
export async function readByValues<T>(
  values: readonly string[],
  read: (run: string[]) => Result<T>,
  onError?: (error: unknown, run: string[]) => void,
): Promise<{ rows: T[]; unread: string[] }> {
  const rows: T[] = [];
  const unread: string[] = [];
  for (const run of chunksBySize(values)) {
    let failure: unknown = null;
    try {
      const { data, error } = await read(run);
      if (error) failure = error;
      else rows.push(...(data ?? []));
    } catch (err) {
      failure = err ?? new Error("read failed");
    }
    if (failure) {
      onError?.(failure, run);
      unread.push(...run);
    }
  }
  return { rows, unread };
}

/** Requests in flight at once for one list of ids. */
const ID_READS_IN_FLIGHT = 4;

/**
 * Every row a read of a list of ids matches, ID_CHUNK ids a request and a few
 * requests at a time — null if any request fails, after handing its error to
 * `onError`. Each request's rows must fit one response (a chunk of ids asks
 * for a few rows each).
 */
export async function readByIds<T>(
  ids: readonly string[],
  read: (chunk: string[]) => Result<T>,
  onError?: (error: unknown) => void,
): Promise<T[] | null> {
  const runs = chunks(ids);
  const out: T[][] = new Array(runs.length);
  let failed = false;
  let next = 0;
  const worker = async () => {
    while (!failed && next < runs.length) {
      const k = next++;
      const { data, error } = await read(runs[k]);
      if (error) {
        if (!failed) onError?.(error);
        failed = true;
        return;
      }
      out[k] = data ?? [];
    }
  };
  await Promise.all(Array.from({ length: Math.min(ID_READS_IN_FLIGHT, runs.length) }, worker));
  return failed ? null : out.flat();
}
