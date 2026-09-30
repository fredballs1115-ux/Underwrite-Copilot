import type { Metadata } from "next";
import Link from "next/link";
import { createSupabaseServerClient, getCurrentUser } from "@/lib/supabase/server";
import { getBilling } from "@/lib/billing";
import { type DealRow } from "@/lib/deals";
import type { ExtractionResult, FirstSignal } from "@/lib/anthropic/types";
import { addressUpgrade, parseStructuredAddress, type StructuredAddress } from "@/lib/address";
import { offersDueUpgrade } from "@/lib/offering";
import { WhatsNewCard } from "./whats-new";
import { Pipeline, type DealCard } from "./pipeline";
import { PIPELINE_VIEW_COOKIE, landingView } from "@/lib/pipeline-view";
import { cookies } from "next/headers";
import { CARD, THUMB, bannerSources } from "@/lib/deal-banner";
import { coverFor, coverPlace } from "@/lib/deal-cover";
import { marketPictureFor } from "@/lib/market-picture";
import { PICTURE_CREDIT, memorandumPhotoCredit, pictureMayBeInMemorandum } from "@/lib/deal-picture";
import { cacheFresh, type DealVisualCache } from "@/lib/deal-location";
import { getBuyBoxForDeal } from "@/lib/criteria-server";
import { evaluateBuyBox, foldBuyBoxChecks, buyBoxCheckSource } from "@/lib/criteria";
import { inferStrategy } from "@/lib/deal-strategy";
import { pickSlots, shownAssetClass } from "@/lib/pipeline-slots";
import { floodCell, floodTag, siteFlagsStale, type SiteFlagsResult } from "@/lib/site-flags/core";
import { scoreMandateFit } from "@/lib/mandate";
import { countyOf, placeDeal } from "@/lib/market-county";
import { listJobStatus, type JobLike } from "@/lib/screen-run";

export const metadata: Metadata = { title: "Pipeline" };

const ERRORS: Record<string, string> = {
  name: "Please give the deal a name.",
  file: "Please choose a PDF offering memorandum to upload.",
  pdf: "That file isn’t a PDF — please upload the OM as a PDF.",
  size: "That PDF is larger than 32 MB — please try a smaller file for now.",
  save: "Couldn’t save the deal. Please try again.",
  upload: "The upload didn’t complete — nothing was saved. Please try again.",
  limit:
    "You’ve reached the 3-deal limit on the Free plan. Upgrade to Pro for unlimited deals.",
  exportfail:
    "Couldn’t build that export just now — please try again in a moment.",
  auth:
    "You were signed out, so the upload didn’t start. You’re back in now — everything you typed is still filled in below; just re-attach the PDF.",
  teamlimit:
    "Your team’s 3 trial deals and your personal free deals are used up. Start the Team plan for unlimited shared deals, or upgrade to Pro.",
};

// Fixed metric slots for the pipeline table — every row fills the SAME
// columns (or shows —), so one header labels them all and values align into
// scannable columns instead of repeating micro-labels in every row. The
// slots themselves are read in lib/pipeline-slots (pure, tested) by the
// same rule the meeting .xlsx applies.

/** A stored site-flags result as the pipeline row reads it (#426). */
function floodFor(flags: SiteFlagsResult | null): { tag: string | null; cell: string } | null {
  if (!flags || flags.status === "pending") return null;
  return { tag: floodTag(flags.flood), cell: floodCell(flags.flood) };
}

