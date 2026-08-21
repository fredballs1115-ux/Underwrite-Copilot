// Per-sector deal facts (research build, Phase 2 item 3). Catalog-driven
// (lib/sector-fields.ts); for residential classes the fields are exactly the
// open questions the rules engine surfaces (permit year, RAD registration,
// other units). Server component + server action; collapsed by default so
// the multifamily flow reads unchanged.

import { fieldsForAssetClass, type SectorFieldValues } from "@/lib/sector-fields";
import { saveSectorFields } from "./sector-actions";

export function SectorFieldsForm({
  dealId,
  assetClass,
  values,
}: {
  dealId: string;
  assetClass: string | null;
  values: SectorFieldValues | null;
}) {
  const defs = fieldsForAssetClass(assetClass);
  if (defs.length === 0) return null;
  const v = values ?? {};
  const filled = defs.filter((d) => v[d.key] !== undefined).length;

  const input =
    "w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40";

  return (
    <details className="rounded-xl border border-line bg-surface p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        Sector facts
        <span className="ml-2 text-[11px] font-normal text-muted">
          {filled}/{defs.length} answered — these settle the regulation panel&apos;s open
          questions
        </span>
      </summary>
      <form action={saveSectorFields} className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <input type="hidden" name="dealId" value={dealId} />
        {defs.map((d) => (
          <label key={d.key} className="block text-xs">
            <span className="font-medium text-muted">{d.label}</span>
            {d.type === "boolean" ? (
              <select
                name={d.key}
                defaultValue={v[d.key] === undefined ? "" : String(v[d.key])}
                className={`mt-1 ${input}`}
              >
                <option value="">Unknown</option>
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            ) : (
              <span className="mt-1 flex items-center gap-1.5">
                <input
                  name={d.key}
                  type={d.type === "text" ? "text" : "number"}
                  step={d.type === "percent" ? "0.1" : "any"}
                  defaultValue={v[d.key] === undefined ? "" : String(v[d.key])}
                  className={input}
                />
                {(d.unit || d.type === "percent") && (
                  <span className="shrink-0 text-muted">{d.unit ?? "%"}</span>
                )}
              </span>
            )}
            {d.help && <span className="mt-0.5 block text-[11px] text-muted">{d.help}</span>}
          </label>
        ))}
        <div className="flex items-end">
          <button
            type="submit"
            className="rounded-lg bg-brand px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Save
          </button>
        </div>
      </form>
    </details>
  );
}
