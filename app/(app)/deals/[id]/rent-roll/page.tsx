import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { downloadDealFile } from "@/lib/storage";
import { readGrid } from "@/lib/rentroll/parse";
import {
  analyzeRentRoll,
  leaseUpCurve,
  markToMarket,
  rolloverCostForecast,
  rolloverSchedule,
} from "@/lib/rentroll/analytics";
import { defaultProfileFor, type ProfileDraft } from "@/lib/rentroll/profiles";
import { getRentRollImport, latestRentRollImport, listProfiles } from "@/lib/rentroll/store";
import { RentRollDashboard } from "./dashboard";
import { MappingForm } from "./mapping-form";
import { deleteRentRollImport, saveLeasingProfile, uploadRentRoll } from "./actions";

export const metadata: Metadata = { title: "Rent roll" };

const ERRORS: Record<string, string> = {
  file: "Pick a rent roll file to upload.",
  size: "That file is over 32MB.",
  format: "That file's contents don't match its extension.",
  parse: "Couldn't read that file. CSV and XLSX are supported.",
  empty: "That file has no rows.",
  save: "Couldn't save the import.",
  notfound: "That import no longer exists.",
  nodoc: "The uploaded file is no longer in storage, so the mapping can't be re-applied.",
};

/** Absorption pace used for the lease-up curve until the user overrides it:
 *  the vacancy leased over three years, which is a screening placeholder and
 *  is labelled as one on screen. */
const defaultAbsorption = (vacantSf: number) => (vacantSf > 0 ? Math.round(vacantSf / 36) : 0);

