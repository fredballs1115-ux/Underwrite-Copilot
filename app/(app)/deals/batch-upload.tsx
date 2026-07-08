"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createDealFromBatch,
  type CreateDealResult,
} from "./actions";

const MAX_FILES = 4;
const MAX_BYTES = 22 * 1024 * 1024;

/** "the-maddox_OM_v2.pdf" → "The maddox OM v2" — a starting point the user
 *  can edit before the batch runs. */
function nameFromFile(fileName: string): string {
  const base = fileName
    .replace(/\.pdf$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  if (!base) return "Untitled OM";
  return base.charAt(0).toUpperCase() + base.slice(1);
}

const ERROR_COPY: Record<string, string> = {
  name: "Needs a deal name.",
  auth: "Signed out — sign in and retry.",
  limit: "Plan limit reached — this one wasn't uploaded.",
  teamlimit: "Team plan limit reached — this one wasn't uploaded.",
  file: "The file didn't arrive — try again.",
  pdf: "Not a valid PDF.",
  size: "Over the 22 MB limit.",
  save: "Couldn't save the deal — try again.",
  upload: "Upload failed — try again.",
};

type ItemStatus =
  | { kind: "ready" }
  | { kind: "uploading" }
  | { kind: "queued"; dealId: string; deduped: boolean }
  | { kind: "error"; message: string }
  | { kind: "skipped"; message: string };

interface Item {
  file: File;
  name: string;
  status: ItemStatus;
}

/** Buy-box triage chip states worth showing (anything else stays hidden).
 *  Keys are the pipeline table's fit vocabulary — one vocabulary everywhere. */
const TRIAGE_CHIP: Record<string, { label: string; cls: string }> = {
  fits: { label: "Fits box", cls: "bg-pass/15 text-pass" },
  near: { label: "Near box", cls: "bg-caution/15 text-caution" },
  outside: { label: "Outside box", cls: "bg-kill/15 text-kill" },
};

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
  const [triage, setTriage] = useState<
    Record<string, { fit: string; provisional: boolean }>
  >({});

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
        problems.push(`"${file.name}" is over 22 MB — left out.`);
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
    // Sequential on purpose: one small request at a time, and a mid-batch
    // plan-limit stop skips the rest instead of half-failing in parallel.
    let hitCap = false;
    const snapshot = items;
    for (let i = 0; i < snapshot.length; i++) {
      const item = snapshot[i];
      if (item.status.kind === "queued") continue; // re-run after a partial failure
      if (hitCap) {
        setItems((prev) =>
          prev.map((it, j) =>
            j === i ? { ...it, status: { kind: "skipped", message: "Skipped — plan limit reached." } } : it,
          ),
        );
        continue;
      }
      setItems((prev) =>
        prev.map((it, j) => (j === i ? { ...it, status: { kind: "uploading" } } : it)),
      );
      let status: ItemStatus;
      try {
        const fd = new FormData();
        fd.set("name", item.name.trim() || nameFromFile(item.file.name));
        fd.set("assetClass", assetClass);
        fd.set("om", item.file);
        const res = await submit(fd);
        if (res.ok) {
          status = { kind: "queued", dealId: res.dealId, deduped: !!res.deduped };
        } else {
          if (res.error === "limit" || res.error === "teamlimit") hitCap = true;
          status = { kind: "error", message: ERROR_COPY[res.error] ?? "Something went wrong." };
        }
      } catch {
        status = { kind: "error", message: "Upload failed — check your connection and retry." };
      }
      setItems((prev) => prev.map((it, j) => (j === i ? { ...it, status } : it)));
    }
    setRunning(false);
    setFinished(true);
    // The new rows (with live "Screening…" status) appear behind the panel.
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
            };
            return {
              id,
              fit: body.fit ?? "pending",
              provisional: body.provisional ?? true,
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
          next[r.id] = { fit: r.fit, provisional: r.provisional };
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
    (it) => it.status.kind === "error" || it.status.kind === "skipped",
  ).length;
  const canRun =
    !running && items.some((it) => it.status.kind !== "queued" && it.status.kind !== "uploading");

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
                    {TRIAGE_CHIP[triage[item.status.dealId]?.fit ?? ""] && (
                      <span
                        title={
                          triage[item.status.dealId].provisional
                            ? "Provisional — from the first-pass read; the full screen refines it"
                            : "From the completed extraction"
                        }
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TRIAGE_CHIP[triage[item.status.dealId].fit].cls}`}
                      >
                        {TRIAGE_CHIP[triage[item.status.dealId].fit].label}
                        {triage[item.status.dealId].provisional ? " ~" : ""}
                      </span>
                    )}
                    <a
                      href={`/deals/${item.status.dealId}`}
                      className="text-xs font-medium text-pass hover:underline"
                    >
                      {item.status.deduped ? "Already queued — open →" : "Queued ✓ Open →"}
                    </a>
                  </span>
                )}
                {(item.status.kind === "error" || item.status.kind === "skipped") && (
                  <span className="shrink-0 text-xs font-medium text-kill">
                    {item.status.message}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={run}
              disabled={!canRun}
              className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running
                ? "Uploading — keep this tab open…"
                : failed > 0 && finished
                  ? "Retry failed uploads"
                  : `Screen ${items.filter((it) => it.status.kind !== "queued").length} deal${items.filter((it) => it.status.kind !== "queued").length === 1 ? "" : "s"}`}
            </button>
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
