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
 * neither overlap nor skip, and ends at an empty page. A list of ids put in
 * a URL goes ID_CHUNK at a time. A failed read is said or thrown by its
 * caller, never read as no rows.
 *
 * Account deletion's handover (lib/account-handover) was the first reader to
 * page; its `readAll` and `chunks` moved here unchanged.
 *
 * No imports: the scripts load it under plain Node.
 */

/** Rows a read asks for per page. A server set to answer fewer is read
 *  correctly too: the next page starts after the rows that came back, and
 *  the read ends at an empty page. */
export const READ_PAGE = 1000;

/** Ids an `in` filter carries per request. A UUID takes 39 characters of the
 *  URL once the comma after it is encoded, so a hundred keep the request line
 *  near 4 KB, inside the 8 KB a proxy commonly allows. */
export const ID_CHUNK = 100;

type Result<T> = PromiseLike<{ data: T[] | null; error: unknown }>;

/** Every row a read matches, a page at a time — null if any page fails, after
 *  handing its error to `onError`. The read must be ordered, so the pages do
 *  not overlap. */
export async function readAll<T>(
  page: (from: number, to: number) => Result<T>,
  onError?: (error: unknown) => void,
): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; ) {
    const { data, error } = await page(from, from + READ_PAGE - 1);
    if (error) {
      onError?.(error);
      return null;
    }
    const got = data ?? [];
    if (got.length === 0) return rows;
    rows.push(...got);
    from += got.length;
  }
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
