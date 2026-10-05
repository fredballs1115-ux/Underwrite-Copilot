"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createDealFromBatch,
  type CreateDealResult,
} from "./actions";
// Each file's deal is named from its file name — a starting point the user
// can edit before the batch runs; the single upload pre-fills the same way.
import { nameFromFile } from "@/lib/deal-name";
import { PERSONAL_CHIP, PERSONAL_TITLE } from "@/lib/personal-deal";
// The run itself, pure (lib/batch-run): each answer's status, what the
// button sends again, and the plan's limit said once with a link.
import { BATCH_MAX_FILES, capNotice, runBatch, runLabel, type BatchStatus } from "@/lib/batch-run";
import type { BuyBoxCoverage } from "@/lib/criteria";
import { checkedSentence, fitCellText, fitTone, type FitTone } from "@/lib/fit-label";

const MAX_FILES = BATCH_MAX_FILES;
const MAX_BYTES = 32 * 1024 * 1024;

interface Item {
  file: File;
  name: string;
  status: BatchStatus;
}

/** Buy-box triage chip states worth showing (anything else stays hidden).
 *  Keys are the pipeline table's fit vocabulary — one vocabulary everywhere. */
const TRIAGE_CHIP: Record<string, string> = {
  fits: "Fits box",
  near: "Near box",
  outside: "Outside box",
};

/** The chip's colours by the fit's tone (lib/fit-label `fitTone`): the
 *  fold's own, and muted — never green — while a criterion the price
 *  decides could not be checked, as the pipeline card is. */
const TRIAGE_TONE_CLS: Record<FitTone, string> = {
  pass: "bg-pass/10 text-pass",
  caution: "bg-caution/10 text-caution",
  kill: "bg-kill/15 text-kill",
  muted: "bg-faint text-muted",
};

type Triage = { fit: string; provisional: boolean; coverage?: BuyBoxCoverage | null };

/** A deal's triage as a chip: "Fits box", or "Fits box (2 of 4)" where the
 *  box could not be judged whole (lib/fit-label `fitCellText`); null for a
 *  state not worth showing. */
function triageChip(t: Triage | undefined): { label: string; cls: string; title: string } | null {
  const word = t ? TRIAGE_CHIP[t.fit] : undefined;
  if (!t || !word) return null;
  const fold = t.fit as "fits" | "near" | "outside";
  return {
    label: `${fitCellText(word, t.coverage)}${t.provisional ? " ~" : ""}`,
    cls: TRIAGE_TONE_CLS[fitTone(null, fold, t.coverage)],
    title: [
      t.provisional ? "Provisional — from the first-pass read; the full screen refines it" : "From the completed extraction",
      checkedSentence(t.coverage),
    ]
      .filter(Boolean)
      .join(". "),
  };
}

/**
 * Batch OM triage: pick several OM PDFs (a call-for-offers day), queue them
 * all for screening in one pass. Files upload one at a time so each request
 * stays small and every plan cap applies per deal; the pipeline's Screening
 * group + Buy box sort then ranks the day's deals by fit.
 *
 * `submit` is injectable so the QA harness can exercise the flow without
 * Supabase; the app renders this with the real server action.
 */
