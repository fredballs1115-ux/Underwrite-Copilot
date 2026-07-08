"use client";

import { useActionState, useEffect, useRef } from "react";
import Link from "next/link";
import { useFormStatus } from "react-dom";
import type { AskEntry } from "@/lib/deals";
import { askDeal, type AskState } from "./ask-actions";

// UTC-pinned so server and client render identical strings (hydration).
const WHEN_FMT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const safeWhen = (at: string) => {
  const d = new Date(at);
  return isNaN(d.getTime()) ? "" : WHEN_FMT.format(d);
};

function AskButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="shrink-0 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
    >
      {pending ? "Reading the OM…" : "Ask"}
    </button>
  );
}

/**
 * Ask-the-deal: grounded Q&A against the stored OM, with page citations.
 * The thread lives on the deal, so answers outlast the conversation that
 * produced them.
 */
export function AskPanel({
  dealId,
  qa,
  hasOm,
  isSample,
  isPro,
}: {
  dealId: string;
  qa: AskEntry[];
  hasOm: boolean;
  isSample: boolean;
  isPro: boolean;
}) {
  const [state, action] = useActionState<AskState, FormData>(askDeal, null);
  const formRef = useRef<HTMLFormElement>(null);

  // A successful answer re-renders the thread via revalidate — clear the box.
  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  const askable = hasOm && !isSample;

  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight">Ask this deal</h2>
        {!isPro && (
          <span className="rounded-full bg-brand/10 px-1.5 py-px text-[10px] font-semibold text-brand">
            Pro
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        Answers come from the OM itself, with page citations — &ldquo;the OM
        doesn&rsquo;t state it&rdquo; is a real answer here. Allow ~20 seconds.
      </p>

      {qa.length > 0 && (
        <ol className="mt-4 space-y-4">
          {qa.map((e, i) => (
            <li key={`${e.at}-${i}`}>
              <p className="text-sm font-medium">
                {e.q}
                <span className="ml-2 text-xs font-normal text-muted">
                  {safeWhen(e.at)}
                </span>
              </p>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-muted">
                {e.answer}
              </p>
              {e.cites.length > 0 && (
                <p className="mt-1.5 flex flex-wrap gap-1.5">
                  {e.cites.map((c, j) => (
                    <span
                      key={j}
                      title={c.note}
                      className="rounded-full bg-faint px-2 py-0.5 text-[11px] font-medium text-muted"
                    >
                      {c.page}
                    </span>
                  ))}
                </p>
              )}
            </li>
          ))}
        </ol>
      )}

      {!askable ? (
        <p className="mt-3 text-sm text-muted">
          {isSample
            ? "The sample deal has no OM behind it — upload a real deal and ask away."
            : "Upload the OM first — answers come from the document itself."}
        </p>
      ) : !isPro ? (
        <p className="mt-3 text-sm text-muted">
          Ask-the-deal is part of Pro —{" "}
          <Link
            href="/billing"
            className="font-medium text-brand underline-offset-2 hover:underline"
          >
            upgrade on the Billing page
          </Link>{" "}
          to put questions to the memorandum.
        </p>
      ) : (
        <form ref={formRef} action={action} className="mt-3">
          <div className="flex items-start gap-2">
            <input type="hidden" name="dealId" value={dealId} />
            <textarea
              name="question"
              required
              minLength={5}
              maxLength={300}
              rows={2}
              // React 19 resets the form after every action — on an error,
              // hand the typed question back instead of wiping it.
              key={state?.error ? `err-${state.question}` : "fresh"}
              defaultValue={state?.error ? (state.question ?? "") : ""}
              placeholder="e.g. What does the OM say about the tax abatement schedule?"
              className="min-w-0 flex-1 resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm placeholder:text-muted/70 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
            <AskButton />
          </div>
          {state?.error && (
            <p className="mt-2 text-sm text-kill" role="alert">
              {state.error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}