export default async function RentRollPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ import?: string; confirm?: string; error?: string; profile?: string }>;
}) {
  const { id } = await params;
  const { import: importParam, confirm, error: errorCode, profile: profileParam } =
    await searchParams;

  const supabase = await createSupabaseServerClient();
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { data: deal, error } = await supabase
    .from("deals")
    .select("id, name, asset_class")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Couldn't load the deal: ${error.message}`);
  if (!deal) notFound();

  const assetClass = String(deal.asset_class ?? "office");
  const [record, profiles] = await Promise.all([
    importParam
      ? getRentRollImport(supabase, importParam)
      : latestRentRollImport(supabase, id),
    listProfiles(supabase, user.id, assetClass),
  ]);

  const activeProfile: ProfileDraft =
    profiles.find((p) => p.id === profileParam) ?? profiles[0] ?? defaultProfileFor(assetClass);

  // The mapping UI needs the file's own header row and a couple of sample rows.
  // Read straight from storage — the file is the source of truth for what the
  // columns actually say.
  let headers: string[] = [];
  let sampleRows: string[][] = [];
  if (record?.sourceDocumentId) {
    const { data: doc } = await supabase
      .from("deal_documents")
      .select("storage_path, filename")
      .eq("id", record.sourceDocumentId)
      .maybeSingle();
    if (doc) {
      try {
        const grid = await readGrid(
          String(doc.filename),
          await downloadDealFile(doc.storage_path as string),
        );
        headers = (grid[record.mapping.headerRow] ?? []).map((c) => String(c ?? "").trim());
        sampleRows = grid
          .slice(record.mapping.headerRow + 1, record.mapping.headerRow + 4)
          .map((r) => r.map((c) => String(c ?? "").trim()));
      } catch {
        // The dashboard still renders off the stored leases.
      }
    }
  }

  const analytics = record
    ? analyzeRentRoll(record.leases, {
        asOf: record.asOfDate ?? new Date().toISOString().slice(0, 10),
        nra: record.nra,
      })
    : null;

  const schedule = record ? rolloverSchedule(record.leases, { nra: record.nra }) : null;
  const cost = schedule ? rolloverCostForecast(schedule, activeProfile) : null;
  const mtm = record
    ? markToMarket(record.leases, {
        default: activeProfile.marketRentPsf,
        NNN: activeProfile.marketRentPsf,
        MG: activeProfile.marketRentPsf,
        FSG: activeProfile.marketRentPsf,
      })
    : null;
  const curve =
    analytics && schedule
      ? leaseUpCurve({
          vacantSf: schedule.vacantSf,
          occupiedSf: analytics.occupiedSf,
          nra: analytics.totalSf,
          absorptionSfPerMonth: defaultAbsorption(schedule.vacantSf),
        })
      : null;

  const pctField = (label: string, name: string, value: number) => (
    <label key={name} className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input
        name={name}
        defaultValue={(value * 100).toFixed(2).replace(/\.?0+$/, "")}
        inputMode="decimal"
        className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
      />
    </label>
  );
  const plainField = (label: string, name: string, value: number) => (
    <label key={name} className="flex flex-col gap-1 text-xs text-muted">
      {label}
      <input
        name={name}
        defaultValue={String(value)}
        inputMode="decimal"
        className="rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
      />
    </label>
  );

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6">
      <header className="flex flex-col gap-1">
        <Link
          href={`/deals/${id}`}
          className="text-sm text-muted underline-offset-2 hover:text-brand hover:underline"
        >
          ← {deal.name as string}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Rent roll</h1>
        <p className="max-w-2xl text-sm text-muted">
          Upload the broker&apos;s file, correct whatever the column mapper got wrong, and get WALT,
          rollover and mark-to-market — then download a workbook whose formulas are live, so
          changing the exit cap on the Assumptions tab moves the IRR.
        </p>
      </header>

      {errorCode && ERRORS[errorCode] ? (
        <p className="rounded-lg border border-kill/30 bg-kill/5 px-4 py-3 text-sm text-kill">
          {ERRORS[errorCode]}
        </p>
      ) : null}

      {/* ── Upload ────────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <h2 className="text-base font-semibold text-ink">Upload a rent roll</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          CSV or XLSX. The header is rarely row 1 and the column names are never the same twice, so
          the file is scanned for both — you confirm the result before anything is computed.
        </p>
        <form action={uploadRentRoll} className="mt-4 flex flex-wrap items-end gap-3">
          <input type="hidden" name="dealId" value={id} />
          <label className="flex flex-col gap-1 text-xs text-muted">
            File
            <input
              type="file"
              name="file"
              accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              required
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink file:mr-3 file:rounded file:border-0 file:bg-faint file:px-2 file:py-1 file:text-xs"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            Building NRA (SF)
            <input
              name="nra"
              inputMode="numeric"
              placeholder="optional"
              className="w-36 rounded-md border border-line bg-surface px-2.5 py-1.5 font-mono text-sm text-ink"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted">
            As-of date
            <input
              type="date"
              name="asOf"
              className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
            />
          </label>
          <button
            type="submit"
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
          >
            Upload
          </button>
        </form>
        <p className="mt-3 text-xs text-muted">
          Rent rolls are client data. The file is stored under this deal&apos;s own path with
          row-level security, its contents are never logged, and nothing in it is shared across
          accounts.
        </p>
      </section>

      {record ? (
        <>
          <MappingForm
            dealId={id}
            importId={record.id}
            headers={headers}
            sampleRows={sampleRows}
            mapping={record.mapping}
            nra={record.nra}
            asOf={record.asOfDate}
            filename={record.filename}
            defaultOpen={confirm === "1" || record.issues.some((i) => i.severity === "error")}
          />

          {/* ── Download ──────────────────────────────────────────────── */}
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-brand/30 bg-brand/5 p-4">
            <a
              href={`/api/deals/${id}/rent-roll.xlsx?import=${record.id}${
                profileParam ? `&profile=${profileParam}` : ""
              }`}
              className="rounded-md bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-strong"
            >
              Download Excel model
            </a>
            <p className="text-sm text-muted">
              Four tabs, live formulas. Assumptions, Rent Roll, Rollover, and a ten-year Cash Flow
              with native <code className="font-mono text-xs">IRR</code>,{" "}
              <code className="font-mono text-xs">XIRR</code> and equity multiple.
            </p>
          </div>

          {analytics && mtm && cost && curve ? (
            <RentRollDashboard
              analytics={analytics}
              mtm={mtm}
              cost={cost}
              leaseUp={curve}
              issues={record.issues}
              filename={record.filename}
            />
          ) : null}

          <form action={deleteRentRollImport}>
            <input type="hidden" name="dealId" value={id} />
            <input type="hidden" name="importId" value={record.id} />
            <button
              type="submit"
              className="text-xs text-muted underline-offset-2 hover:text-kill hover:underline"
            >
              Delete this import
            </button>
          </form>
        </>
      ) : null}

      {/* ── Market leasing profile ────────────────────────────────────── */}
      <section className="rounded-lg border border-line bg-surface p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold text-ink">Market leasing assumptions</h2>
          {profiles.length > 1 ? (
            <form method="get" className="flex items-center gap-2">
              {importParam ? <input type="hidden" name="import" value={importParam} /> : null}
              <select
                name="profile"
                defaultValue={profileParam ?? profiles[0]?.id}
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
              >
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="text-sm text-brand underline-offset-2 hover:underline">
                Apply
              </button>
            </form>
          ) : null}
        </div>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          What happens when a lease rolls: does the tenant renew, at what rent, with how much TI and
          LC, after how much downtime and free rent. Saved profiles are yours and reusable across
          deals. The starting values are ordinary market convention, not any firm&apos;s internal
          standards — change them to your own view.
        </p>
        <form action={saveLeasingProfile} className="mt-4 flex flex-col gap-4">
          <input type="hidden" name="dealId" value={id} />
          <input type="hidden" name="assetClass" value={assetClass} />
          {profileParam ? <input type="hidden" name="profileId" value={profileParam} /> : null}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="flex flex-col gap-1 text-xs text-muted">
              Profile name
              <input
                name="name"
                defaultValue={activeProfile.name}
                className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink"
              />
            </label>
            {plainField("Market rent ($/SF)", "marketRentPsf", activeProfile.marketRentPsf)}
            {pctField("Renewal probability (%)", "renewalProbability", activeProfile.renewalProbability)}
            {plainField("Term (years)", "termYears", activeProfile.termYears)}
            {pctField("Escalation (%)", "escalationPct", activeProfile.escalationPct)}
            {plainField("Renewal TI ($/SF)", "renewalTiPsf", activeProfile.renewalTiPsf)}
            {plainField("New-deal TI ($/SF)", "newTiPsf", activeProfile.newTiPsf)}
            {pctField("Renewal LC (%)", "renewalLcPct", activeProfile.renewalLcPct)}
            {pctField("New-deal LC (%)", "newLcPct", activeProfile.newLcPct)}
            {plainField("Downtime (months)", "downtimeMonths", activeProfile.downtimeMonths)}
            {plainField("Free rent — renewal (mo)", "renewalFreeRentMonths", activeProfile.renewalFreeRentMonths)}
            {plainField("Free rent — new (mo)", "newFreeRentMonths", activeProfile.newFreeRentMonths)}
          </div>
          <button
            type="submit"
            className="w-fit rounded-md border border-brand px-4 py-2 text-sm font-medium text-brand transition hover:bg-brand hover:text-white"
          >
            {profileParam ? "Update profile" : "Save profile"}
          </button>
        </form>
      </section>
    </div>
  );
}
