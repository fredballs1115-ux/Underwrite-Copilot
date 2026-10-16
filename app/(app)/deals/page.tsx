import type { Metadata } from "next";
import { Suspense } from "react";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { FREE_DEAL_LIMIT, getBilling } from "@/lib/billing";
import { MAX_OM_PAGES } from "@/lib/pdf";
import { TEAM_TRIAL_DEALS } from "@/lib/teams";
import { dealAllowance } from "@/lib/deal-allowance";
import { type DealRow } from "@/lib/deals";
import type { ExtractionResult } from "@/lib/anthropic/types";
import { addressUpgrade, parseStructuredAddress, type StructuredAddress } from "@/lib/address";
import { offersDueUpgrade } from "@/lib/offering";
import { WhatsNewCard } from "./whats-new";
import { NewsStrip, type NewsStripItem } from "./news-strip";
import { BrokerageFilter, type BrokerageOption } from "./brokerage-filter";
import { dealFirms } from "@/lib/brokerage";
import { Pipeline, type DealCard } from "./pipeline";
import { PIPELINE_VIEW_COOKIE, landingView } from "@/lib/pipeline-view";
import { TZ_COOKIE, readerToday } from "@/lib/reader-day";
import { cookies } from "next/headers";
import type { DealVisualCache } from "@/lib/deal-location";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import type { SiteFlagsResult } from "@/lib/site-flags/core";
import { type JobLike } from "@/lib/screen-run";
import { screenedAnOm } from "@/lib/onboarding";
import { pipelineCard, sampleDealCard } from "@/lib/pipeline-card";
import { readAllResult, readByIds } from "@/lib/read-all";
import { pipelineReadNote } from "@/lib/pipeline-read-note";
import { inTurns } from "@/lib/in-turns";
import { after } from "next/server";

export const metadata: Metadata = { title: "Pipeline" };

const ERRORS: Record<string, string> = {
  name: "Please give the deal a name.",
  file: "Please choose a PDF offering memorandum to upload.",
  // GOV.UK's own words for it: a chosen file of 0 bytes is empty.
  empty: "That file is empty (0 bytes) — download or export it again, and upload that. Nothing was saved.",
  pdf: "That file isn’t a PDF — please upload the OM as a PDF.",
  size: "That PDF is larger than 32 MB — please try a smaller file for now.",
  locked: "That PDF asks for a password to open, and the screen cannot read it — save a copy without the password (or ask the broker for one) and upload that. Nothing was saved.",
  pages: `That PDF runs past ${MAX_OM_PAGES} pages, more than the analysis reads in one pass — upload the sections that hold the deal's figures, and the screen will read those pages alone, not the whole memorandum. Nothing was saved.`,
  save: "Couldn’t save the deal. Please try again.",
  upload: "The upload didn’t complete — nothing was saved. Please try again.",
  // The limits read from the constants the gates count by (lib/billing,
  // lib/teams), never typed: a changed allowance changes the sentence.
  limit: `You’ve reached the ${FREE_DEAL_LIMIT}-deal limit on the Free plan. Upgrade to Pro for unlimited deals.`,
  exportfail:
    "Couldn’t build that export just now — please try again in a moment.",
  auth:
    "You were signed out, so the upload didn’t start. You’re back in now — everything you typed is still filled in below; just re-attach the PDF.",
  teamlimit: `Your team’s ${TEAM_TRIAL_DEALS} trial deals and your personal free deals are all in use. Start the Team plan for unlimited shared deals, or upgrade to Pro.`,
};

