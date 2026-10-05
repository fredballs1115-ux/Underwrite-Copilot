import { DatedNotes } from "@/app/dated-notes";
import { datedLong } from "@/lib/debt-index";
import { datedNotes } from "@/lib/dated-window";
import { researchAge, staleMark } from "@/lib/research-age";

/**
 * A covered market's note on /market's brief (metros.json's `market_notes`),
 * printed exactly as the file writes it, with its status chip — and beside it
 * the day this market's research was read, in the "By asset type" panel's
 * own words ("· research read Aug 25, 2026"). Research pass 26, C17: the note
 * was printed with no date at all, so its figures (Philadelphia's May 2026
 * median, Baltimore's Q1 2026 volume, a rule's allowance) never aged. Past the
 * research rule's limit (lib/research-age) the day keeps its place and gains
 * its age and the stale mark; the note is still shown. Where the market's
 * research states no day, it says "research undated", never a day of its own.
 *
 * Under it, what the note's own dates say on the day the page is read
 * (lib/dated-window), as before. Pure: the page hands in the note, the
 * market snapshot's read day (lib/tracker-read `snapshotReadOn`) and today.
 */
export function MarketNote({
  note,
  readOn,
  today,
}: {
  note: { value?: string; status?: string } | null;
  /** the day the market's research was read (an ISO day), or null */
  readOn: string | null;
  /** the day the page is read (an ISO day) */
  today: string;
}) {
  const value = note?.value;
  if (!value || !value.trim()) return null;
  const status = note?.status ?? "sourced";
  const stale = readOn ? staleMark(researchAge(readOn, today)) : null;
  return (
    <div>
      <p className="text-sm leading-relaxed">
        {value}{" "}
        <span
          className={`ml-1 rounded px-1.5 py-px align-middle text-[10px] font-medium ${
            status === "verified" ? "bg-emerald-500/10 text-emerald-600" : "bg-brand/10 text-brand"
          }`}
        >
          {status}
        </span>{" "}
        <span className="text-xs text-muted" data-qa="note-read">
          {readOn ? `· research read ${datedLong(readOn)}` : "· research undated"}
          {stale && (
            <span className="text-caution" data-qa="research-stale">
              {` (${stale})`}
            </span>
          )}
        </span>
      </p>
      {/* A window the note states its figure for, ended — or a date it
          gives, come — said under the note, which stays as written
          (lib/dated-window). */}
      <DatedNotes notes={datedNotes(value, today)} className="mt-1" />
    </div>
  );
}
