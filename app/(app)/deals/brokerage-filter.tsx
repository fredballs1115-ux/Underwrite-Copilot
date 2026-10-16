import Link from "next/link";

export interface BrokerageOption {
  key: string;
  name: string;
  count: number;
}

/**
 * The pipeline filtered to one brokerage (research pass 24, B13): a select
 * of the firms the memoranda name, each with its count, as a plain GET form
 * — it works before the page's script has loaded — and, while a firm is
 * chosen, how many deals it leaves and the way back. Pure: the page reads
 * the firms (lib/brokerage) and hands them in. Nothing renders where no
 * memorandum names a firm.
 */
export function BrokerageFilter({
  firms,
  active,
  shown,
  total,
}: {
  firms: BrokerageOption[];
  /** the chosen firm's key, where it names one in the list */
  active: string | null;
  shown: number;
  total: number;
}) {
  if (firms.length === 0) return null;
  const current = active ? firms.find((f) => f.key === active) ?? null : null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm" data-qa="brokerage-filter">
      <form method="get" action="/deals" className="flex items-center gap-2">
        <label htmlFor="broker-filter" className="text-xs font-medium text-muted">
          Brokerage
        </label>
        <select
          id="broker-filter"
          name="broker"
          defaultValue={current?.key ?? ""}
          className="min-h-9 rounded-lg border border-line bg-surface px-2 py-1 text-sm"
        >
          <option value="">Every brokerage</option>
          {firms.map((f) => (
            <option key={f.key} value={f.key}>
              {`${f.name} (${f.count})`}
            </option>
          ))}
        </select>
        <button type="submit" className="min-h-9 rounded-lg border border-line px-3 py-1 text-xs font-medium hover:border-brand/50">
          Show
        </button>
      </form>
      {current && (
        <p className="text-xs text-muted" role="status">
          {`${shown} of ${total} deals offered by ${current.name}`}
          {" · "}
          <Link href="/deals" className="font-medium text-brand hover:underline">
            Every brokerage
          </Link>
        </p>
      )}
    </div>
  );
}