export default async function DealsPage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    deleted?: string;
    joined?: string;
    new?: string;
    addr?: string;
  }>;
}) {
  const { error: errorCode, deleted, joined, new: newParam, addr } = await searchParams;
  // Pull Comps hand-off: a structured address arrives as ?addr=<json> and
  // opens the new-deal form on the manual tab with the address pre-picked.
  const prefillAddress = parseStructuredAddress(addr ?? "");
  const errorMessage = errorCode ? (ERRORS[errorCode] ?? null) : null;
  const notice = deleted
    ? "Deal deleted."
    : joined
      ? "Welcome to the team — this pipeline is now shared with your teammates."
      : null;

  const supabase = await createSupabaseServerClient();
  // Request-cached: shares the layout's auth call instead of a second hop.
  const user = await getCurrentUser();

  // Billing state, the deal list, and the personal buy box are independent —
  // fetch them together.
  const [billing, { data, error }, personalBox] = await Promise.all([
    user ? getBilling(supabase, user.id) : Promise.resolve(null),
    supabase
      .from("deals")
      .select(
        "id, name, asset_class, created_at, verdict, extraction, address, first_signal, user_id, team_id, stage, is_sample, site_flags, photo, om_storage_path",
      )
      .order("created_at", { ascending: false }),
    user ? getBuyBoxForDeal(user.id, null).catch(() => null) : Promise.resolve(null),
  ]);
  const teamBox = billing?.team
    ? await getBuyBoxForDeal("", billing.team.id).catch(() => null)
    : null;

  if (error) {
    // "Relation does not exist" means the migrations haven't run (a setup
    // state); anything else is a transient outage — don't tell a user in
    // production to go run SQL.
    const schemaMissing = /relation|does not exist|schema/i.test(error.message);
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
    photo?: DealVisualCache | null;
    om_storage_path?: string | null;
  };

  // The card view's pictures (#428): the reader's choice of view from its
  // cookie — the cards or the list, never the map (#438) — and whether
  // Street View can be tried at all.
  const initialView = landingView((await cookies()).get(PIPELINE_VIEW_COOKIE)?.value);
  const googleEnabled = !!process.env.GOOGLE_MAPS_API_KEY;

  // The latest job per deal (Screening… / Failed labels) and the teammate
  // names for shared deals both depend only on the deal list, not on each
  // other — fetch them together instead of one after the other.
  const rows = (data ?? []) as Row[];
  const ids = rows.map((d) => d.id);
  const teammateIds = Array.from(
    new Set(
      rows
        .filter((d) => d.team_id && d.user_id !== user?.id)
        .map((d) => d.user_id),
    ),
  );
  const [{ data: jobsData }, { data: mates }, { data: dueRows }] = await Promise.all([
    ids.length
      ? supabase
          .from("analysis_jobs")
          // step + updated_at: a failed run's step says which results it
          // left behind, and a live row that stopped writing reads as stalled.
          .select("deal_id, status, step, updated_at, created_at")
          .in("deal_id", ids)
          .order("created_at", { ascending: false })
          // Only the newest row per deal is read below — cap the fetch so a
          // long re-screen history can't grow this query without bound.
          .limit(Math.max(100, ids.length * 3))
      : Promise.resolve({ data: [] as ({ deal_id: string } & JobLike)[] }),
    teammateIds.length
      ? supabase.from("profiles").select("id, email, full_name").in("id", teammateIds)
      : Promise.resolve({ data: [] as { id: string; email: string | null; full_name: string | null }[] }),
    // Call-for-offers deadlines are best-effort: the column arrived in
    // migration 0013, and the pipeline must keep working on a database that
    // hasn't run it yet (the query just errors and every deadline reads null).
    ids.length
      ? supabase.from("deals").select("id, offers_due").in("id", ids)
      : Promise.resolve({ data: [] as { id: string; offers_due: string | null }[] }),
  ]);
  const jobByDeal = new Map<string, JobLike>();
  for (const j of (jobsData ?? []) as ({ deal_id: string } & JobLike)[]) {
    if (!jobByDeal.has(j.deal_id)) jobByDeal.set(j.deal_id, j);
  }

  const dueById = new Map<string, string>();
  const dueRead = new Set<string>();
  for (const r of (dueRows ?? []) as { id: string; offers_due: string | null }[]) {
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
  if (dueFills.length) {
    await Promise.all(
      dueFills.map(([id, offers_due]) =>
        supabase
          .from("deals")
          .update({ offers_due })
          .eq("id", id)
          .is("offers_due", null)
          .then(
            () => undefined,
            () => undefined,
          ),
      ),
    );
    for (const [id, due] of dueFills) dueById.set(id, due);
  }
  const nameById = new Map(
    ((mates ?? []) as { id: string; email: string | null; full_name: string | null }[]).map(
      (m) => [m.id, m.full_name || m.email || "Teammate"],
    ),
  );

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
  if (upgrades.size) {
    await Promise.all(
      [...upgrades].map(([id, address]) =>
        supabase
          .from("deals")
          .update({ address })
          .eq("id", id)
          .then(
            () => undefined,
            () => undefined,
          ),
      ),
    );
    for (const d of rows) {
      const next = upgrades.get(d.id);
      if (next) d.address = next;
    }
  }

  const deals: DealCard[] = rows.map((d) => {
    const extraction = d.extraction as ExtractionResult | null;
    const verdict = d.verdict as { verdict?: string } | null;
    const job = jobByDeal.get(d.id);
    // Same deterministic engine AND the same inputs as the deal page: judge
    // against buyBoxCheckSource (extraction, else first signal, with the typed
    // address widening geography) so a deal reads identically on both surfaces.
    const box = d.team_id ? teamBox : personalBox;
    const checkSource = box
      ? buyBoxCheckSource(
          extraction,
          (d.first_signal as FirstSignal | null) ?? null,
          (d.address as StructuredAddress | null) ?? null,
          // The kind as the card infers it, so the fit chip judges a
          // development's land cost — the price the card prints.
          inferStrategy(extraction, (d.first_signal as FirstSignal | null) ?? null).kind,
        )
      : null;
    const mandate =
      box && checkSource ? scoreMandateFit(d.asset_class, checkSource, box) : null;
    // Where the deal is, the deal page's answer (lib/market-county, #447):
    // its briefed market, else the metro area whose figures it reads — by
    // its county where its address names no place a market's keywords know.
    // Site flags looked up for an address since edited are the old one's.
    const rowAddress = (d.address as StructuredAddress | null) ?? null;
    const storedFlags = (d as { site_flags?: SiteFlagsResult | null }).site_flags ?? null;
    const flags = siteFlagsStale(storedFlags, rowAddress?.label) ? null : storedFlags;
    const placement = placeDeal(rowAddress, countyOf(rowAddress, flags));
    return {
      id: d.id,
      name: d.name,
      // "auto" is the create form's choice, not a class: the row shows what
      // the extraction read the deck as, and nothing until it has.
      assetClass: shownAssetClass(d.asset_class, extraction),
      createdAt: d.created_at,
      verdict: verdict?.verdict ?? null,
      stage: (d.stage as DealCard["stage"]) ?? "screening",
      // Any miss → outside; else any near-miss → near; all-pass → fits.
      // Unknown-only results (nothing checkable yet) stay null and render as —.
      fit:
        box && checkSource
          ? foldBuyBoxChecks(evaluateBuyBox(d.asset_class, checkSource, box))
          : null,
      score: mandate?.score ?? null,
      mandateVerdict: mandate?.verdict ?? null,
      addedBy:
        d.team_id && d.user_id !== user?.id
          ? (nameById.get(d.user_id) ?? "Teammate")
          : null,
      market: extraction?.market ?? "",
      // The same placement the deal page makes — the list and the detail
      // agree on whether an address sits inside the briefed markets.
      coveredMarket: placement.briefed?.name ?? null,
      // A metro area the site reads without a brief, or one the deal's
      // county placed it in: named, and said how, so the row never reads
      // as "no figures".
      readMarket: placement.read?.name ?? null,
      readCounty: placement.placedBy?.county ?? null,
      offersDue: dueById.get(d.id) ?? null,
      slots: extraction
        ? pickSlots(extraction, (d.first_signal as FirstSignal | null) ?? null)
        : { cap: null, price: null, yoc: null },
      // Running, stalled (its process died mid-screen — a deploy, most
      // often) or failed with the verdict left behind; a failure that never
      // touched the verdict leaves the pill alone (lib/screen-run.ts).
      jobStatus: listJobStatus(job, !!verdict?.verdict),
      // Gate the aerial thumbnail here rather than letting every row fire a
      // request that can only 404: no address, no possible photograph.
      hasAddress: !!(d.address as StructuredAddress | null)?.label?.trim(),
      // FEMA's flood zone at the building, from the stored site-flags lookup
      // (#426): the row's tag in a Special Flood Hazard Area, the CSV's cell
      // in every case, nothing before the lookup has answered.
      flood: floodFor(flags),
      // Where the deal is, from the location its pictures were drawn at
      // (#431): read from the cache only — the list never geocodes; the map
      // places the rest on its own first view.
      ...(() => {
        const cache = d.photo ?? null;
        if (!cacheFresh(cache, Date.now(), (d.address as StructuredAddress | null) ?? null)) return { place: null };
        if (cache?.geoMiss) return { place: null, placeMiss: true };
        return typeof cache?.lat === "number" && typeof cache?.lng === "number"
          ? { place: { lat: cache.lat, lng: cache.lng, precision: cache.geoPrecision ?? ((d.address as StructuredAddress | null)?.street?.trim() ? "street" : "area") } }
          : { place: null };
      })(),
      // The card's pictures, best first and each pinned with its credit
      // (#428, the compare page's rule): the deal's own photograph — or the
      // memorandum's cover on its first ask — then Street View, then the
      // photograph the deal's market is known by, named as the market's
      // (#438). No overhead (#442): the pipeline's rule is pictures, not
      // maps, so where no photograph answers the card wears the deal's
      // cover, and the list row's thumbnail the same, at its own frame.
      ...(() => {
        const cache = d.photo ?? null;
        const address = (d.address as StructuredAddress | null) ?? null;
        const unread = pictureMayBeInMemorandum({
          omPath: d.om_storage_path ?? null,
          isSample: !!d.is_sample,
          cache,
        });
        // A memorandum photograph lifted under older rules is asked for
        // again like one not yet looked for (#444): over the next picture,
        // taking over only if today's search keeps it.
        const picture = unread ? null : (cache?.picture ?? null);
        const market = marketPictureFor(address, extraction?.market ?? null, placement.briefed ?? placement.read);
        const facts = {
          dealId: d.id,
          pictureCredit: picture ? PICTURE_CREDIT[picture.source] : null,
          // Its colours before its pixels (#463): the blur-up the frame
          // shows until the photograph has loaded whole.
          picturePreview: picture?.preview ?? null,
          memorandumUnread: unread,
          googleEnabled,
          hasStreetAddress: !!address?.street?.trim(),
          hasAddress: !!address?.label?.trim(),
          aerial: false,
        };
        return {
          pictures: bannerSources({ ...facts, market }, CARD),
          // No market photograph on a row: a skyline is a panorama, a sliver
          // at 48px, and its licence wants the photographer named beside it,
          // which a row's slot has no room for. The building's own
          // photograph, then its cover.
          thumbs: bannerSources(facts, THUMB),
          cover: coverFor({
            seed: d.id,
            assetClass: shownAssetClass(d.asset_class, extraction),
            place: coverPlace(address, market?.name, extraction?.market),
          }),
          // How many photographs the deal page holds (#448): the cover and
          // the memorandum's others, counted on the card over its photograph.
          photos: picture && !d.is_sample ? 1 + (cache?.gallery?.length ?? 0) : 0,
          // …and flipped through on the card (#450), each with its own page's
          // credit, only where the card leads with the deal's own photograph.
          slides:
            picture && !d.is_sample
              ? (cache?.gallery ?? []).map((g, k) => ({
                  kind: "photo" as const,
                  src: `/api/deals/${encodeURIComponent(d.id)}/picture?size=hero&g=${k + 1}`,
                  credit: memorandumPhotoCredit(g.page),
                  alt: g.page
                    ? `Photograph from page ${g.page} of the memorandum for ${d.name}`
                    : `Photograph from the memorandum for ${d.name}`,
                }))
              : [],
        };
      })(),
    };
  });

  // Getting-started state — all real, computed from the account's actual data.
  const onboarding = {
    hasBuyBox: !!(personalBox || teamBox),
    sampleId: rows.find((d) => d.is_sample)?.id ?? null,
    hasRealDeal: rows.some((d) => !d.is_sample),
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
                dealCount: billing.dealCount,
                dealLimit: billing.dealLimit,
              }
            : null
        }
        initialView={initialView}
      />
      <TodaysNews />
      <WhatsNewCard />
    </>
  );
}

