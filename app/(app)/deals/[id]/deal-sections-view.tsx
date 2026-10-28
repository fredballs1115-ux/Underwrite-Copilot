"use client";

// The deal page's analysis sections as they are drawn: the overview, the
// terms, the challenger, the broker comps, the reconciliation, the market
// check and the verdict. Moved out of deal-sections.tsx so a page that only
// draws them (the homepage's walkthrough of the sample deal) loads no server
// action, no comps map and no Leaflet stylesheet; deal-sections.tsx re-exports
// every one of them, hands the comps their map and search, and keeps the
// pieces that act on a deal (the reconcile upload, the additions, the retry).

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { MarketPicture } from "@/lib/market-picture";
import { photographerParts } from "@/lib/credit-parts";
import { CreditPartsText } from "@/app/credit-parts";
import { MarketCaption } from "../market-caption";
import { placedByClause } from "@/lib/placed-by";
import { andList, figureHolders } from "@/lib/region-line";
import { CHALLENGER_SCENARIO_NOTE, CHALLENGER_SCENARIO_TITLE } from "@/lib/stress-test-title";
import { currentBriefLine } from "@/lib/permit-split";
import type { BehindWhy } from "@/lib/screen-run";
import { liveReadFailedLine } from "@/lib/market-read-failed";
import { COMP_RATING } from "@/lib/comp-rating";
import { SourceChip } from "./source-chip";
// The map is the deal page's (deal-sections.tsx hands it in): a type here,
// so this module loads no Leaflet and none of its stylesheet.
import type { CompsMap, MapComp } from "./comps-map";
import type { SubjectPoint } from "@/lib/public-comps/subject-point";
import { geocodeCandidates } from "@/lib/geo";
import { safeHttpUrl } from "@/lib/safe-url";
import { basisTracks, compBarsCaption, fmtBasis, type BasisTracks, type SubjectBasis } from "@/lib/comp-detail";
import { LISTING_NOT_SALE, saysListing } from "@/lib/web-comp-read";
import { gapDisagreementLine, gapScale, type GapUnit } from "@/lib/gap-detail";
import { reconciledAgainst, reconciliationHeading } from "@/lib/reconciliation-words";
import { typicalRange as readTypicalRange } from "@/lib/typical-range";
import { basePosition, firstNumber, rangeInOrder } from "@/lib/verdict-range";
import { factsForMetrics, locatedPage, type DealFact } from "@/lib/facts";
import { useToast } from "../../toaster";
import type { CompSearchResult } from "@/lib/anthropic/comps-search";
import type {
  ExtractionResult,
  ChallengerResult,
  Challenge,
  BrokerCompsResult,
  BrokerComp,
  ReconciliationResult,
  MarketResult,
  MarketCheck as MarketCheckType,
  VerdictResult,
  ScreenResult,
  ScreenRange,
  DealKiller,
  VerdictScenario,
} from "@/lib/anthropic/types";
import { figureValue, moveDelta, moveSentence, type BriefDelta } from "@/lib/brief-delta";
import { MoveTile } from "./since-last-screen";
import type { MetroDemand } from "@/lib/metro-demand";
import { DemandBars } from "@/app/demand-bars";
import {
  CALL_META,
  Callout,
  IconActivity,
  IconAlert,
  IconArrowDown,
  IconArrowRight,
  IconArrowUp,
  IconAsk,
  IconChevron,
  IconFlag,
  IconMinus,
  RevealList,
  SEV,
  SectionHeader,
  SplitBar,
  VerdictHero,
} from "./deal-sections-base";
// The Overview's pieces live in deal-sections-base.tsx; importers keep
// reading them here.
export { EmptyState, OverviewView, deriveRisks } from "./deal-sections-base";

/* ================================================================== */
/* 1 — Extracted terms (key first, rest on demand)                     */
/* ================================================================== */