export function BatchUpload({
  submit = createDealFromBatch,
}: {
  submit?: (formData: FormData) => Promise<CreateDealResult>;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [assetClass, setAssetClass] = useState("auto");
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  // Buy-box triage per queued deal — filled in by polling as first signals
  // land (~30s into each screen), so the day's stack self-sorts up front.
  const [triage, setTriage] = useState<Record<string, Triage>>({});

  function addFiles(list: FileList | null) {
    if (!list || !list.length) return;
    // Computed against the current items OUTSIDE the state updater — setting
    // other state from inside an updater is a render-phase update React drops.
    const next = [...items];
    const problems: string[] = [];
    for (const file of Array.from(list)) {
      if (next.length >= MAX_FILES) {
        problems.push(`Up to ${MAX_FILES} OMs per batch — extra files were left out.`);
        break;
      }
      const looksPdf =
        file.type === "application/pdf" ||
        file.type === "" ||
        /\.pdf$/i.test(file.name);
      if (!looksPdf) {
        problems.push(`"${file.name}" isn't a PDF — left out.`);
        continue;
      }
      if (file.size > MAX_BYTES) {
        problems.push(`"${file.name}" is over 32 MB — left out.`);
        continue;
      }
      if (next.some((it) => it.file.name === file.name && it.file.size === file.size)) {
        continue; // same file picked twice — keep one
      }
      next.push({ file, name: nameFromFile(file.name), status: { kind: "ready" } });
    }
    setItems(next);
    setPickError(problems.length ? problems.join(" ") : null);
    setFinished(false);
  }

  async function run() {
    if (running) return;
    setRunning(true);
    setFinished(false);
    // Sequential on purpose (lib/batch-run): one small request at a time,
    // and a mid-batch plan-limit stop skips the rest instead of
    // half-failing in parallel. A row the plan stopped is never sent again.
    await runBatch(
      items,
      (item) => {
        const fd = new FormData();
        fd.set("name", item.name.trim() || nameFromFile(item.file.name));
        fd.set("assetClass", assetClass);
        fd.set("om", item.file);
        return submit(fd);
      },
      (i, status) => setItems((prev) => prev.map((it, j) => (j === i ? { ...it, status } : it))),
    );
    setRunning(false);
    setFinished(true);
    // The new rows (with their live "Reading the OM…" status) appear behind the panel.
    router.refresh();
  }

  // Poll /triage for queued deals until each resolves (or ~2 min passes).
  // In the QA harness the fake deal ids fail the endpoint's UUID check and
  // stay "pending" forever — the chip simply never shows, which is correct.
  useEffect(() => {
    // Poll until each verdict is FINAL (non-pending AND non-provisional) or
    // the ~2-minute budget runs out. A provisional chip (from the ~30s first
    // signal) renders immediately but keeps refining until the extraction
    // lands. A transient fetch blip never downgrades a resolved chip.
    const ids = items
      .filter((it) => it.status.kind === "queued")
      .map((it) => (it.status as { dealId: string }).dealId)
      .filter((id) => {
        const t = triage[id];
        return !t || t.fit === "pending" || t.provisional;
      });
    if (ids.length === 0) return;
    let cancelled = false;
    let polls = 0;
    const tick = async () => {
      polls += 1;
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetch(`/api/deals/${id}/triage`, { cache: "no-store" });
            if (!res.ok) return null;
            const body = (await res.json()) as {
              fit?: string;
              provisional?: boolean;
              coverage?: BuyBoxCoverage | null;
            };
            return {
              id,
              fit: body.fit ?? "pending",
              provisional: body.provisional ?? true,
              coverage: body.coverage ?? null,
            };
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setTriage((prev) => {
        const next = { ...prev };
        for (const r of results) {
          if (!r) continue;
          // Never overwrite a resolved verdict with a transient "pending".
          if (r.fit === "pending" && next[r.id] && next[r.id].fit !== "pending")
            continue;
          next[r.id] = { fit: r.fit, provisional: r.provisional, coverage: r.coverage };
        }
        return next;
      });
      const unresolved = results.some(
        (r) => !r || r.fit === "pending" || r.provisional,
      );
      if (unresolved && polls < 30) timer = setTimeout(tick, 4000);
    };
    let timer = setTimeout(tick, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  const queued = items.filter((it) => it.status.kind === "queued").length;
  const failed = items.filter(
    (it) => it.status.kind === "error" || it.status.kind === "capped",
  ).length;
  const statuses = items.map((it) => it.status);
  // The button says what it sends (lib/batch-run): nothing the plan's limit
  // stopped, so there is no "Retry" that can only fail the same way.
  const label = runLabel(statuses, running, finished);
  const cap = capNotice(statuses);

  return (
    <details className="group mt-3 border-t border-line pt-3" data-qa="batch-upload">
      <summary className="cursor-pointer list-none text-sm font-medium text-brand transition-colors hover:text-brand-strong [&::-webkit-details-marker]:hidden">
        Call-for-offers day? Batch-upload up to {MAX_FILES} OMs →
      </summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-muted">
          Each OM becomes its own deal in Screening. Sort the Screening group by
          Buy box when they finish to see which are worth the afternoon.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            disabled={running || items.length >= MAX_FILES}
            onClick={() => inputRef.current?.click()}
            className="rounded-lg border border-dashed border-line px-3 py-2 text-sm font-medium transition-colors hover:border-brand/50 hover:bg-faint disabled:cursor-not-allowed disabled:opacity-50"
          >
            {items.length ? "Add more PDFs" : "Choose OM PDFs"}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            aria-label="Choose OM PDFs for batch upload"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <select
            value={assetClass}
            onChange={(e) => setAssetClass(e.target.value)}
            disabled={running}
            aria-label="Asset class for all files in this batch"
            className="rounded-lg border border-line bg-paper px-3 py-2 text-sm outline-none transition-shadow focus:border-brand focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <option value="auto">Auto-detect asset class</option>
            <option value="multifamily">All multifamily</option>
            <option value="office">All office</option>
            <option value="industrial">All industrial</option>
            <option value="retail">All retail</option>
          </select>
        </div>
        {pickError && (
          <p className="text-xs text-kill" role="alert">
            {pickError}
          </p>
        )}
        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((item, i) => (
              <li
                key={`${item.file.name}-${item.file.size}`}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2"
              >
                <input
                  value={item.name}
                  disabled={running || item.status.kind === "queued"}
                  aria-label={`Deal name for ${item.file.name}`}
                  onChange={(e) =>
                    setItems((prev) =>
                      prev.map((it, j) => (j === i ? { ...it, name: e.target.value } : it)),
                    )
                  }
                  className="min-w-0 flex-1 rounded border-0 bg-transparent text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-brand/40 disabled:text-muted"
                />
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
                  {(item.file.size / 1048576).toFixed(1)} MB
                </span>
                {item.status.kind === "ready" && (
                  <button
                    type="button"
                    disabled={running}
                    onClick={() =>
                      setItems((prev) => prev.filter((_, j) => j !== i))
                    }
                    aria-label={`Remove ${item.file.name}`}
                    className="shrink-0 rounded p-0.5 text-muted transition-colors hover:text-kill"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden>
                      <path d="M18 6 6 18" />
                      <path d="m6 6 12 12" />
                    </svg>
                  </button>
                )}
                {item.status.kind === "uploading" && (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted">
                    <span className="pulse-bar h-1.5 w-1.5 rounded-full bg-brand" />
                    Uploading…
                  </span>
                )}
                {item.status.kind === "queued" && (
                  <span className="flex shrink-0 items-center gap-2">
                    {item.status.personal && (
                      <span
                        title={PERSONAL_TITLE}
                        data-qa="batch-personal"
                        className="rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted"
                      >
                        {PERSONAL_CHIP}
                      </span>
                    )}
                    {(() => {
                      const chip = triageChip(triage[item.status.dealId]);
                      return chip ? (
                        <span title={chip.title} className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${chip.cls}`}>
                          {chip.label}
                        </span>
                      ) : null;
                    })()}
                    <a
                      href={`/deals/${item.status.dealId}`}
                      className="text-xs font-medium text-pass hover:underline"
                    >
                      {item.status.deduped ? "Already queued — open →" : "Queued ✓ Open →"}
                    </a>
                  </span>
                )}
                {(item.status.kind === "error" || item.status.kind === "capped") && (
                  <span className="shrink-0 text-xs font-medium text-kill">
                    {item.status.message}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {cap && (
          <p className="text-sm text-kill" role="status" data-qa="batch-cap">
            {cap.text}{" "}
            <Link href={cap.href} className="font-medium text-brand hover:text-brand-strong">
              {cap.link}
            </Link>
          </p>
        )}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            {label && (
              <button
                type="button"
                onClick={run}
                disabled={running}
                className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
              >
                {label}
              </button>
            )}
            {finished && (
              <p className="text-sm text-muted" role="status">
                {queued} queued{failed ? `, ${failed} not uploaded` : ""} — each
                shows live progress in the pipeline below.
              </p>
            )}
          </div>
        )}
      </div>
    </details>
  );
}
