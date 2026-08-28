import { MAPPING_FIELDS, type ColumnMapping } from "@/lib/rentroll/parse";
import { confirmMapping } from "./actions";

/**
 * Mapping confirmation. The auto-mapper is good, not psychic: it shows what it
 * guessed, with the confidence, and the user corrects the two or three it got
 * wrong. Ticking "remember" makes the next file from the same broker one click.
 */
export function MappingForm({
  dealId,
  importId,
  headers,
  sampleRows,
  mapping,
  nra,
  asOf,
  filename,
  defaultOpen,
}: {
  dealId: string;
  importId: string;
  headers: string[];
  sampleRows: string[][];
  mapping: ColumnMapping;
  nra: number | null;
  asOf: string | null;
  filename: string;
  defaultOpen: boolean;
}) {
  const confidence = (key: string): number | undefined =>
    (mapping.confidence as Record<string, number | undefined>)[key];

  return (
    <details open={defaultOpen} className="rounded-lg border border-line bg-surface">
      <summary className="cursor-pointer px-5 py-3 text-sm font-semibold text-ink">
        Column mapping — {filename}
      </summary>
      <form action={confirmMapping} className="flex flex-col gap-5 border-t border-line px-5 py-4">
        <input type="hidden" name="dealId" value={dealId} />
        <input type="hidden" name="importId" value={importId} />

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-muted">
            Header row (0-based)
            <input
              name="headerRow"
              defaultValue={mapping.headerRow}
              inputMode="numeric"
              className="w-28 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Building NRA (SF)
            <input
              name="nra"
              defaultValue={nra ?? ""}
              placeholder="roll's own sum"
              inputMode="numeric"
              className="w-40 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            As-of date
            <input
              type="date"
              name="asOf"
              defaultValue={asOf ?? ""}
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-medium">Field</th>
                <th className="py-2 pr-3 font-medium">Column in your file</th>
                <th className="py-2 pr-3 font-medium">Sample</th>
                <th className="py-2 font-medium">Monthly?</th>
              </tr>
            </thead>
            <tbody>
              {MAPPING_FIELDS.map((f) => {
                const selected = mapping.columns[f.key];
                const conf = confidence(f.key);
                const sample =
                  selected === undefined
                    ? ""
                    : sampleRows
                        .map((r) => r[selected])
                        .filter((v) => v != null && String(v).trim() !== "")
                        .slice(0, 2)
                        .join(" · ");
                return (
                  <tr key={f.key} className="border-b border-line last:border-b-0 align-top">
                    <td className="py-2 pr-3">
                      <span className="text-ink">{f.label}</span>
                      {f.required ? <span className="ml-1 text-kill">*</span> : null}
                      <span className="block text-[11px] text-muted">{f.help}</span>
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        name={`col_${f.key}`}
                        defaultValue={selected === undefined ? "-1" : String(selected)}
                        className="w-full rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-ink"
                      >
                        <option value="-1">— not in this file —</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>
                            {h || `Column ${i + 1}`}
                          </option>
                        ))}
                      </select>
                      {conf != null ? (
                        <span className="mt-0.5 block text-[11px] text-muted">
                          matched {Math.round(conf * 100)}%
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 font-mono text-xs text-muted">{sample}</td>
                    <td className="py-2">
                      {f.supportsMonthly ? (
                        <label className="flex items-center gap-1.5 text-xs text-muted">
                          <input
                            type="checkbox"
                            name={`monthly_${f.key}`}
                            defaultChecked={mapping.monthly.includes(f.key)}
                          />
                          × 12
                        </label>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" name="remember" defaultChecked />
            Remember this mapping for files with the same columns
          </label>
          <input
            name="mappingName"
            placeholder="Name it (e.g. CBRE export)"
            className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
          />
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            Apply mapping
          </button>
        </div>
      </form>
    </details>
  );
}