export function TermsView({
  result,
  facts = [],
  omUrl = null,
}: {
  result: ExtractionResult;
  /** the deal's stored citations (deal_facts), each matched to its own
   *  row by label and value (lib/facts `factsForMetrics`) */
  facts?: readonly DealFact[];
  omUrl?: string | null;
}) {
  // Each row's own citation: two rows sharing a label get their own pages.
  const matched = factsForMetrics(result.metrics, facts);
  const factOf = new Map(result.metrics.map((m, i) => [m, matched[i]] as const));
  // Surface flagged + first figures; collapse the long tail.
  const ordered = [
    ...result.metrics.filter((m) => m.flagged),
    ...result.metrics.filter((m) => !m.flagged),
  ];
  const cards = ordered.map((m, i) => {
    const fact = factOf.get(m) ?? null;
    return (
    <div
      key={i}
      className={`rounded-xl bg-surface p-4 shadow-sm transition-shadow hover:shadow-md ${
        m.flagged
          ? "border border-line border-l-2 border-l-caution"
          : "border border-line"
      }`}
    >
      {/* Below `sm` the label wraps and its marks follow it: a phone's
          two-column card had cut "Pro forma cap rate" to "PRO FOR…" beside
          its own "pro forma" badge (the visual sweep of 2026-10-19). From
          `sm` it keeps one line, its whole text in the title. */}
      <p
        className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[11px] font-medium uppercase tracking-wide text-muted sm:flex-nowrap"
        data-qa="term-label"
      >
        <span className="min-w-0 break-words sm:truncate" title={m.label}>{m.label}</span>
        {/* The property's reality vs the sponsor's story, on the card
            itself — on a plan deal the difference between a $21M stabilized
            pro forma and today's income is the whole deal. */}
        {m.basis === "pro_forma" && (
          <span className="shrink-0 rounded bg-caution/10 px-1 py-px text-[9px] font-semibold normal-case tracking-normal text-caution">
            pro forma
          </span>
        )}
        {m.basis === "in_place" && (
          <span className="shrink-0 rounded bg-pass/10 px-1 py-px text-[9px] font-semibold normal-case tracking-normal text-pass">
            in place
          </span>
        )}
        {m.flagged && <span className="shrink-0 text-caution">⚑</span>}
      </p>
      <p className="mt-1.5 font-mono text-lg font-semibold leading-none tabular-nums">
        {m.value}
      </p>
      {fact ? (
        <p className="mt-2 leading-none">
          <SourceChip fact={fact} omUrl={omUrl} />
        </p>
      ) : (
        // A term with no stored citation (a deal screened before citations,
        // migration 0018) keeps its own page — only where it parses and
        // falls inside the deck's own length (lib/facts' absolute rule): an
        // unvalidated page is no page. Wherever the page has a memorandum to
        // open — every signed-in deal with an OM, and the public sample's
        // fictional one (lib/sample-om-link) — the validated "p. N" links to
        // it at that page; with none, it is plain text.
        (() => {
          const n = locatedPage(m.page, result.totalPages);
          if (n == null) return null;
          return omUrl ? (
            <p className="mt-2 leading-none">
              <a
                href={`${omUrl}#page=${n}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[10px] text-muted underline-offset-2 hover:text-ink hover:underline"
                title={`Open the OM at p. ${n}`}
                data-qa="term-page"
              >
                {`p. ${n}`}
              </a>
            </p>
          ) : (
            <p className="mt-2 text-[10px] text-muted">{`p. ${n}`}</p>
          );
        })()
      )}
    </div>
    );
  });

  const INITIAL = 8;
  const [open, setOpen] = useState(false);
  const shown = open ? cards : cards.slice(0, INITIAL);

  return (
    <section>
      <SectionHeader
        title="Extracted terms"
        aside={<span className="text-xs text-caution">⚑ verify against source</span>}
      />
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {shown}
      </div>
      {cards.length > INITIAL && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-strong"
        >
          {open ? "Show fewer" : `Show all ${cards.length} terms`}
          <IconChevron
            className={`h-3.5 w-3.5 transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
          />
        </button>
      )}
      {/* Manual deals: the buyer's free-text context, as prose — a paragraph
          has no business inside a KPI card. Whitespace is preserved so a
          pasted notes file keeps its line breaks. */}
      {result.buyerNotes && (
        <div className="mt-3 rounded-xl border border-line bg-surface p-4 shadow-sm">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            Context from the buyer
          </p>
          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed">
            {result.buyerNotes}
          </p>
        </div>
      )}
    </section>
  );
}

/* ================================================================== */
/* 2 — Assumption challenger                                           */
/* ================================================================== */

export function ChallengerView({
  result,
  dealName,
  totalPages = null,
}: {
  result: ChallengerResult;
  dealName?: string;
  /** the memorandum's own length: a cited page past it is never sent */
  totalPages?: number | null;
}) {
  const ordered = [...(result.challenges ?? [])].sort(
    (a, b) => SEV[a.severity].rank - SEV[b.severity].rank,
  );
  return (
    <section>
      <SectionHeader
        title="Assumption challenger"
        aside={
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <SeverityTally challenges={ordered} />
            {ordered.some((c) => c.question) && (
              <CopyAllQuestions challenges={ordered} dealName={dealName} totalPages={totalPages} />
            )}
          </div>
        }
      />
      <div className="mt-4">
        <RevealList
          initial={3}
          noun="more challenges"
          items={ordered.map((c, i) => (
            <ChallengeCard key={i} c={c} />
          ))}
        />
      </div>
      {result.stressTest && (
        <div className="mt-3 rounded-xl border border-line bg-paper p-4">
          <div className="flex items-center gap-2 text-brand">
            <IconActivity className="h-4 w-4" />
            {/* Whose words they are, as the full report heads them: the
                challenger's scenario, never a computed result
                (lib/stress-test-title). */}
            <p className="text-sm font-medium text-ink" data-qa="stress-test-title">{CHALLENGER_SCENARIO_TITLE}</p>
          </div>
          <p className="mt-1 text-xs text-muted" data-qa="stress-test-note">{CHALLENGER_SCENARIO_NOTE}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">
            {result.stressTest}
          </p>
        </div>
      )}
    </section>
  );
}

function SeverityTally({ challenges }: { challenges: Challenge[] }) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const c of challenges) counts[c.severity] = (counts[c.severity] ?? 0) + 1;
  return (
    <SplitBar
      parts={[
        { n: counts.high, label: "high", bar: "bg-kill", text: "text-kill" },
        { n: counts.medium, label: "med", bar: "bg-caution", text: "text-caution" },
        { n: counts.low, label: "low", bar: "bg-brand", text: "text-brand" },
      ]}
    />
  );
}

function ChallengeCard({ c }: { c: Challenge }) {
  const s = SEV[c.severity] ?? SEV.medium;
  return (
    <div className="relative overflow-hidden rounded-xl border border-line bg-surface p-4 pl-5 shadow-sm">
      <span className={`absolute left-0 top-0 h-full w-1 ${s.rail}`} />
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${s.chip}`}
        >
          {s.label}
        </span>
        <span className="text-sm font-semibold">{c.assumption}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-muted">{c.challenge}</p>
      {c.question && (
        <div className="mt-3 flex gap-2.5 rounded-lg bg-faint p-3">
          <span className="mt-0.5 shrink-0 text-brand">
            <IconAsk className="h-4 w-4" />
          </span>
          <p className="flex-1 text-sm leading-relaxed">
            <span className="font-medium">Ask the broker — </span>
            <span className="text-muted">{c.question}</span>
          </p>
          <CopyButton text={c.question} label="Copy broker question" />
        </div>
      )}
    </div>
  );
}

/** One click → a numbered, email-ready list of every broker question. */
/** Assemble the challenges into a ready-to-send broker email: subject line,
 *  questions grouped by severity, OM page refs — paste and hit send. */
export function buildBrokerEmail(challenges: Challenge[], dealName?: string, totalPages: number | null = null): string {
  const deal = dealName?.trim() || "the deal";
  const groups: [Challenge["severity"], string][] = [
    ["high", "Deal-critical"],
    ["medium", "Important"],
    ["low", "Also worth clarifying"],
  ];
  let n = 0;
  const sections = groups
    .map(([sev, heading]) => {
      const qs = challenges.filter((c) => c.severity === sev && c.question);
      if (!qs.length) return null;
      const lines = qs.map((c) => {
        // Only a page the memorandum has: an email to its broker citing a
        // page their deck does not hold is the one place a misread page
        // leaves the site.
        const cited = locatedPage(c.page, totalPages);
        const page = cited != null ? ` (OM p. ${cited})` : "";
        return `${++n}. ${c.question}${page}`;
      });
      return `${heading}:\n${lines.join("\n")}`;
    })
    .filter(Boolean);

  return [
    `Subject: ${deal} — questions from our initial screen`,
    "",
    "Hi,",
    "",
    `We've taken a first pass at ${deal} and have ${n === 1 ? "one question" : `${n} questions`} before going further:`,
    "",
    sections.join("\n\n"),
    "",
    "Anything you can share in writing helps — happy to get on a call for the rest.",
    "",
    "Thanks,",
  ].join("\n");
}

function CopyAllQuestions({
  challenges,
  dealName,
  totalPages,
}: {
  challenges: Challenge[];
  dealName?: string;
  totalPages: number | null;
}) {
  const toast = useToast();
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(
            buildBrokerEmail(challenges, dealName, totalPages),
          );
          toast("Broker email copied — subject line and all.", "success");
        } catch {
          toast("Couldn't copy — select the text instead.", "error");
        }
      }}
      className="whitespace-nowrap text-xs font-medium text-brand transition-colors hover:text-brand-strong"
    >
      Copy broker email
    </button>
  );
}

/** Copy a snippet to the clipboard with toast feedback — for the questions
 *  analysts paste straight into a broker email. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      aria-label={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          toast("Copied — paste it into your broker email.", "success");
        } catch {
          toast("Couldn't copy — select the text instead.", "error");
        }
      }}
      className="mt-0.5 shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-line/60 hover:text-ink"
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-3.5 w-3.5"
        aria-hidden
      >
        <rect width="14" height="14" x="8" y="8" rx="2" />
        <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
      </svg>
    </button>
  );
}

/* ================================================================== */
/* 3 — Broker-comp scrutiny                                            */
/* ================================================================== */

// A comp's grade in the one display map's words (lib/comp-rating): by
// comparability, never the stress test's verdict words.
export { COMP_RATING };

