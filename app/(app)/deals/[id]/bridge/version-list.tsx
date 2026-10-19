import { BarRow, BarRows, Key, KeyItem, Tick } from "@/app/panel-parts";
import { irrBar, versionIrrScale } from "@/lib/bridge/version-bars";
import { NO_IRR_SHORT, noIrrText, type NoIrrWhy } from "@/lib/underwrite/no-irr";
import { deleteDealVersion } from "./actions";

export interface VersionRow {
  id: string;
  label: string;
  note: string | null;
  automatic: boolean;
  createdAt: string;
  /** decimal (0.142 = 14.2%); null where no rate solved */
  leveredIrr: number | null;
  leveredEquityMultiple: number | null;
  /** why no levered IRR solved, from the version's own assumptions
   *  (lib/bridge/version-bars `versionNoIrr`); null where it solved, or
   *  the stored set could not be run again */
  noIrr: NoIrrWhy | null;
}

const pct1 = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * The saved versions, each its levered IRR drawn as a bar on one scale —
 * the tracks share one width and one start (`BarRows`), so a version that
 * moved the return reads as a longer or shorter bar beside the others. A
 * loss runs left of the zero line, which is ticked where the scale crosses
 * it. A version with no IRR draws no bar: its row says why, in the words
 * the playground, the report and the workbook use (lib/underwrite/no-irr).
 */
export function VersionList({
  dealId,
  versions,
  liveId,
  listCut,
}: {
  dealId: string;
  versions: readonly VersionRow[];
  /** the version that is the deal as it stands, kept, so no Delete */
  liveId: string | null;
  /** "the newest 60 of 214", where the list is cut short */
  listCut: string | null;
}) {
  const scale = versionIrrScale(versions.map((v) => v.leveredIrr));
  const drawn = scale !== null;
  return (
    <section className="rounded-lg border border-line bg-surface" data-qa="saved-versions">
      <h2 className="border-b border-line px-5 py-3 text-sm font-semibold text-ink">
        Saved versions
        {listCut ? (
          <span className="font-normal text-muted" data-qa="versions-cut">
            {" — "}
            {listCut}
          </span>
        ) : null}
      </h2>
      {drawn && (
        <Key className="px-5 pt-3">
          <KeyItem mark="swatch" tone="bg-brand">
            {`Levered IRR, every version on one scale from ${pct1(scale.lo)} to ${pct1(scale.hi)}`}
          </KeyItem>
          {scale.lo < 0 && (
            <KeyItem mark="tick" tone="bg-ink">
              Zero
            </KeyItem>
          )}
        </Key>
      )}
      <BarRows className="text-sm">
        <ul>
          {versions.map((v) => {
            const label = <span className="font-medium text-ink">{v.label}</span>;
            const bar = scale && v.leveredIrr != null && Number.isFinite(v.leveredIrr) ? irrBar(scale, v.leveredIrr) : null;
            return (
              <li key={v.id} className="border-b border-line px-5 py-3 last:border-b-0" data-version={v.id}>
                {bar && scale ? (
                  <BarRow label={label} figure={pct1(v.leveredIrr!)}>
                    <span
                      data-bar="version-irr"
                      className={`absolute inset-y-0 rounded-full ${v.leveredIrr! < 0 ? "bg-kill" : "bg-brand"}`}
                      style={{ left: `${bar.left}%`, width: `${Math.max(bar.width, 0.5)}%` }}
                    />
                    {scale.lo < 0 && <Tick at={`${scale.zeroAt}%`} bar="version-irr-zero" track="secondary" />}
                  </BarRow>
                ) : (
                  // No rate solved: no bar, and the row says why where the
                  // bar and its figure would be.
                  <div className="grid grid-cols-[minmax(0,1fr)_4rem] items-center gap-x-2 gap-y-0.5 @sm/bars:grid-cols-[9rem_minmax(0,1fr)_4rem]">
                    <span className="col-span-2 @sm/bars:col-span-1">{label}</span>
                    <span className="col-span-2 text-xs text-muted" data-qa="version-no-irr">
                      {v.noIrr ? noIrrText(v.noIrr) : NO_IRR_SHORT}
                    </span>
                  </div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                  <span className="font-mono">
                    {v.leveredEquityMultiple != null ? `${v.leveredEquityMultiple.toFixed(2)}x` : "—"}
                  </span>
                  <span>
                    {v.automatic ? "auto" : "saved"} ·{" "}
                    {new Date(v.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                  {v.note ? <span>{v.note}</span> : null}
                  {v.id === liveId ? (
                    <span
                      className="ml-auto rounded bg-faint px-1.5 py-px"
                      title="The deal's assumptions as they stand. It is kept while they do — a visit would only take it again — so it has no Delete."
                    >
                      current
                    </span>
                  ) : (
                    <form action={deleteDealVersion} className="ml-auto">
                      <input type="hidden" name="dealId" value={dealId} />
                      <input type="hidden" name="versionId" value={v.id} />
                      <button
                        type="submit"
                        aria-label={`Delete version ${v.label}`}
                        className="underline-offset-2 hover:text-kill hover:underline"
                      >
                        Delete
                      </button>
                    </form>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </BarRows>
    </section>
  );
}