/** Compact stories strip under the pipeline: the highest-scored recent
 *  headlines from the weekday sweep, each linking to its source. Renders
 *  nothing at all until the intel cron has stories — no filler card. */
async function TodaysNews() {
  let items: {
    url: string;
    title: string;
    source: string | null;
    relevance: number | null;
  }[] = [];
  try {
    const supabase = await createSupabaseServerClient();
    const { data } = await supabase
      .from("market_intel_items")
      .select("url, title, source, relevance")
      .gte("relevance", 5)
      .order("created_at", { ascending: false })
      .limit(4);
    items = (data as typeof items | null) ?? [];
  } catch {
    // table absent — no card
  }
  if (items.length === 0) return null;

  return (
    <section className="mt-6 rounded-xl border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">News for your markets</h2>
        <Link
          href="/news"
          className="text-xs font-medium text-brand underline decoration-dotted underline-offset-2"
        >
          All stories →
        </Link>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((it) => (
          <li key={it.url} className="text-sm leading-snug">
            {it.relevance !== null && (
              <span className="mr-2 rounded bg-faint px-1.5 py-px font-mono text-[11px] tabular-nums text-muted">
                {it.relevance}/10
              </span>
            )}
            <a
              href={it.url}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dotted underline-offset-2 hover:text-brand"
            >
              {it.title}
            </a>
            {it.source && <span className="ml-1.5 text-[11px] text-muted">{it.source}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