// Fixed metric slots for the pipeline table — every row fills the SAME
// columns (or shows —), so one header labels them all and values align into
// scannable columns instead of repeating micro-labels in every row. The
// slots themselves are read in lib/pipeline-slots (pure, tested) by the
// same rule the meeting .xlsx applies, through lib/pipeline-card.

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    deleted?: string;
    joined?: string;
    new?: string;
    addr?: string;
    broker?: string;
  }>;
}) {
  const { error: errorCode, deleted, joined, new: newParam, addr, broker } = await searchParams;
  // Pull Comps hand-off: a structured address arrives as ?addr=<json> and
  // opens the new-deal form on the manual tab with the address pre-picked.
  const prefillAddress = parseStructuredAddress(addr ?? "");
  const errorMessage = errorCode ? (ERRORS[errorCode] ?? null) : null;
  // Joining moves no deal (join_team_with_token adds the membership alone):
  // the deals added from now on go into the team's pipeline, while its trial
  // or plan takes them (the create actions' `teamAllowed`), and the ones
  // already here stay the reader's own.
  const notice = deleted
    ? "Deal deleted."
    : joined
      ? "Welcome to the team. The deals you add from now on go into its shared pipeline while the team's trial or plan allows; the deals you already had stay personal."
      : null;

  const supabase = await createSupabaseServerClient();
  // Request-cached: shares the layout's auth call instead of a second hop.
  const user = await getCurrentUser();

  type Row = Pick<
    DealRow,
    "id" | "name" | "asset_class" | "created_at" | "verdict" | "extraction"
  > & {
    address: unknown;
    first_signal: unknown;
    user_id: string;
    team_id: string | null;
    stage: string | null;
    is_sample: boolean | null;
    site_flags?: SiteFlagsResult | null;
    photo?: DealVisualCache | null;
    om_storage_path?: string | null;
    prior_screen?: unknown;
  };

  // Billing state, the deal list, its count and the personal buy box are
  // independent — fetch them together. Every deal the reader can see, a page
  // at a time, newest first (lib/read-all): one read answers at most the
  // project's max rows, and the page had counted, funnelled, split and
  // exported only the newest 1,000 with nothing saying the rest exist
  // (research pass 42). The exact count beside it is the total the page
  // states.
  const [billing, { data, error: readError }, { count: dealTotal }, personalBox] = await Promise.all([
    user ? getBilling(supabase, user.id) : Promise.resolve(null),
    readAllResult<Row>((from, to) =>
      supabase
        .from("deals")
        .select(
          "id, name, asset_class, created_at, verdict, extraction, address, first_signal, user_id, team_id, stage, is_sample, site_flags, photo, om_storage_path, prior_screen",
        )
        .order("created_at", { ascending: false })
        .order("id")
        .range(from, to),
    ),
    supabase.from("deals").select("id", { count: "exact", head: true }),
    user ? getBuyBoxForDeal(user.id, null).catch(() => null) : Promise.resolve(null),
  ]);
  const error = readError ? { message: (readError as { message?: string }).message ?? "" } : null;
  const teamBox = billing?.team
    ? await getBuyBoxForDeal("", billing.team.id).catch(() => null)
    : null;

  if (error) {
    // "Relation does not exist" means the migrations haven't run (a setup
    // state); anything else is a transient outage — don't tell a user in
    // production to go run SQL.
    const schemaMissing = /relation|does not exist|schema/i.test(error.message ?? "");
    return (
      <div className="rounded-xl border border-line bg-surface p-5 text-sm">
        {schemaMissing ? (
          <>
            <p className="font-medium">Database isn’t set up yet</p>
            <p className="mt-1 text-muted">
              Run every file in <code>supabase/migrations/</code> (0001 through
              the latest) in your Supabase SQL editor, then refresh this page.
            </p>
          </>
        ) : (
          <>
            <p className="font-medium">Couldn’t load your pipeline</p>
            <p className="mt-1 text-muted">
              We couldn’t reach your data just now. Please refresh in a moment —
              if it keeps happening, email underwritecopilot.support@gmail.com.
            </p>
          </>
        )}
      </div>
    );
  }

  // The card view's pictures (#428): the reader's choice of view from its
  // cookie — the cards or the list, never the map (#438) — and whether
  // Street View can be tried at all.
  const initialView = landingView((await cookies()).get(PIPELINE_VIEW_COOKIE)?.value);
  const googleEnabled = !!process.env.GOOGLE_MAPS_API_KEY;

  // The latest job per deal (Screening… / Failed labels), the teammate names
  // for shared deals and each deal's call-for-offers deadline depend only on
  // the deal list, not on each other — fetched together, a hundred ids a
  // request (lib/read-all): a whole pipeline's ids in one URL ran past what a
  // request line carries, and the jobs' one read past the project's max rows
  // (research pass 42). A read that fails is said over the list
  // (lib/pipeline-read-note), never shown as no screen running, no deadline.
  const rows = (data ?? []) as Row[];
  const ids = rows.map((d) => d.id);
  const teammateIds = Array.from(
    new Set(
      rows
        .filter((d) => d.team_id && d.user_id !== user?.id)
        .map((d) => d.user_id),
    ),
  );
  const failedRead = (what: string) => (e: unknown) => console.error(`[pipeline] ${what} read failed:`, e);
  const [jobsData, mates, dueRows] = await Promise.all([
    readByIds<{ deal_id: string } & JobLike>(
      ids,
      (chunk) =>
        supabase
          .from("analysis_jobs")
          // step + updated_at: a failed run's step says which results it
          // left behind, and a live row that stopped writing reads as stalled.
          .select("deal_id, status, step, updated_at, created_at")
          .in("deal_id", chunk)
          .order("created_at", { ascending: false })
          // Only the newest row per deal is read below — a few a deal, so a
          // long re-screen history can't grow a request past one response.
          .limit(Math.max(100, chunk.length * 3)),
      failedRead("job"),
    ),
    readByIds<{ id: string; email: string | null; full_name: string | null }>(
      teammateIds,
      (chunk) => supabase.from("profiles").select("id, email, full_name").in("id", chunk),
      failedRead("teammate name"),
    ),
    // The deadline column arrived in migration 0013, run everywhere since.
    readByIds<{ id: string; offers_due: string | null }>(
      ids,
      (chunk) => supabase.from("deals").select("id, offers_due").in("id", chunk),
      failedRead("offers-due"),
    ),
  ]);
  const readNote = pipelineReadNote({ jobs: !jobsData, offersDue: !dueRows, names: !mates });
  // Each chunk's rows arrive newest first, and a deal's rows all sit in its
  // own chunk, so the first seen is its latest.
  const jobByDeal = new Map<string, JobLike>();
  for (const j of jobsData ?? []) {
    if (!jobByDeal.has(j.deal_id)) jobByDeal.set(j.deal_id, j);
  }

  const dueById = new Map<string, string>();
  const dueRead = new Set<string>();
  for (const r of dueRows ?? []) {
    dueRead.add(r.id);
    if (r.offers_due) dueById.set(r.id, r.offers_due);
  }
  // The memorandum's call for offers fills a deadline nobody set (#467) —
  // a deal screened before the screen wrote it — once, and only where the
  // column is still empty when the write lands. Only for a row the read
  // answered for, so a database without the column never reads as "unset".
  const dueFills: [string, string][] = [];
  for (const d of rows) {
    if (d.is_sample || !dueRead.has(d.id) || dueById.has(d.id)) continue;
    const next = offersDueUpgrade(null, d.extraction as ExtractionResult | null);
    if (next) dueFills.push([d.id, next]);
  }
  // Read here from the values computed; written behind the response (below).
  for (const [id, due] of dueFills) dueById.set(id, due);
  const nameById = new Map((mates ?? []).map((m) => [m.id, m.full_name || m.email || "Teammate"]));

  // Every deal placed by its address (#441): a deal uploaded with the
  // address box empty takes the one its memorandum states, and a typed line
  // gets the street, city and state it names. Written once, so the pictures,
  // the flood map and the market check read it too, and read here for this
  // view; the card showed an overhead, or nothing, for a place it could have
  // named. A write the row's policy refuses (a teammate's deal) still reads
  // right on this page.
  const upgrades = new Map<string, StructuredAddress>();
  for (const d of rows) {
    if (d.is_sample) continue;
    const next = addressUpgrade(d.address, d.extraction as ExtractionResult | null);
    if (next) upgrades.set(d.id, next);
  }
  for (const d of rows) {
    const next = upgrades.get(d.id);
    if (next) d.address = next;
  }

  // Both write-backs go behind the response, a few at a time (lib/in-turns):
  // the page had awaited every one at once before it drew anything, so a
  // pipeline of older screens waited on a burst of updates (research pass
  // 42). The client was made before the render, so the callback reads no
  // request API; a write that fails is logged and made again on the next
  // view, which computes the same value.
  if (dueFills.length || upgrades.size) {
    const writes: (() => PromiseLike<boolean>)[] = [
      ...dueFills.map(([id, offers_due]) => () =>
        supabase
          .from("deals")
          .update({ offers_due })
          .eq("id", id)
          .is("offers_due", null)
          .then(({ error: e }) => !e),
      ),
      ...[...upgrades].map(([id, address]) => () =>
        supabase
          .from("deals")
          .update({ address })
          .eq("id", id)
          .then(({ error: e }) => !e),
      ),
    ];
    after(async () => {
      const failed = await inTurns(writes, (write) => write());
      if (failed) console.error(`[pipeline] ${failed} of ${writes.length} write-backs failed; the next view makes them again`);
    });
  }

  // Today on the reader's own calendar (their browser's zone, from its
  // cookie — lib/reader-day), read once per request and handed to the list:
  // every offers-due countdown counts from it, on the server and in the
  // browser alike (the deal page reads its own the same way), and each
  // row's rent rules read the allowance in force on it.
  const todayIso = readerToday((await cookies()).get(TZ_COOKIE)?.value);

  // Each deal's card (lib/pipeline-card): the figures, the fit, the tags
  // and the pictures the card, the list row and the map draw — one builder,
  // so a page that shows the sample's card draws the pipeline's own.
  // The pipeline by brokerage (research pass 24, B13): the firms the
  // memoranda name, each with its count, and the deals of the one chosen —
  // a firm no deal names any longer is no filter, never an empty list.
  const firmCounts = new Map<string, BrokerageOption>();
  const firmsByDeal = new Map<string, string[]>();
  for (const d of rows) {
    if (d.is_sample) continue;
    const firms = dealFirms(d.extraction as ExtractionResult | null);
    firmsByDeal.set(d.id, firms.map((f) => f.key));
    for (const f of firms) {
      const seen = firmCounts.get(f.key);
      firmCounts.set(f.key, { key: f.key, name: seen?.name ?? f.name, count: (seen?.count ?? 0) + 1 });
    }
  }
  const firmOptions = [...firmCounts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const activeBroker = broker && firmCounts.has(broker) ? broker : null;
  const shownRows = activeBroker ? rows.filter((d) => firmsByDeal.get(d.id)?.includes(activeBroker)) : rows;

  const deals: DealCard[] = shownRows.map((d) =>
    pipelineCard(d, {
      viewerId: user?.id ?? null,
      onTeam: !!billing?.team,
      box: d.team_id ? teamBox : personalBox,
      job: jobByDeal.get(d.id),
      addedByName: nameById.get(d.user_id) ?? null,
      offersDue: dueById.get(d.id) ?? null,
      today: todayIso,
      googleEnabled,
    }),
  );

  // Getting-started state — all real, computed from the reader's own data:
  // the list carries a team's deals too, and a teammate's screened memorandum
  // or sample is not this reader's first step taken.
  const own = rows.filter((d) => d.user_id === user?.id);
  const onboarding = {
    hasBuyBox: !!(personalBox || teamBox),
    sampleId: own.find((d) => d.is_sample)?.id ?? null,
    // "Screen your first OM" ticks for a memorandum a screen has finished —
    // never a deal typed in by hand, or a screen still running (lib/onboarding).
    hasScreenedOm: own.some((d) =>
      screenedAnOm({
        isSample: !!d.is_sample,
        omPath: d.om_storage_path ?? null,
        hasVerdict: !!(d.verdict as { verdict?: string } | null)?.verdict,
        job: jobByDeal.get(d.id),
      }),
    ),
  };

  return (
    <>
      <Pipeline
        deals={deals}
        errorMessage={errorMessage}
        notice={notice}
        openNew={newParam ?? (prefillAddress ? "prefill" : undefined)}
        prefillAddress={prefillAddress}
        onboarding={onboarding}
        billing={
          billing
            ? {
                isPro: billing.isPro,
                canCreateDeal: billing.canCreateDeal,
                // The meter counts what the create action counts: a team
                // trial's deals first, then the reader's own (lib/deal-allowance).
                allowance: dealAllowance(billing),
              }
            : null
        }
        initialView={initialView}
        viewerId={user?.id ?? null}
        onTeam={!!billing?.team}
        todayIso={todayIso}
        // The exact count beside the deals read: the page says the two
        // apart should they ever differ (a deal added or removed between the
        // count and the read), never a total it did not read.
        totalDeals={activeBroker ? null : (dealTotal ?? null)}
        filterBar={<BrokerageFilter firms={firmOptions} active={activeBroker} shown={shownRows.length} total={rows.length} />}
        // A read beside the deals that failed, said over the list.
        readNote={readNote}
        // An empty pipeline shows the sample's own card, the one the reader
        // gets the moment they add it: their own box judges it, and a deal
        // the sample action files is the reader's own, on a team or off.
        sampleCard={
          rows.length === 0
            ? sampleDealCard({ today: todayIso, box: personalBox, viewerId: user?.id ?? null, onTeam: !!billing?.team })
            : null
        }
      />
      {/* The strip's own read streams after the pipeline rather than
          holding it back; nothing is drawn until it has stories. */}
      <Suspense fallback={null}>
        <TodaysNews />
      </Suspense>
      <WhatsNewCard />
    </>
  );
}

/** Compact stories strip under the pipeline: the newest headlines the
 *  weekday sweep scored 5 or more, each linking to its source and dated. The
 *  sweep's table is shared by every account and carries no market, so the
 *  strip is titled for what it is (`NewsStrip`). Renders nothing at all
 *  until the intel cron has stories — no filler card. */
async function TodaysNews() {
  let items: NewsStripItem[] = [];
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("market_intel_items")
      .select("url, title, source, relevance, published_at")
      .gte("relevance", 5)
      .order("created_at", { ascending: false })
      .limit(4);
    items = (data as NewsStripItem[] | null) ?? [];
  } catch {
    // table absent — no card
  }
  return <NewsStrip items={items} />;
}