export function BrokerComps({
  result,
  dealId,
  compSearch,
  active,
  isPro,
  publicDemo = false,
  mapContext = null,
  subject = null,
  noun = "unit",
  map: CompsMapView,
  searchAction,
}: {
  result: BrokerCompsResult;
  /** the comps map (comps-map's `CompsMap`), handed in by the deal page
   *  (deal-sections.tsx) so a page that draws no map loads no Leaflet */
  map?: typeof CompsMap;
  /** the public-web search (comps-actions' `searchPublicComps`), handed
   *  in by the deal page, so this module loads no server action */
  searchAction?: (formData: FormData) => void | Promise<void>;
  /** what a unit is called on this deal (lib/asset-words) — "key", "pad";
   *  printed in the bars' captions, never computed on */
  noun?: string;
  dealId: string;
  compSearch: CompSearchResult | null;
  active: boolean;
  isPro: boolean;
  /** rendered on the public /demo page — Pro gates point to signup, not billing */
  publicDemo?: boolean;
  /** subject location for the comps map (Feature 4); null hides the map */
  mapContext?: {
    subjectLabel: string;
    market: string;
    omUrl: string | null;
    totalPages?: number | null;
    /** the deal's resolved location (lib/deal-location), where the page has
     *  one: the map measures from it rather than geocoding again */
    subjectPoint?: SubjectPoint | null;
    /** the sample deal: its memorandum's comps are fictional, so none is
     *  geocoded or pinned — a fictional comp's name placed on a real
     *  building would say it sold there */
    sample?: boolean;
  } | null;
  /** the subject's own basis (lib/comp-detail's subjectBasis), the tick the
   *  sale comps' bars are drawn against; null draws the bars with no tick */
  subject?: SubjectBasis | null;
}) {
  // Guarded once here: a legacy row with a null list must not take the
  // whole tab down (the schema forces arrays on every write the app makes).
  // (memoized: the map's own memo below keys on this array's identity)
  const saleComps = useMemo(() => result.saleComps ?? [], [result.saleComps]);
  const leaseComps = result.leaseComps ?? [];
  const redFlags = result.redFlags ?? [];
  const hasComps = saleComps.length > 0 || leaseComps.length > 0;

  // The map plots SALE comps (the OM's) beside the public-web candidates —
  // one pin set per source, colored apart. Each comp carries a geocode query
  // LADDER (address-in-text first, cleaned name, raw name — lib/geo), because
  // bare property names rarely exist in OpenStreetMap and used to leave most
  // pins unplaced. Memoized: a stable array identity keeps CompsMap's
  // geocode/map effects from re-firing on unrelated re-renders. On the
  // sample deal the memorandum's comps are fictional: none is geocoded or
  // pinned, and the table says so.
  const omCompsPinned = !!mapContext && !mapContext.sample;
  const mapComps: MapComp[] = useMemo(
    () =>
      mapContext
        ? [
            ...(mapContext.sample ? [] : saleComps).map((c, i): MapComp => {
              // A page the memorandum has, never the model's raw citation.
              const pageNum = locatedPage(c.page, mapContext.totalPages);
              return {
                id: `om-${i}`,
                kind: "om",
                name: c.name,
                detail: c.detail,
                sourceLabel: pageNum ? `OM p. ${pageNum}` : "OM",
                // The OM route signs on click; the #page fragment is kept
                // across its redirect (the Location carries none), as on the
                // source chips.
                sourceHref:
                  pageNum && mapContext.omUrl ? `${mapContext.omUrl}#page=${pageNum}` : null,
                queries: geocodeCandidates(c.name, c.detail, mapContext.market),
              };
            }),
            ...(compSearch?.candidates ?? []).map((c, i): MapComp => ({
              id: `web-${i}`,
              kind: "web",
              name: c.name,
              detail: [c.detail, c.date].filter(Boolean).join(" · "),
              // Linked only where the source is a page the search returned
              // (lib/anthropic/search-sources); otherwise its name alone,
              // said unverified.
              sourceLabel:
                c.sourceInSearch === true
                  ? c.sourceName || "Public source"
                  : `${c.sourceName || "Public source"} (unverified)`,
              sourceHref: c.sourceInSearch === true ? c.sourceUrl || null : null,
              queries: geocodeCandidates(
                c.name,
                c.detail ?? "",
                c.location || mapContext.market,
              ),
            })),
          ]
        : [],
    [mapContext, saleComps, compSearch],
  );

  return (
    <section className="space-y-4">
      <SectionHeader title="Broker-comp scrutiny" />
      {result.summary && <Callout icon={<IconAlert />}>{result.summary}</Callout>}
      {mapContext && mapComps.length > 0 && CompsMapView && (
        <CompsMapView
          subjectLabel={mapContext.subjectLabel}
          market={mapContext.market}
          comps={mapComps}
          subjectPoint={mapContext.subjectPoint ?? null}
          // The OM's sale comps are listed once, in the table below with
          // their pins; the map's own table lists the public-web comps.
          tableKinds={["web"]}
        />
      )}
      {redFlags.length > 0 && (
        <div className="rounded-xl border border-line border-l-4 border-l-kill bg-surface p-4 shadow-sm">
          <div className="flex items-center gap-2 text-kill">
            <IconFlag className="h-4 w-4" />
            <p className="text-sm font-medium text-ink">
              Selection &amp; omissions
            </p>
          </div>
          <ul className="mt-2.5 space-y-1.5">
            {redFlags.map((f, i) => (
              <li
                key={i}
                className="flex gap-2 text-sm leading-relaxed text-muted"
              >
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-kill" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {saleComps.length > 0 && mapContext?.sample && (
        <p className="text-xs text-muted" data-qa="sample-comps-unmapped">
          The sample&rsquo;s comps are fictional, like its building, so they are not placed on a map.
        </p>
      )}
      {saleComps.length > 0 && (
        <CompTable
          title="Sale comps"
          comps={saleComps}
          subject={subject ?? null}
          noun={noun}
          pins={!!CompsMapView && omCompsPinned && mapComps.length > 0}
          cite={mapContext ? { omUrl: mapContext.omUrl, totalPages: mapContext.totalPages } : null}
        />
      )}
      {leaseComps.length > 0 && (
        <CompTable title="Lease comps" comps={leaseComps} />
      )}
      {!hasComps && (
        <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
          <p className="text-sm font-medium">No comps in this OM</p>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            This offering memorandum didn’t include sale or lease comps. Try a
            public-web search below, add the comps you’ve found, or upload a comp
            sheet via <span className="font-medium text-ink">“Add info”</span>.
          </p>
        </div>
      )}

      <PublicWebComps
        dealId={dealId}
        compSearch={compSearch}
        active={active}
        hasOmComps={hasComps}
        isPro={isPro}
        publicDemo={publicDemo}
        sample={!!mapContext?.sample}
        searchAction={searchAction}
        subject={subject ?? null}
        noun={noun}
      />
    </section>
  );
}

/** The day a public-web search ran, "Oct 8, 2026" (UTC), or "". */
function searchedDay(iso: string | null | undefined): string {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t)
    ? new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : "";
}

function PublicWebComps({
  dealId,
  compSearch,
  active,
  hasOmComps,
  isPro,
  publicDemo = false,
  sample = false,
  searchAction,
  subject = null,
  noun = "unit",
}: {
  dealId: string;
  compSearch: CompSearchResult | null;
  active: boolean;
  hasOmComps: boolean;
  /** the subject's own basis (lib/comp-detail's subjectBasis): a candidate
   *  whose detail states a basis is drawn against it, as the OM's comps are */
  subject?: SubjectBasis | null;
  /** what a unit is called on this deal, for the bars' captions */
  noun?: string;
  isPro: boolean;
  publicDemo?: boolean;
  /** the reader's own sample deal: its building and its comps are
   *  fictional, so no public-web search runs on it and no upgrade is
   *  offered for one (comps-actions refuses it too) */
  sample?: boolean;
  searchAction?: (formData: FormData) => void | Promise<void>;
}) {
  // A candidate's stated basis on one track with the subject's tick, read
  // from its detail line by the OM comps' own reader (lib/comp-detail) —
  // never inferred, and a figure a listing states stays an ask (said on its
  // card). Its own track, apart from the memorandum's comps: a web
  // candidate is unverified, and the two sets are never pooled.
  const candidates = compSearch?.candidates ?? [];
  const webScale = candidates.length > 0 ? basisTracks(candidates, subject, noun) : null;
  return (
    <div className="rounded-xl border border-dashed border-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">
            Public-web comps{" "}
            {!hasOmComps && (
              <span className="font-normal text-muted">(OM has none)</span>
            )}
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            Public sources only — never MLS, CoStar or a licensed feed. Verify
            before relying on a figure.
          </p>
        </div>
        {publicDemo ? (
          // On the public demo the visitor has no account yet — route the
          // gate to signup, not the billing page's sign-in wall.
          <Link
            href="/login?mode=signup"
            className="shrink-0 rounded-lg border border-brand/30 bg-brand/5 px-3 py-1.5 text-sm font-medium text-brand transition-colors hover:bg-brand/10"
          >
            Sign up to search
          </Link>
        ) : sample ? (
          <p className="max-w-xs text-xs leading-relaxed text-muted" data-qa="sample-no-web-search">
            The sample&rsquo;s building is fictional, so the web is not searched for it; a deal of your own can be.
          </p>
        ) : isPro ? (
          <form action={searchAction}>
            <input type="hidden" name="dealId" value={dealId} />
            <button
              type="submit"
              disabled={active}
              className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm font-medium transition-colors hover:bg-faint disabled:opacity-50"
            >
              {compSearch ? "Search again" : "Search public web"}
            </button>
          </form>
        ) : (
          <Link
            href="/billing"
            className="shrink-0 rounded-lg border border-caution/30 bg-caution/5 px-3 py-1.5 text-sm font-medium text-caution transition-colors hover:bg-caution/10"
          >
            Upgrade to search
          </Link>
        )}
      </div>

      {compSearch && (
        <div className="mt-3">
          <p className="text-xs leading-relaxed text-muted">
            {compSearch.summary}
            {searchedDay(compSearch.searchedAt) ? ` Searched ${searchedDay(compSearch.searchedAt)}.` : ""}
          </p>
          {compSearch.candidates.length > 0 && (
            <div className="mt-2 space-y-2">
              {compSearch.candidates.map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-line bg-surface p-3 shadow-sm"
                >
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">
                      {c.name}
                    </span>
                    <span className="ml-auto shrink-0 rounded-full bg-caution/10 px-2 py-0.5 text-[10px] font-medium uppercase text-caution">
                      unverified
                    </span>
                  </div>
                  {(c.location || c.date) && (
                    <p className="mt-0.5 text-xs text-muted">
                      {c.location}
                      {c.location && c.date ? " · " : ""}
                      {c.date}
                    </p>
                  )}
                  {c.detail && (
                    <p className="mt-1 font-mono text-xs tabular-nums">
                      {c.detail}
                      {webScale && <CompBasisBar tracks={webScale} index={i} />}
                    </p>
                  )}
                  {c.note && (
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {c.note}
                    </p>
                  )}
                  {saysListing(c) && (
                    <p className="mt-1 text-xs leading-relaxed text-caution" data-qa="web-comp-listing">
                      {LISTING_NOT_SALE}
                    </p>
                  )}
                  {/* A source becomes a link only where it is a page the
                      search returned, at the search's own address, and then
                      only an http(s) one (lib/anthropic/search-sources). A
                      source the model named that the search did not return,
                      or one stored before the check, is its name in words,
                      said unverified — never a link. */}
                  {c.sourceInSearch === true && safeHttpUrl(c.sourceUrl) ? (
                    <a
                      href={safeHttpUrl(c.sourceUrl)!}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1.5 inline-block text-xs font-medium text-brand hover:underline"
                    >
                      {c.sourceName || "Source"} →
                    </a>
                  ) : c.sourceName ? (
                    <p className="mt-1.5 text-xs text-muted" data-qa="source-unverified">
                      {`${c.sourceName} · unverified, ${
                        c.sourceInSearch === false
                          ? "not a page the search returned"
                          : "not checked against the search's pages"
                      }`}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
          {webScale && (
            <div className="mt-1.5 space-y-0.5 text-[11px] text-muted" data-qa="web-comp-bars-caption">
              {webScale.tracks.map((t, k) => (
                <p key={t.unit}>{compBarsCaption(t, webScale.counts[k], candidates.length, "candidate")}</p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** A comp's pin on the map above, its number the map's. */
function PinBadge({ n }: { n: number }) {
  return (
    <span
      className="mr-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 align-[1px] text-[10px] font-bold text-white"
      title={`Pin ${n} on the map`}
    >
      <span className="sr-only">Pin </span>
      {n}
    </span>
  );
}

/** "OM p. 14", linked to the page where the memorandum opens. */
function PageCite({ page }: { page: { n: number; href: string | null } | null }) {
  if (!page) return null;
  return page.href ? (
    <a
      href={page.href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-0.5 inline-block text-[11px] font-medium text-brand hover:text-brand-strong"
      data-qa="comp-page"
    >
      {`OM p. ${page.n}`}
    </a>
  ) : (
    <span className="mt-0.5 inline-block text-[11px] text-muted" data-qa="comp-page">
      {`OM p. ${page.n}`}
    </span>
  );
}

/** A comp's stated basis on the set's track with the subject's tick — the
 *  same picture in the table cell and the phone card. The words a screen
 *  reader gets are in the span; the tooltip repeats them for a pointer. */
function CompBasisBar({ tracks, index }: { tracks: BasisTracks; index: number }) {
  const t = tracks.trackOf[index];
  const scale = t != null ? tracks.tracks[t] : null;
  const share = scale ? scale.shares[index] : null;
  if (!scale || share == null) return null;
  const own = fmtBasis(share * scale.max, scale.unit, scale.noun);
  // A lone bar with no subject tick is scaled to nothing but itself, so it
  // claims no scale (lib/comp-detail `compBarsCaption`'s rule).
  const words =
    scale.subjectValue != null
      ? `${own} against the subject's ${fmtBasis(scale.subjectValue, scale.unit, scale.noun)}`
      : (tracks.counts[t!] ?? 0) > 1
        ? `${own}, scaled to the widest in the set`
        : own;
  return (
    <span data-comp-bar className="relative mt-1.5 block h-1 w-24 rounded-full bg-faint" title={words}>
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 rounded-full bg-brand/40"
        style={{ width: `${Math.round(share * 100)}%` }}
      />
      {scale.subjectShare != null && (
        <span
          aria-hidden
          data-comp-subject
          className="absolute -inset-y-0.5 w-0.5 rounded-full bg-ink"
          style={{ left: `calc(${Math.round(scale.subjectShare * 100)}% - 1px)` }}
        />
      )}
      <span className="sr-only">{words}</span>
    </span>
  );
}

function CompTable({
  title,
  comps,
  subject,
  noun = "unit",
  pins = false,
  cite = null,
}: {
  title: string;
  comps: BrokerComp[];
  /** the comps map above draws these comps as numbered pins: each row wears
   *  its pin's number, so the map and this one table read together */
  pins?: boolean;
  /** where a comp states the memorandum's page, the row cites it — linked
   *  where the OM opens (its route signs on click) */
  cite?: { omUrl: string | null; totalPages?: number | null } | null;
  /** what a unit is called on this deal — the bars' captions say "/key" */
  noun?: string;
  /** sale comps carry the subject (null when it has no basis) and draw their
   *  stated basis as a bar against it; lease comps pass nothing and draw none */
  subject?: SubjectBasis | null;
}) {
  const INITIAL = 4;
  const [open, setOpen] = useState(false);
  // Risk first — a stretched comp must never hide behind "Show all". Each
  // keeps its place in the memorandum's list, which is its pin's number.
  const orderedAt = comps
    .map((c, at) => ({ c, at }))
    .sort((a, b) => (COMP_RATING[a.c.support]?.rank ?? 1) - (COMP_RATING[b.c.support]?.rank ?? 1));
  const ordered = orderedAt.map((o) => o.c);
  const shown = open ? ordered : ordered.slice(0, INITIAL);
  // Every comp's stated basis on one track, the subject's as a tick — read
  // once from the detail lines (lib/comp-detail), never inferred. Indexed
  // against `ordered`, of which `shown` is a prefix.
  const scale = subject === undefined ? null : basisTracks(ordered, subject, noun);
  /** The pin and the page a row carries, by its place in `ordered`. */
  const pinOf = (i: number) => (pins ? orderedAt[i].at + 1 : null);
  const pageOf = (c: BrokerComp) => {
    const n = cite ? locatedPage(c.page, cite.totalPages) : null;
    return n ? { n, href: cite?.omUrl ? `${cite.omUrl}#page=${n}` : null } : null;
  };
  const counts = { stretched: 0, favorable: 0, supports: 0 };
  for (const c of comps) counts[c.support] = (counts[c.support] ?? 0) + 1;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted">
          {title}
        </h3>
        <SplitBar
          parts={[
            { n: counts.stretched, label: COMP_RATING.stretched.short, bar: "bg-kill", text: "text-kill" },
            { n: counts.favorable, label: COMP_RATING.favorable.short, bar: "bg-caution", text: "text-caution" },
            { n: counts.supports, label: COMP_RATING.supports.short, bar: "bg-pass", text: "text-pass" },
          ]}
        />
      </div>
      {/* Phone: a card per comp — name and rating, the note, the detail with
          its bar — so a phone reads a whole comp instead of a table it
          scrolls sideways. From `sm` up the table takes over. */}
      <ul className="grid gap-2 sm:hidden" aria-label={`${title} as cards`}>
        {shown.map((c, i) => {
          const r = COMP_RATING[c.support] ?? COMP_RATING.favorable;
          return (
            <li key={i} className="rounded-xl border border-line bg-surface p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-medium">
                  {pinOf(i) != null && <PinBadge n={pinOf(i)!} />}
                  {c.name}
                </p>
                <span
                  className={`inline-flex shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${r.badge}`}
                >
                  {r.label}
                </span>
              </div>
              {c.note && <p className="mt-1 text-xs leading-relaxed text-muted">{c.note}</p>}
              <p className="mt-1.5 break-words font-mono text-xs leading-relaxed tabular-nums text-muted">
                {c.detail}
                {scale && <CompBasisBar tracks={scale} index={i} />}
              </p>
              <PageCite page={pageOf(c)} />
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface shadow-sm sm:block">
        <table className="w-full min-w-[34rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-medium">Comp</th>
              <th className="px-4 py-2.5 font-medium">Detail</th>
              <th className="px-4 py-2.5 text-right font-medium">Comparability</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((c, i) => {
              const r = COMP_RATING[c.support] ?? COMP_RATING.favorable;
              return (
                <tr
                  key={i}
                  className="border-b border-line align-top transition-colors last:border-0 hover:bg-faint/60"
                >
                  <td className="min-w-[14rem] px-4 py-3">
                    <p className="break-words font-medium">
                      {pinOf(i) != null && <PinBadge n={pinOf(i)!} />}
                      {c.name}
                    </p>
                    {c.note && (
                      <p className="mt-0.5 text-xs leading-relaxed text-muted">
                        {c.note}
                      </p>
                    )}
                    <PageCite page={pageOf(c)} />
                  </td>
                  <td className="min-w-[9rem] max-w-[16rem] break-words px-4 py-3 font-mono text-xs leading-relaxed tabular-nums text-muted">
                    {c.detail}
                    {scale && <CompBasisBar tracks={scale} index={i} />}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span
                      className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${r.badge}`}
                    >
                      {r.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {scale && (
        // The legend for the bars: a line a yardstick, each saying which of
        // the comps it draws, so the tick needs no guessing and no comp that
        // states a basis goes undrawn — the report's own caption
        // (lib/comp-detail `compBarsCaption`), so the page and the PDF say
        // one thing, and a lone bar claims no scale.
        <div className="mt-1.5 space-y-0.5 text-[11px] text-muted" data-qa="comp-bars-caption">
          {scale.tracks.map((t, k) => (
            <p key={t.unit}>{compBarsCaption(t, scale.counts[k], comps.length)}</p>
          ))}
        </div>
      )}
      {comps.length > INITIAL && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand transition-colors hover:text-brand-strong"
        >
          {open ? "Show fewer" : `Show all ${comps.length}`}
          <IconChevron
            className={`h-3.5 w-3.5 transition-transform ${open ? "-rotate-90" : "rotate-90"}`}
          />
        </button>
      )}
    </div>
  );
}

/* ================================================================== */
/* 4 — Reconciliation                                                  */
/* ================================================================== */

const DIR = {
  unfavorable: { badge: "bg-kill/10 text-kill", label: "Unfavorable", Icon: IconArrowDown },
  favorable: { badge: "bg-pass/10 text-pass", label: "Favorable", Icon: IconArrowUp },
  neutral: { badge: "bg-brand/10 text-brand", label: "Neutral", Icon: IconMinus },
} as const;

const GAP_UNIT_WORD: Record<GapUnit, string> = {
  usd: "dollar",
  bps: "basis-point",
  pct: "percentage",
};

/** The gap as a bar from a centre line — favorable to the right in the pass
 *  colour, unfavorable to the left in the kill colour, the direction the
 *  row's badge already states — scaled to the widest gap of the same unit
 *  in the table (lib/gap-detail), so a dollar gap and a basis-point gap
 *  never share a scale. The words beside it carry the figure. */
function GapBar({ share, unit }: { share: number; unit: GapUnit }) {
  const half = Math.round(Math.abs(share) * 50);
  return (
    <span
      aria-hidden
      data-gap-bar
      title={`${Math.round(Math.abs(share) * 100)}% of the widest ${GAP_UNIT_WORD[unit]} gap in the table`}
      className="relative mt-1.5 block h-1 w-24 rounded-full bg-faint"
    >
      <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-muted/40" />
      <span
        className={`absolute inset-y-0 rounded-full ${share < 0 ? "bg-kill" : "bg-pass"}`}
        style={share < 0 ? { right: "50%", width: `${half}%` } : { left: "50%", width: `${half}%` }}
      />
    </span>
  );
}

export function Reconciliation({ result }: { result: ReconciliationResult }) {
  const rows = result.rows ?? [];
  const scale = gapScale(rows);
  const drawn = scale.shares.some((s) => s !== null);
  // One read per row for both layouts, so the card and the table can never
  // disagree on a row's direction or its bar.
  const view = rows.map((r, i) => ({
    r,
    d: DIR[r.direction] ?? DIR.neutral,
    share: scale.shares[i] ?? null,
    unit: scale.units[i] ?? null,
    // The bar is the two figures' own gap (lib/gap-detail); where the
    // reconciler's line says another, the row says so under it.
    differs: gapDisagreementLine(r),
  }));
  const legend =
    "Bars: each gap scaled to the widest of its kind; favorable right, unfavorable left.";
  const counts = { unfavorable: 0, favorable: 0, neutral: 0 };
  for (const r of rows) counts[r.direction] = (counts[r.direction] ?? 0) + 1;
  // Whose model the rows are: the reader's own, or (on the sample) the
  // first-draft model built from the documents (lib/reconciliation-words).
  const mine = reconciledAgainst(result).label;
  return (
    <section className="space-y-4">
      <SectionHeader
        title={reconciliationHeading(result)}
        aside={
          rows.length > 0 ? (
            <SplitBar
              parts={[
                { n: counts.unfavorable, label: "unfavorable", bar: "bg-kill", text: "text-kill" },
                { n: counts.favorable, label: "favorable", bar: "bg-pass", text: "text-pass" },
                { n: counts.neutral, label: "neutral", bar: "bg-muted/40", text: "text-muted" },
              ]}
            />
          ) : undefined
        }
      />
      {result.takeaway && (
        <Callout icon={<IconArrowRight />}>
          <span className="font-medium">Takeaway — </span>
          <span className="text-muted">{result.takeaway}</span>
        </Callout>
      )}
      {/* Phone: a card per row — the metric and its direction, the OM's
          figure and yours side by side, the gap with its bar — so a phone
          reads a whole row instead of a table it scrolls sideways. From `sm`
          up the table takes over. */}
      <div className="sm:hidden">
        <ul className="grid gap-2" aria-label="Reconciliation as cards">
          {view.map(({ r, d, share, unit, differs }, i) => (
            <li key={i} className="rounded-xl border border-line bg-surface p-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 break-words text-sm font-medium">{r.metric}</p>
                <span
                  className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${d.badge}`}
                >
                  <d.Icon className="h-3 w-3" />
                  {d.label}
                </span>
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-3">
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted">OM says</dt>
                  <dd className="font-mono text-sm tabular-nums text-muted">{r.omValue}</dd>
                </div>
                <div>
                  <dt className="text-[10px] uppercase tracking-wide text-muted">{mine}</dt>
                  <dd className="font-mono text-sm font-medium tabular-nums text-ink">{r.myValue}</dd>
                </div>
              </dl>
              {r.gap && <p className="mt-2 text-sm text-ink">{r.gap}</p>}
              {differs && <p data-gap-differs className="mt-1 text-[11px] text-caution">{differs}</p>}
              {share !== null && unit && <GapBar share={share} unit={unit} />}
            </li>
          ))}
        </ul>
        {drawn && <p className="mt-1.5 text-[11px] text-muted">{legend}</p>}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-line bg-surface shadow-sm sm:block">
        <table className="w-full min-w-[36rem] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-wide text-muted">
              <th className="px-4 py-2.5 font-medium">Metric</th>
              <th className="px-4 py-2.5 font-medium">OM says</th>
              <th className="px-4 py-2.5 font-medium">{mine}</th>
              <th className="px-4 py-2.5 font-medium">Gap</th>
            </tr>
          </thead>
          <tbody>
            {view.map(({ r, d, share, unit, differs }, i) => {
              return (
                <tr
                  key={i}
                  className="border-b border-line align-top transition-colors last:border-0 hover:bg-faint/60"
                >
                  <td className="px-4 py-3 font-medium">{r.metric}</td>
                  <td className="px-4 py-3 font-mono tabular-nums text-muted">
                    {r.omValue}
                  </td>
                  <td className="px-4 py-3 font-mono font-medium tabular-nums text-ink">
                    {r.myValue}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${d.badge}`}
                    >
                      <d.Icon className="h-3 w-3" />
                      {d.label}
                    </span>
                    {r.gap && <p className="mt-1 text-ink">{r.gap}</p>}
                    {differs && <p data-gap-differs className="mt-1 text-[11px] text-caution">{differs}</p>}
                    {share !== null && unit && <GapBar share={share} unit={unit} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {drawn && <p className="border-t border-line px-4 py-2 text-[11px] text-muted">{legend}</p>}
      </div>
    </section>
  );
}

/* ================================================================== */
/* 5 — Market plausibility check                                       */
/* ================================================================== */

export const TONE = {
  "in-line": { badge: "bg-pass/10 text-pass", label: "In-line" },
  aggressive: { badge: "bg-kill/10 text-kill", label: "Aggressive" },
  conservative: { badge: "bg-brand/10 text-brand", label: "Conservative" },
} as const;

export function MarketCheck({
  result,
  since = null,
  demand = null,
  picture = null,
  pictureCheckReads = false,
}: {
  result: MarketResult;
  /** what moved since the check read its figures (lib/brief-delta), read
   *  by the page today; null where the check stored none or nothing could
   *  be read */
  since?: BriefDelta | null;
  /** the metro area's payrolls by sector today (lib/metro-demand), with the
   *  sector that fills this building's kind marked; null outside the
   *  covered markets or before the pull has written the rows */
  demand?: MetroDemand | null;
  /** the photograph the deal's market is known by (lib/market-picture,
   *  resolved by the page — plain data, so this client module loads none of
   *  lib/skyline's table); null where no photographed market answers */
  picture?: MarketPicture | null;
  /** whether the photograph is of the market whose figures this check read
   *  (the page holds it to the stored brief's market and grain). One
   *  reached through the county or the memorandum's words, for a market the
   *  check read no figures of, is named as the place's photograph, never as
   *  the market this check reads. */
  pictureCheckReads?: boolean;
}) {
  // Aggressive first — that's where the risk is.
  const order = { aggressive: 0, conservative: 1, "in-line": 2 } as const;
  const ordered = [...(result.checks ?? [])].sort(
    (a, b) => order[a.assessment] - order[b.assessment],
  );
  const brief = result.liveBrief ?? null;
  // A portfolio across markets (#413): each other market's own figures,
  // folded under the address's the same way.
  const others = (result.otherBriefs ?? []).filter((b) => b.lines.length > 0);
  // A covered market whose figures could not be read that day: said so,
  // never read like a market outside the covered ones (research pass 30).
  const readFailed = !brief ? liveReadFailedLine(result.liveReadFailed) : null;
  return (
    <section className="space-y-4">
      {picture && <MarketPictureBand picture={picture} checkReads={pictureCheckReads} />}
      <SectionHeader
        title="Market plausibility check"
        aside={
          <span className="text-xs text-muted">
            {others.length > 0
              ? `rules of thumb, read beside each market's published figures`
              : brief
                ? `rules of thumb, read beside ${
                    brief.lines.length > 0 && (brief.national ?? 0) >= brief.lines.length ? "the nation's" : brief.grain === "state" ? "the state's" : "the metro's"
                  } published figures`
                : readFailed
                  ? "rules of thumb — the published figures were not read"
                  : "rules-of-thumb, not pulled comps"}
          </span>
        }
      />
      {readFailed && (
        <p className="rounded-xl border border-caution/30 bg-caution/5 px-4 py-3 text-sm text-caution" data-qa="live-read-failed">
          {readFailed}
        </p>
      )}
      {result.summary && <Callout>{result.summary}</Callout>}
      {brief && brief.lines.length > 0 && <LiveBriefRead brief={brief} />}
      {others.map((b) => (
        <LiveBriefRead key={b.metro} brief={b} />
      ))}
      {demand && <MetroDemandCard demand={demand} />}
      {since && <SinceThisScreen since={since} />}
      <div>
        <RevealList
          initial={3}
          noun="more checks"
          items={ordered.map((c, i) => (
            <MarketRow key={i} c={c} />
          ))}
        />
      </div>
    </section>
  );
}

/**
 * The market check opens on the place it reads: the photograph its market
 * is known by (lib/market-picture, the one the pipeline card and the deal
 * page's Market view draw), named on its face as the market's under the one
 * caption every market photograph wears, its photographer linked to the
 * file's page and its licence to its text, "cropped to fit" since the band
 * crops it. A photograph that does not load takes the band with it, credit
 * and all: a credit is never left over a picture nobody can see.
 */
function marketPictureAlt(picture: MarketPicture, checkReads: boolean): string {
  return checkReads
    ? `${picture.place}: the ${picture.name} market this check reads`
    : `${picture.place}: the photograph the ${picture.name} area is known by`;
}

function MarketPictureBand({ picture, checkReads }: { picture: MarketPicture; checkReads: boolean }) {
  const [gone, setGone] = useState(false);
  const img = useRef<HTMLImageElement>(null);
  // A load that failed before hydration fired its error with no listener.
  useEffect(() => {
    const el = img.current;
    if (el && el.complete && el.naturalWidth === 0) setGone(true);
  }, []);
  if (gone) return null;
  return (
    <figure className="relative overflow-hidden rounded-xl border border-line bg-faint" data-qa="market-check-picture">
      {/* eslint-disable-next-line @next/next/no-img-element -- the skyline
          route, proxied from Commons with its own immutable cache headers */}
      <img
        ref={img}
        src={picture.src}
        alt={marketPictureAlt(picture, checkReads)}
        width={1600}
        height={560}
        loading="lazy"
        decoding="async"
        className="block h-48 w-full object-cover sm:h-56"
        onError={() => setGone(true)}
      />
      <MarketCaption
        market={picture.name}
        credit={
          <CreditPartsText
            parts={photographerParts(picture.author, picture.license, true)}
            linkClassName="pointer-events-auto underline decoration-dotted underline-offset-2 hover:text-white"
          />
        }
        size="hero"
      />
    </figure>
  );
}

/**
 * The figures the check was handed (lib/live-market-brief), folded: the
 * first line of the summary says which market and which day, the list is
 * one click away — and every line stays in the HTML for the lints and a
 * screen reader. A check's evidence is never hidden; it is just not the
 * headline.
 */
/** "Sep 23, 2026" from an ISO day; the day as it came where it is not one. */
function longDate(iso: string): string {
  const at = Date.parse(`${iso}T00:00:00Z`);
  return Number.isFinite(at)
    ? new Date(at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
    : iso;
}

/**
 * What moved since the check read its figures (lib/brief-delta): the day,
 * how many of the figures have a newer observation and how many moved, and
 * a before → after tile per figure that moved, in its own unit — the
 * retrade card's tile (since-last-screen.tsx), its sentence kept in the HTML
 * as what a screen reader hears. A figure the
 * publisher has not updated since is counted as such, never as unchanged.
 */
function SinceThisScreen({ since }: { since: BriefDelta }) {
  const moved = since.moves.filter((m) => m.kind === "moved");
  const n = since.moves.length;
  const figures = n === 1 ? "figure" : "figures";
  const summary =
    since.newer === 0
      ? `None of the ${n} ${figures} the check read has a newer observation yet.`
      : since.moved === 0
        ? `${since.newer} of the ${n} ${figures} the check read have a newer observation, and none moved.`
        : `${since.newer} of the ${n} ${figures} the check read have a newer observation; ${since.moved} moved.`;
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-qa="since-this-screen">
      <p className="font-medium">Since this check ran on {longDate(since.since)}</p>
      <p className="mt-0.5 text-xs text-muted">{summary}</p>
      {moved.length > 0 && (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {moved.map((m) => (
            <li key={m.key}>
              <MoveTile
                label={m.label}
                delta={moveDelta(m)}
                before={figureValue(m.unit, m.from)}
                after={figureValue(m.unit, m.to)}
                tone="moved"
                said={moveSentence(m)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The demand side of the deal's market as a picture: the metro area's
 * payrolls by sector against a year ago (the same rows the market brief
 * draws under its tiles), read today, with the sector that fills this
 * building's kind drawn full and the others faded — an office reads
 * professional and business services, a warehouse transportation and
 * warehousing, a store retail trade, a hotel leisure and hospitality;
 * rental housing reads all payrolls, so nothing is singled out. Nothing
 * renders outside the covered markets or before the pull has written the
 * rows.
 */
function MetroDemandCard({ demand }: { demand: MetroDemand }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3 text-sm" data-qa="metro-demand">
      <p className="font-medium">{`The demand side today — payrolls by sector, ${demand.area}`}</p>
      <p className="mt-0.5 text-xs text-muted">{demand.intro}</p>
      <DemandBars demand={demand} />
    </div>
  );
}

/**
 * How many figures a folded block holds and whose they are. The last
 * `national` lines are the nation's (the debt market, lessor rents, the
 * insurance index, CRE prices) and are counted as such — "each the
 * metro's" over a block ending in the 10-year was not true of it.
 */
function briefCount(brief: NonNullable<MarketResult["liveBrief"]>): string {
  const n = brief.lines.length;
  const nat = Math.min(Math.max(brief.national ?? 0, 0), n);
  const whose = brief.grain === "state" ? "the state’s rather than any metro’s" : "the metro’s rather than the submarket’s";
  // Whose each line is, counted: the market's own, a Census region's
  // rental vacancy (the region's, said so — audit C4, L7) and the nation's.
  const holders = figureHolders(brief.lines, nat, whose, "’");
  // Every line the nation's: no figure of the market's own was current.
  const split = nat >= n ? "each dated, each the nation’s" : holders.length > 1 ? `each dated: ${andList(holders)}` : `each dated, each ${whose}`;
  const tail = brief.portfolio
    ? ", and never the portfolio’s"
    : brief.grain === "state"
      ? " — the address lies outside the metros the site tracks"
      : "";
  return ` — ${n} published ${n === 1 ? "figure" : "figures"} as of ${longDate(brief.readOn)}, ${split}${tail}. Open to see them.`;
}

function LiveBriefRead({ brief }: { brief: NonNullable<MarketResult["liveBrief"]> }) {
  // A portfolio's block says whose figures they are: how many of the
  // properties sit in this market (#413).
  const pf = brief.portfolio;
  const where = pf
    ? pf.here > 0
      ? ` — where ${pf.here} of the ${pf.of} properties ${pf.here === 1 ? "sits" : "sit"}`
      : ` — the address on file, where none of the ${pf.of} properties sits`
    : "";
  // A block of the nation's lines alone: none of the market's own figures
  // was current, and the heading says so rather than "own figures".
  const noneOwn = (brief.national ?? 0) >= brief.lines.length;
  return (
    <details className="rounded-xl border border-line bg-paper px-4 py-3 text-sm">
      <summary className="cursor-pointer list-none text-muted [&::-webkit-details-marker]:hidden">
        <span className="font-medium text-ink">
          {noneOwn
            ? brief.grain === "state"
              ? `Read beside the nation’s figures — none of the state of ${brief.metro}’s own was current${where}`
              : `Read beside the nation’s figures — none of the ${brief.metro} market’s own was current${where}${placedByClause(brief.placedBy)}`
            : brief.grain === "state"
              ? `Read beside the state of ${brief.metro}’s own figures${where}`
              : `Read beside the ${brief.metro} market’s own figures${where}${placedByClause(brief.placedBy)}`}
        </span>
        <span>{briefCount(brief)}</span>
      </summary>
      <ul className="mt-3 space-y-1.5 text-muted">
        {brief.lines.map((line) => (
          <li key={line} className="leading-relaxed">{currentBriefLine(line)}</li>
        ))}
      </ul>
    </details>
  );
}

function MarketRow({ c }: { c: MarketCheckType }) {
  const t = TONE[c.assessment] ?? TONE["in-line"];
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{c.assumption}</span>
        <span
          className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${t.badge}`}
        >
          {t.label}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-[1fr_1fr_1.3fr]">
        <MiniStat label="OM says" value={c.omSays} />
        <MiniStat label="Typical" value={c.typicalRange} />
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[10px] uppercase tracking-wide text-muted">
            Position
          </p>
          <PositionBar
            assessment={c.assessment}
            omSays={c.omSays}
            typicalRange={c.typicalRange}
          />
        </div>
      </div>
      {c.note && (
        <p className="mt-3 text-sm leading-relaxed text-muted">{c.note}</p>
      )}
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}

/** Parse "5.25%–5.75%" / "5.25 to 5.75" style ranges into [lo, hi]. */
function PositionBar({
  assessment,
  omSays,
  typicalRange,
}: {
  assessment: MarketCheckType["assessment"];
  omSays: string;
  typicalRange: string;
}) {
  // Plot the OM's value against the typical band — "how far outside typical"
  // is the actual analyst question, not just which side of it.
  const band = readTypicalRange(typicalRange);
  const om = firstNumber(omSays);
  if (band && om != null) {
    const [lo, hi] = band;
    const pad = (hi - lo) * 0.35 || Math.abs(hi) * 0.1 || 1;
    const min = Math.min(lo, om) - pad;
    const max = Math.max(hi, om) + pad;
    const p = (v: number) => ((v - min) / (max - min)) * 100;
    const tone =
      assessment === "aggressive"
        ? "bg-kill"
        : assessment === "conservative"
          ? "bg-brand"
          : "bg-pass";
    return (
      <div className="mt-1">
        <div className="relative h-1.5 rounded-full bg-line" aria-hidden>
          <div
            className="absolute inset-y-0 rounded-full bg-pass/25"
            style={{ left: `${p(lo)}%`, width: `${p(hi) - p(lo)}%` }}
          />
          <span
            className={`absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface ${tone}`}
            style={{ left: `${Math.min(98, Math.max(2, p(om)))}%` }}
            title={`OM ${omSays} vs. typical ${typicalRange}`}
          />
        </div>
        <div className="mt-1 flex justify-between text-[9px] text-muted">
          <span>{typicalRange.trim()} typical</span>
          <span className={assessment === "aggressive" ? "font-medium text-kill" : ""}>
            OM {omSays}
          </span>
        </div>
      </div>
    );
  }
  // Fallback: categorical strip when the strings don't parse.
  const order: {
    key: MarketCheckType["assessment"];
    label: string;
    color: string;
  }[] = [
    { key: "conservative", label: "Cons.", color: "bg-brand" },
    { key: "in-line", label: "In-line", color: "bg-pass" },
    { key: "aggressive", label: "Aggr.", color: "bg-kill" },
  ];
  return (
    <div className="mt-1 flex gap-1">
      {order.map((seg) => {
        const on = seg.key === assessment;
        return (
          <div key={seg.key} className="flex-1">
            <div className={`h-1.5 rounded-full ${on ? seg.color : "bg-line"}`} />
            <p
              className={`mt-1 text-[9px] ${
                on ? "font-medium text-ink" : "text-muted"
              }`}
            >
              {seg.label}
            </p>
          </div>
        );
      })}
    </div>
  );
}

export function VerdictView({
  result,
  stale = false,
  staleWhy = "failed",
}: {
  result: VerdictResult;
  /** the latest screen has not re-run the verdict */
  stale?: boolean;
  /** why: that screen failed before the verdict, is still running, or
   *  stopped making progress on the way */
  staleWhy?: BehindWhy;
}) {
  return (
    <div className="flex flex-col gap-6">
      <VerdictHero result={result} stale={stale} staleWhy={staleWhy} />
      {result.screen && <ScreeningRanges screen={result.screen} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* The pre-model screen: ranges + provenance + the three deal-killers */
/* ------------------------------------------------------------------ */

export const LEVER_META: Record<
  DealKiller["lever"],
  { label: string; blurb: string }
> = {
  basis: { label: "Basis", blurb: "Are you buying right?" },
  exit: { label: "Exit", blurb: "Does the exit cap hold?" },
  debt: { label: "Debt", blurb: "Does the financing survive a shock?" },
};
const LEVER_ORDER: DealKiller["lever"][] = ["basis", "exit", "debt"];

function ScreeningRanges({ screen }: { screen: ScreenResult }) {
  const ranges = screen.ranges ?? [];
  const killers = [...(screen.dealKillers ?? [])].sort(
    (a, b) => LEVER_ORDER.indexOf(a.lever) - LEVER_ORDER.indexOf(b.lever),
  );
  return (
    <section className="space-y-5">
      <div>
        <SectionHeader title="The screen, before the model" />
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
          Rent, expenses, and cap as ranges — not single hero numbers — each
          traced to where it came from. Same deal in, same ranges out.
        </p>
      </div>

      {ranges.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {ranges.map((r, i) => (
            <RangeCard key={i} r={r} />
          ))}
        </div>
      )}

      {killers.length > 0 && (
        <div>
          <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
            Stress the three deal-killers first
          </h3>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {killers.map((k, i) => (
              <DealKillerCard key={i} k={k} index={i} />
            ))}
          </div>
        </div>
      )}

      {screen.sensitivity && screen.sensitivity.length > 0 && (
        <VerdictSensitivity scenarios={screen.sensitivity} />
      )}
    </section>
  );
}

export const SCENARIO_META: Record<VerdictScenario["scenario"], string> = {
  conservative: "Conservative",
  base: "Base case",
  sponsor: "Sponsor's case",
};
const SCENARIO_ORDER: VerdictScenario["scenario"][] = [
  "conservative",
  "base",
  "sponsor",
];
function VerdictSensitivity({ scenarios }: { scenarios: VerdictScenario[] }) {
  const ordered = [...scenarios].sort(
    (a, b) =>
      SCENARIO_ORDER.indexOf(a.scenario) - SCENARIO_ORDER.indexOf(b.scenario),
  );
  return (
    <div>
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted">
        Where the call flips
      </h3>
      <p className="mt-1 text-sm leading-relaxed text-muted">
        The same deal, read across the range — from conservative to the
        sponsor&apos;s optimistic end.
      </p>
      <div className="mt-3 grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
        {ordered.map((s, i) => {
          const call = CALL_META[s.call] ?? CALL_META.caution;
          return (
            <div key={i} className="bg-surface p-4">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
                {SCENARIO_META[s.scenario] ?? s.scenario}
              </p>
              <p
                className={`mt-1.5 flex items-center gap-1.5 text-sm font-semibold ${call.cls}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${call.dot}`} />
                {call.label}
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-muted">
                {s.note}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const RANGE_CONF: Record<ScreenRange["confidence"], { label: string; cls: string }> = {
  high: { label: "High", cls: "bg-pass/10 text-pass" },
  medium: { label: "Med", cls: "bg-caution/10 text-caution" },
  low: { label: "Low", cls: "bg-kill/10 text-kill" },
};


function RangeCard({ r: stored }: { r: ScreenRange }) {
  // Read in numeric order (lib/verdict-range): a verdict stored when the
  // conservative end came first can hold its larger figure as "low".
  const r = rangeInOrder(stored);
  const conf = RANGE_CONF[r.confidence] ?? RANGE_CONF.medium;
  // Positional encoding: WHERE the base sits inside low→high is the most
  // diagnostic fact about a range. The dot is one neutral colour: the
  // higher figure is not always the sponsor's (a higher vacancy is the
  // buyer's end), so the position is drawn, never graded.
  const pos = basePosition(r);
  return (
    <div className="rounded-xl border border-line bg-surface p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{r.label}</p>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase ${conf.cls}`}
        >
          {conf.label}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-line bg-line">
        <RangeCell label="Low" value={r.low} />
        <RangeCell label="Base" value={r.base} emphasized />
        <RangeCell label="High" value={r.high} />
      </div>
      {pos != null && (
        <div className="relative mt-2.5 h-1.5 rounded-full bg-line" aria-hidden>
          <div
            className="absolute inset-y-0 left-0 rounded-full bg-brand/30"
            style={{ width: `${pos * 100}%` }}
          />
          <span
            className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand ring-2 ring-surface"
            style={{ left: `${pos * 100}%` }}
            title="Where the base sits inside the range"
          />
        </div>
      )}
      <p className="mt-2.5 text-xs leading-relaxed text-muted">
        <span className="font-medium text-ink">Source:</span> {r.source}
      </p>
      {r.basis && (
        <p className="mt-1 text-xs leading-relaxed text-muted">{r.basis}</p>
      )}
    </div>
  );
}

/** A screen range's base cell: the brand's tint on white, opaque. */
export const BASE_CELL = "bg-[color-mix(in_oklab,var(--color-brand)_10%,var(--color-surface))]";

function RangeCell({
  label,
  value,
  emphasized = false,
}: {
  label: string;
  value: string;
  emphasized?: boolean;
}) {
  return (
    // The base's tint is mixed with white rather than laid over the grid's
    // line colour, which showed through a 10% tint and took the label to
    // 3.7:1 (research pass 33).
    <div className={`px-3 py-2 ${emphasized ? BASE_CELL : "bg-surface"}`}>
      <p className="text-[10px] uppercase tracking-wide text-muted">{label}</p>
      <p
        className={`mt-0.5 font-mono tabular-nums ${
          emphasized
            ? "text-base font-semibold text-brand"
            : "text-sm text-ink"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function DealKillerCard({ k, index }: { k: DealKiller; index: number }) {
  const meta = LEVER_META[k.lever] ?? { label: k.lever, blurb: "" };
  return (
    <div className="rounded-xl border border-line border-t-2 border-t-brand bg-surface p-4 shadow-sm">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs tabular-nums text-muted">
          {index + 1}
        </span>
        <p className="text-sm font-semibold">{meta.label}</p>
      </div>
      {meta.blurb && (
        <p className="mt-0.5 text-[11px] text-muted">{meta.blurb}</p>
      )}
      <p className="mt-2.5 text-sm leading-relaxed">{k.read}</p>
      <p className="mt-2 flex gap-1.5 text-xs leading-relaxed text-muted">
        <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-kill" />
        <span>{k.risk}</span>
      </p>
    </div>
  );
}

